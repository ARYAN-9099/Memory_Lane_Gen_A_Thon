const timelineList = document.getElementById('timelineList');
const resultsList = document.getElementById('resultsList');
const captureBtn = document.getElementById('captureBtn');
const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const searchBtn = document.getElementById('searchBtn');
const searchInput = document.getElementById('searchInput');
const emotionFilter = document.getElementById('emotionFilter');
const excludeInput = document.getElementById('excludeInput');
const addExcludeBtn = document.getElementById('addExcludeBtn');
const exclusionsList = document.getElementById('exclusionsList');

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
    summary.textContent = item.summary;

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
      if (item.url) {
        chrome.tabs.create({ url: item.url });
      }
    });

    listElement.appendChild(li);
  });
}

async function refreshTimeline() {
  const response = await chrome.runtime.sendMessage({ type: 'fetch-timeline', limit: 5 });
  if (response?.error) {
    renderItems(timelineList, [], response.error);
    return;
  }

  renderItems(timelineList, response.items, 'No recent captures yet.');
}

async function performSearch() {
  const query = searchInput.value.trim();
  const emotion = emotionFilter.value;
  const response = await chrome.runtime.sendMessage({
    type: 'search-library',
    query,
    emotion
  });

  if (response?.error) {
    renderItems(resultsList, [], response.error);
    return;
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

// Exclusions UI
async function loadExclusions() {
  const res = await chrome.storage.local.get(['memoryLaneExclusions']);
  const custom = res.memoryLaneExclusions || [];
  renderExclusions(custom);
}

function renderExclusions(list) {
  exclusionsList.innerHTML = '';
  if (!list.length) {
    const li = document.createElement('li');
    li.textContent = 'No custom exclusions';
    exclusionsList.appendChild(li);
    return;
  }
  list.forEach(domain => {
    const li = document.createElement('li');
    li.textContent = domain;
    const btn = document.createElement('button');
    btn.textContent = 'Remove';
    btn.addEventListener('click', async () => {
      const res = await chrome.storage.local.get(['memoryLaneExclusions']);
      const cur = res.memoryLaneExclusions || [];
      const updated = cur.filter(x => x !== domain);
      await chrome.storage.local.set({ memoryLaneExclusions: updated });
      loadExclusions();
    });
    li.appendChild(btn);
    exclusionsList.appendChild(li);
  });
}

addExcludeBtn.addEventListener('click', async () => {
  const v = excludeInput.value.trim();
  if (!v) return;
  const res = await chrome.storage.local.get(['memoryLaneExclusions']);
  const cur = res.memoryLaneExclusions || [];
  if (!cur.includes(v)) {
    cur.push(v);
    await chrome.storage.local.set({ memoryLaneExclusions: cur });
    excludeInput.value = '';
    loadExclusions();
  }
});

loadExclusions();

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
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email || !password) {
    alert('Enter email and password');
    return;
  }
  try {
    const res = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    await setTokenInBackground(data.token);
    loginBtn.style.display = 'none';
    logoutBtn.style.display = 'inline-block';
    emailInput.style.display = 'none';
    passwordInput.style.display = 'none';
    await refreshTimeline();
    await performSearch();
  } catch (e) {
    alert(e.message);
  }
}

async function logout() {
  await clearTokenInBackground();
  loginBtn.style.display = 'inline-block';
  logoutBtn.style.display = 'none';
  emailInput.style.display = 'inline-block';
  passwordInput.style.display = 'inline-block';
}

loginBtn.addEventListener('click', login);
logoutBtn.addEventListener('click', logout);
