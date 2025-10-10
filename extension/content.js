// Auto-capture visible text on page load and SPA navigations, then send to background.
(function () {
  const WAIT_MS = 1200;
  const sentForUrl = new Set();

  function getDescription() {
    return document.querySelector('meta[name="description"]')?.content || '';
  }

  function getOgImage() {
    return document.querySelector('meta[property="og:image"]')?.content || null;
  }

  function sendNow() {
    const payload = {
      url: location.href,
      title: document.title || '',
      description: getDescription(),
      ogImage: getOgImage(),
    };

    try {
      chrome.runtime.sendMessage({ type: 'URL_METADATA', payload }, () => {
        const _ = chrome.runtime.lastError;
      });
    } catch (e) {}
  }

  function scheduleOncePerUrl() {
    const url = location.href;
    if (sentForUrl.has(url)) return;
    sentForUrl.add(url);
    setTimeout(sendNow, WAIT_MS);
  }

  // Initial
  scheduleOncePerUrl();

  // SPA navigations support
  let lastHref = location.href;
  const origPushState = history.pushState;
  const origReplaceState = history.replaceState;
  function onUrlMaybeChanged() {
    const href = location.href;
    if (href !== lastHref) {
      lastHref = href;
      scheduleOncePerUrl();
    }
  }
  history.pushState = function () {
    const ret = origPushState.apply(this, arguments);
    onUrlMaybeChanged();
    return ret;
  };
  history.replaceState = function () {
    const ret = origReplaceState.apply(this, arguments);
    onUrlMaybeChanged();
    return ret;
  };
  window.addEventListener('popstate', onUrlMaybeChanged, true);
  window.addEventListener('hashchange', onUrlMaybeChanged, true);
})();
