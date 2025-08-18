// Content script for Katapult to Cloneable Exporter

// Inject the WebSocket interceptor as early as possible
(function() {
  // Inject main interceptor
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('inject.js');
  script.onload = function() {
    this.remove();
    
    // Then inject reconstructor
    const reconstructorScript = document.createElement('script');
    reconstructorScript.src = chrome.runtime.getURL('inject-reconstructor.js');
    reconstructorScript.onload = function() {
      this.remove();
      
      // Finally inject fallback data
      const fallbackScript = document.createElement('script');
      fallbackScript.src = chrome.runtime.getURL('fallback-data.js');
      fallbackScript.onload = function() {
        this.remove();
      };
      (document.head || document.documentElement).appendChild(fallbackScript);
    };
    (document.head || document.documentElement).appendChild(reconstructorScript);
  };
  (document.head || document.documentElement).appendChild(script);
})();

// Function removed - using injected script approach instead

function isModelEditorPage() {
  // Check if we're on the model editor page with a model loaded
  const url = window.location.href;
  return url.includes('katapultpro.com/model-editor/') && url.includes('#');
}

function getModelNameFromURL() {
  // Extract model name from URL hash
  const hash = window.location.hash;
  if (hash && hash.length > 1) {
    // Remove the # and decode the model name
    return decodeURIComponent(hash.substring(1));
  }
  return null;
}

