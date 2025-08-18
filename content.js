// Content script for Katapult to Cloneable Exporter

// Import Interface Class (embedded directly in content script)
class ImportInterface {
  constructor() {
    this.selectedNodes = [];
    this.nodeAttributes = {};
    this.imageAttachments = {};
    this.availableAttributes = null;
    this.photoClassifications = null;
    
    this.init();
  }

  init() {
    // Load available attributes and classifications
    this.loadAttributeSchema();
    this.loadPhotoClassifications();
  }

  loadAttributeSchema() {
    // This would be loaded from our captured data
    this.availableAttributes = {
      // Attributes with picklists
      withPicklists: [
        {
          name: 'node_type',
          displayName: 'Node Type',
          dataType: 'picklist',
          required: false,
          categories: ['osp', 'anchor', 'fiber_callouts', 'note', 'underground'],
          values: {
            osp: ['pole', 'building attachment', 'bridge attachment', 'crossover', 'reference', 'pushbrace', 'doublewood pole', 'midspan takeoff'],
            anchor: ['existing anchor', 'new anchor', 'house'],
            fiber_callouts: ['slack loop', 'splice'],
            note: ['map note'],
            underground: ['break point', 'handhole', 'manhole', 'obstacle']
          }
        },
        {
          name: 'cable_type',
          displayName: 'Cable Type',
          dataType: 'picklist',
          required: false,
          categories: ['communications', 'power'],
          values: {
            communications: ['Telco Com', 'Fiber Optic Com', 'CATV Com', 'Guy', 'Com Drop', 'Traffic Cable', 'Alarm Cable', 'Strand Only'],
            power: ['Primary', 'Neutral', 'Secondary', 'Open Secondary', 'Power Guy', 'ADSS', 'Bundled Primary', 'Street Light Feed', 'Power Drop', 'Static Wire']
          }
        },
        {
          name: 'equipment_type',
          displayName: 'Equipment Type',
          dataType: 'picklist',
          required: false,
          categories: ['default'],
          values: {
            default: ['transformer', 'capacitor', 'drip_loop', 'riser', 'street_light']
          }
        }
      ],
      // Free-form attributes
      withoutPicklists: [
        { name: 'pole_tag', displayName: 'Pole Tag', dataType: 'text', required: false },
        { name: 'height', displayName: 'Height', dataType: 'number', required: false },
        { name: 'diameter', displayName: 'Diameter', dataType: 'number', required: false },
        { name: 'street_address', displayName: 'Street Address', dataType: 'text', required: false },
        { name: 'note', displayName: 'Note', dataType: 'textarea', required: false }
      ]
    };
  }

  loadPhotoClassifications() {
    this.photoClassifications = [
      { id: 'anchor_point', name: 'Anchor Point', shortcut: 'a', type: 'point' },
      { id: 'back', name: 'Back', shortcut: 'b', type: 'chip' },
      { id: 'birthmark', name: 'Birthmark', shortcut: 'i', type: 'chip' },
      { id: 'cable_tag', name: 'CableTag', shortcut: 'c', type: 'chip' },
      { id: 'grounding', name: 'Grounding', shortcut: 'g', type: 'chip' },
      { id: 'pole_tag', name: 'Pole Tag', shortcut: 't', type: 'chip' },
      { id: 'pole_top', name: 'Pole Top', shortcut: '4', type: 'point' },
      { id: 'upshot', name: 'Upshot', shortcut: 'u', type: 'chip' }
    ];
  }

  createImportModal() {
    console.log('[ImportInterface] Creating modal...');
    const modal = document.createElement('div');
    modal.id = 'import-modal';
    modal.className = 'import-modal';
    modal.innerHTML = `
      <div class="import-modal-content">
        <div class="import-header">
          <h2>Import Nodes to Cloneable</h2>
          <button class="close-btn" id="modal-close-btn">&times;</button>
        </div>
        
        <div class="import-body">
          <!-- Step 1: Node Selection -->
          <div class="import-section" id="node-selection">
            <h3 data-step="1">Step 1: Select Nodes</h3>
            <div class="node-type-selector">
              ${this.renderNodeTypeSelector()}
            </div>
            <div class="selected-nodes-list" id="selected-nodes-list"></div>
          </div>

          <!-- Step 2: Review & Export -->
          <div class="import-section" id="export-review">
            <h3 data-step="2">Step 2: Review & Export</h3>
            <div class="export-summary" id="export-summary"></div>
          </div>
        </div>

        <div class="import-footer">
          <button class="btn-secondary" id="preview-json-btn">Preview JSON</button>
          <button class="btn-primary" id="export-data-btn">Export to Cloneable</button>
        </div>
      </div>
    `;

    // Add event listeners after creating the modal
    this.attachEventListeners(modal);
    
    // Initialize summary
    this.updateSelectedNodesList();
    this.updateExportSummary();

    return modal;
  }
  
