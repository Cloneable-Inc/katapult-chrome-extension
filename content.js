



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
    console.log('[ImportInterface] Content script data variables:');
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
        // Keep full objects with raw values
        this.availableAttributes.nodeTypes.values[category] = typesInCategory;
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
        // Keep full objects with raw values
        this.availableAttributes.connectionTypes.values[category] = typesInCategory;
      });
      
      console.log('[ImportInterface] ✅ Loaded connection types from reconstructed data');
      console.log('[ImportInterface] Connection categories:', connCategories);
      console.log('[ImportInterface] Sample values:', this.availableAttributes.connectionTypes.values);
      
      // Refresh the UI if it's currently displayed
      this.refreshUIWithNewData();
    }
    
    // Use the reconstructed attributes for the general attributes list
    if (window.contentScriptAttributes && Object.keys(window.contentScriptAttributes).length > 0) {
      console.log('[ImportInterface] PROCESSING PATH 1: Processing reconstructed attributes from contentScriptAttributes...');
      this.processAttributeDefinitions(window.contentScriptAttributes);
    } else if (window.katapultReconstructedAttributes) {
      console.log('[ImportInterface] PROCESSING PATH 2: Processing reconstructed attributes from katapultReconstructedAttributes fallback...');
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
    
    // Clear existing attributes to prevent duplicates from multiple calls
    this.availableAttributes.withPicklists = [];
    this.availableAttributes.withoutPicklists = [];
    // Process each attribute definition from the WebSocket data
    Object.entries(attributesData).forEach(([attrName, attrData]) => {
      // Skip node_type and cable_type as they're handled separately
      if (attrName === 'node_type' || attrName === 'cable_type') {
        return;
      }
      
      if (attrData && typeof attrData === 'object') {
        // Determine if this is a picklist or free-form attribute
        // Check if this is a boolean attribute first (checkbox GUI element)
        const isBoolean = attrData.gui_element === 'checkbox';
        
        
        if (attrData.picklists && Object.keys(attrData.picklists).length > 0 && !isBoolean) {
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
            dataType: this.getCorrectAttributeType(attrName, attrData),
            required: attrData.required || false,
            appliesTo: appliesTo.length > 0 ? appliesTo : this.determineAppliesTo(attrName)
          });
          
          console.log(`[ImportInterface] Added free-form attribute: ${attrName}`);
        }
      }
    });
    
    // Final deduplication step to ensure no attribute appears in both arrays
    this.deduplicateAttributes();
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
    // Always start fresh to prevent duplicates from multiple processing calls
    const picklistAttrs = []; // Start completely empty
    const freeformAttrs = []; // Start completely empty
    
    console.log(`[ImportInterface] parseModelAttributes: Starting fresh with ${Object.keys(modelAttributes || {}).length} attributes to process`);
    
    // Parse through the captured attributes and add/update them
    Object.entries(modelAttributes || {}).forEach(([attrName, attrData]) => {
      // Skip node_type and cable_type as they're handled separately
      if (attrName === 'node_type' || attrName === 'cable_type') {
        return;
      }
      
      // Check if this attribute already exists in our fallback data
      const existingPicklistIndex = picklistAttrs.findIndex(attr => attr.name === attrName);
      const existingFreeformIndex = freeformAttrs.findIndex(attr => attr.name === attrName);
      
      // Check if this is a boolean attribute first (checkbox GUI element)
      const isBoolean = attrData.gui_element === 'checkbox';
      
      
      if (attrData.picklists && Object.keys(attrData.picklists).length > 0 && !isBoolean) {
        // This is a picklist attribute (but not if it's a boolean checkbox)
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
        
        // Remove from freeform if it exists there (avoid duplicates)
        if (existingFreeformIndex >= 0) {
          freeformAttrs.splice(existingFreeformIndex, 1);
          console.log(`[ImportInterface] Removed ${attrName} from freeform (now picklist)`);
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
        
        // Remove from picklist if it exists there (avoid duplicates)
        if (existingPicklistIndex >= 0) {
          picklistAttrs.splice(existingPicklistIndex, 1);
          console.log(`[ImportInterface] Removed ${attrName} from picklist (now freeform)`);
        }
      }
    });
    
    this.availableAttributes.withPicklists = picklistAttrs;
    this.availableAttributes.withoutPicklists = freeformAttrs;
    
    // Final deduplication step to ensure no attribute appears in both arrays
    this.deduplicateAttributes();
    
    console.log(`[ImportInterface] Final result: ${this.availableAttributes.withPicklists.length} picklist attributes and ${this.availableAttributes.withoutPicklists.length} freeform attributes`);
  }

  // Ensure no attribute appears in both withPicklists and withoutPicklists arrays
  deduplicateAttributes() {
    console.log('[ImportInterface] DEDUPLICATION: Starting deduplication...');
    
    // First, identify boolean attributes that should NEVER be in picklists
    const booleanAttributeNames = ['done', 'field_completed', 'flag_for_review', 'owner', 'pole_top_extension', 'proposed', 'tracing_complete', 'verify_location_in_field'];
    
    // Remove boolean attributes from picklists completely
    const originalPicklistCount = this.availableAttributes.withPicklists.length;
    this.availableAttributes.withPicklists = this.availableAttributes.withPicklists.filter(attr => {
      if (booleanAttributeNames.includes(attr.name)) {
        console.log(`[ImportInterface] DEDUPLICATION: Removed boolean '${attr.name}' from picklists`);
        return false;
      }
      return true;
    });
    
    // Now ensure boolean attributes exist in freeform with correct type
    booleanAttributeNames.forEach(attrName => {
      const existsInFreeform = this.availableAttributes.withoutPicklists.find(attr => attr.name === attrName);
      if (!existsInFreeform) {
        console.log(`[ImportInterface] DEDUPLICATION: Adding missing boolean '${attrName}' to freeform`);
        this.availableAttributes.withoutPicklists.push({
          name: attrName,
          displayName: this.formatDisplayName(attrName),
          dataType: 'boolean',
          required: false
        });
      } else if (existsInFreeform.dataType !== 'boolean') {
        console.log(`[ImportInterface] DEDUPLICATION: Correcting '${attrName}' dataType to boolean`);
        existsInFreeform.dataType = 'boolean';
      }
    });
    
    // Remove general duplicates (non-boolean attributes)
    const picklistNames = new Set(this.availableAttributes.withPicklists.map(attr => attr.name));
    const originalFreeformCount = this.availableAttributes.withoutPicklists.length;
    
    this.availableAttributes.withoutPicklists = this.availableAttributes.withoutPicklists.filter(attr => {
      // Keep boolean attributes always
      if (booleanAttributeNames.includes(attr.name)) {
        return true;
      }
      
      // Remove non-boolean duplicates
      const isDuplicate = picklistNames.has(attr.name);
      if (isDuplicate) {
        console.log(`[ImportInterface] DEDUPLICATION: Removed duplicate '${attr.name}' from freeform`);
      }
      return !isDuplicate;
    });
    
    console.log(`[ImportInterface] DEDUPLICATION: ${originalPicklistCount} → ${this.availableAttributes.withPicklists.length} picklists, ${originalFreeformCount} → ${this.availableAttributes.withoutPicklists.length} freeform`);
    
    // Final verification - log any remaining duplicates
    const finalPicklistNames = new Set(this.availableAttributes.withPicklists.map(attr => attr.name));
    const finalFreeformNames = new Set(this.availableAttributes.withoutPicklists.map(attr => attr.name));
    const intersections = [...finalPicklistNames].filter(name => finalFreeformNames.has(name));
    
    if (intersections.length > 0) {
      console.error(`[ImportInterface] DEDUPLICATION FAILED: Still have duplicates:`, intersections);
    } else {
      console.log(`[ImportInterface] DEDUPLICATION: Success - no duplicates remaining`);
    }
  }

  formatDisplayName(attrName) {
    // Convert snake_case to Title Case
    return attrName
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  // CORRECTED attribute type detection based on Firebase analysis
  getCorrectAttributeType(attributeName, attributeDefinition) {
    const guiElement = attributeDefinition?.gui_element;
    const hasPicklists = attributeDefinition?.picklists && 
                        Object.keys(attributeDefinition.picklists).length > 0;
    const hasNumericConstraints = attributeDefinition?.min !== undefined || 
                                 attributeDefinition?.max !== undefined || 
                                 attributeDefinition?.step !== undefined ||
                                 attributeDefinition?.format === 'feet-inches';
    
    // Check for numeric attributes that use textbox but should be numbers
    const measurementNames = [
      'anc_elevation', 'google_elevation', 'height', 'lasered_cable_height', 
      'lasered_ground_height', 'manual_height', 'measured_elevation', 
      'measured_groundline_circumference', 'measured_pole_height'
    ];
    
    // Special case: pole_height is dropdown with numeric picklist values
    if (attributeName === 'pole_height' && guiElement === 'dropdown') {
      return 'number'; // Heights like "25", "30", "35" feet
    }
    
    // Measurement attributes that should be numbers despite textbox GUI
    if (measurementNames.includes(attributeName) && guiElement === 'textbox') {
      return 'number';
    }
    
    // Definitive type mapping based on GUI elements from Firebase analysis
    switch (guiElement) {
        case 'checkbox':
            return 'boolean';
            
        case 'dropdown':
            return hasPicklists ? 'picklist' : 'text';
            
        case 'textbox':
            // Check for numeric constraints or format
            if (hasNumericConstraints) {
              return 'number';
            }
            return 'text';
            
        case 'textarea':
            return 'textarea';
            
        case 'date':
            return 'date';
            
        case 'calibrated-width':
        case 'calibrated-height':
            return 'number';
            
        case 'coordinate_capture':
            return 'coordinate';
            
        case 'timer':
            return 'timer';
            
        case 'pole_tag':
            return 'pole_tag';
            
        case 'group':
            return 'group';
            
        default:
            return 'text'; // Safe default
    }
  }

  // Helper method to get display-friendly data type names
  getDisplayDataType(dataType) {
    const typeMap = {
      'picklist': 'picklist',
      'boolean': 'boolean',
      'number': 'number', 
      'date': 'date',
      'textarea': 'text',
      'text': 'text',
      'coordinate': 'location', // Display coordinate_capture as "location"
      'timer': 'timer',
      'pole_tag': 'tag',
      'group': 'group'
    };
    
    return typeMap[dataType] || dataType || 'text';
  }

  // Helper method to get CSS classes for different data types
  getTypeStyleClass(dataType) {
    switch(dataType) {
      case 'boolean':
        return 'type-boolean';
      case 'number':
        return 'type-number';
      case 'date':
        return 'type-date';
      case 'coordinate':
        return 'type-location'; // Special styling for location
      case 'picklist':
        return 'type-picklist';
      case 'timer':
      case 'pole_tag':
      case 'group':
        return 'type-special type-disabled'; // Gray out special types except coordinate
      default:
        return 'type-text';
    }
  }

  // Helper method to check if a data type is special and should be disabled (except coordinate)
  isSpecialType(dataType) {
    return ['timer', 'pole_tag', 'group'].includes(dataType);
  }

  // Helper method to get Cloneable-compatible data types
  getCloneableDataType(dataType) {
    const cloneableTypeMap = {
      'boolean': 'boolean',
      'number': 'number',
      'date': 'date',
      'coordinate': 'location',
      'picklist': 'string', // Picklist values are strings
      'text': 'string',
      'textarea': 'string',
      'timer': 'number', // Time values can be numbers
      'pole_tag': 'string', // Tags are strings
      'group': 'object' // Groups might be objects
    };
    
    return cloneableTypeMap[dataType] || 'string';
  }

  // Helper methods for export summary
  getDataTypeBreakdown() {
    const breakdown = {};
    
    this.availableAttributes.withPicklists.forEach(attr => {
      breakdown['picklist'] = (breakdown['picklist'] || 0) + 1;
    });
    
    this.availableAttributes.withoutPicklists.forEach(attr => {
      const type = attr.dataType || 'text';
      breakdown[type] = (breakdown[type] || 0) + 1;
    });
    
    return breakdown;
  }

  getMeasurementAttributeCount() {
    const measurementNames = [
      'anc_elevation', 'google_elevation', 'height', 'lasered_cable_height', 
      'lasered_ground_height', 'manual_height', 'measured_elevation', 
      'measured_groundline_circumference', 'measured_pole_height', 'diameter', 'pole_height'
    ];
    
    return this.availableAttributes.withoutPicklists.filter(attr => 
      measurementNames.includes(attr.name)
    ).length;
  }

  getSpecialTypesCount() {
    return this.availableAttributes.withoutPicklists.filter(attr => 
      this.isSpecialType(attr.dataType)
    ).length;
  }

  getVisualizationRulesSummary() {
    const knownRules = this.getKnownVisualizationRules();
    const nodeTypeRule = knownRules['node_type'];
    
    return {
      totalRules: Object.keys(knownRules).length,
      nodeTypeIcons: nodeTypeRule ? Object.keys(nodeTypeRule.valueRules || {}).length : 0,
      iconMapping: {
        // Katapult to Cloneable icon mappings
        'katapult-map:circle': 'circle',
        'katapult-map:circle-small': 'circle-small', 
        'katapult-map:triangle-up': 'triangle-up',
        'katapult-map:triangle-down': 'triangle-down',
        'katapult-map:multiply': 'x-mark',
        'katapult-map:bullseye': 'target',
        'katapult-map:hexagon': 'hexagon',
        'katapult-map:asterisk': 'star',
        'icons:report': 'warning',
        'image:crop-landscape': 'square',
        'icons:settings-input-svideo': 'connector',
        'icons:add-circle': 'plus-circle',
        'icons:link': 'link'
      },
      colorPalette: [
        '#000', '#f00', '#0f0', '#ff0', '#2196f3', 
        '#2ff', '#6ff', '#26c6da', 'magenta', '#faf', '#f0f'
      ],
      ruleTypes: ['icon_and_color_mapping', 'boolean_color_change', 'boolean_indicator'],
      categories: ['osp', 'anchor', 'fiber_callouts', 'note', 'underground']
    };
  }

  inferDataType(attrName, attrData) {
    // Use CORRECTED type detection first
    const correctType = this.getCorrectAttributeType(attrName, attrData);
    if (correctType !== 'text' || attrData?.gui_element) {
      console.log(`[ImportInterface] Using corrected type for ${attrName}: ${correctType} (gui: ${attrData?.gui_element})`);
      return correctType;
    }
    
    // Fallback to name-based inference only if no gui_element is available
    const name = attrName.toLowerCase();
    
    // Special cases confirmed from Firebase analysis
    if (name === 'done') return 'boolean'; // Confirmed: checkbox element
    
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
              <button class="btn-secondary" id="download-reconstructed-btn" title="Download all captured WebSocket data" style="display: none;">
                📥 Download Captured Data
              </button>
              <button class="btn-secondary" id="dump-raw-websocket-btn" title="Download raw WebSocket messages for debugging" style="display: none;">
                🔍 Dump Raw Messages
              </button>
              <button class="btn-secondary" id="dump-complete-firebase-btn" title="Download complete Firebase JSON data" style="display: none;">
                🔥 Complete Firebase JSON
              </button>
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
              <label id="dev-environment-label">
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
    
    // Download reconstructed data button
    modal.querySelector('#download-reconstructed-btn').addEventListener('click', () => {
      self.downloadReconstructedData();
    });
    
    // Dump raw WebSocket messages button
    modal.querySelector('#dump-raw-websocket-btn').addEventListener('click', () => {
      self.dumpRawWebSocketData();
    });
    
    // Dump complete Firebase JSON button
    modal.querySelector('#dump-complete-firebase-btn').addEventListener('click', () => {
      self.dumpCompleteFirebaseJSON();
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
    
    // Secret keyboard shortcut to show localhost option
    // Press Ctrl+Shift+D (or Cmd+Shift+D on Mac) to toggle dev mode
    let devKeyPresses = [];
    modal.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        const devLabel = modal.querySelector('#dev-environment-label');
        if (devLabel) {
          const isHidden = devLabel.style.display === 'none';
          devLabel.style.display = isHidden ? 'inline-block' : 'none';
          
          // Show a subtle notification
          if (isHidden) {
            const notification = document.createElement('div');
            notification.style.cssText = `
              position: fixed;
              bottom: 20px;
              right: 20px;
              background: #333;
              color: white;
              padding: 10px 15px;
              border-radius: 5px;
              font-size: 12px;
              z-index: 10000;
              animation: fadeIn 0.3s ease-out;
            `;
            notification.textContent = '🔧 Developer mode enabled';
            modal.appendChild(notification);
            setTimeout(() => notification.remove(), 2000);
          }
        }
      }
    });
    
    // Alternative: Triple-click on the title to show dev options
    const modalTitle = modal.querySelector('h2');
    let clickCount = 0;
    let clickTimer = null;
    
    modalTitle.style.cursor = 'default';
    modalTitle.addEventListener('click', () => {
      clickCount++;
      
      if (clickTimer) clearTimeout(clickTimer);
      
      if (clickCount >= 3) {
        const devLabel = modal.querySelector('#dev-environment-label');
        if (devLabel && devLabel.style.display === 'none') {
          devLabel.style.display = 'inline-block';
          
          // Visual feedback
          modalTitle.style.color = '#4CAF50';
          setTimeout(() => modalTitle.style.color = '', 500);
        }
        clickCount = 0;
      }
      
      clickTimer = setTimeout(() => {
        clickCount = 0;
      }, 500);
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
      types.forEach(typeObj => {
        // Extract raw value and display name
        const rawValue = typeObj.originalName?.value || typeObj.displayName || typeObj.key;
        const displayName = typeObj.cleanName || typeObj.displayName || rawValue;
        html += `
          <label class="node-type-item">
            <input type="checkbox" 
              value="${category}:${rawValue}" 
              data-category="${category}" 
              data-type="${rawValue}"
              data-display-name="${displayName}"
              data-item-type="node" 
              class="selection-checkbox">
            <span>${displayName}</span>
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
      types.forEach(typeObj => {
        // Extract raw value and display name
        const rawValue = typeObj.originalName?.value || typeObj.displayName || typeObj.key;
        const displayName = typeObj.cleanName || typeObj.displayName || rawValue;
        html += `
          <label class="connection-type-item">
            <input type="checkbox" 
              value="${category}:${rawValue}" 
              data-category="${category}" 
              data-type="${rawValue}"
              data-display-name="${displayName}"
              data-item-type="connection" 
              class="selection-checkbox">
            <span>${displayName}</span>
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
    const [category, rawType] = checkbox.value.split(':');
    const displayName = checkbox.dataset.displayName || rawType;
    const itemType = checkbox.dataset.itemType; // 'node', 'connection', or 'section'
    
    if (itemType === 'node') {
      if (checkbox.checked) {
        // Check if already exists before adding
        const exists = this.selectedNodes.some(n => 
          n.category === category && (n.rawType === rawType || n.type === rawType)
        );
        if (!exists) {
          this.selectedNodes.push({ 
            category, 
            rawType,  // Store raw value
            type: rawType,  // Keep for backward compatibility
            displayName,  // Store display name separately
            id: Date.now() 
          });
        }
      } else {
        this.selectedNodes = this.selectedNodes.filter(n => 
          !(n.category === category && (n.rawType === rawType || n.type === rawType))
        );
      }
    } else if (itemType === 'connection') {
      if (checkbox.checked) {
        // Check if already exists before adding
        const exists = this.selectedConnections.some(c => 
          c.category === category && (c.rawType === rawType || c.type === rawType)
        );
        if (!exists) {
          this.selectedConnections.push({ 
            category, 
            rawType,  // Store raw value
            type: rawType,  // Keep for backward compatibility
            displayName,  // Store display name separately
            id: Date.now() 
          });
        }
      } else {
        this.selectedConnections = this.selectedConnections.filter(c => 
          !(c.category === category && (c.rawType === rawType || c.type === rawType))
        );
      }
    } else if (itemType === 'section') {
      if (checkbox.checked) {
        // Check if already exists before adding
        const exists = this.selectedSections.some(s => 
          s.category === category && (s.rawType === rawType || s.type === rawType)
        );
        if (!exists) {
          this.selectedSections.push({ 
            category, 
            rawType,  // Store raw value
            type: rawType,  // Keep for backward compatibility
            displayName,  // Store display name separately
            id: Date.now() 
          });
        }
      } else {
        this.selectedSections = this.selectedSections.filter(s => 
          !(s.category === category && (s.rawType === rawType || s.type === rawType))
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
        <label class="attribute-option ${isChecked ? 'selected' : ''} ${this.isSpecialType(attr.dataType) ? 'type-disabled' : ''}">
          <input type="checkbox" 
                 value="${attr.name}" 
                 data-entity="${entityId}"
                 data-entity-type="${entityType}"
                 data-type="${hasPicklist ? 'picklist' : 'freeform'}"
                 ${isChecked ? 'checked' : ''}>
          <div class="attribute-card">
            <div class="attribute-header">
              <span class="attribute-name">${attr.displayName}</span>
              <span class="attribute-type-badge ${this.getTypeStyleClass(attr.dataType)}">${this.getDisplayDataType(attr.dataType)}</span>
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
        <label class="attribute-option ${isChecked ? 'selected' : ''} ${this.isSpecialType(attr.dataType) ? 'type-disabled' : ''}">
          <input type="checkbox" 
                 value="${attr.name}" 
                 data-entity="${entityId}"
                 data-entity-type="${entityType}"
                 data-type="${type}"
                 ${isChecked ? 'checked' : ''}>
          <div class="attribute-card">
            <div class="attribute-header">
              <span class="attribute-name">${attr.displayName}</span>
              <span class="attribute-type-badge ${this.getTypeStyleClass(attr.dataType)}">${this.getDisplayDataType(attr.dataType)}</span>
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
          // Add connection attribute toggle
          self.toggleNodeAttribute(entityId, attrName, attrType, e.target.checked);
        } else if (entityType === 'section') {
          // Add section attribute toggle
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

  // Get visualization rules - these should be loaded from Katapult's system
  getKnownVisualizationRules() {
    // Check if we have captured visualization rules from WebSocket
    if (window.katapultVisualizationRules) {
      return window.katapultVisualizationRules;
    }
    
    // Check if rules are defined in the available attributes
    const rules = {};
    
    // Look through all attributes to see if they have visualization metadata
    if (this.availableAttributes && this.availableAttributes.withPicklists) {
      this.availableAttributes.withPicklists.forEach(attr => {
        if (attr.visualizationRule) {
          rules[attr.name] = attr.visualizationRule;
        }
      });
    }
    
    if (this.availableAttributes && this.availableAttributes.withoutPicklists) {
      this.availableAttributes.withoutPicklists.forEach(attr => {
        if (attr.visualizationRule) {
          rules[attr.name] = attr.visualizationRule;
        }
      });
    }
    
    // Known visualization rules extracted from Katapult Firebase data
    const katapultVisualizationRules = this.getExtractedVisualizationRules();
    Object.assign(rules, katapultVisualizationRules);
    
    return rules;
  }

  // Extracted visualization rules from Katapult Firebase analysis
  getExtractedVisualizationRules() {
    return {
      // Node type visualization rules based on Firebase analysis
      'node_type': {
        attributeName: 'node_type',
        ruleType: 'icon_and_color_mapping',
        valueRules: {
          // OSP Category
          'pole': { icon: 'circle', color: '#000', cloneableIcon: 'circle', category: 'osp' },
          'building attachment': { icon: 'circle-small', color: 'magenta', cloneableIcon: 'circle-small', category: 'osp' },
          'doublewood pole': { icon: 'circle-small', color: 'magenta', cloneableIcon: 'circle-small', category: 'osp' },
          'bridge attachment': { icon: 'circle-small', color: 'magenta', cloneableIcon: 'circle-small', category: 'osp' },
          'midspan takeoff': { icon: 'circle-small', color: 'magenta', cloneableIcon: 'circle-small', category: 'osp' },
          'pushbrace': { icon: 'circle-small', color: 'magenta', cloneableIcon: 'circle-small', category: 'osp' },
          'reference': { icon: 'star', color: '#f0f', cloneableIcon: 'star', category: 'osp' },
          'crossover': { icon: 'x-mark', color: '#f00', cloneableIcon: 'x-mark', category: 'osp' },
          'obstacle': { icon: 'warning', color: '#f00', cloneableIcon: 'warning', category: 'osp' },
          
          // Anchor Category
          'existing anchor': { icon: 'triangle-down', color: '#faf', cloneableIcon: 'triangle-down', category: 'anchor' },
          'new anchor': { icon: 'triangle-down', color: '#faf', cloneableIcon: 'triangle-down', category: 'anchor' },
          'house': { icon: 'triangle-down', color: '#faf', cloneableIcon: 'triangle-down', category: 'anchor' },
          
          // Fiber Callouts Category
          'slack loop': { icon: 'add-circle', color: '#0f0', cloneableIcon: 'plus-circle', category: 'fiber_callouts' },
          'splice': { icon: 'link', color: '#0f0', cloneableIcon: 'link', category: 'fiber_callouts' },
          
          // Note Category
          'map note': { icon: 'target', color: '#26c6da', cloneableIcon: 'target', category: 'note' },
          
          // Underground Category
          'break point': { icon: 'x-mark', color: '#000', cloneableIcon: 'x-mark', category: 'underground' },
          'handhole': { icon: 'rectangle', color: '#2ff', cloneableIcon: 'square', category: 'underground' },
          'manhole': { icon: 'connector', color: '#6ff', cloneableIcon: 'connector', category: 'underground' }
        },
        description: 'Maps node type values to specific icons and colors',
        source: 'katapult_firebase_analysis'
      },
      
      // Boolean attribute rules
      'done': {
        attributeName: 'done',
        ruleType: 'boolean_color_change',
        condition: 'when_true',
        effect: 'changes_node_color',
        trueState: { 
          colorModifier: 'completed', 
          indicator: 'checkmark',
          suggestedColor: '#22c55e', // Green for completed
          suggestedIcon: 'check-circle'
        },
        falseState: { 
          colorModifier: 'pending', 
          indicator: 'none',
          suggestedColor: '#6b7280', // Gray for pending
          suggestedIcon: null
        },
        description: 'Changes node appearance when task is completed',
        source: 'user_reported_firebase_confirmed'
      },
      
      // Other boolean visualization attributes
      'field_completed': {
        attributeName: 'field_completed', 
        ruleType: 'boolean_indicator',
        trueState: { indicator: 'field-check', color: '#0f0' },
        falseState: { indicator: 'none' },
        description: 'Shows field completion status',
        source: 'katapult_firebase_analysis'
      },
      
      'flag_for_review': {
        attributeName: 'flag_for_review',
        ruleType: 'boolean_indicator', 
        trueState: { indicator: 'flag', color: '#ff0' },
        falseState: { indicator: 'none' },
        description: 'Shows review flag status',
        source: 'katapult_firebase_analysis'
      }
    };
  }
  
  // Get visualization rules for an entity based on selected attributes
  getVisualizationRules(entity, selectedAttributes, entityType = 'node') {
    const nodeAttrs = selectedAttributes || [];
    const knownRules = this.getKnownVisualizationRules();
    const applicableRules = [];
    
    // Extract attribute names
    const attributeNames = nodeAttrs.map(attr => 
      typeof attr === 'string' ? attr : attr.name
    );
    
    // Find which known rules apply based on selected attributes
    attributeNames.forEach(attrName => {
      if (knownRules[attrName]) {
        applicableRules.push(knownRules[attrName]);
      }
    });
    
    // Return metadata with applicable rules
    return {
      entityType: entityType,
      baseType: entity.type,
      category: entity.category,
      selectedAttributes: attributeNames,
      visualizationRules: applicableRules,
      metadata: {
        hasVisualizationRules: applicableRules.length > 0,
        ruleCount: applicableRules.length
      }
    };
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
          picklistOptions: picklistValues, // Include all available picklist values
          cloneableDataType: 'string', // Picklist values are strings in Cloneable
          isSpecialType: false
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
          displayName: freeformAttr.displayName,
          cloneableDataType: this.getCloneableDataType(freeformAttr.dataType), // Enhanced for Cloneable
          isSpecialType: this.isSpecialType(freeformAttr.dataType)
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
        
        // Get visualization rules for this node
        const visualizationRules = this.getVisualizationRules(node, nodeAttrs, 'node');
        
        return {
          id: node.id,
          type: node.rawType || node.type,  // Use raw value for export
          displayName: node.displayName,  // Include display name separately
          category: node.category,
          attributes: enrichedAttributes,
          images: this.imageAttachments[node.id] || [],
          visualizationRules: visualizationRules
        };
      }),
      connections: this.selectedConnections.map(conn => {
        // Get selected attributes for this connection with their metadata
        const connAttrs = this.connectionAttributes[conn.id] || [];
        const enrichedAttributes = connAttrs.map(attr => {
          const attrName = typeof attr === 'string' ? attr : attr.name;
          return getAttributeMetadata(attrName);
        });
        
        // Get visualization rules for this connection
        const visualizationRules = this.getVisualizationRules(conn, connAttrs, 'connection');
        
        return {
          id: conn.id,
          type: conn.rawType || conn.type,  // Use raw value for export
          displayName: conn.displayName,  // Include display name separately
          category: conn.category,
          attributes: enrichedAttributes,
          images: this.imageAttachments[conn.id] || [],
          visualizationRules: visualizationRules
        };
      }),
      sections: this.selectedSections.map(section => {
        // Get selected attributes for this section with their metadata
        const sectionAttrs = this.sectionAttributes[section.id] || [];
        const enrichedAttributes = sectionAttrs.map(attr => {
          const attrName = typeof attr === 'string' ? attr : attr.name;
          return getAttributeMetadata(attrName);
        });
        
        // Get visualization rules for this section
        const visualizationRules = this.getVisualizationRules(section, sectionAttrs, 'section');
        
        return {
          id: section.id,
          type: section.rawType || section.type,  // Use raw value for export
          displayName: section.displayName,  // Include display name separately
          category: section.category,
          attributes: enrichedAttributes,
          images: this.imageAttachments[section.id] || [],
          visualizationRules: visualizationRules
        };
      }),
      summary: {
        dataTypeBreakdown: this.getDataTypeBreakdown(),
        totalAttributes: this.availableAttributes.withPicklists.length + this.availableAttributes.withoutPicklists.length,
        measurementAttributes: this.getMeasurementAttributeCount(),
        specialTypesCount: this.getSpecialTypesCount(),
        visualizationRules: this.getVisualizationRulesSummary()
      }
    };
  }

  downloadReconstructedData() {
    console.log('[ImportInterface] Downloading reconstructed data...');
    
    // Gather all captured data from the window object
    const capturedData = {
      metadata: {
        timestamp: new Date().toISOString(),
        source: 'katapult-pro-websocket',
        version: '1.0'
      },
      rawMessages: window.katapultWebSocketMessages || [],
      reconstructedAttributes: window.katapultReconstructedAttributes || {},
      processedNodeTypes: window.katapultProcessedNodeTypes || {},
      availableAttributes: this.availableAttributes || {},
      photoClassifications: this.photoClassifications || [],
      statistics: {
        totalMessages: (window.katapultWebSocketMessages || []).length,
        attributeCount: Object.keys(window.katapultReconstructedAttributes || {}).length,
        nodeTypeCategories: Object.keys(window.katapultProcessedNodeTypes || {}).length
      }
    };
    
    // Create a pretty-printed JSON string
    const jsonString = JSON.stringify(capturedData, null, 2);
    
    // Create a blob and download link
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    
    // Create download link and trigger it
    const a = document.createElement('a');
    a.href = url;
    a.download = `katapult-reconstructed-data-${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log(`[ImportInterface] Downloaded ${jsonString.length} bytes of data`);
    
    // Show a notification or feedback
    const btn = document.getElementById('download-reconstructed-btn');
    if (btn) {
      const originalText = btn.innerText;
      btn.innerText = '✅ Downloaded!';
      btn.disabled = true;
      setTimeout(() => {
        btn.innerText = originalText;
        btn.disabled = false;
      }, 2000);
    }
  }

  dumpRawWebSocketData() {
    console.log('[ImportInterface] Dumping raw WebSocket data...');
    
    try {
      // Collect all available raw WebSocket data
      const dumpData = {
        metadata: {
          timestamp: new Date().toISOString(),
          url: window.location.href,
          userAgent: navigator.userAgent,
          extensionVersion: '1.0.1'
        },
        rawWebSocketMessages: window.katapultWebSocketMessages || [],
        rawWebSocketAnalysis: {
          totalMessages: (window.katapultWebSocketMessages || []).length,
          messageTypes: (window.katapultWebSocketMessages || []).reduce((acc, msg) => {
            const type = typeof msg.raw;
            acc[type] = (acc[type] || 0) + 1;
            return acc;
          }, {}),
          messageSizes: (window.katapultWebSocketMessages || []).map(msg => ({
            index: msg.messageIndex,
            size: msg.raw ? msg.raw.toString().length : 0,
            type: typeof msg.raw,
            firstChars: msg.raw ? msg.raw.toString().substring(0, 100) : 'null'
          })),
          firstMessage: (window.katapultWebSocketMessages || [])[0],
          lastMessage: (window.katapultWebSocketMessages || [])[(window.katapultWebSocketMessages || []).length - 1]
        },
        reconstructedData: window.katapultReconstructedAttributes || {},
        processedNodeTypes: window.katapultProcessedNodeTypes || {},
        importInterfaceState: {
          availableAttributes: this.availableAttributes || {},
          selectedNodeTypes: this.selectedNodeTypes || [],
          photoClassifications: this.photoClassifications || []
        },
        debugInfo: {
          totalRawMessages: (window.katapultWebSocketMessages || []).length,
          reconstructedKeys: Object.keys(window.katapultReconstructedAttributes || {}),
          processedCategories: Object.keys(window.katapultProcessedNodeTypes || {}),
          hasImportInterface: !!this.availableAttributes
        }
      };
      
      // Create and download the raw dump file
      const jsonString = JSON.stringify(dumpData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `katapult-raw-websocket-dump-${timestamp}.json`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      console.log(`[ImportInterface] Raw WebSocket dump saved (${jsonString.length} bytes)`);
      console.log(`[ImportInterface] Raw message count: ${dumpData.debugInfo.totalRawMessages}`);
      
      // Show feedback
      const btn = document.getElementById('dump-raw-websocket-btn');
      if (btn) {
        const originalText = btn.innerText;
        btn.innerText = '✅ Dumped!';
        btn.disabled = true;
        setTimeout(() => {
          btn.innerText = originalText;
          btn.disabled = false;
        }, 2000);
      }
      
    } catch (error) {
      console.error('[ImportInterface] Failed to dump raw WebSocket data:', error);
      alert('Failed to dump raw data: ' + error.message);
    }
  }

  dumpCompleteFirebaseJSON() {
    console.log('[ImportInterface] Dumping complete Firebase JSON data...');
    
    // Since the content script can't directly access the injected script's variables,
    // we need to request the data via postMessage
    console.log('[Firebase Dump] Requesting WebSocket data from inject script...');
    
    // Set up a temporary listener for the response
    const handleWebSocketResponse = (event) => {
      if (event.data && event.data.type === 'cloneable-websocket-data-response') {
        window.removeEventListener('message', handleWebSocketResponse);
        this.processFirebaseWebSocketData(event.data.messages);
      }
    };
    
    window.addEventListener('message', handleWebSocketResponse);
    
    // Request the data
    window.postMessage({ type: 'cloneable-get-websocket-data-dump' }, '*');
    
    // Fallback: try direct access as well
    setTimeout(() => {
      // Remove listener if no response after 2 seconds
      window.removeEventListener('message', handleWebSocketResponse);
      this.processFirebaseWebSocketDataFallback();
    }, 2000);
  }

  processFirebaseWebSocketData(messages) {
    console.log(`[Firebase Dump] Received ${messages ? messages.length : 0} WebSocket messages from inject script`);
    
    if (!messages || messages.length === 0) {
      console.log('[Firebase Dump] No messages to process');
      return;
    }
    
    try {
      const completeFirebaseData = {};
      const parsedMessages = [];
      
      // Enhanced fragment reconstruction system
      const fragments = [];
      let currentFragment = '';
      
      // First pass: identify and reconstruct all fragments
      messages.forEach((messageObj, index) => {
        try {
          let rawData = messageObj.raw;
          if (typeof rawData !== 'string') {
            rawData = rawData.toString();
          }
          
          // Try to parse as complete JSON first
          try {
            const parsed = JSON.parse(rawData);
            parsedMessages.push({
              index: index,
              timestamp: messageObj.timestamp,
              parsed: parsed,
              isComplete: true
            });
            
            // Extract Firebase path data from complete messages
            this.extractFirebasePathData(parsed, index, completeFirebaseData);
            
          } catch (parseError) {
            // This is likely a fragment - try to reconstruct
            console.log(`[Firebase Dump] Fragment detected at message ${index}, attempting reconstruction...`);
            
            // Check if this starts a new fragment sequence
            if (rawData.trim().startsWith('{') || rawData.trim().startsWith('[')) {
              // Start of new fragment
              if (currentFragment) {
                // Try to parse the previous fragment
                this.tryParseFragment(currentFragment, fragments, completeFirebaseData, parsedMessages);
              }
              currentFragment = rawData;
            } else {
              // Continuation of existing fragment
              currentFragment += rawData;
            }
            
            // Check if fragment is now complete
            if (this.isCompleteJSON(currentFragment)) {
              this.tryParseFragment(currentFragment, fragments, completeFirebaseData, parsedMessages);
              currentFragment = '';
            }
          }
        } catch (e) {
          console.log(`[Firebase Dump] Error processing message ${index}:`, e.message);
        }
      });
      
      // Handle any remaining fragment
      if (currentFragment) {
        this.tryParseFragment(currentFragment, fragments, completeFirebaseData, parsedMessages);
      }
      
      // Debug logging
      console.log(`[Firebase Dump] Processed ${messages.length} total messages`);
      console.log(`[Firebase Dump] Successfully parsed ${parsedMessages.length} messages`);
      console.log(`[Firebase Dump] Found ${Object.keys(completeFirebaseData).length} Firebase paths`);
      console.log(`[Firebase Dump] Firebase paths:`, Object.keys(completeFirebaseData));
      
      const dumpData = {
        metadata: {
          timestamp: new Date().toISOString(),
          url: window.location.href,
          totalMessages: messages.length,
          parsedMessages: parsedMessages.length,
          firebasePaths: Object.keys(completeFirebaseData).length
        },
        completeFirebaseData: completeFirebaseData,
        allParsedMessages: parsedMessages,
        firebasePathSummary: Object.keys(completeFirebaseData).map(path => ({
          path: path,
          dataType: typeof completeFirebaseData[path],
          keyCount: typeof completeFirebaseData[path] === 'object' ? Object.keys(completeFirebaseData[path] || {}).length : 'N/A'
        }))
      };
      
      // Create and download the complete Firebase dump
      const jsonString = JSON.stringify(dumpData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `katapult-complete-firebase-${timestamp}.json`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      this.downloadFirebaseJSON(completeFirebaseData, messages.length, parsedMessages, fragments);
      
    } catch (error) {
      console.error('[ImportInterface] Failed to dump complete Firebase data:', error);
      alert('Failed to dump Firebase data: ' + error.message);
    }
  }

  processFirebaseWebSocketDataFallback() {
    console.log('[Firebase Dump] Using fallback method - trying direct window access...');
    
    try {
      // Try to access directly (might work in some contexts)
      const messages = window.katapultWebSocketMessages || [];
      console.log(`[Firebase Dump] Fallback found ${messages.length} raw WebSocket messages`);
      
      if (messages.length === 0) {
        console.log('[Firebase Dump] No WebSocket messages found in fallback either');
        // Create minimal dump with available data
        const fallbackData = {
          metadata: {
            timestamp: new Date().toISOString(),
            url: window.location.href,
            totalMessages: 0,
            source: 'fallback_no_websocket_data'
          },
          completeFirebaseData: {},
          availableData: {
            reconstructedAttributes: window.katapultReconstructedAttributes || {},
            attributeCount: Object.keys(window.katapultReconstructedAttributes || {}).length
          }
        };
        
        this.downloadFirebaseJSONSimple(fallbackData, 'fallback');
        return;
      }
      
      // Process the messages using the same logic
      this.processFirebaseWebSocketData(messages);
      
    } catch (error) {
      console.error('[Firebase Dump] Fallback also failed:', error);
      alert('Failed to dump Firebase data via fallback: ' + error.message);
    }
  }

  downloadFirebaseJSON(completeFirebaseData, totalMessages, parsedMessages, fragments = []) {
    // Debug logging
    console.log(`[Firebase Dump] Processed ${totalMessages} total messages`);
    console.log(`[Firebase Dump] Successfully parsed ${parsedMessages.length || parsedMessages} messages`);
    console.log(`[Firebase Dump] Found ${Object.keys(completeFirebaseData).length} Firebase paths`);
    console.log(`[Firebase Dump] Firebase paths:`, Object.keys(completeFirebaseData));
    
    // Count reconstructed vs complete messages
    const reconstructedCount = Array.isArray(parsedMessages) ? 
      parsedMessages.filter(msg => msg.isReconstructed).length : 0;
    const completeCount = Array.isArray(parsedMessages) ? 
      parsedMessages.filter(msg => msg.isComplete).length : 0;
      
    const dumpData = {
      metadata: {
        timestamp: new Date().toISOString(),
        url: window.location.href,
        totalMessages: totalMessages,
        parsedMessages: Array.isArray(parsedMessages) ? parsedMessages.length : parsedMessages,
        completeMessages: completeCount,
        reconstructedFragments: reconstructedCount,
        firebasePaths: Object.keys(completeFirebaseData).length,
        reconstructionEngine: 'enhanced_fragment_system'
      },
      completeFirebaseData: completeFirebaseData,
      allParsedMessages: Array.isArray(parsedMessages) ? parsedMessages : [],
      fragmentAnalysis: fragments,
      firebasePathSummary: Object.keys(completeFirebaseData).map(path => ({
        path: path,
        dataType: typeof completeFirebaseData[path],
        keyCount: typeof completeFirebaseData[path] === 'object' ? Object.keys(completeFirebaseData[path] || {}).length : 'N/A',
        hasData: completeFirebaseData[path] !== null && completeFirebaseData[path] !== undefined
      }))
    };
    
    this.downloadFirebaseJSONSimple(dumpData, 'complete');
  }

  // Helper method to extract Firebase path data from parsed messages
  extractFirebasePathData(parsed, index, completeFirebaseData) {
    let path = null;
    let data = null;
    
    // Check if it's a Firebase message with path data
    if (parsed.d?.b?.p) {
      path = parsed.d.b.p;
      data = parsed.d.b.d; // data might be null initially
    } else if (parsed.d?.b?.path) {
      path = parsed.d.b.path;
      data = parsed.d.b.data;
    } else if (parsed.d?.a === 'q' && parsed.d?.b?.p) {
      // Query message
      path = parsed.d.b.p;
      data = null; // Query messages don't have data initially
    } else if (parsed.d?.b && !parsed.d.b.p && !parsed.d.b.path) {
      // Data-only messages (responses to queries)
      if (parsed.d.b.d || parsed.d.b.data) {
        path = 'data_response_' + index;
        data = parsed.d.b.d || parsed.d.b.data;
      }
    }
    
    // Also check for direct path in message (some Firebase responses)
    if (!path && parsed.d?.p) {
      path = parsed.d.p;
      data = parsed.d.d;
    }
    
    if (path) {
      // Store ALL Firebase paths, including null data (queries)
      if (!completeFirebaseData[path]) {
        completeFirebaseData[path] = data;
      } else if (data !== null) {
        // Merge if path already exists and we have new data
        if (typeof data === 'object' && typeof completeFirebaseData[path] === 'object') {
          completeFirebaseData[path] = { ...completeFirebaseData[path], ...data };
        } else {
          completeFirebaseData[path] = data;
        }
      }
      console.log(`[Firebase Dump] Extracted path: ${path} (${typeof data})`);
    }
  }

  // Helper method to check if a string is complete JSON
  isCompleteJSON(str) {
    if (!str || str.trim().length === 0) return false;
    
    try {
      JSON.parse(str);
      return true;
    } catch (e) {
      return false;
    }
  }

  // Helper method to try parsing a fragment
  tryParseFragment(fragmentStr, fragments, completeFirebaseData, parsedMessages) {
    try {
      const parsed = JSON.parse(fragmentStr);
      console.log(`[Firebase Dump] ✅ Successfully reconstructed fragment into complete JSON`);
      
      parsedMessages.push({
        index: `fragment_${fragments.length}`,
        timestamp: new Date().toISOString(),
        parsed: parsed,
        isReconstructed: true,
        originalFragment: fragmentStr.substring(0, 100) + '...'
      });
      
      // Extract Firebase path data from reconstructed fragment
      this.extractFirebasePathData(parsed, `fragment_${fragments.length}`, completeFirebaseData);
      
      fragments.push({
        reconstructed: true,
        content: parsed
      });
      
    } catch (e) {
      console.log(`[Firebase Dump] ❌ Fragment reconstruction failed:`, e.message);
      fragments.push({
        reconstructed: false,
        error: e.message,
        content: fragmentStr.substring(0, 200) + '...'
      });
    }
  }

  downloadFirebaseJSONSimple(dumpData, suffix) {
    // Create and download the complete Firebase dump
    const jsonString = JSON.stringify(dumpData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `katapult-firebase-${suffix}-${timestamp}.json`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log(`[ImportInterface] Firebase JSON saved (${jsonString.length} bytes)`);
    console.log(`[ImportInterface] Firebase paths found: ${Object.keys(dumpData.completeFirebaseData || dumpData.availableData || {}).length}`);
    
    // Show feedback
    const btn = document.getElementById('dump-complete-firebase-btn');
    if (btn) {
      const originalText = btn.innerText;
      btn.innerText = '✅ Firebase Dumped!';
      btn.disabled = true;
      setTimeout(() => {
        btn.innerText = originalText;
        btn.disabled = false;
      }, 2000);
    }
  }

  exportData() {
    const data = this.buildExportData();
    
    // Create and download JSON file
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `katapult-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    // Get selected environment and open import tab
    const environment = document.querySelector('input[name="environment"]:checked').value;
    const targetUrl = environment === 'production' 
      ? 'https://app.cloneable.ai/tools/pole-inspect/import'
      : 'http://localhost:3000/tools/pole-inspect/import';
    
    // Open the import page in a new tab
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
    console.log('[ImportInterface] Received cloneable-model-attributes message:', event.data);
    
    // Check for directly provided node types from reconstruction
    if (event.data.nodeTypes && event.data.nodeTypes.length > 0) {
      console.log('[ImportInterface] Got reconstructed node types!', event.data.nodeTypes.length, 'types');
      
      // Store in both old and new locations for compatibility
      window.cloneableNodeTypes = event.data.nodeTypes;
      window.katapultProcessedNodeTypes = event.data.nodeTypes;
      
      console.log('[ImportInterface] Stored node types in both window.cloneableNodeTypes and window.katapultProcessedNodeTypes');
      
      // Trigger interface update if it exists
      if (importInterface) {
        console.log('[ImportInterface] Triggering interface update with new data');
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
      console.log('[ImportInterface] PROCESSING PATH 4: Loading pre-processed attributes from inject script...');
      console.log('[ImportInterface] Pre-processed data:', {
        withPicklists: event.data.processedAttributes.withPicklists?.length || 0,
        withoutPicklists: event.data.processedAttributes.withoutPicklists?.length || 0,
        doneInPicklists: event.data.processedAttributes.withPicklists?.some(a => a.name === 'done'),
        doneInFreeform: event.data.processedAttributes.withoutPicklists?.some(a => a.name === 'done')
      });
      
      window.importInterface.availableAttributes.withPicklists = event.data.processedAttributes.withPicklists || [];
      window.importInterface.availableAttributes.withoutPicklists = event.data.processedAttributes.withoutPicklists || [];
      
      // Ensure no duplicates from processed data
      window.importInterface.deduplicateAttributes();
      
      console.log('[ImportInterface] ✅ Attributes loaded from processed data');
    } else if (window.importInterface && Object.keys(event.data.attributes || {}).length > 0) {
      console.log('[ImportInterface] PROCESSING PATH 3: Processing raw attributes from postMessage data...');
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
  console.log('=== NODE TYPES INFO ===');
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

// Listen for messages from popup/background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'DUMP_WEBSOCKET_DATA') {
    console.log('[Cloneable Extension] Dumping raw WebSocket data...');
    
    try {
      // Collect all available WebSocket data
      const dumpData = {
        timestamp: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent,
        data: {
          // Raw captured messages
          webSocketMessages: window.katapultWebSocketMessages || [],
          
          // Reconstructed data
          reconstructedAttributes: window.katapultReconstructedAttributes || {},
          
          // Processed data
          processedNodeTypes: window.katapultProcessedNodeTypes || {},
          
          // Import interface data
          importInterfaceData: importInterface ? {
            availableAttributes: importInterface.availableAttributes,
            selectedNodeTypes: importInterface.selectedNodeTypes
          } : null,
          
          // Additional debug info
          debugInfo: {
            messageCount: window.katapultWebSocketMessages ? window.katapultWebSocketMessages.length : 0,
            reconstructedKeys: window.katapultReconstructedAttributes ? Object.keys(window.katapultReconstructedAttributes) : [],
            hasImportInterface: !!importInterface
          }
        }
      };
      
      // Create and download the dump file
      const jsonString = JSON.stringify(dumpData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `katapult-websocket-dump-${timestamp}.json`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      console.log(`[Cloneable Extension] WebSocket dump saved (${jsonString.length} bytes)`);
      console.log(`[Cloneable Extension] Message count: ${dumpData.data.debugInfo.messageCount}`);
      
      sendResponse({ success: true, messageCount: dumpData.data.debugInfo.messageCount });
      
    } catch (error) {
      console.error('[Cloneable Extension] Failed to dump WebSocket data:', error);
      sendResponse({ success: false, error: error.message });
    }
    
    return true; // Keep message channel open for async response
  }
});

console.log('[Cloneable Extension] Debug function available: window.debugNodeTypes()');
console.log('[Cloneable Extension] Content script loaded and ready');