function createExportButton() {
  const button = document.createElement('button');
  button.id = 'cloneable-export-btn';
  button.textContent = 'Export';
  button.className = 'cloneable-export-button';
  button.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 999999;
    padding: 12px 24px;
    background: #4CAF50;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    transition: all 0.3s ease;
  `;
  
  button.addEventListener('mouseenter', () => {
    button.style.transform = 'scale(1.05)';
    button.style.boxShadow = '0 6px 12px rgba(0,0,0,0.15)';
  });
  
  button.addEventListener('mouseleave', () => {
    button.style.transform = 'scale(1)';
    button.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
  });
  
  button.addEventListener('click', () => {
    showNodeTypesModal();
  });
  
  return button;
}

function findModelData() {
  const modelData = {};
  
  // 1. Check localStorage
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    try {
      const value = localStorage.getItem(key);
      if (value && (key.toLowerCase().includes('model') || key.toLowerCase().includes('katapult'))) {
        modelData[`localStorage.${key}`] = JSON.parse(value);
      }
    } catch (e) {
      // Not JSON, skip
    }
  }
  
  // 2. Check sessionStorage
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    try {
      const value = sessionStorage.getItem(key);
      if (value && (key.toLowerCase().includes('model') || key.toLowerCase().includes('katapult'))) {
        modelData[`sessionStorage.${key}`] = JSON.parse(value);
      }
    } catch (e) {
      // Not JSON, skip
    }
  }
  
  // 3. Check window object for common patterns
  const windowKeys = ['model', 'data', 'katapult', '__INITIAL_STATE__', '__DATA__', 'app'];
  windowKeys.forEach(key => {
    if (window[key]) {
      modelData[`window.${key}`] = window[key];
    }
  });
  
  // 4. Check for data in script tags
  const scriptTags = document.querySelectorAll('script[type="application/json"], script[data-type="model"]');
  scriptTags.forEach((script, index) => {
    try {
      const data = JSON.parse(script.textContent);
      modelData[`scriptTag${index}`] = data;
    } catch (e) {
      // Not valid JSON
    }
  });
  
  return modelData;
}

function processNodeTypes(attributes) {
  console.log('\n=== NODE TYPES FROM MODEL ATTRIBUTES ===');
  
  // Look for node_type attribute
  if (attributes.node_type) {
    const nodeTypeAttr = attributes.node_type;
    console.log('Node type attribute found:', nodeTypeAttr);
    
    // Extract picklists which contain the actual node types
    if (nodeTypeAttr.picklists) {
      const allNodeTypes = [];
      
      Object.entries(nodeTypeAttr.picklists).forEach(([category, types]) => {
        console.log(`\n${category.toUpperCase()} node types:`);
        
        if (types && typeof types === 'object') {
          const typeValues = Object.values(types).map(t => t.value);
          console.log(typeValues);
          
          typeValues.forEach(type => {
            allNodeTypes.push({
              category: category,
              type: type
            });
          });
        }
      });
      
      console.log('\n=== ALL NODE TYPES SUMMARY ===');
      console.log('Total categories:', Object.keys(nodeTypeAttr.picklists).length);
      console.log('Total node types:', allNodeTypes.length);
      console.log('\nComplete list:');
      allNodeTypes.forEach(item => {
        console.log(`  ${item.category}: ${item.type}`);
      });
      
      // Store for easy access
      window.cloneableNodeTypes = allNodeTypes;
      console.log('\nStored in window.cloneableNodeTypes for easy access');
    }
  } else {
    console.log('No node_type attribute found in model attributes');
  }
  
  // Also look for node_sub_type if it exists
  if (attributes.node_sub_type) {
    const nodeSubTypeAttr = attributes.node_sub_type;
    console.log('\n=== NODE SUB-TYPES ===');
    console.log('Node sub-type attribute found:', nodeSubTypeAttr);
    
    if (nodeSubTypeAttr.picklists) {
      Object.entries(nodeSubTypeAttr.picklists).forEach(([category, types]) => {
        console.log(`\n${category} sub-types:`);
        if (types && typeof types === 'object') {
          const typeValues = Object.values(types).map(t => t.value);
          console.log(typeValues);
        }
      });
    }
  }
}

function createModal() {
  const modal = document.createElement('div');
  modal.id = 'cloneable-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000000;
  `;
  
  const modalContent = document.createElement('div');
  modalContent.style.cssText = `
    background: white;
    border-radius: 12px;
    padding: 24px;
    max-width: 600px;
    max-height: 80vh;
    overflow: auto;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
    position: relative;
  `;
  
  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 2px solid #e5e7eb;
  `;
  
  const title = document.createElement('h2');
  title.textContent = 'Node Types';
  title.style.cssText = `
    margin: 0;
    font-size: 24px;
    font-weight: 700;
    color: #1f2937;
  `;
  
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '×';
  closeBtn.style.cssText = `
    background: none;
    border: none;
    font-size: 32px;
    cursor: pointer;
    color: #6b7280;
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.2s;
  `;
  
  closeBtn.addEventListener('mouseenter', () => {
    closeBtn.style.background = '#f3f4f6';
    closeBtn.style.color = '#1f2937';
  });
  
  closeBtn.addEventListener('mouseleave', () => {
    closeBtn.style.background = 'none';
    closeBtn.style.color = '#6b7280';
  });
  
  closeBtn.addEventListener('click', () => {
    modal.remove();
  });
  
  header.appendChild(title);
  header.appendChild(closeBtn);
  
  const content = document.createElement('div');
  content.id = 'cloneable-modal-content';
  content.style.cssText = `
    color: #374151;
    line-height: 1.6;
  `;
  
  modalContent.appendChild(header);
  modalContent.appendChild(content);
  modal.appendChild(modalContent);
  
  // Click outside to close
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
  
  return { modal, content };
}

function showNodeTypesModal() {
  // Remove existing modal if any
  const existingModal = document.getElementById('cloneable-modal');
  if (existingModal) {
    existingModal.remove();
  }
  
  const { modal, content } = createModal();
  
  // Request node types data
  window.postMessage({ type: 'cloneable-get-model-attributes' }, '*');
  
  // Initially show loading state
  content.innerHTML = `
    <div style="text-align: center; padding: 40px; color: #6b7280;">
      <div style="margin-bottom: 16px; font-size: 18px;">Loading node types...</div>
      <div style="font-size: 14px;">Please wait while we fetch the data</div>
    </div>
  `;
  
  // Check if we already have the data
  if (window.cloneableNodeTypes && window.cloneableNodeTypes.length > 0) {
    displayNodeTypes(content, window.cloneableNodeTypes);
  }
  
  document.body.appendChild(modal);
}

function displayNodeTypes(container, nodeTypes) {
  if (!nodeTypes || nodeTypes.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: #6b7280;">
        <div style="margin-bottom: 16px; font-size: 18px;">No node types found</div>
        <div style="font-size: 14px;">Make sure you're on a model editor page with data loaded</div>
      </div>
    `;
    return;
  }
  
  // Group node types by category
  const grouped = {};
  nodeTypes.forEach(item => {
    if (!grouped[item.category]) {
      grouped[item.category] = [];
    }
    grouped[item.category].push(item.type);
  });
  
  let html = '';
  
  // Statistics
  html += `
    <div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
      <div style="display: flex; justify-content: space-around; text-align: center;">
        <div>
          <div style="font-size: 24px; font-weight: 700; color: #4CAF50;">${Object.keys(grouped).length}</div>
          <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">Categories</div>
        </div>
        <div>
          <div style="font-size: 24px; font-weight: 700; color: #2563eb;">${nodeTypes.length}</div>
          <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">Total Node Types</div>
        </div>
      </div>
    </div>
  `;
  
  // Categories and types
  Object.entries(grouped).forEach(([category, types]) => {
    html += `
      <div style="margin-bottom: 24px;">
        <h3 style="font-size: 16px; font-weight: 600; color: #1f2937; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
          ${category} (${types.length})
        </h3>
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
    `;
    
    types.forEach(type => {
      html += `
        <span style="
          background: #e5e7eb;
          color: #374151;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 14px;
          font-family: monospace;
        ">${type}</span>
      `;
    });
    
    html += `
        </div>
      </div>
    `;
  });
  
  // Export button
  html += `
    <div style="margin-top: 32px; padding-top: 20px; border-top: 2px solid #e5e7eb;">
      <button id="export-json-btn" style="
        width: 100%;
        padding: 12px;
        background: #2563eb;
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s;
      ">Export as JSON</button>
    </div>
  `;
  
  container.innerHTML = html;
  
  // Add export functionality
  const exportBtn = document.getElementById('export-json-btn');
  if (exportBtn) {
    exportBtn.addEventListener('mouseenter', () => {
      exportBtn.style.background = '#1d4ed8';
    });
    exportBtn.addEventListener('mouseleave', () => {
      exportBtn.style.background = '#2563eb';
    });
    exportBtn.addEventListener('click', () => {
      const data = {
        timestamp: new Date().toISOString(),
        url: window.location.href,
        model: getModelNameFromURL(),
        categories: grouped,
        allNodeTypes: nodeTypes
      };
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `node-types-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }
}

function handleExport() {
  const modelName = getModelNameFromURL();
  console.log('Export to Cloneable clicked for model:', modelName);
  
  // Find model data
  const modelData = findModelData();
  console.log('Found model data sources:', Object.keys(modelData));
  console.log('Model data:', modelData);
  
  // Request WebSocket data from the injected script
  window.postMessage({ type: 'cloneable-log-websocket-data' }, '*');
  
  // Request model attributes data
  window.postMessage({ type: 'cloneable-get-model-attributes' }, '*');
  
  // Log to help identify the structure
  if (Object.keys(modelData).length > 0) {
    console.log('\n=== MODEL DATA FOUND ===');
    Object.entries(modelData).forEach(([source, data]) => {
      console.log(`Source: ${source}`);
      console.log(data);
    });
  } else {
    console.log('No model data found in storage or window object.');
  }
  
  // Get recent API URLs from background script
  chrome.runtime.sendMessage({action: 'getModelUrls'}, (response) => {
    if (response && response.lastModelUrl) {
      console.log('\nRecent model API URL:', response.lastModelUrl);
      console.log('To manually fetch this URL, run in console:');
      console.log(`fetch('${response.lastModelUrl}').then(r => r.json()).then(console.log)`);
    }
  });
  
  // Additional debugging info
  console.log('\n=== DEBUGGING TIPS ===');
  console.log('1. Check all WebSocket messages: window.katapultWebSocketMessages');
  console.log('2. Get last WebSocket reference: window.lastWebSocket');
  console.log('3. Get captured model attributes: window.katapultModelAttributes');
  console.log('4. Get COMBINED model attributes: window.katapultCombinedAttributes');
  console.log('5. Get latest model attributes: window.latestModelAttributes');
  console.log('6. Filter messages by content:');
  console.log('   window.katapultWebSocketMessages.filter(m => JSON.stringify(m).includes("your_model_name"))');
  console.log('7. Find model attribute messages dynamically:');
  console.log('   window.katapultWebSocketMessages.filter(m => m.data && m.data.t === "d" && m.data.d && m.data.d.b && m.data.d.b.d)');
  console.log('8. Check MODEL schema attributes:');
  console.log('   window.katapultModelSchemaAttributes');
  console.log('9. Check if node_type exists in MODEL schema:');
  console.log('   window.katapultModelSchemaAttributes && window.katapultModelSchemaAttributes.node_type');
  console.log('10. See all captured paths:');
  console.log('   window.katapultModelAttributes.map(m => m.path)');
  console.log('11. Try these commands in the console:');
  console.log('   - Object.keys(window).filter(k => k.includes("model"))');
  console.log('   - Object.keys(window).filter(k => k.includes("node"))');
  console.log('   - document.querySelectorAll("[data-model]")');
  console.log('   - document.querySelectorAll("[data-node]")');
  
  
  if (modelName) {
    alert(`Model: ${modelName}\n\nCheck the browser console (F12) for WebSocket data.\n\nCaptured ${captureStatus.messageCount} WebSocket messages.`);
  } else {
    alert('No model selected. Please select a model to export.');
  }
}

function removeButton() {
  const existingButton = document.getElementById('cloneable-export-btn');
  if (existingButton) {
    existingButton.remove();
  }
  const existingModal = document.getElementById('cloneable-modal');
  if (existingModal) {
    existingModal.remove();
  }
}

function checkAndInjectButton() {
  if (isModelEditorPage()) {
    // We're on a model editor page with a model
    if (!document.getElementById('cloneable-export-btn')) {
      injectButton();
    }
  } else {
    // Not on a model editor page, remove button if it exists
    removeButton();
  }
}

function injectButton() {
  // Create and inject the button directly to body
  const button = createExportButton();
  document.body.appendChild(button);
}

// Store capture status
let captureStatus = {
  messageCount: 0,
  socketCount: 0
};

// Add message listener to receive data from injected script
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'cloneable-websocket-update') {
    console.log('[Cloneable Extension] WebSocket update:', event.data);
    captureStatus = event.data;
    updateButtonStatus();
  }
  
  if (event.data && event.data.type === 'cloneable-websocket-data') {
    captureStatus = {
      messageCount: event.data.messages.length,
      socketCount: event.data.socketCount
    };
    updateButtonStatus();
  }
  
  if (event.data && event.data.type === 'cloneable-model-attributes') {
    console.log('[DEBUG] Received cloneable-model-attributes message:', event.data);
    
    // Check for directly provided node types from reconstruction
    if (event.data.nodeTypes && event.data.nodeTypes.length > 0) {
      console.log('[DEBUG] Got reconstructed node types!', event.data.nodeTypes.length, 'types');
      window.cloneableNodeTypes = event.data.nodeTypes;
      
      // Update modal if it's open
      const modalContent = document.getElementById('cloneable-modal-content');
      if (modalContent) {
        displayNodeTypes(modalContent, event.data.nodeTypes);
      }
      
      // Update button status
      updateButtonStatus();
    }
    
    if (event.data.latestAttributes || event.data.combinedAttributes) {
      const attributes = event.data.combinedAttributes || event.data.latestAttributes;
      console.log('\n=== MODEL ATTRIBUTES FOUND ===');
      console.log('Latest model attributes:', attributes);
      
      // Log attribute names for easy reference
      const attributeNames = Object.keys(attributes || {});
      console.log(`Found ${attributeNames.length} attributes:`, attributeNames);
      
      // Store globally for easy access
      window.cloneableModelAttributes = attributes;
      console.log('Stored in window.cloneableModelAttributes for easy access');
      
      // Now process node types if available
      if (attributes && attributes.node_type) {
        console.log('[DEBUG] Processing node_type attribute');
        processNodeTypes(attributes);
      } else {
        console.log('[DEBUG] No node_type attribute found in:', attributeNames);
      }
      
      // Update modal if it's open
      const modalContent = document.getElementById('cloneable-modal-content');
      if (modalContent) {
        if (window.cloneableNodeTypes && window.cloneableNodeTypes.length > 0) {
          console.log('[DEBUG] Updating modal with node types');
          displayNodeTypes(modalContent, window.cloneableNodeTypes);
        } else {
          console.log('[DEBUG] No cloneableNodeTypes available yet');
        }
      }
    } else {
      console.log('[DEBUG] No attributes in message:', event.data);
    }
    
    if (event.data.modelAttributes && event.data.modelAttributes.length > 0) {
      console.log(`\nTotal captured model attribute messages: ${event.data.modelAttributes.length}`);
      event.data.modelAttributes.forEach((msg, index) => {
        console.log(`Model attributes message ${index + 1}:`, msg.path);
      });
    }
  }
});

// Update button to show capture status
function updateButtonStatus() {
  const button = document.getElementById('cloneable-export-btn');
  if (button && window.cloneableNodeTypes && window.cloneableNodeTypes.length > 0) {
    button.textContent = `Export (${window.cloneableNodeTypes.length} types)`;
    button.style.backgroundColor = '#4CAF50';
  } else if (button && captureStatus.messageCount > 0) {
    button.textContent = `Export`;
    button.style.backgroundColor = '#4CAF50';
  } else if (button) {
    button.textContent = 'Export';
    button.style.backgroundColor = '#ff9800';
  }
}

// Check capture status periodically
function checkCaptureStatus() {
  // Request status update from injected script
  window.postMessage({ type: 'cloneable-get-websocket-data' }, '*');
}

// Start checking capture status
checkCaptureStatus(); // Check immediately
setInterval(checkCaptureStatus, 2000); // Then every 2 seconds

// Check on initial load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', checkAndInjectButton);
} else {
  checkAndInjectButton();
}

// Listen for URL changes (including hash changes)
window.addEventListener('hashchange', checkAndInjectButton);
window.addEventListener('popstate', checkAndInjectButton);

// Also listen for dynamic content changes
const observer = new MutationObserver(() => {
  // Debounce the check to avoid excessive calls
  clearTimeout(window.cloneableCheckTimeout);
  window.cloneableCheckTimeout = setTimeout(checkAndInjectButton, 100);
});

// Only start observing when document.body is available
function startObserving() {
  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  } else {
    // Try again in a moment
    setTimeout(startObserving, 100);
  }
}

startObserving();