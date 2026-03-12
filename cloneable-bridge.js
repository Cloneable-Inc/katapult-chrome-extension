// Cloneable Bridge Script
// Injected on Cloneable app pages to provide cached Katapult model data.
// Communicates via CustomEvents on the page and chrome.storage.local.

(function () {
  // Only activate on the pole-inspect import page
  if (!window.location.pathname.includes('/tools/pole-inspect/import')) {
    return;
  }

  function dispatchModel(model) {
    window.dispatchEvent(
      new CustomEvent('katapult-model-available', { detail: model })
    );
  }

  function sendCachedModel() {
    chrome.storage.local.get(
      ['cachedFullModel', 'cachedModelTimestamp', 'cachedModelSource'],
      (result) => {
        if (result.cachedFullModel) {
          dispatchModel({
            model: result.cachedFullModel,
            timestamp: result.cachedModelTimestamp,
            source: result.cachedModelSource,
          });
        }
      }
    );
  }

  // Retry sending until React has mounted (up to 10 seconds)
  let retries = 0;
  const maxRetries = 20;
  const retryInterval = setInterval(() => {
    retries++;
    sendCachedModel();
    if (retries >= maxRetries) {
      clearInterval(retryInterval);
    }
  }, 500);

  // Re-send on demand when the webapp requests it
  window.addEventListener('katapult-request-model', () => {
    clearInterval(retryInterval);
    sendCachedModel();
  });
})();
