// --- ELEMENT SELECTORS ---
const timelineList = document.getElementById('timelineList');
const resultsList = document.getElementById('resultsList');
const captureBtn = document.getElementById('captureBtn');
const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const searchBtn = document.getElementById('searchBtn');
const emotionFilter = document.getElementById('emotionFilter');
const excludeInput = document.getElementById('excludeInput');
const addExcludeBtn = document.getElementById('addExcludeBtn');
const exclusionsList = document.getElementById('exclusionsList');

// --- UI MANAGEMENT FUNCTIONS ---
function showLoggedInUI() {
  loginBtn.style.display = 'none';
  emailInput.style.display = 'none';
  passwordInput.style.display = 'none';
  logoutBtn.style.display = 'inline-block';
  captureBtn.style.display = 'inline-block';
}

function showLoggedOutUI() {
  loginBtn.style.display = 'inline-block';
  emailInput.style.display = 'inline-block';
  passwordInput.style.display = 'inline-block';
  logoutBtn.style.display = 'none';
  captureBtn.style.display = 'none';
  renderItems(timelineList, [], 'Please log in to see recent captures.');
  renderItems(resultsList, [], 'Please log in to search.');
}

// --- RENDERING FUNCTION ---
function renderItems(listElement, items, emptyMessage) {
  listElement.innerHTML = '';
  if (!items || !items.length) {
    const li = document.createElement('li');
    li.textContent = emptyMessage;
    listElement.appendChild(li);
    return;
  }
  items.forEach(item => {
    const li = document.createElement('li');
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = item.title || 'Untitled';

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = new Date(item.createdAt).toLocaleString();

    const summary = document.createElement('div');
    summary.className = 'summary';
    summary.textContent = item.summary || 'No summary available.';

    const tags = document.createElement('div');
    tags.className = 'tags';
    if (item.emotion) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = item.emotion;
      tags.appendChild(badge);
    }
    (item.keywords || []).slice(0, 3).forEach(keyword => {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = keyword;
      tags.appendChild(badge);
    });

    li.appendChild(title);
    li.appendChild(meta);
    li.appendChild(summary);
    li.appendChild(tags);
    li.addEventListener('click', () => {
      if (item.url) chrome.tabs.create({ url: item.url });
    });
    listElement.appendChild(li);
  });
}

// --- API & CHROME RUNTIME FUNCTIONS ---
async function refreshTimeline() {
  const response = await chrome.runtime.sendMessage({ type: 'fetch-timeline', limit: 5 });
  if (response?.error) {
    renderItems(timelineList, [], response.error);
    return;
  }
  renderItems(timelineList, response.items, 'No recent captures yet.');
}

async function performSearch() {
  searchBtn.disabled = true;
  try {
    const emotion = emotionFilter.value;

    const message = {
      type: 'search-library',
      query: '' // Always send an empty query
    };

    if (emotion) {
      message.emotion = emotion;
    }

    const response = await chrome.runtime.sendMessage(message);

    if (!response) {
      throw new Error("No response from background script.");
    }
    if (response.error) {
      throw new Error(response.error);
    }

  renderItems(resultsList, response.results, 'Nothing matched your search.');
}

captureBtn.addEventListener('click', async () => {
  captureBtn.disabled = true;
  captureBtn.textContent = 'Saving…';

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const response = await chrome.runtime.sendMessage({
    type: 'capture-current-tab',
    tabId: tab.id
  });

  if (response?.error) {
    alert(response.error);
  } else {
    await refreshTimeline();
  }

  captureBtn.disabled = false;
  captureBtn.textContent = 'Capture';
});

searchBtn.addEventListener('click', performSearch);
searchInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    performSearch();
  }
});

refreshTimeline();

// Auth helpers
async function setTokenInBackground(token) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'auth-set-token', token }, () => resolve());
  });
}

async function clearTokenInBackground() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'auth-clear-token' }, () => resolve());
  });
}

async function login() {
  loginBtn.disabled = true;
  loginBtn.textContent = '...';
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email || !password) {
    alert('Please enter both email and password.');
    loginBtn.disabled = false;
    loginBtn.textContent = 'Login';
    return;
  }
  try {
    const response = await chrome.runtime.sendMessage({ type: 'auth-login', email, password });
    if (response?.error) throw new Error(response.error);
    showLoggedInUI();
    await refreshTimeline();
  } catch (e) {
    alert(e.message);
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Login';
  }
}

async function logout() {
  await chrome.runtime.sendMessage({ type: 'auth-clear-token' });
  showLoggedOutUI();
}

async function captureTab() {
  captureBtn.disabled = true;
  captureBtn.textContent = 'Saving…';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await chrome.runtime.sendMessage({ type: 'capture-current-tab', tabId: tab.id });
    if (response?.error) {
      alert(response.error);
    } else {
      setTimeout(refreshTimeline, 500);
    }
  } finally {
    captureBtn.disabled = false;
    captureBtn.textContent = 'Capture';
  }
}

// --- INITIALIZATION ---
async function init() {
  const response = await chrome.runtime.sendMessage({ type: 'auth-get-status' });
  if (response?.isLoggedIn) {
    showLoggedInUI();
    await refreshTimeline();
    await performSearch();
  } else {
    showLoggedOutUI();
  }
}

// --- EVENT LISTENERS ---
captureBtn.addEventListener('click', captureTab);
searchBtn.addEventListener('click', performSearch);
loginBtn.addEventListener('click', login);
logoutBtn.addEventListener('click', logout);

init();