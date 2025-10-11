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

// Built-in exclusion list (defaults). Users can add/remove entries via the popup.
const BUILTIN_EXCLUSIONS = [
  'localhost',
  '127.0.0.1',
  'github.com',
  'mail.google.com',
  'accounts.google.com',
  'chrome.google.com',
];

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

// Exclusion helpers
async function getExclusions() {
  const res = await chrome.storage.local.get(['memoryLaneExclusions']);
  const custom = res.memoryLaneExclusions || [];
  return Array.from(new Set([...BUILTIN_EXCLUSIONS, ...custom]));
}

async function isExcluded(hostname) {
  const exclusions = await getExclusions();
  return exclusions.some(e => e && hostname.includes(e));
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
  if (message?.type === 'auth-login') {
    // Handle login request from popup
    const { email, password } = message;
    fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })
      .then(async response => {
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Login failed: ${errorText}`);
        }
        return response.json();
      })
      .then(data => {
        // Store the token
        return setToken(data.token).then(() => {
          sendResponse({ userId: data.userId, token: data.token });
        });
      })
      .catch(error => {
        sendResponse({ error: error.message });
      });
    return true; // Will respond asynchronously
  }
  if (message?.type === 'auth-get-status') {
    // Check if user is logged in
    getToken().then(token => {
      sendResponse({ isLoggedIn: !!token });
    });
    return true; // Will respond asynchronously
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
    const hostname = new URL(tab.url).hostname;
    if (await isExcluded(hostname)) {
      console.info('Domain excluded, skipping manual capture for', hostname);
      return;
    }
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

    // Check exclusions (async) then run capture flow
    try {
      const hostname = (new URL(url)).hostname;
      isExcluded(hostname).then(excluded => {
        if (excluded) {
          sendResponse?.({ skipped: true, excluded: true });
          return;
        }

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
      }).catch(() => {
        // If exclusion check fails, proceed with capture
        postCapture(payload)
          .then((res) => {
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
      });
    } catch (e) {
      // ignore URL parse errors and continue with capture
      postCapture(payload)
        .then((res) => {
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
    }
    return true;
  }
});
