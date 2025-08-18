// Content script for Katapult to Cloneable Exporter

// Import Interface Class (embedded directly in content script)
class ImportInterface {
  constructor() {
    this.selectedNodes = [];
    this.selectedConnections = [];
    this.selectedSections = [];
    this.nodeAttributes = {};
    this.connectionAttributes = {};
    this.sectionAttributes = {};
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
    // Initialize empty - will be populated ONLY from WebSocket data
    this.availableAttributes = {
      nodeTypes: {
        name: 'node_type',
        displayName: 'Node Type',
        categories: [],
        values: {}
      },
      
      connectionTypes: {
        name: 'cable_type',
        displayName: 'Connection Type',
        categories: [],
        values: {}
      },
      
      // These arrays will be populated from the actual WebSocket data ONLY
      withPicklists: [],
      withoutPicklists: [],
      
      // Section types - will be populated from WebSocket data ONLY
      sectionTypes: {
        categories: [],
        values: {}
      }
    };
  }

  // Update the interface with real data from WebSocket capture
  updateWithCapturedData() {
    console.log('[ImportInterface] Updating with captured WebSocket data...');
    
    // Request fresh data from WebSocket interceptor
    window.postMessage({ type: 'cloneable-get-model-attributes' }, '*');
    
    // Give inject.js time to process the data, then parse
    setTimeout(() => {
      this.parseWebSocketMessages();
    }, 1000);
  }
  
  parseWebSocketMessages() {
    console.log('[ImportInterface] 🔍 Checking for reconstructed WebSocket data...');
    console.log('[ImportInterface] DEBUG - Content script data variables:');
    console.log('  contentScriptNodeTypes:', window.contentScriptNodeTypes?.length || 'undefined');
    console.log('  contentScriptConnectionTypes:', window.contentScriptConnectionTypes?.length || 'undefined');  
    console.log('  contentScriptAttributes:', window.contentScriptAttributes ? Object.keys(window.contentScriptAttributes).length + ' keys' : 'undefined');
    console.log('  contentScriptModelData:', window.contentScriptModelData ? Object.keys(window.contentScriptModelData).length + ' paths' : 'undefined');
    
    // Sample first few node types if they exist
    if (window.contentScriptNodeTypes && window.contentScriptNodeTypes.length > 0) {
      console.log('  First 3 node types:', window.contentScriptNodeTypes.slice(0, 3));
    }
    
    // Check if we have any data at all (from content script context)
    const hasNodeTypes = window.contentScriptNodeTypes && window.contentScriptNodeTypes.length > 0;
    const hasAttributes = window.contentScriptAttributes && Object.keys(window.contentScriptAttributes).length > 0;
    
    // If no processed data exists, trigger reconstruction immediately
    if (!hasNodeTypes && !hasAttributes) {
      const messageCount = window.katapultWebSocketMessages?.length || 0;
      
      if (messageCount > 0 && (!this.parseRetryCount || this.parseRetryCount === 1)) {
        console.log(`[ImportInterface] 🚀 Found ${messageCount} WebSocket messages - triggering immediate reconstruction...`);
        
        // Show processing status
        if (document.getElementById('import-modal')) {
          this.showProcessingData();
        }
        
        // Send message to inject script to trigger reconstruction immediately
        window.postMessage({
          type: 'cloneable-trigger-reconstruction'
        }, '*');
        
        // Start retry loop with first attempt in 3 seconds
        this.parseRetryCount = 1;
        setTimeout(() => {
          this.parseWebSocketMessages();
        }, 3000);
        return;
      }
      
      // Track retry attempts for subsequent attempts
      this.parseRetryCount = (this.parseRetryCount || 0) + 1;
      const maxRetries = 15; // Try for about 45 seconds total
      const retryDelay = Math.min(this.parseRetryCount * 1000, 3000); // 1s, 2s, 3s, 3s...
      
      if (this.parseRetryCount <= maxRetries) {
        console.log(`[ImportInterface] ⏳ Waiting for reconstruction completion (attempt ${this.parseRetryCount}/${maxRetries}), retry in ${retryDelay/1000}s...`);
        console.log(`[ImportInterface] WebSocket messages captured: ${messageCount}`);
        
        // Show waiting status in UI if modal is open
        if (document.getElementById('import-modal')) {
          this.showWaitingForData();
        }
        
        setTimeout(() => {
          this.parseWebSocketMessages();
        }, retryDelay);
        return;
      } else {
        console.log('[ImportInterface] ❌ Reconstruction timeout - proceeding with available data');
        if (document.getElementById('import-modal')) {
          this.showTimeoutMessage();
        }
        return;
      }
    }
    
    // Reset retry counter on success
    this.parseRetryCount = 0;
    
    // Check if inject.js has already processed the data
    if (window.contentScriptNodeTypes && window.contentScriptNodeTypes.length > 0) {
      console.log(`[ImportInterface] ✅ Found ${window.contentScriptNodeTypes.length} reconstructed node types from inject script!`);
      
      // Convert processed node types to the expected format
      const nodeCategories = [...new Set(window.contentScriptNodeTypes.map(n => n.category))];
      this.availableAttributes.nodeTypes.categories = nodeCategories;
      this.availableAttributes.nodeTypes.values = {};
      
      nodeCategories.forEach(category => {
        const typesInCategory = window.contentScriptNodeTypes.filter(n => n.category === category);
        this.availableAttributes.nodeTypes.values[category] = typesInCategory.map(n => n.cleanName || n.displayName || n.name);
      });
      
      console.log('[ImportInterface] ✅ Loaded node types from reconstructed data');
      console.log('[ImportInterface] Node categories:', nodeCategories);
      console.log('[ImportInterface] Sample values:', this.availableAttributes.nodeTypes.values);
      
      // Update node button status
      this.nodeTypesLoaded = true;
      
      // Refresh the UI if it's currently displayed
      this.refreshUIWithNewData();
    }
    
    if (window.contentScriptConnectionTypes && window.contentScriptConnectionTypes.length > 0) {
      console.log(`[ImportInterface] ✅ Found ${window.contentScriptConnectionTypes.length} reconstructed connection types from inject script!`);
      
      // Convert processed connection types to the expected format
      const connCategories = [...new Set(window.contentScriptConnectionTypes.map(c => c.category))];
      this.availableAttributes.connectionTypes.categories = connCategories;
      this.availableAttributes.connectionTypes.values = {};
      
      connCategories.forEach(category => {
        const typesInCategory = window.contentScriptConnectionTypes.filter(c => c.category === category);
        this.availableAttributes.connectionTypes.values[category] = typesInCategory.map(c => c.cleanName || c.displayName || c.name);
      });
      
      console.log('[ImportInterface] ✅ Loaded connection types from reconstructed data');
      console.log('[ImportInterface] Connection categories:', connCategories);
      console.log('[ImportInterface] Sample values:', this.availableAttributes.connectionTypes.values);
      
      // Refresh the UI if it's currently displayed
      this.refreshUIWithNewData();
    }
    
    // Use the reconstructed attributes for the general attributes list
    if (window.katapultReconstructedAttributes) {
      console.log('[ImportInterface] Processing reconstructed attributes...');
      this.processAttributeDefinitions(window.katapultReconstructedAttributes);
    }
    
    // Log what we found
    const nodeTypesCount = this.availableAttributes.nodeTypes.categories.length;
    const connectionTypesCount = this.availableAttributes.connectionTypes.categories.length;
    const attributesCount = this.availableAttributes.withPicklists.length + this.availableAttributes.withoutPicklists.length;
    
    console.log(`[ImportInterface] Summary: ${nodeTypesCount} node categories, ${connectionTypesCount} connection categories, ${attributesCount} attributes`);
    
    // If we didn't find processed data, wait for WebSocket reconstruction
    if (nodeTypesCount === 0 && connectionTypesCount === 0) {
      console.log('[ImportInterface] No processed data found - waiting for real WebSocket reconstruction...');
      // REMOVED: No longer using fallback parsing or sample data creation
    }
  }
  
