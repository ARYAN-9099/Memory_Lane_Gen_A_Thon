document.addEventListener('DOMContentLoaded', () => {

  const API_BASE = `${window.location.origin}/api`;

  // --- Element Selectors ---
  const apiStatus = document.getElementById('apiStatus');
  const processingStatus = document.getElementById('processingStatus');
  const searchInput = document.getElementById('searchInput');
  const emotionSelect = document.getElementById('emotionSelect');
  const semanticToggle = document.getElementById('semanticToggle');
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

  function startProcessingCheck(intervalMs = 3000) {
    setInterval(async () => {
      try {
        const data = await fetchJson('/processing-status');
        if (data.processing) {
          if (processingStatus) {
            processingStatus.style.display = 'inline-block';
          }
        } else {
          if (processingStatus) {
            processingStatus.style.display = 'none';
          }
        }
      } catch (error) {
        // Silently handle error - processing status is not critical
        if (processingStatus) {
          processingStatus.style.display = 'none';
        }
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
      title.style.display = 'inline-block';
      title.style.height = '2rem';
      title.style.overflow = 'hidden';
      title.style.textOverflow = 'ellipsis';
      title.style.whiteSpace = 'nowrap';
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
    const useSemantic = semanticToggle && semanticToggle.checked;
    
    if (query) params.set('q', query);
    if (emotion) params.set('emotion', emotion);
    if (useSemantic) params.set('semantic', 'true');
    
    try {
      const data = await fetchJson(`/search?${params.toString()}`);
      const resultCount = data.results.length;
      const semanticNote = data.semanticSearchUsed ? ' 🔍 (including similar tags)' : '';
      if (resultsCount) resultsCount.textContent = `(${resultCount} matches${semanticNote})`;
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

  // --- Page Navigation Functions ---
  const dashContent = document.getElementById('dash-content');
  const analysisPage = document.getElementById('analysisPage');
  const dashboardLink = document.getElementById('dashboardLink');
  const analysisLink = document.getElementById('analysisLink');
  const footer = document.querySelector('.footer');

  function showDashboard() {
    if (dashContent) dashContent.style.display = 'block';
    if (analysisPage) analysisPage.style.display = 'none';
    if (footer) footer.style.display = 'block';
    
    // Update active state
    document.querySelectorAll('.side-menu a').forEach(a => a.classList.remove('active'));
    if (dashboardLink) dashboardLink.classList.add('active');
    
    // Save state
    localStorage.setItem('currentPage', 'dashboard');
  }

  function showAnalysis() {
    if (dashContent) dashContent.style.display = 'none';
    if (analysisPage) analysisPage.style.display = 'block';
    if (footer) footer.style.display = 'none';
    
    // Update active state
    document.querySelectorAll('.side-menu a').forEach(a => a.classList.remove('active'));
    if (analysisLink) analysisLink.classList.add('active');
    
    // Save state
    localStorage.setItem('currentPage', 'analysis');
    
    // Load analysis data
    loadAnalysisData();
  }

  if (dashboardLink) {
    dashboardLink.addEventListener('click', (e) => {
      e.preventDefault();
      showDashboard();
    });
  }

  if (analysisLink) {
    analysisLink.addEventListener('click', (e) => {
      e.preventDefault();
      showAnalysis();
    });
  }

  // --- Analysis Page Functions ---
  let analysisCharts = {
    website: null,
    emotion: null,
    keywords: null,
    hourly: null
  };

  async function loadAnalysisData() {
    try {
      const [timelineData, insightsData] = await Promise.all([
        fetchJson('/timeline?limit=1000'),
        fetchJson('/insights')
      ]);

      renderSummaryCards(timelineData.items, insightsData);
      renderDetailedTimeline(timelineData.items);
      renderAnalysisCharts(timelineData.items);
      renderInsights(timelineData.items, insightsData);
    } catch (error) {
      console.error('Failed to load analysis data:', error);
    }
  }

  function renderSummaryCards(items, insights) {
    const container = document.getElementById('summaryCards');
    if (!container) return;

    const totalItems = items.length;
    const uniqueWebsites = new Set(items.map(item => item.source)).size;
    const totalKeywords = items.reduce((sum, item) => sum + (item.keywords?.length || 0), 0);
    
    // Get most common emotion
    const emotionCounts = {};
    items.forEach(item => {
      if (item.emotion) {
        emotionCounts[item.emotion] = (emotionCounts[item.emotion] || 0) + 1;
      }
    });
    const mostCommonEmotion = Object.entries(emotionCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

    const cards = [
      { 
        title: 'Total Captures', 
        value: totalItems, 
        description: 'Pages saved to memory' 
      },
      { 
        title: 'Unique Websites', 
        value: uniqueWebsites, 
        description: 'Different sources explored' 
      },
      { 
        title: 'Keywords Extracted', 
        value: totalKeywords, 
        description: 'Total tags generated' 
      },
      { 
        title: 'Most Common Emotion', 
        value: mostCommonEmotion, 
        description: 'Dominant content mood' 
      }
    ];

    container.innerHTML = cards.map(card => `
      <div class="summary-card">
        <h3>${card.title}</h3>
        <div class="value">${card.value}</div>
        <div class="description">${card.description}</div>
      </div>
    `).join('');
  }

  function renderDetailedTimeline(items) {
    const container = document.getElementById('detailedTimeline');
    if (!container) return;

    if (!items || items.length === 0) {
      container.innerHTML = '<p class="muted">No activity to display</p>';
      return;
    }

    // Sort by date, most recent first
    const sortedItems = [...items].sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    );

    container.innerHTML = sortedItems.slice(0, 50).map(item => {
      const date = new Date(item.createdAt);
      const timeStr = date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      const dateStr = date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: 'numeric'
      });

      return `
        <div class="timeline-item">
          <div class="timeline-time">
            <div>${timeStr}</div>
            <div style="font-size: 0.75rem; opacity: 0.7;">${dateStr}</div>
          </div>
          <div class="timeline-content">
            <div class="timeline-title">${item.title || 'Untitled'}</div>
            <div class="timeline-url">${item.source || item.url || 'Unknown source'}</div>
            ${item.summary ? `<div style="font-size: 0.875rem; color: var(--d-gray-color); margin-top: 4px;">${item.summary.slice(0, 150)}${item.summary.length > 150 ? '...' : ''}</div>` : ''}
            <div class="timeline-meta">
              ${item.emotion ? `<span class="timeline-badge emotion">${item.emotion}</span>` : ''}
              ${(item.keywords || []).slice(0, 3).map(kw => 
                `<span class="timeline-badge keyword">${kw}</span>`
              ).join('')}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderInsights(items, insightsData) {
    const container = document.getElementById('insightsContent');
    if (!container) return;

    // Calculate insights
    const mostVisitedSite = getMostVisitedSite(items);
    const mostCommonEmotion = getMostCommonEmotion(items);
    const peakHour = getPeakActivityHour(items);
    const avgSessionGap = getAverageSessionGap(items);

    const insights = [
      {
        title: 'Most Visited Website',
        text: `You visited ${mostVisitedSite.name} the most with ${mostVisitedSite.count} captures, showing a strong interest in this source.`
      },
      {
        title: 'Dominant Emotion',
        text: `Your content is primarily ${mostCommonEmotion.emotion} (${mostCommonEmotion.percentage}% of captures), reflecting the overall tone of your browsing.`
      },
      {
        title: 'Peak Activity Time',
        text: `You're most active around ${peakHour.hour}, with ${peakHour.count} captures during this hour. Consider this your peak productivity time!`
      },
      {
        title: 'Browsing Pattern',
        text: `On average, you save new content every ${avgSessionGap} minutes, showing ${avgSessionGap < 30 ? 'active' : 'moderate'} engagement with online resources.`
      }
    ];

    container.innerHTML = insights.map(insight => `
      <div class="insight-card">
        <h3>${insight.title}</h3>
        <p>${insight.text}</p>
      </div>
    `).join('');
  }

  function getMostVisitedSite(items) {
    const counts = {};
    items.forEach(item => {
      const source = item.source || 'Unknown';
      counts[source] = (counts[source] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return { name: sorted[0]?.[0] || 'None', count: sorted[0]?.[1] || 0 };
  }

  function getMostCommonEmotion(items) {
    const counts = {};
    let total = 0;
    items.forEach(item => {
      if (item.emotion) {
        counts[item.emotion] = (counts[item.emotion] || 0) + 1;
        total++;
      }
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const top = sorted[0];
    return { 
      emotion: top?.[0] || 'neutral', 
      percentage: top ? Math.round((top[1] / total) * 100) : 0 
    };
  }

  function getPeakActivityHour(items) {
    const hourCounts = {};
    items.forEach(item => {
      if (item.createdAt) {
        const hour = new Date(item.createdAt).getHours();
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      }
    });
    const sorted = Object.entries(hourCounts).sort((a, b) => b[1] - a[1]);
    const peakHour = sorted[0];
    return { 
      hour: peakHour ? `${peakHour[0]}:00` : 'N/A', 
      count: peakHour?.[1] || 0 
    };
  }

  function getAverageSessionGap(items) {
    if (items.length < 2) return 'N/A';
    const sorted = [...items].sort((a, b) => 
      new Date(a.createdAt) - new Date(b.createdAt)
    );
    let totalGap = 0;
    for (let i = 1; i < sorted.length; i++) {
      const gap = new Date(sorted[i].createdAt) - new Date(sorted[i-1].createdAt);
      totalGap += gap;
    }
    const avgGapMinutes = Math.round(totalGap / (sorted.length - 1) / 1000 / 60);
    return avgGapMinutes;
  }

  function renderAnalysisStats(insights) {
    const statsContainer = document.getElementById('analysisStats');
    if (!statsContainer) return;

    const stats = [
      { label: 'Total Captures', value: insights.totalItems || 0 },
      { label: 'Unique Websites', value: insights.uniqueSources || 0 },
      { label: 'Keywords', value: insights.totalKeywords || 0 },
      { label: 'Avg Sentiment', value: (insights.avgSentiment || 0).toFixed(2) }
    ];

    statsContainer.innerHTML = stats.map(stat => `
      <div class="stat-item">
        <span class="stat-value">${stat.value}</span>
        <span class="stat-label">${stat.label}</span>
      </div>
    `).join('');
  }

  function renderAnalysisCharts(items) {
    // Website distribution chart
    const websiteCounts = {};
    items.forEach(item => {
      const source = item.source || 'unknown';
      websiteCounts[source] = (websiteCounts[source] || 0) + 1;
    });

    const sortedWebsites = Object.entries(websiteCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    renderAnalysisWebsiteChart(sortedWebsites);
    renderAnalysisEmotionChart(items);
    renderAnalysisKeywordsChart(items);
    renderAnalysisHourlyChart(items);
  }

  function renderAnalysisWebsiteChart(data) {
    const canvas = document.getElementById('analysisWebsiteChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
    if (analysisCharts.website) {
      analysisCharts.website.destroy();
    }

    // Modern gradient colors
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
      '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#52B788'
    ];

    const total = data.reduce((sum, [, count]) => sum + count, 0);

    analysisCharts.website = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: data.map(([name]) => name),
        datasets: [{
          data: data.map(([, count]) => count),
          backgroundColor: colors.slice(0, data.length),
          borderColor: getComputedStyle(document.documentElement).getPropertyValue('--card-color').trim() || '#ffffff',
          borderWidth: 3,
          hoverOffset: 15
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim(),
              padding: 20,
              font: { 
                size: 13,
                weight: '500'
              },
              usePointStyle: true,
              pointStyle: 'circle'
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const label = context.label || '';
                const value = context.parsed || 0;
                const percentage = ((value / total) * 100).toFixed(1);
                return `${label}: ${value} visits (${percentage}%)`;
              }
            }
          },
          datalabels: {
            color: '#fff',
            font: {
              weight: 'bold',
              size: 14
            },
            formatter: (value, ctx) => {
              const percentage = ((value / total) * 100).toFixed(1);
              return percentage > 5 ? `${percentage}%` : '';
            }
          }
        }
      },
      plugins: [{
        beforeDraw: function(chart) {
          const width = chart.width,
                height = chart.height,
                ctx = chart.ctx;
          ctx.restore();
          
          // Calculate center position
          const centerX = width / 2;
          const centerY = height / 2;
          
          // Draw total number
          const fontSize = (height / 160).toFixed(2);
          ctx.font = `bold ${fontSize}em sans-serif`;
          ctx.textBaseline = "middle";
          ctx.textAlign = "center";
          
          const text = String(total);
          ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim();
          ctx.fillText(text, centerX, centerY - 10);
          
          // Draw "Total" label
          ctx.font = `${(fontSize * 0.5)}em sans-serif`;
          ctx.fillText("Total", centerX, centerY + 18);
          
          ctx.save();
        }
      }]
    });
  }

  function renderAnalysisEmotionChart(items) {
    const canvas = document.getElementById('analysisEmotionChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
    if (analysisCharts.emotion) {
      analysisCharts.emotion.destroy();
    }

    const emotionCounts = {};
    items.forEach(item => {
      const emotion = item.emotion || 'unknown';
      emotionCounts[emotion] = (emotionCounts[emotion] || 0) + 1;
    });

    const emotions = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1]);

    // Vibrant gradient colors for emotions
    const emotionColors = {
      'happy': '#FFD93D',
      'sad': '#6C91BF',
      'neutral': '#95E1D3',
      'angry': '#FF6B6B',
      'excited': '#FFA07A',
      'thoughtful': '#B8A5D6',
      'reflective': '#98D8C8',
      'helpful': '#52B788',
      'surprised': '#F8B739',
      'funny': '#FF9FF3'
    };

    const colors = emotions.map(([emotion]) => 
      emotionColors[emotion.toLowerCase()] || '#AA69FF'
    );

    analysisCharts.emotion = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: emotions.map(([name]) => name.charAt(0).toUpperCase() + name.slice(1)),
        datasets: [{
          label: 'Emotion Count',
          data: emotions.map(([, count]) => count),
          backgroundColor: colors,
          borderColor: colors.map(c => c),
          borderWidth: 2,
          borderRadius: 12,
          barThickness: 40
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              color: getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim(),
              stepSize: 1,
              font: {
                size: 12,
                weight: '500'
              }
            },
            grid: {
              color: 'rgba(0, 0, 0, 0.05)',
              drawBorder: false
            }
          },
          x: {
            ticks: {
              color: getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim(),
              font: {
                size: 12,
                weight: '500'
              }
            },
            grid: {
              display: false
            }
          }
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            padding: 12,
            titleFont: {
              size: 14,
              weight: 'bold'
            },
            bodyFont: {
              size: 13
            },
            callbacks: {
              label: function(context) {
                return `Count: ${context.parsed.y}`;
              }
            }
          }
        }
      }
    });
  }

  function renderAnalysisKeywordsChart(items) {
    const canvas = document.getElementById('analysisKeywordsChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
    if (analysisCharts.keywords) {
      analysisCharts.keywords.destroy();
    }

    // Count all keywords
    const keywordCounts = {};
    items.forEach(item => {
      if (item.keywords && Array.isArray(item.keywords)) {
        item.keywords.forEach(keyword => {
          keywordCounts[keyword] = (keywordCounts[keyword] || 0) + 1;
        });
      }
    });

    // Get top 7 keywords
    const topKeywords = Object.entries(keywordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7);

    if (topKeywords.length === 0) {
      // Show empty state
      ctx.font = '16px sans-serif';
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--d-gray-color').trim();
      ctx.textAlign = 'center';
      ctx.fillText('No keywords found', canvas.width / 2, canvas.height / 2);
      return;
    }

    // Vibrant gradient colors for keywords
    const colors = [
      '#FF6B6B', // Coral Red
      '#4ECDC4', // Turquoise
      '#45B7D1', // Sky Blue
      '#FFA07A', // Light Salmon
      '#98D8C8', // Mint
      '#F7DC6F', // Yellow
      '#BB8FCE'  // Purple
    ];

    analysisCharts.keywords = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: topKeywords.map(([keyword]) => keyword),
        datasets: [{
          label: 'Frequency',
          data: topKeywords.map(([, count]) => count),
          backgroundColor: colors,
          borderColor: colors.map(c => c),
          borderWidth: 2,
          borderRadius: 12,
          barThickness: 30,
          categoryPercentage: 0.9,
          barPercentage: 0.6
        }]
      },
      options: {
        indexAxis: 'y', // Horizontal bars
        responsive: true,
        maintainAspectRatio: true,
        layout: {
          padding: {
            top: 10,
            bottom: 10,
            left: 10,
            right: 10
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: {
              color: getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim(),
              stepSize: 1,
              font: {
                size: 12,
                weight: '500'
              }
            },
            grid: {
              color: 'rgba(0, 0, 0, 0.05)',
              drawBorder: false
            }
          },
          y: {
            ticks: {
              color: getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim(),
              font: {
                size: 13,
                weight: '600'
              }
            },
            grid: {
              display: false
            }
          }
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            padding: 12,
            titleFont: {
              size: 14,
              weight: 'bold'
            },
            bodyFont: {
              size: 13
            },
            callbacks: {
              label: function(context) {
                return `Used ${context.parsed.x} times`;
              }
            }
          }
        }
      }
    });
  }

  function renderAnalysisContentTypeChart(items) {
    const canvas = document.getElementById('analysisContentTypeChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
    if (analysisCharts.contentType) {
      analysisCharts.contentType.destroy();
    }

    // Count content types
    const contentTypeCounts = {};
    items.forEach(item => {
      const type = item.contentType || item.content_type || 'web';
      contentTypeCounts[type] = (contentTypeCounts[type] || 0) + 1;
    });

    const sortedTypes = Object.entries(contentTypeCounts).sort((a, b) => b[1] - a[1]);
    const total = sortedTypes.reduce((sum, [, count]) => sum + count, 0);

    // Beautiful gradient colors
    const colors = ['#667eea', '#764ba2', '#f093fb', '#4facfe', '#00f2fe'];

    analysisCharts.contentType = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: sortedTypes.map(([type]) => type.charAt(0).toUpperCase() + type.slice(1)),
        datasets: [{
          data: sortedTypes.map(([, count]) => count),
          backgroundColor: colors.slice(0, sortedTypes.length),
          borderColor: '#fff',
          borderWidth: 3,
          hoverOffset: 15
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim(),
              padding: 20,
              font: { 
                size: 13,
                weight: '500'
              },
              usePointStyle: true,
              pointStyle: 'circle'
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const label = context.label || '';
                const value = context.parsed || 0;
                const percentage = ((value / total) * 100).toFixed(1);
                return `${label}: ${value} items (${percentage}%)`;
              }
            }
          },
          datalabels: {
            color: '#fff',
            font: {
              weight: 'bold',
              size: 16
            },
            formatter: (value, ctx) => {
              const percentage = ((value / total) * 100).toFixed(1);
              return `${percentage}%`;
            }
          }
        }
      }
    });
  }

  function renderAnalysisTimelineChart(items) {
    const canvas = document.getElementById('analysisTimelineChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
    if (analysisCharts.timeline) {
      analysisCharts.timeline.destroy();
    }

    // Group by date
    const dateCounts = {};
    items.forEach(item => {
      if (item.createdAt) {
        const date = new Date(item.createdAt).toLocaleDateString();
        dateCounts[date] = (dateCounts[date] || 0) + 1;
      }
    });

    const sortedDates = Object.entries(dateCounts)
      .sort((a, b) => new Date(a[0]) - new Date(b[0]))
      .slice(-30); // Last 30 days

    analysisCharts.timeline = new Chart(ctx, {
      type: 'line',
      data: {
        labels: sortedDates.map(([date]) => date),
        datasets: [{
          label: 'Captures per Day',
          data: sortedDates.map(([, count]) => count),
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.1)',
          tension: 0.4,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              color: getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim()
            },
            grid: {
              color: 'rgba(0, 0, 0, 0.05)'
            }
          },
          x: {
            ticks: {
              color: getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim(),
              maxRotation: 45,
              minRotation: 45
            },
            grid: {
              display: false
            }
          }
        },
        plugins: {
          legend: {
            labels: {
              color: getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim()
            }
          }
        }
      }
    });
  }

  function renderAnalysisHourlyChart(items) {
    const canvas = document.getElementById('analysisHourlyChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
    if (analysisCharts.hourly) {
      analysisCharts.hourly.destroy();
    }

    // Group by hour of day
    const hourCounts = Array(24).fill(0);
    items.forEach(item => {
      if (item.createdAt) {
        const hour = new Date(item.createdAt).getHours();
        hourCounts[hour]++;
      }
    });

    const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`);

    analysisCharts.hourly = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: hours,
        datasets: [{
          label: 'Activity by Hour',
          data: hourCounts,
          backgroundColor: 'rgba(170, 105, 255, 0.7)',
          borderColor: '#6f00ff',
          borderWidth: 1,
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              color: getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim(),
              stepSize: 1
            },
            grid: {
              color: 'rgba(0, 0, 0, 0.05)'
            }
          },
          x: {
            ticks: {
              color: getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim(),
              maxRotation: 90,
              minRotation: 45
            },
            grid: {
              display: false
            }
          }
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                return `${context.parsed.y} captures`;
              }
            }
          }
        }
      }
    });
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
    startProcessingCheck();
    loadTimeline();
    performSearch();
    
    // Restore page state from localStorage
    const savedPage = localStorage.getItem('currentPage');
    if (savedPage === 'analysis') {
      showAnalysis();
    } else {
      showDashboard();
    }
  }

  if (searchBtn) searchBtn.addEventListener('click', performSearch);
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (emotionSelect) emotionSelect.value = '';
      if (semanticToggle) semanticToggle.checked = false;
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
      // Reload charts with new theme colors
      setTimeout(() => {
        loadWebsiteAnalytics();
        if (analysisPage && analysisPage.style.display !== 'none') {
          loadAnalysisData();
        }
      }, 100);
    });
  }

  async function loadFavorites() {
    try {
      // We'll assume a new API endpoint for favorites
      const data = await fetchJson('/api/favorites?limit=15');
      const favoritesList = document.getElementById('favoritesList');
      renderList(favoritesList, data.items, 'No favorites found.');
      setupSlider('favorites'); // This activates the slider
    } catch (error) {
      renderList(favoritesList, [], `Favorites error: ${error.message}`);
    }
  }

  // --- Website Analytics Functions ---
  let websiteChart = null;

  async function loadWebsiteAnalytics() {
    try {
      const data = await fetchJson('/timeline?limit=1000'); // Get all items for analytics
      const websiteCounts = {};
      
      // Count visits per website
      data.items.forEach(item => {
        const source = item.source || 'unknown';
        websiteCounts[source] = (websiteCounts[source] || 0) + 1;
      });

      // Sort by frequency
      const sortedWebsites = Object.entries(websiteCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10); // Top 10 for chart

      const labels = sortedWebsites.map(([name]) => name);
      const counts = sortedWebsites.map(([, count]) => count);
      const total = counts.reduce((sum, count) => sum + count, 0);

      // Render pie chart
      renderWebsiteChart(labels, counts);

      // Render top 5
      renderTopWebsites(sortedWebsites.slice(0, 5), total);

    } catch (error) {
      const topWebsites = document.getElementById('topWebsites');
      if (topWebsites) {
        topWebsites.innerHTML = `<p class="muted">Failed to load analytics: ${error.message}</p>`;
      }
    }
  }

  function renderWebsiteChart(labels, data) {
    const canvas = document.getElementById('websiteChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
    // Destroy existing chart if it exists
    if (websiteChart) {
      websiteChart.destroy();
    }

    // Generate colors for each slice
    const colors = [
      '#6f00ff', '#892fff', '#aa69ff', '#2563eb', '#3b82f6',
      '#00d962', '#2ecc71', '#ffe851', '#ffa500', '#e65339'
    ];

    websiteChart = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: colors.slice(0, data.length),
          borderColor: getComputedStyle(document.documentElement).getPropertyValue('--card-color').trim() || '#ffffff',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim(),
              padding: 15,
              font: {
                size: 12
              }
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const label = context.label || '';
                const value = context.parsed || 0;
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const percentage = ((value / total) * 100).toFixed(1);
                return `${label}: ${value} visits (${percentage}%)`;
              }
            }
          }
        }
      }
    });
  }

  function renderTopWebsites(topSites, total) {
    const container = document.getElementById('topWebsites');
    if (!container) return;

    container.innerHTML = '';

    if (!topSites || topSites.length === 0) {
      container.innerHTML = '<p class="muted">No data available</p>';
      return;
    }

    topSites.forEach(([name, count], index) => {
      const percentage = ((count / total) * 100).toFixed(1);
      
      const item = document.createElement('div');
      item.className = 'top-website-item';
      
      const rank = document.createElement('div');
      rank.className = 'website-rank';
      rank.textContent = `#${index + 1}`;
      
      const info = document.createElement('div');
      info.className = 'website-info';
      
      const nameEl = document.createElement('div');
      nameEl.className = 'website-name';
      nameEl.textContent = name;
      
      const countEl = document.createElement('div');
      countEl.className = 'website-count';
      countEl.textContent = `${count} visits`;
      
      info.appendChild(nameEl);
      info.appendChild(countEl);
      
      const percentEl = document.createElement('div');
      percentEl.className = 'website-percentage';
      percentEl.textContent = `${percentage}%`;
      
      item.appendChild(rank);
      item.appendChild(info);
      item.appendChild(percentEl);
      
      container.appendChild(item);
    });
  }
  
  init();
  loadWebsiteAnalytics();
});