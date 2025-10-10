document.addEventListener('DOMContentLoaded', () => {

  const API_BASE = `${window.location.origin}/api`;

  // --- Element Selectors ---
  const apiStatus = document.getElementById('apiStatus');
  const searchInput = document.getElementById('searchInput');
  const emotionSelect = document.getElementById('emotionSelect');
  const searchBtn = document.getElementById('searchBtn');
  const resetBtn = document.getElementById('resetBtn');
  const timelineList = document.getElementById('timelineList');
  const resultsList = document.getElementById('resultsList');
  const resultsCount = document.getElementById('resultsCount');
  const profile = document.querySelector('nav .profile');
  const toggleSidebar = document.querySelector('nav .toggle-sidebar');
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById("toggle-theme");
  const html = document.documentElement;

  // --- API Functions ---
  async function fetchJson(path, options) {
    const response = await fetch(`${API_BASE}${path}`, options);
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || response.statusText);
    }
    return response.json();
  }

  function setStatus(message, variant = 'info') {
    if (apiStatus) {
      apiStatus.textContent = message;
      apiStatus.dataset.variant = variant;
    }
  }

  function startHealthCheck(intervalMs = 5000) {
    setInterval(async () => {
      try {
        await fetchJson('/health');
        setStatus('API connected', 'info');
      } catch (error) {
        setStatus('API disconnected', 'error');
      }
    }, intervalMs);
  }

  // --- Rendering Functions ---
  function createItemElement(item) {
    const card = document.createElement('div');
    card.className = 'card';
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
    const summary = document.createElement('p');
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
    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(summary);
    card.appendChild(badges);
    return card;
  }

  function renderList(trackEl, items, emptyMessage) {
    if (!trackEl) return;
    trackEl.innerHTML = '';
    if (!items || !items.length) {
      trackEl.innerHTML = `<p class="muted" style="padding: 20px;">${emptyMessage}</p>`;
      return;
    }
    items.forEach(item => trackEl.appendChild(createItemElement(item)));
  }

  // --- Data Loading & Search ---
  async function loadTimeline() {
    try {
      const data = await fetchJson('/timeline?limit=15');
      renderList(timelineList, data.items, 'No captures yet.');
      setupSlider('timeline');
    } catch (error) {
      renderList(timelineList, [], `Timeline error: ${error.message}`);
    }
  }

  async function performSearch() {
    if (searchBtn) searchBtn.disabled = true;
    const params = new URLSearchParams();
    const query = searchInput.value.trim();
    const emotion = emotionSelect.value;
    if (query) params.set('q', query);
    if (emotion) params.set('emotion', emotion);
    try {
      const data = await fetchJson(`/search?${params.toString()}`);
      if (resultsCount) resultsCount.textContent = `(${data.results.length} matches)`;
      renderList(resultsList, data.results, 'No results found.');
      setupSlider('results');
    } catch (error) {
      if (resultsCount) resultsCount.textContent = '';
      renderList(resultsList, [], `Search error: ${error.message}`);
    } finally {
      if (searchBtn) searchBtn.disabled = false;
    }
  }

  // --- UI Component Functions ---
  function setupSlider(prefix) {
    const track = document.getElementById(`${prefix}List`);
    const nextButton = document.getElementById(`${prefix}-next`);
    const prevButton = document.getElementById(`${prefix}-prev`);
    if (!track || !nextButton || !prevButton) return;
    let currentIndex = 0;
    const itemsPerScreen = 3;
    const totalItems = track.children.length;
    const maxIndex = Math.max(0, Math.ceil(totalItems / itemsPerScreen) - 1);

    function updateSlider() {
      const itemWidth = track.firstElementChild ? track.firstElementChild.offsetWidth + 24 : 0;
      const newTransform = -currentIndex * itemWidth * itemsPerScreen;
      track.style.transform = `translateX(${newTransform}px)`;
      prevButton.disabled = currentIndex === 0;
      nextButton.disabled = currentIndex >= maxIndex;
    }
    nextButton.addEventListener('click', () => {
      if (currentIndex < maxIndex) {
        currentIndex++;
        updateSlider();
      }
    });
    prevButton.addEventListener('click', () => {
      if (currentIndex > 0) {
        currentIndex--;
        updateSlider();
      }
    });
    updateSlider();
  }

  // --- Initialization and Event Listeners ---
  async function init() {
    try {
      await fetchJson('/health');
      setStatus('API connected');
    } catch (error) {
      setStatus('API disconnected', 'error');
    }
    startHealthCheck();
    loadTimeline();
    performSearch();
  }

  if (searchBtn) searchBtn.addEventListener('click', performSearch);
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (emotionSelect) emotionSelect.value = '';
      performSearch();
    });
  }
  if (searchInput) {
    searchInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') performSearch();
    });
  }

  if (profile) {
    const imgProfile = profile.querySelector('img');
    const dropdownProfile = profile.querySelector('.profile-link');
    if (imgProfile && dropdownProfile) {
      imgProfile.addEventListener('click', () => dropdownProfile.classList.toggle('show'));
    }
  }

  if (toggleSidebar && sidebar) {
    const allsideDividers = document.querySelectorAll('li.divider');
    const selectWrapper = document.querySelector('#emotionSelect'); // Define it once here
    const footer = document.querySelector('.footer');

    toggleSidebar.addEventListener('click', () => {
      sidebar.classList.toggle('hide');

      if (sidebar.classList.contains('hide')) {
        allsideDividers.forEach(item => {
          item.textContent = '-';
        });
        // Set width once when hidden
        if (selectWrapper) {
          selectWrapper.style.width = '35rem';
          selectWrapper.style.transition = 'width 0.3s ease'; // Optional: smooth transition
          footer.style.left = '30rem';
          footer.style.transition = 'left 0.3s ease'; // Optional: smooth transition
        }
      } else {
        allsideDividers.forEach(item => {
          item.textContent = item.dataset.text;
        });
        // Set width once when visible (outside the loop)
        if (selectWrapper) {
          selectWrapper.style.width = '20rem';
          footer.style.left = '18rem';
        }
      }
    });
  }

  if (toggleBtn) {
    const updateIcon = (theme) => {
      toggleBtn.classList.remove("fa-sun", "fa-moon");
      toggleBtn.classList.add(theme === "dark" ? "fa-sun" : "fa-moon");
    };
    const savedTheme = localStorage.getItem("theme") || "light";
    html.setAttribute("data-theme", savedTheme);
    updateIcon(savedTheme);
    toggleBtn.addEventListener("click", () => {
      const newTheme = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
      html.setAttribute("data-theme", newTheme);
      localStorage.setItem("theme", newTheme);
      updateIcon(newTheme);
    });
  }

  window.addEventListener('click', (evt) => {
    const dropdownProfile = profile ? profile.querySelector('.profile-link') : null;
    if (profile && dropdownProfile?.classList.contains('show') && !profile.contains(evt.target)) {
      dropdownProfile.classList.remove('show');
    }
  });

  init();
});