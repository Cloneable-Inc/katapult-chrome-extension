// Popup script to show extension status and manage domains

let currentTab = null;

// Initialize popup
async function init() {
  // Get current tab
  const tabs = await chrome.tabs.query({active: true, currentWindow: true});
  currentTab = tabs[0];

  // Update status
  await updateStatus();

  // Load and display custom domains
  await loadDomainList();

  // Setup event listeners
  setupEventListeners();
}

// Update status based on current tab
async function updateStatus() {
  const statusElement = document.getElementById('status');
  const debugBtn = document.getElementById('dump-websocket-btn');
  const addDomainBtn = document.getElementById('add-domain-btn');
  const exportFullModelBtn = document.getElementById('export-full-model-btn');

  if (!currentTab || !currentTab.url) {
    statusElement.textContent = 'No active tab';
    debugBtn.disabled = true;
    addDomainBtn.disabled = true;
    exportFullModelBtn.disabled = true;
    return;
  }

  // Check if current URL is on an allowed domain
  const isAllowed = await isUrlAllowed(currentTab.url);
  const domain = extractDomain(currentTab.url);

  if (isAllowed) {
    statusElement.textContent = `Active on ${domain}`;
    statusElement.classList.add('active');
    debugBtn.disabled = false;
    exportFullModelBtn.disabled = false;

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
    debugBtn.disabled = true;
    exportFullModelBtn.disabled = true;

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
  // Add domain button
  document.getElementById('add-domain-btn').addEventListener('click', handleAddDomain);

  // Export full model button
  document.getElementById('export-full-model-btn').addEventListener('click', handleExportFullModel);

  // Debug button
  document.getElementById('dump-websocket-btn').addEventListener('click', handleDumpWebSocket);
}

// Handle add domain button click
async function handleAddDomain() {
  const addDomainBtn = document.getElementById('add-domain-btn');

  if (!currentTab || !currentTab.url) {
    showFeedback(addDomainBtn, '❌ No active tab', '#f44336');
    return;
  }

  // Check if it's a model editor URL
  if (!isModelEditorUrl(currentTab.url)) {
    showFeedback(addDomainBtn, '❌ Not on Model Editor', '#f44336');
    return;
  }

  const domain = extractDomain(currentTab.url);
  if (!domain) {
    showFeedback(addDomainBtn, '❌ Invalid URL', '#f44336');
    return;
  }

  // Request permission for this domain
  showFeedback(addDomainBtn, 'Requesting permission...', '#2196F3', false);

  try {
    const permissionGranted = await chrome.permissions.request({
      origins: [`https://${domain}/*`]
    });

    if (!permissionGranted) {
      showFeedback(addDomainBtn, '❌ Permission denied', '#f44336');
      return;
    }

    // Add domain to storage
    const result = await addDomain(domain);

    if (!result.success) {
      showFeedback(addDomainBtn, `❌ ${result.error}`, '#f44336');
      return;
    }

    // Notify background script to register content scripts
    await chrome.runtime.sendMessage({
      type: 'REGISTER_DOMAIN',
      domain: domain
    });

    // Success!
    showFeedback(addDomainBtn, '✓ Domain added!', '#4CAF50');

    // Reload domain list and status
    await loadDomainList();
    await updateStatus();

  } catch (error) {
    console.error('Error adding domain:', error);
    showFeedback(addDomainBtn, '❌ Error occurred', '#f44336');
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

// Handle export full model button click
function handleExportFullModel() {
  const btn = document.getElementById('export-full-model-btn');
  showFeedback(btn, 'Exporting...', '#1976D2', false);

  chrome.tabs.sendMessage(currentTab.id, {
    type: 'EXPORT_FULL_MODEL',
    skipDownload: true
  }, (response) => {
    if (chrome.runtime.lastError) {
      showFeedback(btn, 'Error: no connection', '#f44336');
      return;
    }

    if (response && response.success) {
      const summary = `${response.nodeCount}N ${response.connectionCount}C ${response.sectionCount || 0}S`;
      showFeedback(btn, `Opening import... (${summary})`, '#4CAF50');

      // Open the Cloneable import page — bridge script will auto-inject
      chrome.tabs.create({
        url: 'http://localhost:3000/tools/pole-inspect/import'
      });
    } else {
      showFeedback(btn, `Error: ${(response && response.error) || 'unknown'}`, '#f44336');
    }
  });
}

// Handle dump WebSocket button click
function handleDumpWebSocket() {
  chrome.tabs.sendMessage(currentTab.id, {
    type: 'DUMP_WEBSOCKET_DATA'
  }, (response) => {
    if (chrome.runtime.lastError) {
      return;
    }

    if (response && response.success) {
      const btn = document.getElementById('dump-websocket-btn');
      showFeedback(btn, '✓ Downloaded!', '#4CAF50');
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
