// Popup script to show extension status and manage domains

let currentTab = null;
let contentScriptConnected = false;

const ENV_URLS = {
  production: 'https://app.cloneable.ai/tools/pole-inspect/import',
  development: 'http://localhost:3000/tools/pole-inspect/import'
};

// Initialize popup
async function init() {
  // Get current tab
  const tabs = await chrome.tabs.query({active: true, currentWindow: true});
  currentTab = tabs[0];

  // Load saved environment preference
  await loadEnvironment();

  // Load stick line preference
  await loadStickLinePreference();

  // Load auto-calibrate preference
  await loadAutoCalibratePreference();

  // Load auto-confirm Do-it-Anyway preference
  await loadAutoConfirmPreference();

  // Load "missing main photo" badge preference
  await loadUnstarredBadgePreference();

  // Update status
  await updateStatus();

  // Load and display custom domains
  await loadDomainList();

  // Setup event listeners
  setupEventListeners();
}

// Load saved environment preference
async function loadEnvironment() {
  const { cloneableEnv } = await chrome.storage.local.get('cloneableEnv');
  const env = cloneableEnv || 'production';
  const radio = document.querySelector(`input[name="environment"][value="${env}"]`);
  if (radio) radio.checked = true;
}

// Save environment preference
function saveEnvironment(env) {
  chrome.storage.local.set({ cloneableEnv: env, cloneableEnvUpdatedAt: new Date().toISOString() });
}

// Load stick line preference
async function loadStickLinePreference() {
  const { extendStickLine } = await chrome.storage.local.get('extendStickLine');
  // Default to true (on)
  const enabled = extendStickLine !== false;
  document.getElementById('extend-stickline-toggle').checked = enabled;
}

// Toggle stick line extension
function toggleStickLine(enabled) {
  chrome.storage.local.set({ extendStickLine: enabled });
  if (currentTab && contentScriptConnected) {
    chrome.tabs.sendMessage(currentTab.id, {
      type: 'TOGGLE_EXTEND_STICKLINE',
      enabled: enabled
    }, (response) => {
      if (chrome.runtime.lastError) return;
      const statusEl = document.getElementById('stickline-status');
      if (response && response.applied) {
        statusEl.textContent = response.message || 'Applied';
      } else if (response && response.message) {
        statusEl.textContent = response.message;
      }
    });
  }
}

// Load auto-calibrate preference (default on)
async function loadAutoCalibratePreference() {
  const { autoCalibrate } = await chrome.storage.local.get('autoCalibrate');
  const enabled = autoCalibrate !== false;
  document.getElementById('auto-calibrate-toggle').checked = enabled;
}

// Toggle auto-calibrate of purple markers
function toggleAutoCalibrate(enabled) {
  chrome.storage.local.set({ autoCalibrate: enabled });
  if (currentTab && contentScriptConnected) {
    chrome.tabs.sendMessage(currentTab.id, {
      type: 'TOGGLE_AUTO_CALIBRATE',
      enabled: enabled
    }, (response) => {
      if (chrome.runtime.lastError) return;
      const statusEl = document.getElementById('autocalibrate-status');
      if (response && response.message) {
        statusEl.textContent = response.message;
      }
    });
  }
}

// Load auto-confirm Do-it-Anyway preference (default on)
async function loadAutoConfirmPreference() {
  const { autoConfirmDoItAnyway } = await chrome.storage.local.get('autoConfirmDoItAnyway');
  const enabled = autoConfirmDoItAnyway !== false;
  document.getElementById('auto-confirm-toggle').checked = enabled;
}

// Toggle auto-confirm Do-it-Anyway
function toggleAutoConfirm(enabled) {
  chrome.storage.local.set({ autoConfirmDoItAnyway: enabled });
}

// Load "missing main photo" badge preference (default on)
async function loadUnstarredBadgePreference() {
  const { showUnstarredBadge } = await chrome.storage.local.get('showUnstarredBadge');
  const enabled = showUnstarredBadge !== false;
  document.getElementById('unstarred-badge-toggle').checked = enabled;
}

// Toggle "missing main photo" floating badge
function toggleUnstarredBadge(enabled) {
  chrome.storage.local.set({ showUnstarredBadge: enabled });
  if (currentTab && contentScriptConnected) {
    chrome.tabs.sendMessage(currentTab.id, {
      type: 'TOGGLE_UNSTARRED_BADGE',
      enabled: enabled
    }, () => { void chrome.runtime.lastError; });
  }
  // Re-fetch the count so the popup's status row reflects the new state.
  refreshUnstarredStatus();
}