  attachEventListeners(modal) {
    const self = this;
    
    // Close button
    modal.querySelector('#modal-close-btn').addEventListener('click', () => {
      modal.remove();
    });
    
    // Node checkboxes
    modal.querySelectorAll('.node-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        self.toggleNode(e.target);
      });
    });
    
    // Preview JSON button
    modal.querySelector('#preview-json-btn').addEventListener('click', () => {
      self.previewExport();
    });
    
    // Export data button
    modal.querySelector('#export-data-btn').addEventListener('click', () => {
      self.exportData();
    });
  }

  renderNodeTypeSelector() {
    const nodeTypes = this.availableAttributes.withPicklists.find(attr => attr.name === 'node_type');
    let html = '<div class="node-type-grid">';
    
    Object.entries(nodeTypes.values).forEach(([category, types]) => {
      html += `
        <div class="node-category">
          <h4>${category.toUpperCase()}</h4>
          <div class="node-type-list">
      `;
      types.forEach(type => {
        html += `
          <label class="node-type-item">
            <input type="checkbox" value="${category}:${type}" data-category="${category}" data-type="${type}" class="node-checkbox">
            <span>${type}</span>
          </label>
        `;
      });
      html += '</div></div>';
    });
    
    html += '</div>';
    return html;
  }

  toggleNode(checkbox) {
    const [category, type] = checkbox.value.split(':');
    
    if (checkbox.checked) {
      this.selectedNodes.push({ category, type, id: Date.now() });
    } else {
      this.selectedNodes = this.selectedNodes.filter(n => 
        !(n.category === category && n.type === type)
      );
    }
    
    this.updateSelectedNodesList();
    this.updateExportSummary();
  }

  updateSelectedNodesList() {
    const listEl = document.getElementById('selected-nodes-list');
    if (!listEl) return;
    
    if (this.selectedNodes.length === 0) {
      listEl.innerHTML = '<p class="no-selection">No nodes selected</p>';
      return;
    }
    
    listEl.innerHTML = `
      <div class="selected-nodes">
        ${this.selectedNodes.map(node => `
          <div class="selected-node-chip">
            <span>${node.category}: ${node.type}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  updateExportSummary() {
    const summaryEl = document.getElementById('export-summary');
    if (!summaryEl) return;
    
    summaryEl.innerHTML = `
      <div class="summary-stats">
        <div class="stat">
          <span class="stat-value">${this.selectedNodes.length}</span>
          <span class="stat-label">Nodes Selected</span>
        </div>
      </div>
    `;
  }

  previewExport() {
    const exportData = this.buildExportData();
    const modal = document.createElement('div');
    modal.className = 'preview-modal';
    modal.innerHTML = `
      <div class="preview-content">
        <h3>Export Preview</h3>
        <pre>${JSON.stringify(exportData, null, 2)}</pre>
        <button class="close-preview-btn">Close</button>
      </div>
    `;
    
    modal.querySelector('.close-preview-btn').addEventListener('click', () => {
      modal.remove();
    });
    
    document.body.appendChild(modal);
  }

  buildExportData() {
    return {
      version: '1.0',
      timestamp: new Date().toISOString(),
      source: 'katapult',
      target: 'cloneable',
      nodes: this.selectedNodes.map(node => ({
        id: node.id,
        type: `${node.category}:${node.type}`
      }))
    };
  }

  exportData() {
    const data = this.buildExportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `katapult-export-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

// Global instance
let importInterface = null;

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

function isModelEditorPage() {
  const url = window.location.href;
  return url.includes('katapultpro.com/model-editor/') && url.includes('#');
}

function getModelNameFromURL() {
  const hash = window.location.hash;
  if (hash && hash.length > 1) {
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
    showAdvancedImportInterface();
  });
  
  return button;
}

function showAdvancedImportInterface() {
  console.log('[Cloneable] Showing advanced import interface...');
  
  // Check if styles are already loaded
  if (!document.querySelector('link[href*="import-interface.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('import-interface.css');
    document.head.appendChild(link);
  }
  
  // Create the interface if not already created
  if (!importInterface) {
    importInterface = new ImportInterface();
  }
  
  // Update with real node types if available
  if (window.cloneableNodeTypes && window.cloneableNodeTypes.length > 0) {
    console.log('[Cloneable] Updating interface with captured node types');
    const nodeTypesByCategory = {};
    window.cloneableNodeTypes.forEach(item => {
      if (!nodeTypesByCategory[item.category]) {
        nodeTypesByCategory[item.category] = [];
      }
      nodeTypesByCategory[item.category].push(item.type);
    });
    
    // Update the interface's available attributes with real data
    const nodeTypeAttr = importInterface.availableAttributes.withPicklists.find(attr => attr.name === 'node_type');
    if (nodeTypeAttr) {
      nodeTypeAttr.values = nodeTypesByCategory;
      nodeTypeAttr.categories = Object.keys(nodeTypesByCategory);
    }
  }
  
  // Create and show the modal
  const modal = importInterface.createImportModal();
  document.body.appendChild(modal);
  console.log('[Cloneable] Modal added to page');
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
    if (!document.getElementById('cloneable-export-btn')) {
      injectButton();
    }
  } else {
    removeButton();
  }
}

function injectButton() {
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
      updateButtonStatus();
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
checkCaptureStatus();
setInterval(checkCaptureStatus, 2000);

// Check on initial load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', checkAndInjectButton);
} else {
  checkAndInjectButton();
}

// Listen for URL changes
window.addEventListener('hashchange', checkAndInjectButton);
window.addEventListener('popstate', checkAndInjectButton);

// Also listen for dynamic content changes
const observer = new MutationObserver(() => {
  clearTimeout(window.cloneableCheckTimeout);
  window.cloneableCheckTimeout = setTimeout(checkAndInjectButton, 100);
});

// Start observing when document.body is available
function startObserving() {
  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  } else {
    setTimeout(startObserving, 100);
  }
}

startObserving();