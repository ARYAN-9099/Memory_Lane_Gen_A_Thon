// Auto-capture visible text on page load and SPA navigations, then send to background.
(function () {
  const WAIT_MS = 1200;
  const MAX_TEXT = 20000;
  const sentForUrl = new Set();

  function getText() {
    try {
      return document.body ? (document.body.innerText || '') : '';
    } catch (e) {
      return '';
    }
  }

  function getDescription() {
    return document.querySelector('meta[name="description"]')?.content || '';
  }

  function getOgImage() {
    return document.querySelector('meta[property="og:image"]')?.content || null;
  }

  function sendNow() {
    const fullText = getText();
    const text = fullText.length > MAX_TEXT ? fullText.slice(0, MAX_TEXT) : fullText;
    const payload = {
      url: location.href,
      title: document.title || '',
      description: getDescription(),
      ogImage: getOgImage(),
      text,
      length: fullText.length
    };

    try {
      chrome.runtime.sendMessage({ type: 'AUTO_PAGE_CONTENT', payload }, () => {
        // Avoid unchecked lastError warnings on navigation
        const _ = chrome.runtime.lastError;
      });
    } catch (e) {
      // ignore
    }
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