// Pull the current refined count from the content script and render the
// popup's status row + Show-on-map button. Safe to call repeatedly — no-ops
// if the content script isn't reachable yet.
function refreshUnstarredStatus() {
  const textEl = document.getElementById('unstarred-status-text');
  const btnEl = document.getElementById('show-unstarred-btn');
  const rowEl = document.getElementById('unstarred-status');
  if (!textEl || !btnEl || !rowEl) return;
  const setClasses = (state) => {
    rowEl.classList.remove('ok', 'loading');
    if (state) rowEl.classList.add(state);
  };
  if (!currentTab || !contentScriptConnected) {
    textEl.textContent = 'Not connected to Katapult';
    btnEl.style.display = 'none';
    setClasses('loading');
    return;
  }
  chrome.tabs.sendMessage(currentTab.id, { type: 'GET_UNSTARRED_COUNT' }, (resp) => {
    if (chrome.runtime.lastError || !resp) {
      textEl.textContent = 'Waiting for job…';
      btnEl.style.display = 'none';
      setClasses('loading');
      return;
    }
    const total = (resp.nodeCount || 0) + (resp.connCount || 0);
    if (resp.loading) {
      textEl.textContent = 'Loading job…';
      btnEl.style.display = 'none';
      setClasses('loading');
      return;
    }
    if (total === 0) {
      textEl.textContent = '✓ All eligible photos starred';
      btnEl.style.display = 'none';
      setClasses('ok');
      return;
    }
    setClasses(null);  // dark pill
    const parts = [];
    if (resp.nodeCount) parts.push(`${resp.nodeCount} node${resp.nodeCount === 1 ? '' : 's'}`);
    if (resp.connCount) parts.push(`${resp.connCount} section${resp.connCount === 1 ? '' : 's'}`);
    textEl.textContent = `Missing main photo: ${parts.join(' + ')}`;
    // Offer "Show on map" only when the badge is currently hidden — either by
    // toggle or per-job dismiss. Otherwise the badge is already visible.
    const badgeIsVisible = resp.enabled && !resp.isDismissed;
    btnEl.style.display = badgeIsVisible ? 'none' : 'inline-block';
  });
}

// Click handler for "Show on map" — un-dismisses the badge and re-enables it
// if it was toggled off in this popup session.
function handleShowUnstarred() {
  if (!currentTab || !contentScriptConnected) return;
  document.getElementById('unstarred-badge-toggle').checked = true;
  chrome.tabs.sendMessage(currentTab.id, { type: 'SHOW_UNSTARRED_BADGE' }, () => {
    void chrome.runtime.lastError;
    refreshUnstarredStatus();
    // Close the popup so the user can see the badge they just summoned.
    setTimeout(() => window.close(), 200);
  });
}

// Check if model data has been captured
function checkDataStatus() {
  if (!currentTab) return;
  chrome.tabs.sendMessage(currentTab.id, { type: 'CHECK_DATA_STATUS' }, (response) => {
    if (chrome.runtime.lastError || !response) return;
    const warning = document.getElementById('data-warning');
    const exportBtn = document.getElementById('export-full-model-btn');
    if (!response.hasData) {
      warning.style.display = '';
      exportBtn.disabled = true;
    } else {
      warning.style.display = 'none';
    }
  });
}

