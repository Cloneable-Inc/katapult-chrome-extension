// Advanced Import Interface for Katapult to Cloneable
// Handles node selection, attribute mapping, and image classification

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
        },
        {
          name: 'pole_height',
          displayName: 'Pole Height',
          dataType: 'picklist',
          required: false,
          categories: ['default'],
          values: {
            default: ['20', '25', '30', '35', '40', '45', '50', '55', '60', '65', '70', '75', '80', '85', '90', '95', '100', '110', '120']
          }
        },
        {
          name: 'pole_class',
          displayName: 'Pole Class',
          dataType: 'picklist',
          required: false,
          categories: ['default'],
          values: {
            default: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']
          }
        },
        {
          name: 'grounding',
          displayName: 'Grounding Status',
          dataType: 'picklist',
          required: false,
          categories: ['untitled'],
          values: {
            untitled: ['Grounded', 'Not Grounded', 'Broken Ground']
          }
        },
        {
          name: 'post_construction_inspection',
          displayName: 'Post Construction Inspection',
          dataType: 'picklist',
          required: false,
          categories: ['post_construction_options'],
          values: {
            post_construction_options: ['Pass', 'Passes; not built as designed', 'Fails', 'Already passed in previous round', 'Not yet constructed', 'Delayed']
          }
        }
      ],
      // Free-form attributes
      withoutPicklists: [
        { name: 'pole_tag', displayName: 'Pole Tag', dataType: 'text', required: false },
        { name: 'height', displayName: 'Height', dataType: 'number', required: false },
        { name: 'diameter', displayName: 'Diameter', dataType: 'number', required: false },
        { name: 'measured_elevation', displayName: 'Measured Elevation', dataType: 'number', required: false },
        { name: 'street_address', displayName: 'Street Address', dataType: 'text', required: false },
        { name: 'note', displayName: 'Note', dataType: 'textarea', required: false },
        { name: 'internal_note', displayName: 'Internal Note', dataType: 'textarea', required: false },
        { name: 'county', displayName: 'County', dataType: 'text', required: false },
        { name: 'state', displayName: 'State', dataType: 'text', required: false },
        { name: 'zip_code', displayName: 'ZIP Code', dataType: 'text', required: false }
      ]
    };
  }

  loadPhotoClassifications() {
    this.photoClassifications = [
      { id: 'anchor_point', name: 'Anchor Point', shortcut: 'a', type: 'point' },
      { id: 'back', name: 'Back', shortcut: 'b', type: 'chip' },
      { id: 'birthmark', name: 'Birthmark', shortcut: 'i', type: 'chip', attributes: ['class', 'height', 'species'] },
      { id: 'cable_tag', name: 'CableTag', shortcut: 'c', type: 'chip' },
      { id: 'grounding', name: 'Grounding', shortcut: 'g', type: 'chip' },
      { id: 'groundline_circumference', name: 'Groundline Circumference', shortcut: 'd', type: 'measurement' },
      { id: 'hallway', name: 'Hallway', shortcut: 'h', type: 'chip' },
      { id: 'midspan_height', name: 'MidspanHeight', shortcut: 'm', type: 'measurement' },
      { id: 'miscellaneous', name: 'Miscellaneous', shortcut: 'l', type: 'chip' },
      { id: 'no_birthmark', name: 'No Birthmark', shortcut: 'z', type: 'chip' },
      { id: 'no_tag', name: 'No Tag', shortcut: 'x', type: 'chip' },
      { id: 'note', name: 'Note', shortcut: 'n', type: 'text' },
      { id: 'osmose', name: 'Osmose', shortcut: 'o', type: 'chip' },
      { id: 'pole_tag', name: 'Pole Tag', shortcut: 't', type: 'chip' },
      { id: 'pole_top', name: 'Pole Top', shortcut: '4', type: 'point' },
      { id: 'pole_height', name: 'PoleHeight', shortcut: 'p', type: 'measurement' },
      { id: 'rubbish', name: 'Rubbish', shortcut: 'r', type: 'chip' },
      { id: 'side', name: 'Side', shortcut: 's', type: 'chip' },
      { id: 'sync_and_job', name: 'Sync And Job', shortcut: 'j', type: 'chip' },
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

          <!-- Step 2: Attribute Selection -->
          <div class="import-section" id="attribute-selection">
            <h3 data-step="2">Step 2: Choose Attributes for Selected Nodes</h3>
            <div class="attribute-tabs">
              <button class="tab-btn active" data-tab="picklist">Picklist Attributes</button>
              <button class="tab-btn" data-tab="freeform">Free-form Attributes</button>
            </div>
            <div class="attributes-container">
              <div id="picklist-attributes" class="tab-content active">
                ${this.renderPicklistAttributes()}
              </div>
              <div id="freeform-attributes" class="tab-content">
                ${this.renderFreeformAttributes()}
              </div>
            </div>
          </div>

          <!-- Step 3: Image Attachments -->
          <div class="import-section" id="image-attachments">
            <h3 data-step="3">Step 3: Add Images (Optional)</h3>
            <div class="image-options">
              <label>
                <input type="radio" name="image-mode" value="single" checked> Single Image per Node
              </label>
              <label>
                <input type="radio" name="image-mode" value="multiple"> Multiple Images per Node
              </label>
            </div>
            <button class="btn-add-image" id="add-image-btn">
              + Add Image Attachment
            </button>
            <div id="image-attachments-list"></div>
          </div>

          <!-- Step 4: Review & Export -->
          <div class="import-section" id="export-review">
            <h3 data-step="4">Step 4: Review & Export</h3>
            <div class="export-summary" id="export-summary"></div>
          </div>
        </div>

        <div class="import-footer">
          <div class="environment-selector">
            <label>
              <input type="radio" name="environment" value="production" checked>
              <span>Production (app.cloneable.ai)</span>
            </label>
            <label>
              <input type="radio" name="environment" value="development">
              <span>Development (localhost:3000)</span>
            </label>
          </div>
          <button class="btn-secondary" id="preview-json-btn">Preview JSON</button>
          <button class="btn-primary" id="export-data-btn">Send to Cloneable</button>
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
    
    // Attribute checkboxes - updated to use data attributes
    modal.querySelectorAll('#picklist-attributes input[type="checkbox"]').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        self.toggleAttribute(e.target, 'picklist');
      });
    });
    
    modal.querySelectorAll('#freeform-attributes input[type="checkbox"]').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        self.toggleAttribute(e.target, 'freeform');
      });
    });
    
    // Tab buttons
    modal.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        // Remove active from all tabs
        modal.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        modal.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        // Add active to clicked tab
        e.target.classList.add('active');
        const tabName = e.target.dataset.tab;
        modal.querySelector(`#${tabName}-attributes`).classList.add('active');
      });
    });
    
    // Add image button
    modal.querySelector('#add-image-btn').addEventListener('click', () => {
      self.addImageAttachment();
    });
    
    // Preview JSON button
    modal.querySelector('#preview-json-btn').addEventListener('click', () => {
      self.previewExport();
    });
    
    // Export data button
    modal.querySelector('#export-data-btn').addEventListener('click', () => {
      self.exportData();
    });
    
    // Use event delegation for dynamically added elements
    modal.addEventListener('click', (e) => {
      // Handle remove attachment buttons
      if (e.target.classList.contains('remove-attachment-btn')) {
        const attachmentId = e.target.dataset.attachmentId;
        self.removeImageAttachment(attachmentId);
      }
      
      // Handle close preview button
      if (e.target.classList.contains('close-preview-btn')) {
        e.target.closest('.preview-modal').remove();
      }
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

  renderPicklistAttributes() {
    let html = '<div class="attribute-list">';
    
    this.availableAttributes.withPicklists.forEach(attr => {
      html += `
        <div class="attribute-item">
          <label class="attribute-checkbox">
            <input type="checkbox" value="${attr.name}" data-attr-type="picklist">
            <span class="attribute-name">${attr.displayName}</span>
            <span class="data-type-badge">Picklist</span>
          </label>
          <div class="attribute-details">
      `;
      
      // Show picklist values
      Object.entries(attr.values).forEach(([category, values]) => {
        html += `
          <div class="picklist-category">
            <strong>${category}:</strong>
            <div class="picklist-values">
              ${values.slice(0, 5).map(v => `<span class="value-chip">${v}</span>`).join('')}
              ${values.length > 5 ? `<span class="more-values">+${values.length - 5} more</span>` : ''}
            </div>
          </div>
        `;
      });
      
      html += '</div></div>';
    });
    
    html += '</div>';
    return html;
  }

  renderFreeformAttributes() {
    let html = '<div class="attribute-list">';
    
    this.availableAttributes.withoutPicklists.forEach(attr => {
      html += `
        <div class="attribute-item">
          <label class="attribute-checkbox">
            <input type="checkbox" value="${attr.name}" data-attr-type="freeform">
            <span class="attribute-name">${attr.displayName}</span>
            <span class="data-type-badge">${attr.dataType}</span>
          </label>
        </div>
      `;
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

  toggleAttribute(checkbox, type) {
    const nodeId = this.getCurrentNodeId(); // Would need to track which node we're configuring
    
    if (!this.nodeAttributes[nodeId]) {
      this.nodeAttributes[nodeId] = [];
    }
    
    if (checkbox.checked) {
      this.nodeAttributes[nodeId].push({
        name: checkbox.value,
        type: type
      });
    } else {
      this.nodeAttributes[nodeId] = this.nodeAttributes[nodeId].filter(
        attr => attr.name !== checkbox.value
      );
    }
    
    this.updateExportSummary();
  }

  addImageAttachment() {
    const imageMode = document.querySelector('input[name="image-mode"]:checked').value;
    const attachmentId = Date.now();
    
    const attachmentHtml = `
      <div class="image-attachment" id="attachment-${attachmentId}">
        <div class="attachment-header">
          <span>Image Attachment (${imageMode})</span>
          <button data-attachment-id="${attachmentId}" class="remove-attachment-btn">&times;</button>
        </div>
        <div class="classification-selector">
          <h5>Select Classifications:</h5>
          <div class="classification-grid">
            ${this.photoClassifications.map(cls => `
              <label class="classification-item">
                <input type="checkbox" value="${cls.id}" data-attachment="${attachmentId}">
                <span>${cls.name} (${cls.shortcut})</span>
                <span class="type-badge">${cls.type}</span>
              </label>
            `).join('')}
          </div>
        </div>
        <div class="image-upload">
          <input type="file" accept="image/*" ${imageMode === 'multiple' ? 'multiple' : ''}>
          <span class="upload-hint">Select ${imageMode} image(s)</span>
        </div>
      </div>
    `;
    
    document.getElementById('image-attachments-list').insertAdjacentHTML('beforeend', attachmentHtml);
  }

  removeImageAttachment(attachmentId) {
    document.getElementById(`attachment-${attachmentId}`).remove();
    delete this.imageAttachments[attachmentId];
    this.updateExportSummary();
  }

  updateSelectedNodesList() {
    const listEl = document.getElementById('selected-nodes-list');
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
    const attributeCount = Object.values(this.nodeAttributes).reduce((sum, attrs) => sum + attrs.length, 0);
    const imageCount = Object.keys(this.imageAttachments).length;
    
    summaryEl.innerHTML = `
      <div class="summary-stats">
        <div class="stat">
          <span class="stat-value">${this.selectedNodes.length}</span>
          <span class="stat-label">Nodes Selected</span>
        </div>
        <div class="stat">
          <span class="stat-value">${attributeCount}</span>
          <span class="stat-label">Attributes Configured</span>
        </div>
        <div class="stat">
          <span class="stat-value">${imageCount}</span>
          <span class="stat-label">Image Attachments</span>
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
    document.body.appendChild(modal);
  }

  buildExportData() {
    // Helper function to get attribute metadata
    const getAttributeMetadata = (attr) => {
      // Check in picklist attributes
      const picklistAttr = this.availableAttributes.withPicklists.find(a => a.name === attr.name);
      if (picklistAttr) {
        return {
          name: {
            name: attr.name,
            type: 'picklist'
          },
          dataType: 'picklist',
          displayName: picklistAttr.displayName,
          picklistOptions: picklistAttr.values // Include all available picklist values
        };
      }
      
      // Check in free-form attributes
      const freeformAttr = this.availableAttributes.withoutPicklists.find(a => a.name === attr.name);
      if (freeformAttr) {
        return {
          name: {
            name: attr.name,
            type: 'freeform'
          },
          dataType: freeformAttr.dataType || 'text',
          displayName: freeformAttr.displayName
        };
      }
      
      // Fallback if not found
      return { 
        name: {
          name: attr.name,
          type: attr.type || 'unknown'
        },
        dataType: 'text' 
      };
    };
    
    return {
      version: '1.0',
      timestamp: new Date().toISOString(),
      source: 'katapult',
      target: 'cloneable',
      nodes: this.selectedNodes.map(node => ({
        id: node.id,
        type: node.type,
        category: node.category,
        attributes: (this.nodeAttributes[node.id] || []).map(attr => getAttributeMetadata(attr)),
        images: this.imageAttachments[node.id] || []
      })),
      connections: [],
      sections: []
    };
  }

  exportData() {
    const data = this.buildExportData();
    const jsonString = JSON.stringify(data);
    
    // Base64 encode the JSON data
    const base64Data = btoa(jsonString);
    
    // Get selected environment
    const environment = document.querySelector('input[name="environment"]:checked').value;
    
    // Construct the URL based on environment
    let targetUrl;
    if (environment === 'production') {
      targetUrl = `https://app.cloneable.ai/tools/pole-inspect/import?katapult_data=${encodeURIComponent(base64Data)}`;
    } else {
      targetUrl = `http://localhost:3000/tools/pole-inspect/import?katapult_data=${encodeURIComponent(base64Data)}`;
    }
    
    // Open in new tab
    window.open(targetUrl, '_blank');
    
    // Close the modal
    const modal = document.getElementById('import-modal');
    if (modal) {
      modal.remove();
    }
  }

  getCurrentNodeId() {
    // This would track which node is currently being configured
    // For now, return first selected node
    return this.selectedNodes[0]?.id || null;
  }
}

// Initialize when loaded and ensure it's globally accessible
(function() {
  const instance = new ImportInterface();
  
  // Force exposure to global window object
  if (typeof window !== 'undefined') {
    window.importInterface = instance;
    // Also try to set it on the top window if in iframe
    try {
      if (window.top && window.top !== window) {
        window.top.importInterface = instance;
      }
    } catch (e) {
      // Cross-origin restriction, ignore
    }
  }
  
  // Log for debugging
  console.log('[ImportInterface] Initialized and exposed to window:', !!window.importInterface);
})();