const timelineList = document.getElementById('timelineList');
const resultsList = document.getElementById('resultsList');
const captureBtn = document.getElementById('captureBtn');
const searchBtn = document.getElementById('searchBtn');
const searchInput = document.getElementById('searchInput');
const emotionFilter = document.getElementById('emotionFilter');

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