// Ping the content script to check if it's loaded in the tab
function pingContentScript(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: 'PING' }, (response) => {
      if (chrome.runtime.lastError || !response?.pong) {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

// Inject the content script and reload the tab so inject.js can capture WebSocket data
async function injectAndReload(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
  } catch (e) {
    // Injection may fail if we lack host permission; that's ok, the reload
    // will still trigger the manifest-declared content script.
  }
  await chrome.tabs.reload(tabId);
}

// Helper: paint the small subtitle + dot underneath the brand title.
function setHeaderState(text, connected) {
  const subtitle = document.getElementById('header-subtitle-text');
  const dot = document.getElementById('header-dot');
  if (subtitle) subtitle.textContent = text;
  if (dot) dot.classList.toggle('connected', !!connected);
}

// Update status based on current tab
async function updateStatus() {
  const addDomainBtn = document.getElementById('add-domain-btn');
  const exportFullModelBtn = document.getElementById('export-full-model-btn');
  const downloadJsonBtn = document.getElementById('download-json-btn');
  const thisJobBlock = document.getElementById('this-job-block');

  if (!currentTab || !currentTab.url) {
    setHeaderState('No active tab', false);
    if (thisJobBlock) thisJobBlock.style.display = 'none';
    addDomainBtn.disabled = true;
    exportFullModelBtn.disabled = true;
    downloadJsonBtn.disabled = true;
    return;
  }

  // Check if current URL is on an allowed domain
  const isAllowed = await isUrlAllowed(currentTab.url);
  const domain = extractDomain(currentTab.url);

  if (isAllowed) {
    // Ping the content script to verify it's actually loaded
    contentScriptConnected = await pingContentScript(currentTab.id);

    if (contentScriptConnected) {
      setHeaderState(`Connected · ${domain}`, true);
      if (thisJobBlock) thisJobBlock.style.display = '';
      exportFullModelBtn.disabled = false;
      downloadJsonBtn.disabled = false;

      // Check if model data has been captured
      checkDataStatus();

      // Apply stick line preference
      const toggle = document.getElementById('extend-stickline-toggle');
      toggleStickLine(toggle.checked);

      // Render the unstarred-count status row + Show-on-map button
      refreshUnstarredStatus();
    } else {
      setHeaderState(`Reconnecting to ${domain}…`, false);
      if (thisJobBlock) thisJobBlock.style.display = 'none';
      exportFullModelBtn.disabled = true;
      downloadJsonBtn.disabled = true;

      // Auto-inject and reload so the content script + WebSocket interceptor are present
      await injectAndReload(currentTab.id);

      // Show a message — the popup will close on reload, but if it stays open
      // the user knows what happened
      setHeaderState('Page refreshed — reopen to export', false);
    }

    // Check if it's a model editor page
    const isModelEditor = isModelEditorUrl(currentTab.url);
    if (isModelEditor) {
      addDomainBtn.disabled = true;
      addDomainBtn.textContent = 'Already added';
    } else {
      addDomainBtn.disabled = true;
      addDomainBtn.textContent = 'Not on Katapult';
    }
  } else {
    setHeaderState(`Inactive on ${domain}`, false);
    if (thisJobBlock) thisJobBlock.style.display = 'none';
    exportFullModelBtn.disabled = true;
    downloadJsonBtn.disabled = true;

    // Check if current page could be added
    const isModelEditor = isModelEditorUrl(currentTab.url);
    if (isModelEditor) {
      addDomainBtn.disabled = false;
      addDomainBtn.textContent = 'Add current domain';
    } else {
      addDomainBtn.disabled = true;
      addDomainBtn.textContent = 'Not on Katapult';
    }
  }
}

// Load and display custom domain list
async function loadDomainList() {
  const domainListElement = document.getElementById('domain-list');
  const customDomains = await getCustomDomains();

  if (customDomains.length === 0) {
    domainListElement.innerHTML = '<div class="no-domains">No custom domains added yet</div>';
    return;
  }

  domainListElement.innerHTML = '';

  for (const domain of customDomains) {
    const domainItem = document.createElement('div');
    domainItem.className = 'domain-item';

    const domainName = document.createElement('span');
    domainName.className = 'domain-name';
    domainName.textContent = domain;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = 'Remove';
    removeBtn.onclick = () => handleRemoveDomain(domain);

    domainItem.appendChild(domainName);
    domainItem.appendChild(removeBtn);
    domainListElement.appendChild(domainItem);
  }
}

// Setup event listeners
function setupEventListeners() {
  document.getElementById('add-domain-btn').addEventListener('click', handleAddDomain);
  document.getElementById('export-full-model-btn').addEventListener('click', handleExportFullModel);
  document.getElementById('download-json-btn').addEventListener('click', handleDownloadJSON);

  // Refresh page button (data warning)
  document.getElementById('refresh-page-btn').addEventListener('click', async () => {
    if (currentTab) {
      await chrome.tabs.reload(currentTab.id);
      window.close();
    }
  });

  // Stick line toggle
  document.getElementById('extend-stickline-toggle').addEventListener('change', (e) => {
    toggleStickLine(e.target.checked);
  });

  // Auto-calibrate toggle
  document.getElementById('auto-calibrate-toggle').addEventListener('change', (e) => {
    toggleAutoCalibrate(e.target.checked);
  });

  // Auto-confirm Do-it-Anyway toggle
  document.getElementById('auto-confirm-toggle').addEventListener('change', (e) => {
    toggleAutoConfirm(e.target.checked);
  });

  // "Missing main photo" badge toggle
  document.getElementById('unstarred-badge-toggle').addEventListener('change', (e) => {
    toggleUnstarredBadge(e.target.checked);
  });

  // "Show on map" — undismiss the badge from the popup
  document.getElementById('show-unstarred-btn').addEventListener('click', handleShowUnstarred);

  // Environment radio buttons
  document.querySelectorAll('input[name="environment"]').forEach(radio => {
    radio.addEventListener('change', (e) => saveEnvironment(e.target.value));
  });

  // Triple-click the title to show dev environment toggle
  let clickCount = 0;
  let clickTimer = null;
  document.querySelector('h2').addEventListener('click', () => {
    clickCount++;
    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => { clickCount = 0; }, 500);
    if (clickCount >= 3) {
      clickCount = 0;
      const envSection = document.getElementById('env-section');
      envSection.style.display = envSection.style.display === 'none' ? '' : 'none';
    }
  });
}

