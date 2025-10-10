const BACKEND_URL = 'http://localhost:5000';

async function postCapture(payload) {
  const token = await getToken();
  const response = await fetch(`${BACKEND_URL}/api/capture`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Capture failed: ${response.status} ${errorText}`);
  }

  return response.json();
}

async function captureCurrentTab(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const description = document.querySelector('meta[name="description"]')?.content || '';
      const ogImage = document.querySelector('meta[property="og:image"]')?.content || null;
      return {
        url: window.location.href,
        title: document.title,
        source: window.location.hostname,
        contentType: 'web',
        content: description,
        selection: '',
        thumbnail: ogImage,
        allowServerExtract: true,
      };
    },
  });

  if (!results.length) {
    throw new Error('Unable to capture tab content.');
  }

  const payload = results[0].result;
  const data = await postCapture(payload);
  return data.item;
}

async function searchLibrary(query, emotion) {
  const token = await getToken();
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (emotion && emotion !== 'any') params.set('emotion', emotion);

  const response = await fetch(`${BACKEND_URL}/api/search?${params.toString()}`, {
    headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) }
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Search failed: ${response.status} ${errorText}`);
  }

  return response.json();
}

// Deduplicate metadata-only auto captures per URL for a short TTL
const autoCaptureCache = new Map(); // url -> timestamp(ms)
const AUTO_TTL_MS = 60_000; // 1 minute
function shouldAutoCapture(url) {
  const now = Date.now();
  const last = autoCaptureCache.get(url) || 0;
  if (now - last < AUTO_TTL_MS) return false;
  autoCaptureCache.set(url, now);
  return true;
}

async function fetchTimeline(limit = 10) {
  const token = await getToken();
  const response = await fetch(`${BACKEND_URL}/api/timeline?limit=${limit}`, {
    headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) }
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Timeline failed: ${response.status} ${errorText}`);
  }

  return response.json();
}

// Token storage helpers
function setToken(token) {
  return chrome.storage.local.set({ memoryLaneToken: token });
}
async function getToken() {
  const res = await chrome.storage.local.get(['memoryLaneToken']);
  return res.memoryLaneToken || '';
}
function clearToken() {
  return chrome.storage.local.remove(['memoryLaneToken']);
}

// Expose auth actions to popup via messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'auth-set-token') {
    setToken(message.token || '').then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === 'auth-clear-token') {
    clearToken().then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'memory-lane-capture',
    title: 'Save to Memory Lane Snapshot',
    contexts: ['selection', 'page']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'memory-lane-capture' || !tab?.id) {
    return;
  }

  try {
    const item = await captureCurrentTab(tab.id);
    console.info('Captured item:', item.title);
  } catch (error) {
    console.error(error);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'capture-current-tab') {
    if (!sender.tab?.id && !message.tabId) {
      sendResponse({ error: 'No active tab detected.' });
      return;
    }

    const tabId = sender.tab?.id || message.tabId;
    captureCurrentTab(tabId)
      .then(item => sendResponse({ item }))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }

  if (message.type === 'search-library') {
    searchLibrary(message.query, message.emotion)
      .then(results => sendResponse(results))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }

  if (message.type === 'fetch-timeline') {
    fetchTimeline(message.limit)
      .then(results => sendResponse(results))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }

  return false;
});

// Receive auto page content from content script and send to backend
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'URL_METADATA') {
    const { url, title, description, ogImage } = message.payload || {};
    if (!url || !shouldAutoCapture(url)) {
      sendResponse?.({ skipped: true });
      return;
    }

    const payload = {
      url,
      title: title || 'Untitled',
      source: (new URL(url)).hostname,
      contentType: 'web',
      // Send no large text; backend will extract. Include small description if present.
      content: description || '',
      selection: '',
      thumbnail: ogImage || null,
      allowServerExtract: true,
    };

    postCapture(payload)
      .then((res) => {
        // If backend could not extract enough, fallback to client-side full text capture
        if (!res?.extracted) {
          if (sender?.tab?.id) {
            chrome.scripting.executeScript({
              target: { tabId: sender.tab.id },
              func: () => document.body ? (document.body.innerText || '') : '',
            }).then(results => {
              const text = results?.[0]?.result || '';
              if (text && text.length > 0) {
                const retryPayload = { ...payload, content: text, allowServerExtract: false };
                return postCapture(retryPayload);
              }
            }).catch(() => {/* ignore */});
          }
        }
        sendResponse?.({ ok: true, extracted: !!res?.extracted });
      })
      .catch(err => sendResponse?.({ error: String(err) }));
    return true;
  }
});
