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
    this.photoClassifications = []; // Initialize as empty array instead of null
    
    // Set global reference immediately
    window.importInterface = this;
    
    this.init();
  }

  init() {
    // Load available attributes and classifications
    this.loadAttributeSchema();
    this.loadPhotoClassifications();
  }

  resetState() {
    console.log('[ImportInterface] Resetting state - clearing all selections');
    
    // Clear all selections
    this.selectedNodes = [];
    this.selectedConnections = [];
    this.selectedSections = [];
    
    // Clear all attribute selections
    this.nodeAttributes = {};
    this.connectionAttributes = {};
    this.sectionAttributes = {};
    
    // Clear image attachments
    this.imageAttachments = {};
    
    // Note: We keep availableAttributes and photoClassifications as they are data, not selections
    
    // Reset any UI state
    this.parseRetryCount = 0;
    
    console.log('[ImportInterface] State reset complete');
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
    if (window.contentScriptAttributes && Object.keys(window.contentScriptAttributes).length > 0) {
      console.log('[ImportInterface] Processing reconstructed attributes...');
      this.processAttributeDefinitions(window.contentScriptAttributes);
    } else if (window.katapultReconstructedAttributes) {
      console.log('[ImportInterface] Processing reconstructed attributes from fallback...');
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
    
    // Check if we're on the configuration step - if so, don't refresh the selection step
    const configSection = document.getElementById('configure-section');
    if (configSection && configSection.classList.contains('active')) {
      console.log('[ImportInterface] User is on configuration step, skipping selection refresh');
      return;
    }
    
    // Check if we already have COMPLETE data rendered - if so, don't re-render unnecessarily
    const existingNodes = modal.querySelectorAll('.node-type-item').length;
    const existingConnections = modal.querySelectorAll('.connection-type-item').length;
    const hasNodeData = this.availableAttributes.nodeTypes.categories.length > 0;
    const hasConnectionData = this.availableAttributes.connectionTypes.categories.length > 0;
    
    // Only skip refresh if we have rendered items AND the data matches what we have
    if (existingNodes > 0 && hasNodeData && existingConnections > 0 && hasConnectionData) {
      console.log('[ImportInterface] Complete data already rendered, skipping refresh to preserve selections');
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
    if (connectionsSelector && this.availableAttributes.connectionTypes.categories.length > 0) {
      console.log('[ImportInterface] Refreshing connections selector with real data...');
      console.log('[ImportInterface] Connection categories available:', this.availableAttributes.connectionTypes.categories);
      connectionsSelector.innerHTML = this.renderConnectionTypeSelector();
      this.reattachSelectionListeners(modal);
    } else if (connectionsSelector) {
      console.log('[ImportInterface] Connection types not ready yet, will refresh later');
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
          
          // Extract attribute_types into an array
          const appliesTo = [];
          if (attrData.attribute_types) {
            Object.values(attrData.attribute_types).forEach(type => {
              if (type && !appliesTo.includes(type)) {
                appliesTo.push(type);
              }
            });
          }
          
          this.availableAttributes.withPicklists.push({
            name: attrName,
            displayName: this.formatDisplayName(attrName),
            dataType: 'picklist',
            required: attrData.required || false,
            appliesTo: appliesTo.length > 0 ? appliesTo : this.determineAppliesTo(attrName),
            categories: categories,
            values: values
          });
          
          console.log(`[ImportInterface] Added picklist attribute: ${attrName}`);
        } else {
          // This is a free-form attribute
          // Extract attribute_types into an array
          const appliesTo = [];
          if (attrData.attribute_types) {
            Object.values(attrData.attribute_types).forEach(type => {
              if (type && !appliesTo.includes(type)) {
                appliesTo.push(type);
              }
            });
          }
          
          this.availableAttributes.withoutPicklists.push({
            name: attrName,
            displayName: this.formatDisplayName(attrName),
            dataType: this.inferDataType(attrName, attrData),
            required: attrData.required || false,
            appliesTo: appliesTo.length > 0 ? appliesTo : this.determineAppliesTo(attrName)
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
    console.log('[ImportInterface] Checking window.contentScriptImageClassifications:', window.contentScriptImageClassifications);
    console.log('[ImportInterface] Checking window.katapultProcessedImageClassifications:', window.katapultProcessedImageClassifications);
    
    // Check if we have image classifications from the content script data
    if (window.contentScriptImageClassifications && window.contentScriptImageClassifications.length > 0) {
      console.log(`[ImportInterface] Found ${window.contentScriptImageClassifications.length} processed image classifications from content script`);
      
      // Convert processed image classifications to the expected format
      this.photoClassifications = window.contentScriptImageClassifications.map(image => ({
        id: image.key,
        key: image.key,
        name: image.name,
        shortcut: image.shortcut,
        type: image.elementType,
        color: image.color,
        textColor: image.textColor,
        editable: image.editable,
        hasAttributes: image.hasAttributes,
        helpText: image.helpText
      }));
      
      console.log('[ImportInterface] ✅ Loaded image classifications from content script data');
    }
    // Also check legacy locations for backwards compatibility
    else if (window.katapultProcessedImageClassifications && window.katapultProcessedImageClassifications.length > 0) {
      console.log(`[ImportInterface] Found ${window.katapultProcessedImageClassifications.length} processed image classifications from inject script`);
      
      // Convert processed image classifications to the expected format
      this.photoClassifications = window.katapultProcessedImageClassifications.map(image => ({
        id: image.key,
        key: image.key, 
        name: image.name,
        shortcut: image.shortcut,
        type: image.elementType,
        color: image.color,
        textColor: image.textColor,
        editable: image.editable,
        hasAttributes: image.hasAttributes,
        helpText: image.helpText
      }));
      
      console.log('[ImportInterface] ✅ Loaded image classifications from inject script data');
    } else {
      // Initialize empty - will be populated from WebSocket data
      this.photoClassifications = [];
      console.log('[ImportInterface] No processed image classifications found, starting with empty array');
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
    // Ensure global reference is set before creating modal
    window.importInterface = this;
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
                <!-- Connection types will be loaded dynamically -->
              </div>
              <div id="sections-selector" class="selection-pane">
                ${this.renderSectionTypeSelector()}
              </div>
            </div>
            
            <!-- Selection summary removed - selections are visible in checkboxes -->
            
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
            <div class="environment-selector" style="margin: 20px 0;">
              <label style="margin-right: 20px;">
                <input type="radio" name="environment" value="production" checked>
                <span>Production (app.cloneable.ai)</span>
              </label>
              <label>
                <input type="radio" name="environment" value="development">
                <span>Development (localhost:3000)</span>
              </label>
            </div>
            <div class="step-actions">
              <button class="btn-secondary" id="back-to-configure">← Back to Configure</button>
              <button class="btn-secondary" id="preview-json-btn">Preview JSON</button>
              <button class="btn-primary" id="export-data-btn">🚀 Send to Cloneable</button>
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
    const connectionTypes = this.availableAttributes?.connectionTypes;
    
    // If no connection types are available yet, show loading/waiting message
    if (!connectionTypes || !connectionTypes.values || Object.keys(connectionTypes.values).length === 0) {
      console.log('[ImportInterface] No connection types available yet, showing loading message');
      return `
        <div style="text-align: center; padding: 40px; color: #666;">
          <div style="margin-bottom: 20px; font-size: 24px;">⏳</div>
          <h3>Loading Connection Types...</h3>
          <p>Waiting for data to be captured.<br>If this persists, try refreshing the page.</p>
          <div style="margin-top: 15px; font-size: 14px; opacity: 0.8;">
            Categories found: ${connectionTypes?.categories?.length || 0}
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
        // Check if already exists before adding
        const exists = this.selectedNodes.some(n => 
          n.category === category && n.type === type
        );
        if (!exists) {
          this.selectedNodes.push({ category, type, id: Date.now() });
        }
      } else {
        this.selectedNodes = this.selectedNodes.filter(n => 
          !(n.category === category && n.type === type)
        );
      }
    } else if (itemType === 'connection') {
      if (checkbox.checked) {
        // Check if already exists before adding
        const exists = this.selectedConnections.some(c => 
          c.category === category && c.type === type
        );
        if (!exists) {
          this.selectedConnections.push({ category, type, id: Date.now() });
        }
      } else {
        this.selectedConnections = this.selectedConnections.filter(c => 
          !(c.category === category && c.type === type)
        );
      }
    } else if (itemType === 'section') {
      if (checkbox.checked) {
        // Check if already exists before adding
        const exists = this.selectedSections.some(s => 
          s.category === category && s.type === type
        );
        if (!exists) {
          this.selectedSections.push({ category, type, id: Date.now() });
        }
      } else {
        this.selectedSections = this.selectedSections.filter(s => 
          !(s.category === category && s.type === type)
        );
      }
    }
    
    this.updateExportSummary();
  }

  // Legacy method for compatibility
  toggleNode(checkbox) {
    checkbox.dataset.itemType = 'node';
    this.toggleSelection(checkbox);
  }

  updateSelectedItemsLists() {
    // Selection lists removed - no longer needed
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

  refreshNodeSelectionUI(modal) {
    // Update node checkboxes
    modal.querySelectorAll('.node-type-item input[type="checkbox"]').forEach(checkbox => {
      const [category, type] = checkbox.value.split(':');
      const isSelected = this.selectedNodes.some(n => n.category === category && n.type === type);
      checkbox.checked = isSelected;
      
      // Update parent styling
      const parent = checkbox.closest('.node-type-item');
      if (parent) {
        if (isSelected) {
          parent.classList.add('selected');
        } else {
          parent.classList.remove('selected');
        }
      }
    });
    
    // Update connection checkboxes
    modal.querySelectorAll('.connection-type-item input[type="checkbox"]').forEach(checkbox => {
      const [category, type] = checkbox.value.split(':');
      const isSelected = this.selectedConnections.some(c => c.category === category && c.type === type);
      checkbox.checked = isSelected;
      
      // Update parent styling
      const parent = checkbox.closest('.connection-type-item');
      if (parent) {
        if (isSelected) {
          parent.classList.add('selected');
        } else {
          parent.classList.remove('selected');
        }
      }
    });
    
    // Update section checkboxes
    modal.querySelectorAll('.section-type-item input[type="checkbox"]').forEach(checkbox => {
      const [category, type] = checkbox.value.split(':');
      const isSelected = this.selectedSections.some(s => s.category === category && s.type === type);
      checkbox.checked = isSelected;
      
      // Update parent styling
      const parent = checkbox.closest('.section-type-item');
      if (parent) {
        if (isSelected) {
          parent.classList.add('selected');
        } else {
          parent.classList.remove('selected');
        }
      }
    });
    
    // Update the summary display
    this.updateSelectionSummary(modal);
  }

  updateSelectionSummary(modal) {
    // Update the selected items summary at the bottom of step 1
    const summaryContainer = modal.querySelector('.selected-items-summary');
    if (!summaryContainer) return;
    
    let html = '<div class="selection-summary-section">';
    
    // Node summary
    if (this.selectedNodes.length > 0) {
      html += '<h4>Selected Infrastructure Nodes:</h4>';
      html += '<div class="selected-items">';
      this.selectedNodes.forEach(node => {
        html += `<span class="selected-item-chip node-chip">${node.type}</span>`;
      });
      html += '</div>';
    }
    
    // Connection summary  
    if (this.selectedConnections.length > 0) {
      html += '<h4>Selected Connections:</h4>';
      html += '<div class="selected-items">';
      this.selectedConnections.forEach(conn => {
        html += `<span class="selected-item-chip connection-chip">${conn.type}</span>`;
      });
      html += '</div>';
    }
    
    // Section summary
    if (this.selectedSections.length > 0) {
      html += '<h4>Selected Sections:</h4>';
      html += '<div class="selected-items">';
      this.selectedSections.forEach(section => {
        html += `<span class="selected-item-chip section-chip">${section.type}</span>`;
      });
      html += '</div>';
    }
    
    // No selection message
    if (this.selectedNodes.length === 0 && this.selectedConnections.length === 0 && this.selectedSections.length === 0) {
      html = '<div class="no-selection">No items selected yet</div>';
    }
    
    html += '</div>';
    summaryContainer.innerHTML = html;
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
    
    // Re-render node selection when going back to ensure UI reflects current state
    if (stepId === 'node-selection') {
      this.refreshNodeSelectionUI(modal);
      // Re-attach event listeners since we're updating checkbox states
      this.reattachSelectionListeners(modal);
    }
    
    // Update summary if showing export review
    if (stepId === 'export-review') {
      this.updateExportSummary();
    }
  }

  showConfigureStep(modal) {
    this.showStep(modal, 'configure-section');
    this.renderAllConfigurations();
    // Event listeners will be attached by renderAllConfigurations after DOM is ready
  }
  
  // Substring search function - search term must appear as contiguous substring
  fuzzyMatch(searchTerm, text) {
    if (!searchTerm) return true;
    
    const search = searchTerm.toLowerCase();
    const target = text.toLowerCase();
    
    return target.includes(search);
  }
  
  // Filter content within a specific card
  filterCardContent(nodeId, searchTerm) {
    const card = document.querySelector(`[data-node-id="${nodeId}"]`);
    if (!card) return;
    
    let matchCount = 0;
    let totalCount = 0;
    
    // Filter attributes
    card.querySelectorAll('.attribute-option').forEach(item => {
      totalCount++;
      const text = item.textContent || '';
      const matches = this.fuzzyMatch(searchTerm, text);
      
      if (matches) {
        item.style.display = '';
        matchCount++;
      } else {
        item.style.display = 'none';
      }
    });
    
    // Filter image classifications
    card.querySelectorAll('.classification-option').forEach(item => {
      totalCount++;
      const text = item.textContent || '';
      const matches = this.fuzzyMatch(searchTerm, text);
      
      if (matches) {
        item.style.display = '';
        matchCount++;
      } else {
        item.style.display = 'none';
      }
    });
    
    // Update match count display
    const countDisplay = card.querySelector('.search-match-count');
    if (countDisplay) {
      if (searchTerm) {
        countDisplay.textContent = `${matchCount} of ${totalCount} items`;
        countDisplay.style.display = '';
      } else {
        countDisplay.style.display = 'none';
      }
    }
  }
  
  toggleCard(button) {
    const card = button.closest('.node-config-card');
    if (!card) {
      console.error('[ImportInterface] Could not find parent card');
      return;
    }
    const chevron = button.querySelector('.chevron');
    const isCollapsed = card.classList.contains('collapsed');
    
    card.classList.toggle('collapsed');
    if (chevron) {
      chevron.textContent = isCollapsed ? '▼' : '▶';
    }
  }
  
  expandAll() {
    console.log('[ImportInterface] Expanding all accordions');
    document.querySelectorAll('.node-config-card').forEach(card => {
      card.classList.remove('collapsed');
      const chevron = card.querySelector('.chevron');
      if (chevron) chevron.textContent = '▼'; // Down arrow when expanded
    });
  }
  
  collapseAll() {
    console.log('[ImportInterface] Collapsing all accordions');
    document.querySelectorAll('.node-config-card').forEach(card => {
      card.classList.add('collapsed');
      const chevron = card.querySelector('.chevron');
      if (chevron) chevron.textContent = '▶'; // Right arrow when collapsed
    });
  }
  
  filterConfigurations(searchTerm) {
    const term = searchTerm.toLowerCase();
    const cards = document.querySelectorAll('.node-config-card');
    
    if (!term) {
      // Reset all when search is empty
      cards.forEach(card => {
        // Show all attributes and classifications
        card.querySelectorAll('.attribute-option, .classification-option').forEach(el => {
          el.style.display = '';
        });
        // Remove all highlights
        card.querySelectorAll('.highlight').forEach(el => {
          el.classList.remove('highlight');
        });
        // Update header to remove match count
        const header = card.querySelector('.node-config-header h4');
        if (header) {
          const originalText = header.textContent.replace(/ \(\d+ matches\)/, '');
          header.textContent = originalText;
        }
      });
      return;
    }
    
    // Filter attributes within each card
    cards.forEach(card => {
      let matchCount = 0;
      let totalItems = 0;
      
      // Check node/connection/section name in header
      const title = card.querySelector('.node-type-title');
      let titleMatches = false;
      if (title && title.textContent.toLowerCase().includes(term)) {
        titleMatches = true;
        title.classList.add('highlight');
      } else if (title) {
        title.classList.remove('highlight');
      }
      
      // Filter attributes
      card.querySelectorAll('.attribute-option').forEach(attrEl => {
        totalItems++;
        const attrText = attrEl.textContent.toLowerCase();
        const hasMatch = attrText.includes(term);
        
        if (hasMatch || titleMatches) {
          attrEl.style.display = '';
          if (hasMatch) matchCount++;
          // Highlight matching text
          const nameEl = attrEl.querySelector('.attribute-name');
          if (nameEl && nameEl.textContent.toLowerCase().includes(term)) {
            nameEl.classList.add('highlight');
          } else if (nameEl) {
            nameEl.classList.remove('highlight');
          }
        } else {
          attrEl.style.display = 'none';
          attrEl.querySelector('.attribute-name')?.classList.remove('highlight');
        }
      });
      
      // Filter image classifications
      card.querySelectorAll('.classification-option').forEach(classEl => {
        totalItems++;
        const classText = classEl.textContent.toLowerCase();
        const hasMatch = classText.includes(term);
        
        if (hasMatch || titleMatches) {
          classEl.style.display = '';
          if (hasMatch) matchCount++;
          // Highlight matching text
          const nameEl = classEl.querySelector('.classification-name');
          if (nameEl && nameEl.textContent.toLowerCase().includes(term)) {
            nameEl.classList.add('highlight');
          } else if (nameEl) {
            nameEl.classList.remove('highlight');
          }
        } else {
          classEl.style.display = 'none';
          classEl.querySelector('.classification-name')?.classList.remove('highlight');
        }
      });
      
      // Update card header with match count
      const header = card.querySelector('.node-config-header h4');
      if (header) {
        const originalText = header.textContent.replace(/ \(\d+ matches\)/, '');
        if (matchCount > 0 || titleMatches) {
          if (matchCount > 0) {
            header.textContent = `${originalText} (${matchCount} matches)`;
          } else {
            header.textContent = originalText;
          }
          // Auto-expand cards with matches
          card.classList.remove('collapsed');
          const chevron = card.querySelector('.chevron');
          if (chevron) chevron.textContent = '▼';
        } else {
          header.textContent = originalText;
          // Auto-collapse cards with no matches
          card.classList.add('collapsed');
          const chevron = card.querySelector('.chevron');
          if (chevron) chevron.textContent = '▶';
        }
      }
    });
  }

  renderAllConfigurations() {
    const container = document.getElementById('node-configurations');
    if (!container) return;
    
    // Remove any existing event listeners to avoid duplicates
    const newContainer = container.cloneNode(false);
    container.parentNode.replaceChild(newContainer, container);
    
    // Add bulk action controls (removed global search)
    let html = `
      <div class="configuration-controls">
        <div class="bulk-actions" style="margin-left: auto;">
          <button class="bulk-action-btn" data-action="expand-all">
            <span>📂</span> Expand All
          </button>
          <button class="bulk-action-btn" data-action="collapse-all">
            <span>📁</span> Collapse All
          </button>
        </div>
      </div>
    `;
    
    // Render configurations for nodes
    this.selectedNodes.forEach((node, index) => {
      const nodeId = node.id;
      // Count selected items for this node
      const selectedAttrs = this.nodeAttributes[nodeId]?.length || 0;
      const selectedImages = this.imageAttachments[nodeId]?.length || 0;
      
      html += `
        <div class="node-config-card collapsed" data-node-id="${nodeId}">
          <div class="node-config-header">
            <div class="node-info">
              <h4 class="node-type-title">${node.type}</h4>
              <span class="node-category-badge">${node.category.toUpperCase()}</span>
              ${(selectedAttrs > 0 || selectedImages > 0) ? `
                <span class="selection-count">
                  ${selectedAttrs > 0 ? `${selectedAttrs} attrs` : ''}
                  ${selectedAttrs > 0 && selectedImages > 0 ? ' • ' : ''}
                  ${selectedImages > 0 ? `${selectedImages} imgs` : ''}
                </span>
              ` : ''}
            </div>
            <button class="toggle-config-btn" data-action="toggle-card">
              <span class="chevron">▶</span>
            </button>
          </div>
          
          <div class="node-config-content">
            <div class="card-search-container">
              <input type="text" 
                     class="card-search-input" 
                     placeholder="Search attributes and images (fuzzy)..." 
                     data-node-id="${nodeId}"
                     data-action="search-card">
              <span class="search-match-count" style="display:none;"></span>
            </div>
            
            <!-- Attributes Section -->
            <div class="config-section">
              <h5><span class="icon">📋</span> Attributes</h5>
              <div class="attribute-content">
                ${this.renderAllAttributes(nodeId, 'node')}
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
      const selectedAttrs = this.connectionAttributes?.[connectionId]?.length || 0;
      const selectedImages = this.imageAttachments[connectionId]?.length || 0;
      
      html += `
        <div class="node-config-card collapsed" data-connection-id="${connectionId}">
          <div class="node-config-header">
            <div class="node-info">
              <h4>${connection.type} <span class="node-category-badge">${connection.category}</span></h4>
              ${(selectedAttrs > 0 || selectedImages > 0) ? `
                <span class="selection-count">
                  ${selectedAttrs > 0 ? `${selectedAttrs} attrs` : ''}
                  ${selectedAttrs > 0 && selectedImages > 0 ? ' • ' : ''}
                  ${selectedImages > 0 ? `${selectedImages} imgs` : ''}
                </span>
              ` : ''}
            </div>
            <button class="toggle-config-btn" data-action="toggle-card">
              <span class="chevron">▶</span>
            </button>
          </div>
          
          <div class="node-config-content">
            <div class="card-search-container">
              <input type="text" 
                     class="card-search-input" 
                     placeholder="Search attributes and images (fuzzy)..." 
                     data-node-id="${connectionId}"
                     data-action="search-card">
              <span class="search-match-count" style="display:none;"></span>
            </div>
            
            <!-- Attributes Section -->
            <div class="config-section">
              <h5><span class="icon">📋</span> Attributes</h5>
              <div class="attribute-content">
                ${this.renderAllAttributes(connectionId, 'connection')}
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
      const selectedAttrs = this.sectionAttributes?.[sectionId]?.length || 0;
      const selectedImages = this.imageAttachments[sectionId]?.length || 0;
      
      html += `
        <div class="node-config-card collapsed" data-section-id="${sectionId}">
          <div class="node-config-header">
            <div class="node-info">
              <h4>${section.type} <span class="node-category-badge" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);">${section.category}</span></h4>
              ${(selectedAttrs > 0 || selectedImages > 0) ? `
                <span class="selection-count">
                  ${selectedAttrs > 0 ? `${selectedAttrs} attrs` : ''}
                  ${selectedAttrs > 0 && selectedImages > 0 ? ' • ' : ''}
                  ${selectedImages > 0 ? `${selectedImages} imgs` : ''}
                </span>
              ` : ''}
            </div>
            <button class="toggle-config-btn" data-action="toggle-card">
              <span class="chevron">▶</span>
            </button>
          </div>
          
          <div class="node-config-content">
            <div class="card-search-container">
              <input type="text" 
                     class="card-search-input" 
                     placeholder="Search attributes and images (fuzzy)..." 
                     data-node-id="${sectionId}"
                     data-action="search-card">
              <span class="search-match-count" style="display:none;"></span>
            </div>
            
            <!-- Attributes Section -->
            <div class="config-section">
              <h5><span class="icon">📋</span> Attributes</h5>
              <div class="attribute-content">
                ${this.renderAllAttributes(sectionId, 'section')}
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
    
    // Get the fresh container reference after replacement
    const freshContainer = document.getElementById('node-configurations');
    freshContainer.innerHTML = html;
    
    // Small delay to ensure DOM is ready before attaching listeners
    setTimeout(() => {
      this.attachConfigurationEventListeners();
    }, 10);
  }

  renderAllAttributes(entityId, entityType) {
    // Combine both picklist and free-form attributes
    const allAttributes = [
      ...this.availableAttributes.withPicklists,
      ...this.availableAttributes.withoutPicklists
    ];
    
    // Filter attributes based on entity type
    const filteredAttributes = allAttributes.filter(attr => {
      if (!attr.appliesTo || attr.appliesTo.length === 0) {
        return true; // Apply to all types if not specified
      }
      // The attribute_types values are singular: "node", "connection", "section", "job", "photo_annotation"
      // Map our entity types to the expected values
      const entityTypeMapping = {
        'node': 'node',
        'connection': 'connection',
        'section': 'section'
      };
      const mappedType = entityTypeMapping[entityType] || entityType;
      return attr.appliesTo.includes(mappedType);
    });
    
    // Sort attributes alphabetically by display name
    filteredAttributes.sort((a, b) => {
      const nameA = (a.displayName || a.name || '').toLowerCase();
      const nameB = (b.displayName || b.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
    
    let html = '<div class="attribute-grid">';
    
    filteredAttributes.forEach(attr => {
      const isChecked = this.isAttributeSelected(entityId, attr.name);
      const hasPicklist = attr.values && Object.keys(attr.values).length > 0;
      
      html += `
        <label class="attribute-option ${isChecked ? 'selected' : ''}">
          <input type="checkbox" 
                 value="${attr.name}" 
                 data-entity="${entityId}"
                 data-entity-type="${entityType}"
                 data-type="${hasPicklist ? 'picklist' : 'freeform'}"
                 ${isChecked ? 'checked' : ''}>
          <div class="attribute-card">
            <div class="attribute-header">
              <span class="attribute-name">${attr.displayName}</span>
              <span class="attribute-type-badge">${hasPicklist ? 'picklist' : attr.dataType || 'text'}</span>
            </div>
            ${hasPicklist ? this.renderPicklistPreview(attr) : ''}
          </div>
        </label>
      `;
    });
    
    html += '</div>';
    return html;
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
    
    // Check if photoClassifications is available
    if (!this.photoClassifications || !Array.isArray(this.photoClassifications)) {
      console.log('[ImportInterface] Warning: photoClassifications not available or not an array:', this.photoClassifications);
      html += '<div style="padding: 20px; color: #999; text-align: center;">No image classifications available</div>';
      html += '</div>';
      return html;
    }
    
    if (this.photoClassifications.length === 0) {
      console.log('[ImportInterface] No image classifications to render');
      html += '<div style="padding: 20px; color: #999; text-align: center;">No image classifications configured</div>';
      html += '</div>';
      return html;
    }
    
    console.log(`[ImportInterface] Rendering ${this.photoClassifications.length} image classifications for node ${nodeId}`);
    
    // Sort image classifications alphabetically
    const sortedClassifications = [...this.photoClassifications].sort((a, b) => {
      const nameA = (a.name || '').toLowerCase();
      const nameB = (b.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
    
    sortedClassifications.forEach(classification => {
      const imageConfig = this.getImageClassificationConfig(nodeId, classification.id);
      const isSelected = !!imageConfig;
      
      // Use data attributes instead of inline onclick to avoid escaping issues
      html += `
        <div class="classification-option ${isSelected ? 'selected' : ''}" 
             data-classification="${classification.id}" 
             data-node="${nodeId}"
             data-action="toggle-classification">
          <div class="classification-card">
            <div class="classification-header">
              <span class="classification-name">${classification.name}</span>
              <span class="classification-shortcut">(${classification.shortcut})</span>
            </div>
            
            ${isSelected ? `
              <div class="image-mode-badge" 
                   data-node="${nodeId}"
                   data-classification="${classification.id}"
                   data-action="toggle-image-mode"
                   title="Click to toggle between single and multiple images">
                ${imageConfig && imageConfig.mode === 'multiple' ? 
                  '<span class="mode-icon">🖼️</span> Multiple' : 
                  '<span class="mode-icon">📷</span> Single'}
              </div>
            ` : ''}
          </div>
        </div>
      `;
    });
    
    html += '</div>';
    return html;
  }

  attachConfigurationEventListeners() {
    const self = this;
    
    // Card toggle (expand/collapse) - make entire header clickable
    const cardHeaders = document.querySelectorAll('.node-config-header');
    console.log(`[ImportInterface] Attaching accordion listeners to ${cardHeaders.length} headers`);
    
    // Convert NodeList to Array to avoid issues with replacing elements while iterating
    Array.from(cardHeaders).forEach((header, index) => {
      // Make header look clickable
      header.style.cursor = 'pointer';
      
      console.log(`[ImportInterface] Attaching click listener to header ${index}`);
      
      // Add click listener to entire header (don't clone, just add directly)
      header.addEventListener('click', function(e) {
        console.log('[ImportInterface] Header clicked!', e.target);
        e.preventDefault();
        e.stopPropagation();
        
        // Find the card that contains this header
        const card = this.closest('.node-config-card');
        if (!card) {
          console.error('[ImportInterface] Could not find parent card');
          return;
        }
        
        // Toggle the card state
        const isCollapsed = card.classList.contains('collapsed');
        card.classList.toggle('collapsed');
        
        // Update chevron - collapsed shows right arrow, expanded shows down arrow
        const chevron = this.querySelector('.chevron');
        if (chevron) {
          chevron.textContent = isCollapsed ? '▼' : '▶';
        }
        
        console.log('[ImportInterface] Accordion toggled:', {
          nodeId: card.dataset.nodeId,
          wasCollapsed: isCollapsed,
          isNowCollapsed: card.classList.contains('collapsed')
        });
      });
    });
    
    // Image classification toggling - attach after header listeners
    const classificationElements = document.querySelectorAll('[data-action="toggle-classification"]');
    console.log(`[ImportInterface] Found ${classificationElements.length} image classification elements to attach listeners to`);
    
    classificationElements.forEach(element => {
      // Ensure element is clickable
      element.style.cursor = 'pointer';
      element.style.userSelect = 'none'; // Prevent text selection on click
      
      element.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation(); // Prevent accordion toggle
        
        console.log('[ImportInterface] Image classification clicked!', {
          nodeId: this.dataset.node,
          classificationId: this.dataset.classification,
          currentlySelected: this.classList.contains('selected'),
          element: this
        });
        
        // Ensure we have the required data
        if (!this.dataset.node || !this.dataset.classification) {
          console.error('[ImportInterface] Missing node or classification data on element');
          return;
        }
        
        try {
          const nodeId = this.dataset.node;
          const classificationId = this.dataset.classification;
          // Check if the element has 'selected' class
          const isSelected = this.classList.contains('selected');
          
          // Toggle the selection and pass the element for UI update
          self.toggleImageClassification(nodeId, classificationId, !isSelected, this);
        } catch (error) {
          console.error('[ImportInterface] Error in image classification click handler:', error);
        }
      });
    });
    
    // Expand all button
    const expandAllBtn = document.querySelector('[data-action="expand-all"]');
    if (expandAllBtn) {
      // Remove any existing listener to prevent duplicates
      const newExpandHandler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('[ImportInterface] Expand all clicked');
        self.expandAll();
      };
      // Clone and replace to remove all existing listeners
      const newExpandBtn = expandAllBtn.cloneNode(true);
      expandAllBtn.parentNode.replaceChild(newExpandBtn, expandAllBtn);
      newExpandBtn.addEventListener('click', newExpandHandler);
    }
    
    // Collapse all button
    const collapseAllBtn = document.querySelector('[data-action="collapse-all"]');
    if (collapseAllBtn) {
      // Remove any existing listener to prevent duplicates
      const newCollapseHandler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('[ImportInterface] Collapse all clicked');
        self.collapseAll();
      };
      // Clone and replace to remove all existing listeners
      const newCollapseBtn = collapseAllBtn.cloneNode(true);
      collapseAllBtn.parentNode.replaceChild(newCollapseBtn, collapseAllBtn);
      newCollapseBtn.addEventListener('click', newCollapseHandler);
    }
    
    // Global search removed - only per-card search remains
    
    // Per-card search inputs
    const cardSearchInputs = document.querySelectorAll('[data-action="search-card"]');
    cardSearchInputs.forEach(input => {
      input.addEventListener('keyup', (e) => {
        const nodeId = input.dataset.nodeId;
        const searchTerm = e.target.value;
        self.filterCardContent(nodeId, searchTerm);
      });
    });
    
    // Image mode toggle (single/multiple)
    document.querySelectorAll('[data-action="toggle-image-mode"]').forEach(badge => {
      badge.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation(); // Prevent triggering the parent click
        const nodeId = badge.dataset.node;
        const classificationId = badge.dataset.classification;
        
        console.log('[ImportInterface] Image mode toggle clicked:', {
          nodeId,
          classificationId
        });
        
        // Get current mode and toggle it
        const imageConfig = self.getImageClassificationConfig(nodeId, classificationId);
        const newMode = (!imageConfig || imageConfig.mode === 'single') ? 'multiple' : 'single';
        
        self.updateImageMode(nodeId, classificationId, newMode);
        
        // Update the badge text
        badge.innerHTML = newMode === 'multiple' ? 
          '<span class="mode-icon">🖼️</span> Multiple' : 
          '<span class="mode-icon">📷</span> Single';
      });
    });
    
    // Attribute selection
    document.querySelectorAll('.attribute-option input[type="checkbox"]').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const entityId = e.target.dataset.entity;
        const entityType = e.target.dataset.entityType;
        const attrName = e.target.value;
        const attrType = e.target.dataset.type;
        
        // Use the appropriate toggle method based on entity type
        if (entityType === 'node') {
          self.toggleNodeAttribute(entityId, attrName, attrType, e.target.checked);
        } else if (entityType === 'connection') {
          // TODO: Add connection attribute toggle
          self.toggleNodeAttribute(entityId, attrName, attrType, e.target.checked);
        } else if (entityType === 'section') {
          // TODO: Add section attribute toggle
          self.toggleNodeAttribute(entityId, attrName, attrType, e.target.checked);
        }
        
        e.target.closest('.attribute-option').classList.toggle('selected', e.target.checked);
      });
    });
    
    // Note: Image classification toggling and mode selection are now handled via inline onclick/onchange
    // handlers in the renderImageClassifications method for better reactivity
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

  toggleImageClassification(nodeId, classificationId, isChecked, element) {
    console.log('[ImportInterface] toggleImageClassification called:', {
      nodeId,
      classificationId,
      isChecked,
      hasElement: !!element
    });
    
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
        
        // Update UI - add selected class and mode badge
        if (element) {
          element.classList.add('selected');
          const card = element.querySelector('.classification-card');
          if (card && !card.querySelector('.image-mode-badge')) {
            // Add the mode badge
            const badge = document.createElement('div');
            badge.className = 'image-mode-badge';
            badge.dataset.node = nodeId;
            badge.dataset.classification = classificationId;
            badge.dataset.action = 'toggle-image-mode';
            badge.title = 'Click to toggle between single and multiple images';
            badge.innerHTML = '<span class="mode-icon">📷</span> Single';
            card.appendChild(badge);
            
            // Add event listener to the new badge
            badge.addEventListener('click', (e) => {
              e.stopPropagation();
              const currentMode = badge.textContent.includes('Single') ? 'single' : 'multiple';
              const newMode = currentMode === 'single' ? 'multiple' : 'single';
              this.updateImageMode(nodeId, classificationId, newMode);
              badge.innerHTML = newMode === 'multiple' ? 
                '<span class="mode-icon">🖼️</span> Multiple' : 
                '<span class="mode-icon">📷</span> Single';
            });
          }
        }
      }
    } else {
      // Remove
      this.imageAttachments[nodeId] = this.imageAttachments[nodeId].filter(
        img => img.id !== classificationId
      );
      
      // Update UI - remove selected class and mode badge
      if (element) {
        element.classList.remove('selected');
        const badge = element.querySelector('.image-mode-badge');
        if (badge) {
          badge.remove();
        }
      }
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
    // Helper function to get attribute metadata
    const getAttributeMetadata = (attrName) => {
      // Check in picklist attributes
      const picklistAttr = this.availableAttributes.withPicklists.find(a => a.name === attrName);
      if (picklistAttr) {
        // Make sure we have values, and if not, try to find them
        const picklistValues = picklistAttr.values || picklistAttr.picklistOptions || {};
        
        return {
          name: {
            name: attrName,
            type: 'picklist'
          },
          dataType: 'picklist',
          displayName: picklistAttr.displayName,
          picklistOptions: picklistValues // Include all available picklist values
        };
      }
      
      // Check in free-form attributes
      const freeformAttr = this.availableAttributes.withoutPicklists.find(a => a.name === attrName);
      if (freeformAttr) {
        return {
          name: {
            name: attrName,
            type: 'freeform'
          },
          dataType: freeformAttr.dataType || 'text',
          displayName: freeformAttr.displayName
        };
      }
      
      // Fallback if not found
      return { 
        name: {
          name: attrName,
          type: 'unknown'
        },
        dataType: 'text' 
      };
    };
    
    return {
      version: '1.0',
      timestamp: new Date().toISOString(),
      source: 'katapult',
      target: 'cloneable',
      nodes: this.selectedNodes.map(node => {
        // Get selected attributes for this node with their metadata
        const nodeAttrs = this.nodeAttributes[node.id] || [];
        const enrichedAttributes = nodeAttrs.map(attr => {
          // Extract the attribute name from the object
          const attrName = typeof attr === 'string' ? attr : attr.name;
          const metadata = getAttributeMetadata(attrName);
          
          // Ensure we include picklistOptions for picklist attributes
          if (metadata.dataType === 'picklist' && !metadata.picklistOptions) {
            // Find the attribute in our available attributes to get its picklist values
            const picklistAttr = this.availableAttributes.withPicklists.find(a => a.name === attrName);
            if (picklistAttr) {
              metadata.picklistOptions = picklistAttr.values;
            }
          }
          
          return metadata;
        });
        
        return {
          id: node.id,
          type: node.type,
          category: node.category,
          attributes: enrichedAttributes,
          images: this.imageAttachments[node.id] || []
        };
      }),
      connections: this.selectedConnections.map(conn => {
        // Get selected attributes for this connection with their metadata
        const connAttrs = this.connectionAttributes[conn.id] || [];
        const enrichedAttributes = connAttrs.map(attr => {
          const attrName = typeof attr === 'string' ? attr : attr.name;
          return getAttributeMetadata(attrName);
        });
        
        return {
          id: conn.id,
          type: conn.type,
          category: conn.category,
          attributes: enrichedAttributes,
          images: this.imageAttachments[conn.id] || []
        };
      }),
      sections: this.selectedSections.map(section => {
        // Get selected attributes for this section with their metadata
        const sectionAttrs = this.sectionAttributes[section.id] || [];
        const enrichedAttributes = sectionAttrs.map(attr => {
          const attrName = typeof attr === 'string' ? attr : attr.name;
          return getAttributeMetadata(attrName);
        });
        
        return {
          id: section.id,
          type: section.type,
          category: section.category,
          attributes: enrichedAttributes,
          images: this.imageAttachments[section.id] || []
        };
      })
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
}

// Global instance
let importInterface = null;
window.importInterface = null; // Also store globally for debugging

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
  button.innerHTML = '<span class="button-text">Loading model data...</span>';
  button.className = 'cloneable-export-button';
  button.disabled = true; // Initially disabled
  button.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 999999;
    padding: 12px 24px;
    background: #9e9e9e;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: not-allowed;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    gap: 8px;
    opacity: 0.7;
  `;
  
  button.addEventListener('mouseenter', () => {
    if (!button.disabled) {
      button.style.transform = 'scale(1.05)';
      button.style.boxShadow = '0 6px 12px rgba(0,0,0,0.15)';
    }
  });
  
  button.addEventListener('mouseleave', () => {
    if (!button.disabled) {
      button.style.transform = 'scale(1)';
      button.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
    }
  });
  
  button.addEventListener('click', () => {
    if (!button.disabled) {
      // Double-check data is fully loaded before opening modal
      const hasNodeTypes = window.cloneableNodeTypes && window.cloneableNodeTypes.length > 0;
      const hasConnectionTypes = window.contentScriptConnectionTypes && window.contentScriptConnectionTypes.length > 0;
      const hasAttributes = window.contentScriptAttributes && Object.keys(window.contentScriptAttributes).length > 0;
      const hasImageClassifications = window.contentScriptImageClassifications && window.contentScriptImageClassifications.length > 0;
      
      if (!hasNodeTypes || !hasConnectionTypes || !hasAttributes || !hasImageClassifications) {
        alert('Data is still loading. Please wait for all model data to be captured.');
        console.log('[Cloneable] Data not fully loaded:', {
          hasNodeTypes,
          hasConnectionTypes,
          hasAttributes,
          hasImageClassifications
        });
        return;
      }
      
      showAdvancedImportInterface();
    }
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
  } else {
    // Reset state when reopening the modal
    importInterface.resetState();
  }
  
  // Always update the global reference BEFORE creating the modal
  window.importInterface = importInterface;
  console.log('[ImportInterface] ✅ Global interface reference updated BEFORE modal creation');
  
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
  buttonCreatedTime = Date.now(); // Track when button was created
}

// Store capture status
let captureStatus = {
  messageCount: 0,
  socketCount: 0
};

// Track when the button was first created
let buttonCreatedTime = null;

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
    window.contentScriptImageClassifications = event.data.imageClassifications || [];
    
    // Also store in the location that updateButtonStatus checks
    if (event.data.nodeTypes && event.data.nodeTypes.length > 0) {
      window.cloneableNodeTypes = event.data.nodeTypes;
    }
    
    console.log('[ImportInterface] ✅ Data stored in content script context');
    console.log('[ImportInterface] Image classifications:', event.data.imageClassifications?.length || 0);
    
    // Use processed attributes if available, otherwise process raw attributes
    if (window.importInterface && event.data.processedAttributes) {
      console.log('[ImportInterface] 🎯 Using pre-processed attributes from inject script...');
      console.log('[ImportInterface] Received attributes:', {
        withPicklists: event.data.processedAttributes.withPicklists?.length || 0,
        withoutPicklists: event.data.processedAttributes.withoutPicklists?.length || 0
      });
      
      // Directly use the processed attributes instead of processing raw data
      window.importInterface.availableAttributes.withPicklists = event.data.processedAttributes.withPicklists || [];
      window.importInterface.availableAttributes.withoutPicklists = event.data.processedAttributes.withoutPicklists || [];
      
      console.log('[ImportInterface] ✅ Attributes loaded from processed data');
    } else if (window.importInterface && Object.keys(event.data.attributes || {}).length > 0) {
      console.log('[ImportInterface] 🔧 Processing raw attributes from postMessage data...');
      window.importInterface.processAttributeDefinitions(event.data.attributes);
    }
    
    // Reload image classifications if available
    if (window.importInterface && event.data.imageClassifications && event.data.imageClassifications.length > 0) {
      console.log('[ImportInterface] 📸 Reloading image classifications with new data...');
      window.importInterface.loadPhotoClassifications();
      
      // Only re-render if we're on the configuration step AND we don't have classifications yet
      // This prevents re-rendering when data updates come in while user is selecting items
      if (document.getElementById('configure-section') && 
          document.getElementById('configure-section').classList.contains('active') &&
          document.querySelectorAll('.classification-option').length === 0) {
        console.log('[ImportInterface] 🔄 Re-rendering configuration to show image classifications for first time...');
        window.importInterface.renderAllConfigurations();
        // Re-attach event listeners after re-render
        window.importInterface.attachConfigurationEventListeners();
      }
    }
    
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
  if (!button) return;
  
  const textSpan = button.querySelector('.button-text');
  
  // Check if data is fully loaded
  const hasNodeTypes = window.cloneableNodeTypes && window.cloneableNodeTypes.length > 0;
  const hasConnectionTypes = window.contentScriptConnectionTypes && window.contentScriptConnectionTypes.length > 0;
  const hasAttributes = window.contentScriptAttributes && Object.keys(window.contentScriptAttributes).length > 0;
  const hasImageClassifications = window.contentScriptImageClassifications && window.contentScriptImageClassifications.length > 0;
  
  // Data is considered fully loaded when we have all required data types
  const dataFullyLoaded = hasNodeTypes && hasConnectionTypes && hasAttributes && hasImageClassifications;
  
  // Check if we've been waiting too long (more than 30 seconds)
  const waitingTooLong = buttonCreatedTime && (Date.now() - buttonCreatedTime > 30000);
  
  if (dataFullyLoaded) {
    // All data is ready - enable button
    if (textSpan) textSpan.textContent = `Export model to Cloneable`;
    button.style.backgroundColor = '#4CAF50';
    button.style.cursor = 'pointer';
    button.style.opacity = '1';
    button.disabled = false;
  } else if (captureStatus.messageCount > 50) {
    // Still loading - show what's missing
    const missing = [];
    if (!hasNodeTypes) missing.push('nodes');
    if (!hasConnectionTypes) missing.push('connections');
    if (!hasAttributes) missing.push('attributes');
    if (!hasImageClassifications) missing.push('images');
    
    if (textSpan) textSpan.textContent = `Loading... (waiting for: ${missing.join(', ')})`;
    button.style.backgroundColor = '#ff9800';
    button.style.cursor = 'not-allowed';
    button.style.opacity = '0.7';
    button.disabled = true;
  } else if (captureStatus.messageCount > 0) {
    // Just starting to capture
    if (textSpan) textSpan.textContent = `Capturing (${captureStatus.messageCount} messages)...`;
    button.style.backgroundColor = '#9e9e9e';
    button.style.cursor = 'not-allowed';
    button.style.opacity = '0.7';
    button.disabled = true;
  } else if (waitingTooLong) {
    // Been waiting too long - show error state
    if (textSpan) textSpan.textContent = 'No data captured - reload page';
    button.style.backgroundColor = '#f44336';
    button.style.cursor = 'not-allowed';
    button.style.opacity = '0.7';
    button.disabled = true;
  } else {
    // No data yet - keep button disabled
    if (textSpan) textSpan.textContent = 'Loading model data...';
    button.style.backgroundColor = '#9e9e9e';
    button.style.cursor = 'not-allowed';
    button.style.opacity = '0.7';
    button.disabled = true;
  }
}

// Check capture status periodically
function checkCaptureStatus() {
  // Don't request updates if user is actively interacting with the import interface
  const modal = document.getElementById('import-modal');
  const configSection = document.getElementById('configure-section');
  
  // Skip if modal is open and user is on configuration step
  if (modal && modal.style.display === 'block' && 
      configSection && configSection.classList.contains('active')) {
    console.log('[Cloneable] Skipping data request - user is configuring selections');
    return;
  }
  
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