  // REMOVED: fallbackParseWebSocketMessages method - no longer using fallback parsing
  
  refreshUIWithNewData() {
    console.log('[ImportInterface] 🔄 Refreshing UI with newly reconstructed data...');
    
    // Check if the modal is currently displayed
    const modal = document.getElementById('import-modal');
    if (!modal || modal.style.display === 'none') {
      console.log('[ImportInterface] Modal not displayed yet, refresh will happen when opened');
      return;
    }
    
    // Refresh the nodes selector content with real data
    const nodesSelector = document.getElementById('nodes-selector');
    if (nodesSelector) {
      console.log('[ImportInterface] Refreshing nodes selector with real data...');
      nodesSelector.innerHTML = this.renderNodeTypeSelector();
      this.reattachSelectionListeners(modal);
    }
    
    // Refresh the connections selector content with real data  
    const connectionsSelector = document.getElementById('connections-selector');
    if (connectionsSelector) {
      console.log('[ImportInterface] Refreshing connections selector with real data...');
      connectionsSelector.innerHTML = this.renderConnectionTypeSelector();
      this.reattachSelectionListeners(modal);
    }
    
    // Refresh the sections selector content with real data
    const sectionsSelector = document.getElementById('sections-selector');
    if (sectionsSelector) {
      console.log('[ImportInterface] Refreshing sections selector with real data...');
      sectionsSelector.innerHTML = this.renderSectionTypeSelector();
      this.reattachSelectionListeners(modal);
    }
    
    // Update any displayed counts or summaries
    const nodeTypesCount = this.availableAttributes.nodeTypes.categories.length;
    const connectionTypesCount = this.availableAttributes.connectionTypes.categories.length;
    
    console.log(`[ImportInterface] ✅ UI refresh complete - ${nodeTypesCount} node categories, ${connectionTypesCount} connection categories`);
  }
  