// Handle add domain button click
async function handleAddDomain() {
  const addDomainBtn = document.getElementById('add-domain-btn');

  if (!currentTab || !currentTab.url) {
    showFeedback(addDomainBtn, 'No active tab', '#f44336');
    return;
  }

  // Check if it's a model editor URL
  if (!isModelEditorUrl(currentTab.url)) {
    showFeedback(addDomainBtn, 'Not on Model Editor', '#f44336');
    return;
  }

  const domain = extractDomain(currentTab.url);
  if (!domain) {
    showFeedback(addDomainBtn, 'Invalid URL', '#f44336');
    return;
  }

  // Request permission for this domain
  showFeedback(addDomainBtn, 'Requesting permission...', '#2196F3', false);

  try {
    const permissionGranted = await chrome.permissions.request({
      origins: [`https://${domain}/*`]
    });

    if (!permissionGranted) {
      showFeedback(addDomainBtn, 'Permission denied', '#f44336');
      return;
    }

    // Add domain to storage
    const result = await addDomain(domain);

    if (!result.success) {
      showFeedback(addDomainBtn, result.error, '#f44336');
      return;
    }

    // Notify background script to register content scripts
    await chrome.runtime.sendMessage({
      type: 'REGISTER_DOMAIN',
      domain: domain
    });

    // Success!
    showFeedback(addDomainBtn, 'Domain added!', '#4CAF50');

    // Reload domain list and status
    await loadDomainList();
    await updateStatus();

  } catch (error) {
    console.error('Error adding domain:', error);
    showFeedback(addDomainBtn, 'Error occurred', '#f44336');
  }
}

// Handle remove domain button click
async function handleRemoveDomain(domain) {
  if (!confirm(`Remove ${domain} from allowed domains?`)) {
    return;
  }

  try {
    // Remove from storage
    const result = await removeDomain(domain);

    if (!result.success) {
      alert(`Error: ${result.error}`);
      return;
    }

    // Remove permission
    await chrome.permissions.remove({
      origins: [`https://${domain}/*`]
    });

    // Notify background script to unregister content scripts
    await chrome.runtime.sendMessage({
      type: 'UNREGISTER_DOMAIN',
      domain: domain
    });

    // Reload domain list and status
    await loadDomainList();
    await updateStatus();

  } catch (error) {
    console.error('Error removing domain:', error);
    alert('Error removing domain');
  }
}

// Handle download JSON button click (debug menu)
function handleDownloadJSON() {
  const btn = document.getElementById('download-json-btn');
  showFeedback(btn, 'Building...', '#FF9800', false);

  chrome.tabs.sendMessage(currentTab.id, {
    type: 'EXPORT_FULL_MODEL',
    skipDownload: false
  }, (response) => {
    if (chrome.runtime.lastError) {
      showFeedback(btn, 'Error: not connected', '#f44336');
      return;
    }

    if (response && response.success) {
      const summary = `${response.nodeCount}N ${response.connectionCount}C`;
      showFeedback(btn, `Downloaded (${summary})`, '#4CAF50');
    } else {
      showFeedback(btn, `Error: ${(response && response.error) || 'unknown'}`, '#f44336');
    }
  });
}

// Handle export full model button click
function handleExportFullModel() {
  const btn = document.getElementById('export-full-model-btn');
  showFeedback(btn, 'Exporting...', '#1976D2', false);

  chrome.tabs.sendMessage(currentTab.id, {
    type: 'EXPORT_FULL_MODEL',
    skipDownload: true
  }, (response) => {
    if (chrome.runtime.lastError) {
      // Content script not reachable — auto-reload to fix
      showFeedback(btn, 'Reconnecting... page will refresh', '#FF9800', false);
      injectAndReload(currentTab.id);
      return;
    }

    if (response && response.success && response.nodeCount === 0 && response.connectionCount === 0) {
      showFeedback(btn, 'No model data — refresh the page', '#FF9800');
      document.getElementById('data-warning').style.display = '';
      return;
    }

    if (response && response.success) {
      const summary = `${response.nodeCount}N ${response.connectionCount}C ${response.sectionCount || 0}S`;
      showFeedback(btn, `Opening import... (${summary})`, '#4CAF50');

      // Open the Cloneable import page — bridge script will auto-inject
      const env = document.querySelector('input[name="environment"]:checked').value;
      chrome.tabs.create({
        url: ENV_URLS[env]
      });
    } else {
      showFeedback(btn, `Error: ${(response && response.error) || 'unknown'}`, '#f44336');
    }
  });
}

// Show temporary feedback on a button
function showFeedback(button, message, color, temporary = true) {
  const originalText = button.textContent;
  const originalBackground = button.style.background;

  button.textContent = message;
  button.style.background = color;

  if (temporary) {
    setTimeout(() => {
      button.textContent = originalText;
      button.style.background = originalBackground;
    }, 2000);
  }
}

// Initialize when popup opens
init();
