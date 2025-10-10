const API_BASE = `${window.location.origin}/api`;

const apiStatus = document.getElementById('apiStatus');
const searchInput = document.getElementById('searchInput');
const emotionSelect = document.getElementById('emotionSelect');
const searchBtn = document.getElementById('searchBtn');
const resetBtn = document.getElementById('resetBtn');
const refreshTimelineBtn = document.getElementById('refreshTimeline');
const timelineList = document.getElementById('timelineList');
const resultsList = document.getElementById('resultsList');
const resultsCount = document.getElementById('resultsCount');
const totalItemsEl = document.getElementById('totalItems');
const topTagsEl = document.getElementById('topTags');

let contentTypeChart;
let emotionChart;

async function fetchJson(path, options) {
  const response = await fetch(`${API_BASE}${path}`, options);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || response.statusText);
  }
  return response.json();
}

function setStatus(message, variant = 'info') {
  apiStatus.textContent = message;
  apiStatus.dataset.variant = variant;
}

function createItemElement(item) {
  const li = document.createElement('li');
  li.className = 'item';

  const title = document.createElement('a');
  title.className = 'item-title';
  title.textContent = item.title || 'Untitled';
  if (item.url) {
    title.href = item.url;
    title.target = '_blank';
    title.rel = 'noreferrer';
  }

  const meta = document.createElement('div');
  meta.className = 'item-meta';
  const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Unknown';
  meta.textContent = `${item.source || 'web'} • ${item.contentType || 'web'} • ${dateStr}`;

  const summary = document.createElement('div');
  summary.className = 'item-summary';
  summary.textContent = item.summary || item.content?.slice(0, 180) || '';

  const badges = document.createElement('div');
  badges.className = 'badges';
  if (item.emotion) {
    const emotionBadge = document.createElement('span');
    emotionBadge.className = 'badge';
    emotionBadge.textContent = item.emotion;
    badges.appendChild(emotionBadge);
  }
  (item.keywords || []).slice(0, 5).forEach(keyword => {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = keyword;
    badges.appendChild(badge);
  });

  li.appendChild(title);
  li.appendChild(meta);
  li.appendChild(summary);
  li.appendChild(badges);
  return li;
}

function renderList(listEl, items, emptyMessage) {
  listEl.innerHTML = '';
  if (!items || !items.length) {
    const empty = document.createElement('li');
    empty.className = 'item';
    empty.textContent = emptyMessage;
    listEl.appendChild(empty);
    return;
  }
  items.forEach(item => listEl.appendChild(createItemElement(item)));
}

async function loadTimeline() {
  refreshTimelineBtn.disabled = true;
  try {
    const data = await fetchJson('/timeline?limit=15');
    renderList(timelineList, data.items, 'No captures yet. Try saving something from the extension.');
  } catch (error) {
    renderList(timelineList, [], `Timeline error: ${error.message}`);
  } finally {
    refreshTimelineBtn.disabled = false;
  }
}

async function performSearch() {
  searchBtn.disabled = true;
  const params = new URLSearchParams();
  const query = searchInput.value.trim();
  const emotion = emotionSelect.value;

  if (query) params.set('q', query);
  if (emotion) params.set('emotion', emotion);

  try {
    const data = await fetchJson(`/search?${params.toString()}`);
    resultsCount.textContent = `${data.results.length} matches`;
    renderList(resultsList, data.results, 'No results yet. Try another keyword or emotion.');
  } catch (error) {
    resultsCount.textContent = '';
    renderList(resultsList, [], `Search error: ${error.message}`);
  } finally {
    searchBtn.disabled = false;
  }
}

async function loadInsights() {
  try {
    const data = await fetchJson('/insights');
    totalItemsEl.textContent = data.totalItems ?? 0;

    topTagsEl.innerHTML = '';
    (data.topTags || []).forEach(tagInfo => {
      const li = document.createElement('li');
      li.textContent = `${tagInfo.tag} (${tagInfo.count})`;
      topTagsEl.appendChild(li);
    });

    const contentCtx = document.getElementById('contentTypeChart').getContext('2d');
    const emotionCtx = document.getElementById('emotionChart').getContext('2d');

    const contentLabels = Object.keys(data.byContentType || {});
    const contentValues = Object.values(data.byContentType || {});
    const emotionLabels = Object.keys(data.byEmotion || {});
    const emotionValues = Object.values(data.byEmotion || {});

    if (contentTypeChart) {
      contentTypeChart.destroy();
    }
    if (emotionChart) {
      emotionChart.destroy();
    }

    if (contentLabels.length) {
      contentTypeChart = new Chart(contentCtx, {
        type: 'doughnut',
        data: {
          labels: contentLabels,
          datasets: [{
            label: 'Content types',
            data: contentValues,
            backgroundColor: ['#2563eb', '#9333ea', '#16a34a', '#f97316', '#ef4444']
          }]
        },
        options: {
          plugins: { legend: { position: 'bottom' } }
        }
      });
    }

    if (emotionLabels.length) {
      emotionChart = new Chart(emotionCtx, {
        type: 'bar',
        data: {
          labels: emotionLabels,
          datasets: [{
            label: 'Emotion spread',
            data: emotionValues,
            backgroundColor: '#1d4ed8'
          }]
        },
        options: {
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true } }
        }
      });
    }
  } catch (error) {
    totalItemsEl.textContent = '—';
    topTagsEl.innerHTML = `<li>${error.message}</li>`;
  }
}

async function init() {
  try {
    await fetchJson('/health');
    setStatus('API connected');
  } catch (error) {
    setStatus(`API unavailable: ${error.message}`, 'error');
  }

  await Promise.all([loadTimeline(), performSearch(), loadInsights()]);
}

searchBtn.addEventListener('click', performSearch);
resetBtn.addEventListener('click', () => {
  searchInput.value = '';
  emotionSelect.value = '';
  performSearch();
});
refreshTimelineBtn.addEventListener('click', loadTimeline);
searchInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    performSearch();
  }
});

init();