  reattachSelectionListeners(modal) {
    // Re-attach event listeners to new selection checkboxes
    modal.querySelectorAll('.selection-checkbox').forEach(checkbox => {
      // Remove existing listeners to prevent duplicates
      checkbox.replaceWith(checkbox.cloneNode(true));
    });
    
    // Attach new listeners
    modal.querySelectorAll('.selection-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        this.toggleSelection(e.target);
        this.updateConfigureButton();
      });
    });
  }
  
  // Add missing methods that are called from the postMessage listener
  renderNodeSelection() {
    console.log('[ImportInterface] renderNodeSelection called - refreshing UI...');
    this.refreshUIWithNewData();
  }
  
  renderConnectionSelection() {
    console.log('[ImportInterface] renderConnectionSelection called - refreshing UI...');
    this.refreshUIWithNewData();
  }
  
  processAttributeDefinitions(attributesData) {
    console.log('[ImportInterface] Processing attribute definitions...');
    console.log(`[ImportInterface] Processing ${Object.keys(attributesData).length} attributes`);
    // Process each attribute definition from the WebSocket data
    Object.entries(attributesData).forEach(([attrName, attrData]) => {
      // Skip node_type and cable_type as they're handled separately
      if (attrName === 'node_type' || attrName === 'cable_type') {
        return;
      }
      
      if (attrData && typeof attrData === 'object') {
        // Determine if this is a picklist or free-form attribute
        if (attrData.picklists && Object.keys(attrData.picklists).length > 0) {
          // This is a picklist attribute
          const categories = Object.keys(attrData.picklists);
          const values = {};
          
          categories.forEach(category => {
            const categoryData = attrData.picklists[category];
            if (categoryData && typeof categoryData === 'object') {
              values[category] = Object.values(categoryData).map(item => 
                typeof item === 'object' ? (item.value || item.name || String(item)) : String(item)
              );
            }
          });
          
          this.availableAttributes.withPicklists.push({
            name: attrName,
            displayName: this.formatDisplayName(attrName),
            dataType: 'picklist',
            required: attrData.required || false,
            appliesTo: this.determineAppliesTo(attrName),
            categories: categories,
            values: values
          });
          
          console.log(`[ImportInterface] Added picklist attribute: ${attrName}`);
        } else {
          // This is a free-form attribute
          this.availableAttributes.withoutPicklists.push({
            name: attrName,
            displayName: this.formatDisplayName(attrName),
            dataType: this.determineDataType(attrName, attrData),
            required: attrData.required || false,
            appliesTo: this.determineAppliesTo(attrName)
          });
          
          console.log(`[ImportInterface] Added free-form attribute: ${attrName}`);
        }
      }
    });
  }
  
  determineAppliesTo(attributeName) {
    // Determine which entity types this attribute applies to based on name patterns
    const name = attributeName.toLowerCase();
    
    if (name.includes('pole') || name.includes('equipment') || name.includes('manufacturer') || 
        name.includes('serial') || name.includes('model')) {
      return ['nodes'];
    }
    
    if (name.includes('cable') || name.includes('voltage') || name.includes('ampacity') || 
        name.includes('ground_clearance')) {
      return ['connections'];
    }
    
    if (name.includes('span') || name.includes('right_of_way') || name.includes('easement')) {
      return ['sections'];
    }
    
    // Common attributes that apply to multiple entity types
    if (name.includes('note') || name.includes('inspection') || name.includes('condition') || 
        name.includes('ownership') || name.includes('installation') || name.includes('address') ||
        name.includes('coordinates') || name.includes('lat') || name.includes('lng')) {
      return ['nodes', 'connections', 'sections'];
    }
    
    // Default to nodes if unclear
    return ['nodes'];
  }

  parseModelAttributes(modelAttributes) {
    const picklistAttrs = [...this.availableAttributes.withPicklists]; // Start empty
    const freeformAttrs = [...this.availableAttributes.withoutPicklists]; // Start empty
    
    console.log(`[ImportInterface] Starting with ${picklistAttrs.length} existing picklist attributes and ${freeformAttrs.length} existing freeform attributes`);
    
    // Parse through the captured attributes and add/update them
    Object.entries(modelAttributes || {}).forEach(([attrName, attrData]) => {
      // Skip node_type and cable_type as they're handled separately
      if (attrName === 'node_type' || attrName === 'cable_type') {
        return;
      }
      
      // Check if this attribute already exists in our fallback data
      const existingPicklistIndex = picklistAttrs.findIndex(attr => attr.name === attrName);
      const existingFreeformIndex = freeformAttrs.findIndex(attr => attr.name === attrName);
      
      if (attrData.picklists && Object.keys(attrData.picklists).length > 0) {
        // This is a picklist attribute
        const categories = Object.keys(attrData.picklists);
        const values = {};
        
        categories.forEach(category => {
          const categoryData = attrData.picklists[category];
          if (categoryData && typeof categoryData === 'object') {
            values[category] = Object.values(categoryData).map(item => item.value || item);
          }
        });
        
        const newAttr = {
          name: attrName,
          displayName: this.formatDisplayName(attrName),
          dataType: 'picklist',
          required: attrData.required || false,
          categories: categories,
          values: values
        };
        
        if (existingPicklistIndex >= 0) {
          // Update existing
          picklistAttrs[existingPicklistIndex] = newAttr;
          console.log(`[ImportInterface] Updated picklist attribute: ${attrName}`);
        } else {
          // Add new
          picklistAttrs.push(newAttr);
          console.log(`[ImportInterface] Added new picklist attribute: ${attrName}`);
        }
      } else {
        // This is a free-form attribute
        const newAttr = {
          name: attrName,
          displayName: this.formatDisplayName(attrName),
          dataType: this.inferDataType(attrName, attrData),
          required: attrData.required || false
        };
        
        if (existingFreeformIndex >= 0) {
          // Update existing
          freeformAttrs[existingFreeformIndex] = newAttr;
          console.log(`[ImportInterface] Updated freeform attribute: ${attrName}`);
        } else {
          // Add new
          freeformAttrs.push(newAttr);
          console.log(`[ImportInterface] Added new freeform attribute: ${attrName}`);
        }
      }
    });
    
    this.availableAttributes.withPicklists = picklistAttrs;
    this.availableAttributes.withoutPicklists = freeformAttrs;
    
    console.log(`[ImportInterface] Final result: ${picklistAttrs.length} picklist attributes and ${freeformAttrs.length} freeform attributes`);
  }

  formatDisplayName(attrName) {
    // Convert snake_case to Title Case
    return attrName
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  inferDataType(attrName, attrData) {
    // Infer data type from attribute name
    const name = attrName.toLowerCase();
    
    if (name.includes('date')) return 'date';
    if (name.includes('height') || name.includes('diameter') || name.includes('elevation') || 
        name.includes('capacity') || name.includes('clearance') || name.includes('length') ||
        name.includes('lat') || name.includes('lng') || name.includes('coordinates')) {
      return 'number';
    }
    if (name.includes('note') || name.includes('description')) return 'textarea';
    
    return 'text'; // default
  }

  loadPhotoClassifications() {
    console.log('[ImportInterface] Loading photo classifications from processed data...');
    
    // Check if inject.js has already processed photo classifications
    if (window.katapultProcessedPhotoClassifications && window.katapultProcessedPhotoClassifications.length > 0) {
      console.log(`[ImportInterface] Found ${window.katapultProcessedPhotoClassifications.length} processed photo classifications`);
      
      // Convert processed photo classifications to the expected format
      this.photoClassifications = window.katapultProcessedPhotoClassifications.map(photo => ({
        key: photo.key,
        name: photo.name,
        category: photo.category,
        source: photo.source,
        shortcut: photo.key.slice(0, 3).toUpperCase()
      }));
      
      console.log('[ImportInterface] ✅ Loaded photo classifications from processed data');
    } else {
      // Initialize empty - will be populated from WebSocket data
      this.photoClassifications = [];
      console.log('[ImportInterface] No processed photo classifications found, starting with empty array');
    }
  }

  // REMOVED: No longer creating sample data - interface must show only real parsed WebSocket data

  showProcessingData() {
    const nodeSection = document.getElementById('node-selection');
    if (nodeSection) {
      nodeSection.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #27ae60;">
          <div style="margin-bottom: 20px; font-size: 24px;">⚡</div>
          <h3>Processing WebSocket Data</h3>
          <p>Reconstructing ${window.katapultWebSocketMessages?.length || 0} WebSocket messages...<br>This should complete in a few seconds.</p>
        </div>
      `;
    }
  }

  showWaitingForData() {
    const nodeSection = document.getElementById('node-selection');
    if (nodeSection) {
      nodeSection.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #666;">
          <div style="margin-bottom: 20px; font-size: 24px;">⏳</div>
          <h3>Waiting for Data Processing...</h3>
          <p>WebSocket reconstruction in progress.<br>This may take up to 45 seconds.</p>
          <div style="margin-top: 15px; font-size: 14px; opacity: 0.8;">
            WebSocket messages captured: ${window.katapultWebSocketMessages?.length || 0}
          </div>
        </div>
      `;
    }
  }

  showTimeoutMessage() {
    const nodeSection = document.getElementById('node-selection');
    if (nodeSection) {
      nodeSection.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #e74c3c;">
          <div style="margin-bottom: 20px; font-size: 24px;">⚠️</div>
          <h3>Data Reconstruction Timeout</h3>
          <p>Background WebSocket processing took too long.<br>Try refreshing the page and opening the export interface again.</p>
          <div style="margin-top: 15px; font-size: 14px; opacity: 0.8;">
            WebSocket messages captured: ${window.katapultWebSocketMessages?.length || 0}
          </div>
        </div>
      `;
    }
  }

  showNoDataMessage() {
    const nodeSection = document.getElementById('node-selection');
    if (nodeSection) {
      nodeSection.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #e74c3c;">
          <div style="margin-bottom: 20px; font-size: 24px;">📭</div>
          <h3>No WebSocket Data Found</h3>
          <p>No WebSocket messages were captured.<br>Make sure to load the Katapult Pro model editor first.</p>
        </div>
      `;
    }
  }

  refreshInterface() {
    console.log('[ImportInterface] Refreshing interface with new data...');
    
    // Close existing modal
    const existingModal = document.getElementById('import-modal');
    if (existingModal) {
      existingModal.remove();
    }
    
    // Create new modal with updated data
    const modal = this.createImportModal();
    document.body.appendChild(modal);
    
    console.log('[ImportInterface] Interface refreshed successfully');
  }

  createImportModal() {
    console.log('[ImportInterface] Creating modal...');
    const modal = document.createElement('div');
    modal.id = 'import-modal';
    modal.className = 'import-modal';
    modal.innerHTML = `
      <div class="import-modal-content">
        <div class="import-header">
          <h2>✨ Import Nodes to Cloneable</h2>
          <button class="close-btn" id="modal-close-btn">&times;</button>
        </div>
        
        <div class="import-body">
          <!-- Step 1: Node & Connection Selection -->
          <div class="import-section active" id="node-selection">
            <h3 data-step="1">Select Infrastructure Types</h3>
            <p class="step-description">Choose the types of infrastructure nodes, connections, and sections you want to import</p>
            
            <div class="selection-tabs">
              <button class="selection-tab-btn active" data-tab="nodes">Infrastructure Nodes</button>
              <button class="selection-tab-btn" data-tab="connections">Connection Types</button>
              <button class="selection-tab-btn" data-tab="sections">Sections</button>
            </div>
            
            <div class="selection-content">
              <div id="nodes-selector" class="selection-pane active">
                ${this.renderNodeTypeSelector()}
              </div>
              <div id="connections-selector" class="selection-pane">
                ${this.renderConnectionTypeSelector()}
              </div>
              <div id="sections-selector" class="selection-pane">
                ${this.renderSectionTypeSelector()}
              </div>
            </div>
            
            <div class="selected-items-summary">
              <div class="selected-nodes-list" id="selected-nodes-list"></div>
              <div class="selected-connections-list" id="selected-connections-list"></div>
              <div class="selected-sections-list" id="selected-sections-list"></div>
            </div>
            
            <div class="step-actions">
              <button class="btn-primary" id="configure-attributes-btn" disabled>
                Configure Selected Items →
              </button>
            </div>
          </div>

          <!-- Step 2: Configure Attributes & Images -->
          <div class="import-section" id="configure-section" style="display: none;">
            <h3 data-step="2">Configure Attributes & Images</h3>
            <p class="step-description">Set up attributes and images for each selected node type</p>
            <div id="node-configurations"></div>
            <div class="step-actions">
              <button class="btn-secondary" id="back-to-selection">← Back to Selection</button>
              <button class="btn-primary" id="proceed-to-review">Review & Export →</button>
            </div>
          </div>

          <!-- Step 3: Review & Export -->
          <div class="import-section" id="export-review" style="display: none;">
            <h3 data-step="3">Review & Export</h3>
            <p class="step-description">Review your configuration and export to Cloneable</p>
            <div class="export-summary" id="export-summary"></div>
            <div class="step-actions">
              <button class="btn-secondary" id="back-to-configure">← Back to Configure</button>
              <button class="btn-secondary" id="preview-json-btn">Preview JSON</button>
              <button class="btn-primary" id="export-data-btn">🚀 Export to Cloneable</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Add event listeners after creating the modal
    this.attachEventListeners(modal);
    
    // Initialize summary
    this.updateSelectedItemsLists();
    this.updateExportSummary();

    return modal;
  }
  
  attachEventListeners(modal) {
    const self = this;
    
    // Close button
    modal.querySelector('#modal-close-btn').addEventListener('click', () => {
      modal.remove();
    });
    
    // Selection tab switching
    modal.querySelectorAll('.selection-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        // Update tab buttons
        modal.querySelectorAll('.selection-tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        
        // Update tab content
        const tabType = e.target.dataset.tab;
        modal.querySelectorAll('.selection-pane').forEach(pane => pane.classList.remove('active'));
        modal.querySelector(`#${tabType}-selector`).classList.add('active');
      });
    });

    // Selection checkboxes (both nodes and connections)
    modal.querySelectorAll('.selection-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        self.toggleSelection(e.target);
        self.updateConfigureButton();
      });
    });
    
    // Step navigation
    modal.querySelector('#configure-attributes-btn').addEventListener('click', () => {
      self.showConfigureStep(modal);
    });
    
    modal.querySelector('#back-to-selection').addEventListener('click', () => {
      self.showStep(modal, 'node-selection');
    });
    
    modal.querySelector('#proceed-to-review').addEventListener('click', () => {
      self.showStep(modal, 'export-review');
    });
    
    modal.querySelector('#back-to-configure').addEventListener('click', () => {
      self.showStep(modal, 'configure-section');
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
    const nodeTypes = this.availableAttributes.nodeTypes;
    
    // If no node types are available yet, show loading/waiting message
    if (!nodeTypes.values || Object.keys(nodeTypes.values).length === 0) {
      return `
        <div style="text-align: center; padding: 40px; color: #666;">
          <div style="margin-bottom: 20px; font-size: 24px;">⏳</div>
          <h3>Loading Infrastructure Node Types...</h3>
          <p>Reconstructing data from WebSocket messages.<br>This should complete in a few seconds.</p>
          <div style="margin-top: 15px; font-size: 14px; opacity: 0.8;">
            WebSocket messages captured: ${window.katapultWebSocketMessages?.length || 0}
          </div>
        </div>
      `;
    }
    
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
            <input type="checkbox" value="${category}:${type}" data-category="${category}" data-type="${type}" data-item-type="node" class="selection-checkbox">
            <span>${type}</span>
          </label>
        `;
      });
      html += '</div></div>';
    });
    
    html += '</div>';
    return html;
  }

  renderConnectionTypeSelector() {
    const connectionTypes = this.availableAttributes.connectionTypes;
    
    // If no connection types are available yet, show loading/waiting message
    if (!connectionTypes.values || Object.keys(connectionTypes.values).length === 0) {
      return `
        <div style="text-align: center; padding: 40px; color: #666;">
          <div style="margin-bottom: 20px; font-size: 24px;">⏳</div>
          <h3>Loading Connection Types...</h3>
          <p>Reconstructing data from WebSocket messages.<br>This should complete in a few seconds.</p>
          <div style="margin-top: 15px; font-size: 14px; opacity: 0.8;">
            WebSocket messages captured: ${window.katapultWebSocketMessages?.length || 0}
          </div>
        </div>
      `;
    }
    
    let html = '<div class="connection-type-grid">';
    
    Object.entries(connectionTypes.values).forEach(([category, types]) => {
      html += `
        <div class="connection-category">
          <h4>${category.toUpperCase()}</h4>
          <div class="connection-type-list">
      `;
      types.forEach(type => {
        html += `
          <label class="connection-type-item">
            <input type="checkbox" value="${category}:${type}" data-category="${category}" data-type="${type}" data-item-type="connection" class="selection-checkbox">
            <span>${type}</span>
          </label>
        `;
      });
      html += '</div></div>';
    });
    
    html += '</div>';
    return html;
  }

  renderSectionTypeSelector() {
    const sectionTypes = this.availableAttributes.sectionTypes;
    let html = '<div class="connection-type-grid">';
    
    Object.entries(sectionTypes.values).forEach(([category, types]) => {
      html += `
        <div class="connection-category">
          <h4>${category.toUpperCase()}</h4>
          <div class="connection-type-list">
      `;
      types.forEach(type => {
        html += `
          <label class="connection-type-item">
            <input type="checkbox" value="${category}:${type}" data-category="${category}" data-type="${type}" data-item-type="section" class="selection-checkbox">
            <span>${type}</span>
          </label>
        `;
      });
      html += '</div></div>';
    });
    
    html += '</div>';
    return html;
  }

  toggleSelection(checkbox) {
    const [category, type] = checkbox.value.split(':');
    const itemType = checkbox.dataset.itemType; // 'node', 'connection', or 'section'
    
    if (itemType === 'node') {
      if (checkbox.checked) {
        this.selectedNodes.push({ category, type, id: Date.now() });
      } else {
        this.selectedNodes = this.selectedNodes.filter(n => 
          !(n.category === category && n.type === type)
        );
      }
    } else if (itemType === 'connection') {
      if (checkbox.checked) {
        this.selectedConnections.push({ category, type, id: Date.now() });
      } else {
        this.selectedConnections = this.selectedConnections.filter(c => 
          !(c.category === category && c.type === type)
        );
      }
    } else if (itemType === 'section') {
      if (checkbox.checked) {
        this.selectedSections.push({ category, type, id: Date.now() });
      } else {
        this.selectedSections = this.selectedSections.filter(s => 
          !(s.category === category && s.type === type)
        );
      }
    }
    
    this.updateSelectedItemsLists();
    this.updateExportSummary();
  }

  // Legacy method for compatibility
  toggleNode(checkbox) {
    checkbox.dataset.itemType = 'node';
    this.toggleSelection(checkbox);
  }

  updateSelectedItemsLists() {
    this.updateSelectedNodesList();
    this.updateSelectedConnectionsList();
    this.updateSelectedSectionsList();
  }

  updateSelectedNodesList() {
    const listEl = document.getElementById('selected-nodes-list');
    if (!listEl) return;
    
    if (this.selectedNodes.length === 0) {
      listEl.innerHTML = '<div class="selection-summary-section"><h4>Infrastructure Nodes</h4><p class="no-selection">No nodes selected</p></div>';
      return;
    }
    
    listEl.innerHTML = `
      <div class="selection-summary-section">
        <h4>Infrastructure Nodes (${this.selectedNodes.length})</h4>
        <div class="selected-items">
          ${this.selectedNodes.map(node => `
            <div class="selected-item-chip node-chip">
              <span>${node.type}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  updateSelectedConnectionsList() {
    const listEl = document.getElementById('selected-connections-list');
    if (!listEl) return;
    
    if (this.selectedConnections.length === 0) {
      listEl.innerHTML = '<div class="selection-summary-section"><h4>Connection Types</h4><p class="no-selection">No connections selected</p></div>';
      return;
    }
    
    listEl.innerHTML = `
      <div class="selection-summary-section">
        <h4>Connection Types (${this.selectedConnections.length})</h4>
        <div class="selected-items">
          ${this.selectedConnections.map(connection => `
            <div class="selected-item-chip connection-chip">
              <span>${connection.type}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  updateSelectedSectionsList() {
    const listEl = document.getElementById('selected-sections-list');
    if (!listEl) return;
    
    if (this.selectedSections.length === 0) {
      listEl.innerHTML = '<div class="selection-summary-section"><h4>Sections</h4><p class="no-selection">No sections selected</p></div>';
      return;
    }
    
    listEl.innerHTML = `
      <div class="selection-summary-section">
        <h4>Sections (${this.selectedSections.length})</h4>
        <div class="selected-items">
          ${this.selectedSections.map(section => `
            <div class="selected-item-chip section-chip">
              <span>${section.type}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  updateConfigureButton() {
    const configureBtn = document.getElementById('configure-attributes-btn');
    if (configureBtn) {
      const totalSelected = this.selectedNodes.length + this.selectedConnections.length + this.selectedSections.length;
      configureBtn.disabled = totalSelected === 0;
      
      if (totalSelected === 0) {
        configureBtn.textContent = 'Configure Selected Items →';
      } else {
        const parts = [];
        if (this.selectedNodes.length > 0) {
          parts.push(`${this.selectedNodes.length} node${this.selectedNodes.length === 1 ? '' : 's'}`);
        }
        if (this.selectedConnections.length > 0) {
          parts.push(`${this.selectedConnections.length} connection${this.selectedConnections.length === 1 ? '' : 's'}`);
        }
        configureBtn.textContent = `Configure ${parts.join(' & ')} →`;
      }
    }
  }

  showStep(modal, stepId) {
    // Hide all sections
    modal.querySelectorAll('.import-section').forEach(section => {
      section.style.display = 'none';
      section.classList.remove('active');
    });
    
    // Show target section
    const targetSection = modal.querySelector(`#${stepId}`);
    if (targetSection) {
      targetSection.style.display = 'block';
      targetSection.classList.add('active');
    }
    
    // Update summary if showing export review
    if (stepId === 'export-review') {
      this.updateExportSummary();
    }
  }

  showConfigureStep(modal) {
    this.showStep(modal, 'configure-section');
    this.renderAllConfigurations();
  }

  renderAllConfigurations() {
    const container = document.getElementById('node-configurations');
    if (!container) return;
    
    let html = '';
    
    // Render configurations for nodes
    this.selectedNodes.forEach((node, index) => {
      const nodeId = node.id;
      html += `
        <div class="node-config-card" data-node-id="${nodeId}">
          <div class="node-config-header">
            <div class="node-info">
              <h4 class="node-type-title">${node.type}</h4>
              <span class="node-category-badge">${node.category.toUpperCase()}</span>
            </div>
            <button class="toggle-config-btn" onclick="this.parentElement.parentElement.classList.toggle('collapsed')">
              <span class="chevron">▼</span>
            </button>
          </div>
          
          <div class="node-config-content">
            <!-- Attributes Section -->
            <div class="config-section">
              <h5><span class="icon">📋</span> Attributes</h5>
              <div class="attribute-tabs">
                <button class="attribute-tab-btn active" data-tab="picklist" data-entity="${nodeId}" data-entity-type="node">
                  Picklist Attributes
                </button>
                <button class="attribute-tab-btn" data-tab="freeform" data-entity="${nodeId}" data-entity-type="node">
                  Free-form Attributes
                </button>
              </div>
              
              <div class="attribute-content">
                <div class="tab-pane active" id="picklist-${nodeId}">
                  ${this.renderAttributeOptions('picklist', nodeId, 'node')}
                </div>
                <div class="tab-pane" id="freeform-${nodeId}">
                  ${this.renderAttributeOptions('freeform', nodeId, 'node')}
                </div>
              </div>
            </div>
            
            <!-- Images Section -->
            <div class="config-section">
              <h5><span class="icon">📸</span> Images</h5>
              <div class="image-classification-options">
                ${this.renderImageClassifications(nodeId)}
              </div>
            </div>
          </div>
        </div>
      `;
    });
    
    // Render configurations for connections
    this.selectedConnections.forEach((connection, index) => {
      const connectionId = connection.id;
      html += `
        <div class="node-config-card" data-connection-id="${connectionId}">
          <div class="node-config-header">
            <div class="node-info">
              <h4>${connection.type} <span class="node-category-badge">${connection.category}</span></h4>
            </div>
            <button class="toggle-config-btn">
              <span class="chevron">▼</span>
            </button>
          </div>
          
          <div class="node-config-content">
            <!-- Attributes Section -->
            <div class="config-section">
              <h5><span class="icon">📋</span> Attributes</h5>
              <div class="attribute-tabs">
                <button class="attribute-tab-btn active" data-tab="picklist" data-entity="${connectionId}" data-entity-type="connection">
                  Picklist Attributes
                </button>
                <button class="attribute-tab-btn" data-tab="freeform" data-entity="${connectionId}" data-entity-type="connection">
                  Free-form Attributes
                </button>
              </div>
              
              <div class="attribute-content">
                <div class="tab-pane active" id="picklist-${connectionId}">
                  ${this.renderAttributeOptions('picklist', connectionId, 'connection')}
                </div>
                <div class="tab-pane" id="freeform-${connectionId}">
                  ${this.renderAttributeOptions('freeform', connectionId, 'connection')}
                </div>
              </div>
            </div>
            
            <!-- Images Section -->
            <div class="config-section">
              <h5><span class="icon">📸</span> Images</h5>
              <div class="image-classification-options">
                ${this.renderImageClassifications(connectionId)}
              </div>
            </div>
          </div>
        </div>
      `;
    });
    
    // Render configurations for sections
    this.selectedSections.forEach((section, index) => {
      const sectionId = section.id;
      html += `
        <div class="node-config-card" data-section-id="${sectionId}">
          <div class="node-config-header">
            <div class="node-info">
              <h4>${section.type} <span class="node-category-badge" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);">${section.category}</span></h4>
            </div>
            <button class="toggle-config-btn">
              <span class="chevron">▼</span>
            </button>
          </div>
          
          <div class="node-config-content">
            <!-- Attributes Section -->
            <div class="config-section">
              <h5><span class="icon">📋</span> Attributes</h5>
              <div class="attribute-tabs">
                <button class="attribute-tab-btn active" data-tab="picklist" data-entity="${sectionId}" data-entity-type="section">
                  Picklist Attributes
                </button>
                <button class="attribute-tab-btn" data-tab="freeform" data-entity="${sectionId}" data-entity-type="section">
                  Free-form Attributes
                </button>
              </div>
              
              <div class="attribute-content">
                <div class="tab-pane active" id="picklist-${sectionId}">
                  ${this.renderAttributeOptions('picklist', sectionId, 'section')}
                </div>
                <div class="tab-pane" id="freeform-${sectionId}">
                  ${this.renderAttributeOptions('freeform', sectionId, 'section')}
                </div>
              </div>
            </div>
            
            <!-- Images Section -->
            <div class="config-section">
              <h5><span class="icon">📸</span> Images</h5>
              <div class="image-classification-options">
                ${this.renderImageClassifications(sectionId)}
              </div>
            </div>
          </div>
        </div>
      `;
    });
    
    container.innerHTML = html;
    this.attachConfigurationEventListeners();
  }

  renderAttributeOptions(type, entityId, entityType = 'node') {
    const attributes = type === 'picklist' 
      ? this.availableAttributes.withPicklists 
      : this.availableAttributes.withoutPicklists;
    
    // Filter attributes based on entity type (nodes, connections, sections)
    const filteredAttributes = attributes.filter(attr => {
      if (!attr.appliesTo || attr.appliesTo.length === 0) {
        // If no appliesTo is specified, assume it applies to all types
        return true;
      }
      // Convert entityType to plural for matching appliesTo array
      const entityTypePlural = entityType === 'node' ? 'nodes' 
                              : entityType === 'connection' ? 'connections'
                              : 'sections';
      return attr.appliesTo.includes(entityTypePlural);
    });
    
    let html = '<div class="attribute-grid">';
    
    filteredAttributes.forEach(attr => {
      const isChecked = this.isAttributeSelected(entityId, attr.name);
      html += `
        <label class="attribute-option ${isChecked ? 'selected' : ''}">
          <input type="checkbox" 
                 value="${attr.name}" 
                 data-entity="${entityId}"
                 data-entity-type="${entityType}"
                 data-type="${type}"
                 ${isChecked ? 'checked' : ''}>
          <div class="attribute-card">
            <div class="attribute-header">
              <span class="attribute-name">${attr.displayName}</span>
              <span class="attribute-type-badge">${attr.dataType || type}</span>
            </div>
            ${type === 'picklist' ? this.renderPicklistPreview(attr) : ''}
          </div>
        </label>
      `;
    });
    
    html += '</div>';
    return html;
  }

  renderPicklistPreview(attr) {
    let html = '<div class="picklist-preview">';
    let count = 0;
    
    Object.entries(attr.values || {}).forEach(([category, values]) => {
      if (count < 6) {
        values.slice(0, 3).forEach(value => {
          if (count < 6) {
            html += `<span class="preview-chip">${value}</span>`;
            count++;
          }
        });
      }
    });
    
    if (count >= 6) html += '<span class="preview-more">+more</span>';
    html += '</div>';
    return html;
  }

  renderImageClassifications(nodeId) {
    let html = '<div class="image-classification-grid">';
    
    this.photoClassifications.forEach(classification => {
      const imageConfig = this.getImageClassificationConfig(nodeId, classification.id);
      const isSelected = !!imageConfig;
      
      html += `
        <div class="classification-option ${isSelected ? 'selected' : ''}" data-classification="${classification.id}" data-node="${nodeId}">
          <div class="classification-card">
            <div class="classification-header">
              <span class="classification-name">${classification.name}</span>
              <span class="classification-shortcut">${classification.shortcut}</span>
            </div>
            <span class="classification-type">${classification.type}</span>
            
            ${isSelected ? `
              <div class="image-selection-controls">
                <div class="image-mode-selector">
                  <label class="radio-option">
                    <input type="radio" 
                           name="mode-${nodeId}-${classification.id}" 
                           value="single" 
                           ${imageConfig.mode === 'single' ? 'checked' : ''}>
                    <span>Single image</span>
                  </label>
                  <label class="radio-option">
                    <input type="radio" 
                           name="mode-${nodeId}-${classification.id}" 
                           value="multiple" 
                           ${imageConfig.mode === 'multiple' ? 'checked' : ''}>
                    <span>Multiple images</span>
                  </label>
                </div>
              </div>
            ` : ''}
          </div>
          
          <div class="classification-toggle">
            <input type="checkbox" 
                   value="${classification.id}" 
                   data-node="${nodeId}"
                   ${isSelected ? 'checked' : ''}>
            <span class="toggle-label">${isSelected ? 'Remove' : 'Add'}</span>
          </div>
        </div>
      `;
    });
    
    html += '</div>';
    return html;
  }

  attachConfigurationEventListeners() {
    const self = this;
    
    // Attribute tab switching
    document.querySelectorAll('.attribute-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const nodeId = e.target.dataset.node;
        const tabType = e.target.dataset.tab;
        
        // Update tab buttons
        e.target.parentElement.querySelectorAll('.attribute-tab-btn').forEach(b => 
          b.classList.remove('active')
        );
        e.target.classList.add('active');
        
        // Update tab content
        const container = e.target.closest('.config-section');
        container.querySelectorAll('.tab-pane').forEach(pane => 
          pane.classList.remove('active')
        );
        container.querySelector(`#${tabType}-${nodeId}`).classList.add('active');
      });
    });
    
    // Attribute selection
    document.querySelectorAll('.attribute-option input[type="checkbox"]').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const nodeId = e.target.dataset.node;
        const attrName = e.target.value;
        const attrType = e.target.dataset.type;
        
        self.toggleNodeAttribute(nodeId, attrName, attrType, e.target.checked);
        e.target.closest('.attribute-option').classList.toggle('selected', e.target.checked);
      });
    });
    
    // Image classification toggle
    document.querySelectorAll('.classification-toggle input[type="checkbox"]').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const nodeId = e.target.dataset.node;
        const classificationId = e.target.value;
        
        self.toggleImageClassification(nodeId, classificationId, e.target.checked);
        
        const option = e.target.closest('.classification-option');
        option.classList.toggle('selected', e.target.checked);
        
        // Update the toggle label
        const label = e.target.nextElementSibling;
        label.textContent = e.target.checked ? 'Remove' : 'Add';
        
        // Re-render to show/hide controls
        self.showConfigurationStep();
      });
    });
    
    // Image mode selection (single/multiple)
    document.querySelectorAll('.image-mode-selector input[type="radio"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        const matches = e.target.name.match(/mode-(.+)-(.+)/);
        if (matches) {
          const nodeId = matches[1];
          const classificationId = matches[2];
          self.updateImageMode(nodeId, classificationId, e.target.value);
        }
      });
    });
  }

  isAttributeSelected(nodeId, attrName) {
    return this.nodeAttributes[nodeId]?.some(attr => attr.name === attrName) || false;
  }

  isImageClassificationSelected(nodeId, classificationId) {
    return !!this.getImageClassificationConfig(nodeId, classificationId);
  }
  
  getImageClassificationConfig(nodeId, classificationId) {
    if (!this.imageAttachments[nodeId]) return null;
    return this.imageAttachments[nodeId].find(img => img.id === classificationId) || null;
  }

  toggleNodeAttribute(nodeId, attrName, attrType, isChecked) {
    if (!this.nodeAttributes[nodeId]) {
      this.nodeAttributes[nodeId] = [];
    }
    
    if (isChecked) {
      if (!this.isAttributeSelected(nodeId, attrName)) {
        this.nodeAttributes[nodeId].push({
          name: attrName,
          type: attrType
        });
      }
    } else {
      this.nodeAttributes[nodeId] = this.nodeAttributes[nodeId].filter(
        attr => attr.name !== attrName
      );
    }
  }

  toggleImageClassification(nodeId, classificationId, isChecked) {
    if (!this.imageAttachments[nodeId]) {
      this.imageAttachments[nodeId] = [];
    }
    
    if (isChecked) {
      // Add with default single mode
      if (!this.getImageClassificationConfig(nodeId, classificationId)) {
        this.imageAttachments[nodeId].push({
          id: classificationId,
          mode: 'single'
        });
      }
    } else {
      // Remove
      this.imageAttachments[nodeId] = this.imageAttachments[nodeId].filter(
        img => img.id !== classificationId
      );
    }
  }
  
  updateImageMode(nodeId, classificationId, mode) {
    if (!this.imageAttachments[nodeId]) return;
    
    const imageConfig = this.imageAttachments[nodeId].find(img => img.id === classificationId);
    if (imageConfig) {
      imageConfig.mode = mode;
    }
  }

  updateExportSummary() {
    const summaryEl = document.getElementById('export-summary');
    if (!summaryEl) return;
    
    const totalAttributes = Object.values(this.nodeAttributes).reduce((sum, attrs) => sum + attrs.length, 0);
    const totalImages = Object.values(this.imageAttachments).reduce((sum, images) => sum + images.length, 0);
    
    let html = `
      <div class="summary-stats">
        <div class="stat">
          <span class="stat-value">${this.selectedNodes.length}</span>
          <span class="stat-label">Node Types Selected</span>
        </div>
        <div class="stat">
          <span class="stat-value">${totalAttributes}</span>
          <span class="stat-label">Total Attributes</span>
        </div>
        <div class="stat">
          <span class="stat-value">${totalImages}</span>
          <span class="stat-label">Images</span>
        </div>
      </div>
    `;
    
    if (this.selectedNodes.length > 0) {
      html += '<div class="summary-details">';
      html += '<h4 style="margin-bottom: 16px; color: #1e293b;">Selected Node Types</h4>';
      
      this.selectedNodes.forEach(node => {
        const nodeAttrs = this.nodeAttributes[node.id] || [];
        const nodeImages = this.imageAttachments[node.id] || [];
        
        html += `
          <div class="summary-node-card">
            <div class="node-header">
              <span class="node-name">${node.type}</span>
              <span class="node-category-badge">${node.category}</span>
            </div>
            <div class="node-config-summary">
              <span class="config-item">${nodeAttrs.length} attributes configured</span>
              <span class="config-separator">•</span>
              <span class="config-item">${nodeImages.length} images</span>
            </div>
          </div>
        `;
      });
      html += '</div>';
    } else {
      html += '<div class="no-selection-message">No node types selected yet. Go back to step 1 to select nodes.</div>';
    }
    
    summaryEl.innerHTML = html;
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
        type: node.type,
        category: node.category,
        attributes: this.nodeAttributes[node.id] || [],
        images: this.imageAttachments[node.id] || []
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
  
  // Update interface with captured WebSocket data
  importInterface.updateWithCapturedData();
  
  // Force sample data creation if no data is found after waiting
  setTimeout(() => {
    const nodeTypesCount = importInterface.availableAttributes.nodeTypes.categories.length;
    const connectionTypesCount = importInterface.availableAttributes.connectionTypes.categories.length;
    console.log(`[ImportInterface] After updateWithCapturedData: ${nodeTypesCount} node categories, ${connectionTypesCount} connection categories`);
    
    if (nodeTypesCount === 0 && connectionTypesCount === 0) {
      console.log('[ImportInterface] No data found after update, creating sample data immediately...');
      // REMOVED: No longer using sample data - using only real reconstructed WebSocket data
      
      // Refresh the interface if it's already showing
      if (document.getElementById('import-modal')) {
        console.log('[ImportInterface] Refreshing interface with sample data...');
        importInterface.refreshInterface();
      }
    }
  }, 3000);
  
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
      
      // Store in both old and new locations for compatibility
      window.cloneableNodeTypes = event.data.nodeTypes;
      window.katapultProcessedNodeTypes = event.data.nodeTypes;
      
      console.log('[DEBUG] Stored node types in both window.cloneableNodeTypes and window.katapultProcessedNodeTypes');
      
      // Trigger interface update if it exists
      if (importInterface) {
        console.log('[DEBUG] Triggering interface update with new data');
        importInterface.parseWebSocketMessages();
      }
      
      updateButtonStatus();
    }
  }
  
  // Listen for data update notifications from inject script
  if (event.data && event.data.type === 'cloneable-data-updated') {
    console.log('[ImportInterface] 📢 Received reconstructed data from inject script!');
    console.log('[ImportInterface] Data received:', {
      nodeTypes: event.data.nodeTypes?.length || 0,
      connectionTypes: event.data.connectionTypes?.length || 0,
      attributes: Object.keys(event.data.attributes || {}).length,
      modelData: Object.keys(event.data.modelData || {}).length
    });
    
    // Store the received data in content script context
    window.contentScriptNodeTypes = event.data.nodeTypes || [];
    window.contentScriptConnectionTypes = event.data.connectionTypes || [];
    window.contentScriptAttributes = event.data.attributes || {};
    window.contentScriptModelData = event.data.modelData || {};
    
    console.log('[ImportInterface] ✅ Data stored in content script context');
    
    if (importInterface) {
      console.log('[ImportInterface] 🔄 Triggering UI refresh with newly reconstructed data...');
      
      // Parse the new data
      importInterface.parseWebSocketMessages();
      
      // Also refresh the interface if it's currently open
      if (document.getElementById('import-modal')) {
        console.log('[ImportInterface] 🖥️ Modal is open, refreshing node selection...');
        importInterface.renderNodeSelection();
        importInterface.renderConnectionSelection();
      }
    }
    
    updateButtonStatus();
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

// Debug function to check all data locations
window.debugNodeTypes = function() {
  console.log('=== NODE TYPES DEBUG INFO ===');
  console.log('window.katapultProcessedNodeTypes:', window.katapultProcessedNodeTypes);
  console.log('window.cloneableNodeTypes:', window.cloneableNodeTypes);
  console.log('window.katapultReconstructedAttributes:', window.katapultReconstructedAttributes ? Object.keys(window.katapultReconstructedAttributes) : null);
  console.log('window.katapultModelAttributesData:', window.katapultModelAttributesData ? Object.keys(window.katapultModelAttributesData) : null);
  
  if (importInterface && importInterface.availableAttributes) {
    console.log('ImportInterface node categories:', importInterface.availableAttributes.nodeTypes.categories);
    console.log('ImportInterface node values:', importInterface.availableAttributes.nodeTypes.values);
  }
  
  // Try to trigger data loading
  console.log('Requesting fresh data from inject script...');
  window.postMessage({ type: 'cloneable-get-model-attributes' }, '*');
};

console.log('[Cloneable Extension] Debug function available: window.debugNodeTypes()');
console.log('[Cloneable Extension] Content script loaded and ready');