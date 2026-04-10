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

// Update status based on current tab
async function updateStatus() {
  const statusElement = document.getElementById('status');
  const addDomainBtn = document.getElementById('add-domain-btn');
  const exportFullModelBtn = document.getElementById('export-full-model-btn');
  const downloadJsonBtn = document.getElementById('download-json-btn');

  if (!currentTab || !currentTab.url) {
    statusElement.textContent = 'No active tab';
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
      statusElement.textContent = `Active on ${domain}`;
      statusElement.classList.add('active');
      exportFullModelBtn.disabled = false;
      downloadJsonBtn.disabled = false;

      // Apply stick line preference
      const toggle = document.getElementById('extend-stickline-toggle');
      if (toggle.checked) {
        toggleStickLine(true);
      }
    } else {
      statusElement.textContent = `Reconnecting to ${domain}...`;
      statusElement.classList.remove('active');
      exportFullModelBtn.disabled = true;
      downloadJsonBtn.disabled = true;

      // Auto-inject and reload so the content script + WebSocket interceptor are present
      await injectAndReload(currentTab.id);

      // Show a message — the popup will close on reload, but if it stays open
      // the user knows what happened
      statusElement.textContent = 'Page refreshed — reopen to export';
    }

    // Check if it's a model editor page
    const isModelEditor = isModelEditorUrl(currentTab.url);
    if (isModelEditor) {
      addDomainBtn.disabled = true;
      addDomainBtn.textContent = 'Already Active';
    } else {
      addDomainBtn.disabled = true;
      addDomainBtn.textContent = 'Not on Model Editor';
    }
  } else {
    statusElement.textContent = `Inactive on ${domain}`;
    statusElement.classList.remove('active');
    exportFullModelBtn.disabled = true;
    downloadJsonBtn.disabled = true;

    // Check if current page could be added
    const isModelEditor = isModelEditorUrl(currentTab.url);
    if (isModelEditor) {
      addDomainBtn.disabled = false;
      addDomainBtn.textContent = 'Add Current Domain';
    } else {
      addDomainBtn.disabled = true;
      addDomainBtn.textContent = 'Not on Model Editor';
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

  // Stick line toggle
  document.getElementById('extend-stickline-toggle').addEventListener('change', (e) => {
    toggleStickLine(e.target.checked);
  });

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
