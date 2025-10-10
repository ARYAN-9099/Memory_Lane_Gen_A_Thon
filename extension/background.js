const BACKEND_URL = 'http://localhost:5000';

async function postCapture(payload) {
  const response = await fetch(`${BACKEND_URL}/api/capture`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
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
      const selection = window.getSelection()?.toString() || '';
      const description = document.querySelector('meta[name="description"]')?.content || '';
      const ogImage = document.querySelector('meta[property="og:image"]')?.content || null;
      const textContent = selection || Array.from(document.querySelectorAll('p'))
        .slice(0, 5)
        .map(p => p.textContent?.trim() || '')
        .join(' ');

      return {
        url: window.location.href,
        title: document.title,
        source: window.location.hostname,
        contentType: 'web',
        content: `${selection}\n${description}\n${textContent}`.trim(),
        selection,
        thumbnail: ogImage,
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
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (emotion && emotion !== 'any') params.set('emotion', emotion);

  const response = await fetch(`${BACKEND_URL}/api/search?${params.toString()}`);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Search failed: ${response.status} ${errorText}`);
  }

  return response.json();
}

// Deduplicate auto-captures per URL for a short TTL to reduce noise
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
  const response = await fetch(`${BACKEND_URL}/api/timeline?limit=${limit}`);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Timeline failed: ${response.status} ${errorText}`);
  }

  return response.json();
}

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
  if (message?.type === 'AUTO_PAGE_CONTENT') {
    const { url, title, text, description, ogImage } = message.payload || {};
    if (!url || !shouldAutoCapture(url)) {
      sendResponse?.({ skipped: true });
      return; // skip too-frequent duplicates
    }

    const content = [text || '', description || ''].join('\n').trim();
    const payload = {
      url,
      title: title || 'Untitled',
      source: (new URL(url)).hostname,
      contentType: 'web',
      content,
      selection: '',
      thumbnail: ogImage || null,
    };

    postCapture(payload)
      .then(() => sendResponse?.({ ok: true }))
      .catch(err => sendResponse?.({ error: String(err) }));
    return true; // async response
  }
});
