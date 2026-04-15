// Cloneable Extension - WebSocket Interceptor
// This script intercepts WebSocket messages and reconstructs complete JSON from all messages
// FIXED: Now properly handles company-specific paths like photoheight/company_space/*/models/attributes

// Global storage for WebSocket messages  
window.katapultWebSocketMessages = [];
window.katapultReconstructedAttributes = {};
window.katapultModelAttributesData = {};
window.katapultProcessedNodeTypes = [];
window.katapultProcessedConnectionTypes = [];

// Timer for delayed reconstruction
let reconstructionTimer = null;

const originalWebSocket = window.WebSocket;
window.WebSocket = function(url, protocols) {
  
  const ws = new originalWebSocket(url, protocols);
  
  // Intercept messages
  const originalOnMessage = ws.onmessage;
  ws.addEventListener('message', function(event) {
    const messageIndex = window.katapultWebSocketMessages.length;
    const dataStr = event.data.toString();
    
    // Store every single message for dumper-style processing
    const messageObj = {
      timestamp: new Date().toISOString(),
      type: 'received',
      raw: event.data,
      messageIndex
    };
    
    window.katapultWebSocketMessages.push(messageObj);
    
    // Send status update to content script
    window.postMessage({
      type: 'cloneable-websocket-update',
      messageCount: window.katapultWebSocketMessages.length,
      socketCount: 1
    }, '*');
    
    // Schedule reconstruction after a delay to batch messages
    if (reconstructionTimer) {
      clearTimeout(reconstructionTimer);
    }
    reconstructionTimer = setTimeout(() => {
      if (window.katapultWebSocketMessages.length > 0) {
        reconstructFullModel();
      }
    }, 3000); // Wait 3 seconds after last message
    
    // Try to parse as complete JSON for immediate processing
    try {
      const parsed = JSON.parse(event.data);
      messageObj.data = parsed;
      
      // Immediate processing for complete messages
      if (parsed.d?.b?.p && parsed.d?.b?.d) {
        const path = parsed.d.b.p;
        const data = parsed.d.b.d;
        
        if (path.includes('models/attributes')) {
          
          window.katapultReconstructedAttributes = data;
          window.katapultModelAttributesData = data;
          processAttributesData(data);
        }
      }
      
    } catch (e) {
      // Fragment - will be handled by dumper-style reconstruction
    }
    
    // Call original handler if it exists
    if (originalOnMessage) {
      originalOnMessage.call(this, event);
    }
  });
  
  // Intercept send
  const originalSend = ws.send;
  ws.send = function(data) {
    return originalSend.call(this, data);
  };
  
  return ws;
};

// Copy static properties
Object.setPrototypeOf(window.WebSocket, originalWebSocket);
for (const key in originalWebSocket) {
  if (originalWebSocket.hasOwnProperty(key)) {
    window.WebSocket[key] = originalWebSocket[key];
  }
}

// Alias for reconstruction function
function reconstructFullModel() {
  performReconstructionFinalization();
}

// Complete WebSocket message reconstruction - NO FRAGMENTS
function performReconstructionFinalization() {
  
  const messages = window.katapultWebSocketMessages || [];
  
  // Step 1: Combine ALL raw messages into one giant string
  let combinedRaw = '';
  messages.forEach((messageObj) => {
    if (messageObj.raw) {
      combinedRaw += messageObj.raw;
    }
  });
  
  
  // Step 2: Extract all complete JSON objects from the combined string
  const jsonObjects = [];
  const dataByPath = {};
  let currentPos = 0;
  
  while (currentPos < combinedRaw.length) {
    // Find next JSON object start
    const jsonStart = combinedRaw.indexOf('{"t":"', currentPos);
    if (jsonStart === -1) break;
    
    // Find matching closing brace
    let depth = 0;
    let jsonEnd = jsonStart;
    let inString = false;
    let escapeNext = false;
    
    for (let i = jsonStart; i < combinedRaw.length; i++) {
      const char = combinedRaw[i];
      
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      
      if (char === '"' && !escapeNext) {
        inString = !inString;
      }
      
      if (!inString) {
        if (char === '{') depth++;
        if (char === '}') depth--;
        
        if (depth === 0 && i > jsonStart) {
          jsonEnd = i + 1;
          break;
        }
      }
    }
    
    if (jsonEnd > jsonStart) {
      const jsonStr = combinedRaw.substring(jsonStart, jsonEnd);
      try {
        const parsed = JSON.parse(jsonStr);
        jsonObjects.push(parsed);
        
        // Extract path and data
        let path = null;
        let responseData = null;
        
        if (parsed.d?.b?.p) path = parsed.d.b.p;
        if (parsed.d?.b?.d) responseData = parsed.d.b.d;
        
        // Store data by path
        if (path && responseData) {
          dataByPath[path] = responseData;
        }
        
      } catch (e) {
        // Skip invalid JSON but log if it looks important
        if (jsonStr.includes('attributes') || jsonStr.includes('node_type')) {
        }
      }
      currentPos = jsonEnd;
    } else {
      currentPos = jsonStart + 1;
    }
  }
  
  
  // Store globally first so model detection can use it
  window.katapultModelAttributesData = dataByPath;

  // Detect the currently selected model FIRST (before extracting attributes)
  // This ensures we prioritize the correct model's data
  let detectedModelKey = null;

  // Method 1: Try to detect from DOM (Model Editor shows selected model in header)
  const modelSelectorElement = document.querySelector('[class*="model-selector"]') ||
                                document.querySelector('[class*="ModelSelector"]') ||
                                document.querySelector('.MuiChip-label') ||
                                document.querySelector('[data-model-key]');

  if (modelSelectorElement) {
    detectedModelKey = modelSelectorElement.dataset?.modelKey ||
                       modelSelectorElement.textContent?.trim();
  }

  // Method 2: Check URL for model parameter
  if (!detectedModelKey) {
    const urlParams = new URLSearchParams(window.location.search);
    detectedModelKey = urlParams.get('model') || urlParams.get('model_key');

    const pathMatch = window.location.pathname.match(/model[s]?\/([^\/]+)/i) ||
                      window.location.hash.match(/model[s]?\/([^\/]+)/i);
    if (pathMatch) {
      detectedModelKey = pathMatch[1];
    }
  }

  // Method 3: Find model key from captured WebSocket paths
  const modelKeysInData = new Set();
  for (const path of Object.keys(dataByPath)) {
    const match = path.match(/company_space\/([^\/]+)/);
    if (match) {
      modelKeysInData.add(match[1]);
    }
  }

  if (!detectedModelKey && modelKeysInData.size > 0) {
    const modelKeys = Array.from(modelKeysInData).sort((a, b) => b.length - a.length);
    detectedModelKey = modelKeys[0];
  }

  window.katapultSelectedModelKey = detectedModelKey;

  // Extract attributes data - PRIORITIZE the selected model's path
  let reconstructedAttributes = {};

  // Build list of attribute paths, prioritizing selected model
  const attributePaths = Object.keys(dataByPath)
    .filter(path => path.includes('/models/attributes'))
    .sort((a, b) => {
      // Prioritize paths matching selected model
      const aMatch = detectedModelKey && a.includes(`company_space/${detectedModelKey}`);
      const bMatch = detectedModelKey && b.includes(`company_space/${detectedModelKey}`);
      if (aMatch && !bMatch) return -1;
      if (bMatch && !aMatch) return 1;
      // Then prefer company_space paths over catalog paths
      const aIsCompany = a.includes('company_space');
      const bIsCompany = b.includes('company_space');
      if (aIsCompany && !bIsCompany) return -1;
      if (bIsCompany && !aIsCompany) return 1;
      return 0;
    });

  // If we have a selected model, try to use ONLY its attributes first
  if (detectedModelKey) {
    const selectedModelPath = `photoheight/company_space/${detectedModelKey}/models/attributes`;
    if (dataByPath[selectedModelPath]) {
      reconstructedAttributes = dataByPath[selectedModelPath];
    }
  }

  // If no attributes found for selected model, merge from prioritized paths
  if (Object.keys(reconstructedAttributes).length === 0) {
    for (const path of attributePaths) {
      const data = dataByPath[path];
      if (data && typeof data === 'object') {
        Object.assign(reconstructedAttributes, data);
      }
    }
  }

  // Store globally
  window.katapultReconstructedAttributes = reconstructedAttributes;
  
  // Process attributes if found
  if (Object.keys(reconstructedAttributes).length > 0) {
    processAttributesData(reconstructedAttributes);
  }
  
  
  // Send complete reconstructed data to content script
  window.postMessage({
    type: 'cloneable-data-updated',
    nodeTypes: window.katapultProcessedNodeTypes || [],
    connectionTypes: window.katapultProcessedConnectionTypes || [],
    attributes: reconstructedAttributes,
    processedAttributes: window.katapultProcessedAttributes || { withPicklists: [], withoutPicklists: [] },
    imageClassifications: window.katapultProcessedImageClassifications || [],
    nestedAttributeStructures: window.katapultNestedAttributeStructures || {},
    modelData: dataByPath,
    // Pole annotation data - pass from page context to content script context
    poleAnnotationTypes: window.katapultPoleAnnotationTypes || [],
    inputModelGroups: window.katapultInputModelGroups || null,
    traceModels: window.katapultTraceModels || null,
    selectedModelKey: window.katapultSelectedModelKey || null,
    activeCatalog: window.katapultActiveCatalog || null,
    // Counts for debugging
    nodeTypesCount: window.katapultProcessedNodeTypes ? window.katapultProcessedNodeTypes.length : 0,
    connectionTypesCount: window.katapultProcessedConnectionTypes ? window.katapultProcessedConnectionTypes.length : 0,
    attributesCount: Object.keys(reconstructedAttributes).length,
    processedPicklistsCount: window.katapultProcessedAttributes ? window.katapultProcessedAttributes.withPicklists.length : 0,
    processedFreeformCount: window.katapultProcessedAttributes ? window.katapultProcessedAttributes.withoutPicklists.length : 0,
    imageClassificationsCount: window.katapultProcessedImageClassifications ? window.katapultProcessedImageClassifications.length : 0,
    poleAnnotationTypesCount: window.katapultPoleAnnotationTypes ? window.katapultPoleAnnotationTypes.length : 0
  }, '*');
  
}

// Helper function to detect message type (like dumper)
function detectMessageType(parsed) {
  if (parsed.t === 'c') return 'control';
  if (parsed.t === 'd') {
    if (parsed.d?.a === 'auth') return 'authentication';
    if (parsed.d?.a === 'q') return 'query';
    if (parsed.d?.a === 'p') return 'put';
    if (parsed.d?.a === 'n') return 'listen';
    if (parsed.d?.a === 'd') return 'data_update';
    if (parsed.d?.a === 's') return 'stats';
    if (parsed.d?.b?.s) return 'response';
    return 'data';
  }
  return 'unknown';
}

// Process attributes data into interface format
function processAttributesData(attributesData) {
  
  // Reset global arrays
  window.katapultProcessedNodeTypes = [];
  window.katapultProcessedConnectionTypes = [];
  
  // Process node types
  if (attributesData.node_type && attributesData.node_type.picklists) {
    const nodePicklists = attributesData.node_type.picklists;
    
    Object.entries(nodePicklists).forEach(([category, types]) => {
      if (types && typeof types === 'object') {
        Object.entries(types).forEach(([key, valueObj]) => {
          // Extract the actual value - it's nested in a .value property
          let displayName;
          if (valueObj && typeof valueObj === 'object' && valueObj.value) {
            displayName = valueObj.value;
          } else if (typeof valueObj === 'string') {
            displayName = valueObj;
          } else {
            displayName = key; // fallback to key
          }
          
          const finalCleanName = displayName.replace(/^[^:]*:\s*/, ''); // Remove prefixes like "osp:"
          
          window.katapultProcessedNodeTypes.push({
            category: category,
            key: key, // Keep the numeric key for reference
            displayName: displayName,
            cleanName: finalCleanName, // This is what gets displayed in the UI
            originalName: valueObj
          });
        });
      }
    });
    
  }
  
  // Process connection types (connection_type)
  if (attributesData.connection_type && attributesData.connection_type.picklists) {
    const connectionPicklists = attributesData.connection_type.picklists;
    
    Object.entries(connectionPicklists).forEach(([category, types]) => {
      if (types && typeof types === 'object') {
        Object.entries(types).forEach(([key, valueObj]) => {
          // Extract the actual value - it's nested in a .value property
          let displayName;
          if (valueObj && typeof valueObj === 'object' && valueObj.value) {
            displayName = valueObj.value;
          } else if (typeof valueObj === 'string') {
            displayName = valueObj;
          } else {
            displayName = key; // fallback to key
          }
          
          const finalCleanName = displayName.replace(/^[^:]*:\s*/, ''); // Remove prefixes like "cable:"
          
          window.katapultProcessedConnectionTypes.push({
            category: category,
            key: key, // Keep the numeric key for reference  
            displayName: displayName,
            cleanName: finalCleanName, // This is what gets displayed in the UI
            originalName: valueObj
          });
        });
      }
    });
    
  }
  
  // Process all other attributes 
  window.katapultProcessedAttributes = {
    withPicklists: [],
    withoutPicklists: []
  };
  
  Object.entries(attributesData).forEach(([attrName, attrData]) => {
    // Skip node_type and connection_type as they're handled separately above
    if (attrName === 'node_type' || attrName === 'connection_type') {
      return;
    }
    
    if (attrData && typeof attrData === 'object') {
      // Check if this is a boolean attribute first (checkbox GUI element)
      const isBoolean = attrData.gui_element === 'checkbox';
      
      // Check if this attribute has picklists (but not if it's a boolean)
      if (attrData.picklists && Object.keys(attrData.picklists).length > 0 && !isBoolean) {
        // This is a picklist attribute - process like node_type/cable_type
        const categories = Object.keys(attrData.picklists);
        const values = {};
        
        categories.forEach(category => {
          const categoryData = attrData.picklists[category];
          if (categoryData && typeof categoryData === 'object') {
            values[category] = [];
            Object.entries(categoryData).forEach(([key, valueObj]) => {
              // Extract the actual value - it's nested in a .value property
              let displayName;
              if (valueObj && typeof valueObj === 'object' && valueObj.value) {
                displayName = valueObj.value;
              } else if (typeof valueObj === 'string') {
                displayName = valueObj;
              } else {
                displayName = key; // fallback to key
              }
              
              values[category].push(displayName);
            });
          }
        });
        
        window.katapultProcessedAttributes.withPicklists.push({
          name: attrName,
          displayName: attrName.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
          dataType: 'picklist',
          required: attrData.required || false,
          categories: categories,
          values: values,
          attribute_types: attrData.attribute_types || {}
        });
        
      } else {
        // This is a free-form attribute
        window.katapultProcessedAttributes.withoutPicklists.push({
          name: attrName,
          displayName: attrName.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
          dataType: isBoolean ? 'boolean' : 'text', // Use boolean for checkbox elements
          required: attrData.required || false,
          attribute_types: attrData.attribute_types || {}
        });
        
      }
    }
  });
  
  
  // Process image classifications from input_models
  window.katapultProcessedImageClassifications = [];

  // Use the already-detected model key (set earlier in performReconstructionFinalization)
  const selectedModelKey = window.katapultSelectedModelKey;

  // Look for input_models data for the selected model
  let inputModelsData = null;
  let foundPath = null;

  // Build possible paths prioritizing the selected model
  const possiblePaths = [];

  if (selectedModelKey) {
    // Prioritize the selected model's path
    possiblePaths.push(`photoheight/company_space/${selectedModelKey}/models/input_models`);
  }

  // Also check all paths that contain /models/input_models as fallback
  possiblePaths.push(...Object.keys(window.katapultModelAttributesData)
    .filter(path => path.includes('/models/input_models'))
    .sort((a, b) => {
      // Prioritize paths matching selected model
      const aMatch = selectedModelKey && a.includes(selectedModelKey);
      const bMatch = selectedModelKey && b.includes(selectedModelKey);
      if (aMatch && !bMatch) return -1;
      if (bMatch && !aMatch) return 1;
      return 0;
    }));

  for (const path of possiblePaths) {
    if (window.katapultModelAttributesData[path]) {
      inputModelsData = window.katapultModelAttributesData[path];
      foundPath = path;
      break;
    }
  }
  
  // Find the selected model's subscribed catalog module to get input_model_groups and trace_models
  // Each model can extend a different base catalog
  let inputModelGroups = null;
  let traceModels = null;
  let activeCatalogName = null;

  // Step 1: Find which catalog modules the selected model is subscribed to
  const subscribedModules = [];

  // Prioritize the selected model's subscription path
  const subscriptionPaths = [];
  if (selectedModelKey) {
    subscriptionPaths.push(`photoheight/company_space/${selectedModelKey}/subscription/modules`);
  }
  // Also check all subscription paths as fallback
  subscriptionPaths.push(...Object.keys(window.katapultModelAttributesData)
    .filter(path => path.includes('/subscription/modules')));

  for (const path of subscriptionPaths) {
    const modules = window.katapultModelAttributesData[path];
    if (modules && typeof modules === 'object') {
      for (const [moduleName, enabled] of Object.entries(modules)) {
        if (enabled === true && !subscribedModules.includes(moduleName)) {
          subscribedModules.push(moduleName);
        }
      }
      // If we found modules from the selected model's path, prioritize those
      if (selectedModelKey && path.includes(selectedModelKey)) {
        break;
      }
    }
  }

  // Step 2: Find catalog data that matches subscribed modules
  // The catalog data may be deeply nested under a single path like `photoheight/catalogs`
  // We need to recursively search through it to find input_model_groups and trace_models

  // Helper function to recursively find input_model_groups and trace_models in nested objects
  function findCatalogData(obj, catalogPath = []) {
    if (!obj || typeof obj !== 'object') return null;

    const results = [];

    // Check if this object directly contains what we need
    if (obj.input_model_groups || obj.trace_models) {
      results.push({
        catalogName: catalogPath.join('/'),
        inputModelGroups: obj.input_model_groups || null,
        traceModels: obj.trace_models || null
      });
    }

    // Check if there's a 'models' sub-object that contains what we need
    if (obj.models && typeof obj.models === 'object') {
      if (obj.models.input_model_groups || obj.models.trace_models) {
        results.push({
          catalogName: catalogPath.join('/'),
          inputModelGroups: obj.models.input_model_groups || null,
          traceModels: obj.models.trace_models || null
        });
      }
    }

    // Recursively search through all object properties
    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        // Skip certain keys that are not catalog names
        if (key.startsWith('_') || key === 'models') continue;

        const nestedResults = findCatalogData(value, [...catalogPath, key]);
        if (nestedResults && nestedResults.length > 0) {
          results.push(...nestedResults);
        }
      }
    }

    return results;
  }

  // First, check for specific catalog paths
  const catalogPaths = Object.keys(window.katapultModelAttributesData)
    .filter(path => path.includes('catalogs'))
    .sort((a, b) => b.length - a.length); // Longer paths first (more specific)

  const allFoundCatalogs = [];

  for (const path of catalogPaths) {
    const pathData = window.katapultModelAttributesData[path];
    if (!pathData || typeof pathData !== 'object') continue;

    // Recursively search through this catalog data
    const foundCatalogs = findCatalogData(pathData, [path.split('/').pop() || 'catalogs']);
    if (foundCatalogs && foundCatalogs.length > 0) {
      allFoundCatalogs.push(...foundCatalogs);
    }
  }

  // Sort by preference: subscribed modules first, then by name length (more specific first)
  allFoundCatalogs.sort((a, b) => {
    const aSubscribed = subscribedModules.some(mod =>
      a.catalogName.includes(mod) || mod.includes(a.catalogName.split('/').pop())
    );
    const bSubscribed = subscribedModules.some(mod =>
      b.catalogName.includes(mod) || mod.includes(b.catalogName.split('/').pop())
    );
    if (aSubscribed && !bSubscribed) return -1;
    if (bSubscribed && !aSubscribed) return 1;
    return b.catalogName.length - a.catalogName.length;
  });

  // Pick the best catalog data
  for (const catalog of allFoundCatalogs) {
    if (catalog.inputModelGroups && !inputModelGroups) {
      inputModelGroups = catalog.inputModelGroups;
      activeCatalogName = catalog.catalogName;
    }
    if (catalog.traceModels && !traceModels) {
      traceModels = catalog.traceModels;
    }
    if (inputModelGroups && traceModels) {
      break;
    }
  }

  // Fallback: Check for input_model_groups and trace_models directly alongside input_models
  // They might be in the same company_space path rather than in catalogs
  if (!inputModelGroups || !traceModels) {
    for (const [path, data] of Object.entries(window.katapultModelAttributesData)) {
      if (path.includes('/models/input_model_groups') && !inputModelGroups) {
        inputModelGroups = data;
        activeCatalogName = 'model-direct';
      }
      if (path.includes('/models/trace_models') && !traceModels) {
        traceModels = data;
      }
    }
  }

  // Additional fallback: Look for a single "catalogs" or "models" object that contains everything
  if (!inputModelGroups || !traceModels) {
    for (const [path, data] of Object.entries(window.katapultModelAttributesData)) {
      if (data && typeof data === 'object') {
        // Check if this object directly contains input_model_groups or trace_models
        if (data.input_model_groups && !inputModelGroups) {
          inputModelGroups = data.input_model_groups;
          activeCatalogName = path.split('/').pop() || 'direct';
        }
        if (data.trace_models && !traceModels) {
          traceModels = data.trace_models;
        }
        // Also check under 'models' sub-key
        if (data.models && typeof data.models === 'object') {
          if (data.models.input_model_groups && !inputModelGroups) {
            inputModelGroups = data.models.input_model_groups;
            activeCatalogName = path.split('/').pop() || 'nested';
          }
          if (data.models.trace_models && !traceModels) {
            traceModels = data.models.trace_models;
          }
        }
      }
    }
  }

  // Store for later use
  window.katapultInputModelGroups = inputModelGroups;
  window.katapultTraceModels = traceModels;
  window.katapultActiveCatalog = activeCatalogName;

  if (inputModelsData && typeof inputModelsData === 'object') {

    // Extract nested attribute structures from input_models
    window.katapultNestedAttributeStructures = {};
    Object.entries(inputModelsData).forEach(([key, modelData]) => {
      if (modelData && typeof modelData === 'object' && modelData._attributes) {
        window.katapultNestedAttributeStructures[key] = {
          nestedFields: modelData._attributes,
          elementType: modelData.element_type
        };
      }
    });

    // Extract pole annotation types (element_type: 'point') from input_models
    // NO HARDCODING - everything comes from the catalog data dynamically
    window.katapultPoleAnnotationTypes = [];

    // Build a lookup for shortcuts from input_model_groups.Measure
    const measureGroupShortcuts = {};
    if (inputModelGroups && inputModelGroups.Measure) {
      Object.entries(inputModelGroups.Measure).forEach(([groupKey, groupData]) => {
        if (groupKey.startsWith('_')) return; // Skip meta keys like _priority
        // Convert Pascal_Case to snake_case for matching
        const snakeKey = groupKey.toLowerCase().replace(/_/g, '');
        if (groupData && groupData._shortcut !== undefined) {
          measureGroupShortcuts[snakeKey] = groupData._shortcut;
        }
      });
    }

    // Build attribute mappings from trace_models
    // trace_models links _trace_type to attributes (e.g., cable -> {cable_type: true, company: true})
    const traceTypeAttributes = {};
    if (traceModels) {
      Object.entries(traceModels).forEach(([traceType, traceData]) => {
        if (traceData && traceData.attributes) {
          traceTypeAttributes[traceType] = Object.keys(traceData.attributes);
        }
      });
    }

    Object.entries(inputModelsData).forEach(([key, modelData]) => {
      if (modelData && typeof modelData === 'object' && modelData.element_type === 'point') {
        // Skip calibration types - they're for image calibration, not pole annotations
        if (key.includes('calibration')) {
          return;
        }

        // Format display name from key
        const displayName = key
          .replace(/_/g, ' ')
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');

        // Get shortcut from input_model_groups (preferred) or input_model itself
        const snakeKey = key.replace(/_/g, '');
        let shortcut = measureGroupShortcuts[snakeKey] ||
                       modelData.shortcut ||
                       modelData._shortcut ||
                       modelData.hotkey ||
                       null;

        // Get attributes from trace_models using _trace_type
        const traceType = modelData._trace_type;
        const traceAttributes = traceType ? traceTypeAttributes[traceType] || [] : [];

        window.katapultPoleAnnotationTypes.push({
          key: key,
          displayName: displayName,
          shortcut: shortcut,
          traceType: traceType,
          traceAttributes: traceAttributes,  // Attributes from trace_models (e.g., ['cable_type', 'company'])
          rawAttributes: modelData._attributes || {},
          allowedChildren: modelData.allowed_children || null,
          color: modelData._color || null,
          helpText: modelData._help_text || null,
          originalData: modelData
        });
      }
    });

    Object.entries(inputModelsData).forEach(([key, modelData]) => {
      if (modelData && typeof modelData === 'object') {
        // Only include items with element_type of 'chip' - these are the actual image classifications
        // Skip 'point' types and other non-classification items
        const isImageClassification = modelData.element_type === 'chip';
        
        if (isImageClassification) {
          // Format the display name  
          const displayName = key
            .replace(/_/g, ' ')
            .replace(/([A-Z])/g, ' $1')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ')
            .replace(/^Cable Tag$/, 'CableTag')  // Special case
            .replace(/^Pole Tag$/, 'Pole Tag')
            .replace(/^Pole Top$/, 'Pole Top')
            .replace(/^No Tag$/, 'No Tag')
            .replace(/^No Birthmark$/, 'No Birthmark')
            .replace(/^Sync And Job$/, 'Sync And Job');
          
          // Extract shortcut (try multiple sources)
          let shortcut = modelData.shortcut || modelData._shortcut;
          if (!shortcut) {
            // Generate shortcut from name if not provided
            if (key === 'anchor_point') shortcut = 'a';
            else if (key === 'back') shortcut = 'b';  
            else if (key === 'cableTag') shortcut = 'c';
            else if (key === 'grounding') shortcut = 'g';
            else if (key === 'hallway') shortcut = 'h';
            else if (key === 'miscellaneous') shortcut = 'l';
            else if (key === 'midspanHeight') shortcut = 'm';
            else if (key === 'note') shortcut = 'n';
            else if (key === 'osmose') shortcut = 'o';
            else if (key === 'poleHeight') shortcut = 'p';
            else if (key === 'rubbish') shortcut = 'r';
            else if (key === 'side') shortcut = 's';
            else if (key === 'pole_tag') shortcut = 't';
            else if (key === 'upshot') shortcut = 'u';
            else if (key === 'no_tag') shortcut = 'x';
            else if (key === 'no_birthmark') shortcut = 'z';
            else if (key === 'pole_top') shortcut = '4';
            else if (key === 'sync_and_job') shortcut = 'j';
            else shortcut = key.charAt(0); // fallback
          }
          
          window.katapultProcessedImageClassifications.push({
            key: key,
            name: displayName,
            shortcut: shortcut,
            elementType: modelData.element_type || 'chip',
            color: modelData._color || 'var(--paper-grey-500)',
            textColor: modelData._text_color || 'white',
            editable: modelData.editability !== 'uneditable',
            hasAttributes: !!modelData._attributes,
            helpText: modelData._help_text || modelData._help_link || null,
            originalData: modelData
          });
          
        }
      }
    });
    
  } else {
  }
}

// Debug function
window.debugNodeTypes = function() {

  if (window.katapultProcessedNodeTypes?.length > 0) {
  }

  return {
    messages: window.katapultWebSocketMessages?.length || 0,
    nodeTypes: window.katapultProcessedNodeTypes?.length || 0,
    connectionTypes: window.katapultProcessedConnectionTypes?.length || 0,
    attributes: Object.keys(window.katapultReconstructedAttributes || {}).length
  };
};

// Dump all captured Firebase paths with data previews
// Run in console: dumpAllCapturedPaths() to see what data is available
window.dumpAllCapturedPaths = function(opts = {}) {
  const { verbose = false, filter = null, download = false } = opts;
  const dataByPath = window.katapultModelAttributesData || {};
  const paths = Object.keys(dataByPath).sort();

  console.group(`📡 All Captured Firebase Paths (${paths.length} total)`);

  const summary = [];

  for (const path of paths) {
    const data = dataByPath[path];
    // Skip unnamed data_response entries unless verbose
    if (!verbose && path.startsWith('data_response_')) continue;

    const dataType = Array.isArray(data) ? 'array' : typeof data;
    let size = 0;
    let keyCount = 0;
    let preview = '';

    if (data && typeof data === 'object') {
      const json = JSON.stringify(data);
      size = json.length;
      keyCount = Array.isArray(data) ? data.length : Object.keys(data).length;
      // Show first few keys as preview
      const keys = Array.isArray(data) ? [] : Object.keys(data).slice(0, 8);
      preview = keys.join(', ');
      if (Object.keys(data).length > 8) preview += ` ... (+${Object.keys(data).length - 8} more)`;
    } else {
      size = String(data).length;
      preview = String(data).substring(0, 100);
    }

    const sizeStr = size > 1000000 ? `${(size / 1000000).toFixed(1)}MB`
                  : size > 1000 ? `${(size / 1000).toFixed(1)}KB`
                  : `${size}B`;

    const entry = { path, dataType, size, sizeStr, keyCount, preview };
    summary.push(entry);

    // Apply filter if provided
    if (filter && !path.toLowerCase().includes(filter.toLowerCase())) continue;

    console.log(`${path}\n  type: ${dataType} | size: ${sizeStr} | keys: ${keyCount}\n  preview: ${preview}\n`);
  }

  console.groupEnd();

  // Show total stats
  const totalSize = summary.reduce((sum, e) => sum + e.size, 0);
  const totalStr = totalSize > 1000000 ? `${(totalSize / 1000000).toFixed(1)}MB` : `${(totalSize / 1000).toFixed(1)}KB`;
  console.log(`📊 Total: ${summary.length} named paths, ${totalStr} of data, ${(window.katapultWebSocketMessages || []).length} raw WS messages`);

  if (download) {
    // Download the full data dump as JSON
    const dump = {
      timestamp: new Date().toISOString(),
      url: window.location.href,
      pathCount: paths.length,
      paths: {}
    };
    for (const path of paths) {
      dump.paths[path] = dataByPath[path];
    }
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `katapult-dump-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    console.log('📥 Downloaded full data dump');
  }

  return summary;
};

// Dump data for a specific path - useful for exploring job data
// Run in console: inspectPath('photoheight/company_space/...')
window.inspectPath = function(pathFragment) {
  const dataByPath = window.katapultModelAttributesData || {};
  const matches = Object.keys(dataByPath).filter(p => p.includes(pathFragment));

  if (matches.length === 0) {
    console.log(`❌ No paths matching "${pathFragment}"`);
    console.log('Available paths:', Object.keys(dataByPath).filter(p => !p.startsWith('data_response_')).sort());
    return null;
  }

  const result = {};
  for (const path of matches) {
    console.group(`📂 ${path}`);
    const data = dataByPath[path];
    console.log(data);
    console.groupEnd();
    result[path] = data;
  }

  return result;
};

// Auto-calibrate every photo viewer that has purple (uncalibrated) height markers.
// Purple markers = `<div class="markerLabel notDisabled">` with computed bg rgba(100,100,255,0.8).
// Calibration is done by calling photo-controls.saveCalibration(photoId, null, null, null),
// which internally runs stick_align computation + writes _score on all anchors.
// Per-photoId in-flight guard: Firebase writes are async, so successive scans
// may still see purple markers before the first saveCalibration lands. We skip
// re-issuing a call for a given photoId until this cooldown expires.
const CLONEABLE_CALIBRATE_COOLDOWN_MS = 5000;
window.__cloneableCalibrateInflight = window.__cloneableCalibrateInflight || {};

function autoCalibratePurpleMarkers(options) {
  const autoConfirm = !options || options.autoConfirm !== false;
  // Fresh WeakSet per call so successive deepQuery invocations don't skip
  // shadow roots that a previous query already traversed.
  function deepQuery(root, predicate) {
    const results = [];
    const seen = new WeakSet();
    (function walk(r) {
      if (!r || seen.has(r)) return;
      seen.add(r);
      const nodes = r.querySelectorAll ? r.querySelectorAll('*') : [];
      for (const el of nodes) {
        if (predicate(el)) results.push(el);
        if (el.shadowRoot) walk(el.shadowRoot);
      }
      // Also recurse into the root's OWN shadow root (when called on a host directly)
      if (r.shadowRoot) walk(r.shadowRoot);
    })(root);
    return results;
  }

  // Find photo-controls (singleton) and all photo viewers with a photoId
  const controls = deepQuery(document, el => el.tagName === 'PHOTO-CONTROLS')[0];
  if (!controls || typeof controls.saveCalibration !== 'function') {
    return { applied: false, message: 'photo-controls not ready' };
  }
  const viewers = deepQuery(document, el => el.tagName === 'KATAPULT-PHOTO-VIEWER' && el.photoId);
  if (viewers.length === 0) return { applied: false, message: 'no viewers with photoId' };

  // Normalized "purple" RGBA Katapult uses for uncalibrated anchor_calibration markers.
  const isPurple = (c) => typeof c === 'string' && c.replace(/\s+/g, '') === 'rgba(100,100,255,0.8)';

  let calibrated = 0;
  const photoIdsCalibrated = [];
  for (const viewer of viewers) {
    // Find anchor_calibration annotations on THIS viewer and check each's color.
    const anchorAnnotations = deepQuery(viewer, el =>
      el.tagName === 'KATAPULT-PHOTO-ANNOTATION' &&
      el.__data && el.__data.attributeName === 'anchor_calibration'
    );
    const uncalibrated = anchorAnnotations.filter(a => isPurple(a.__data.color));
    if (uncalibrated.length === 0) continue;
    // Skip if we just issued a calibration for this photoId and the write hasn't
    // landed yet (would cause double writes + double "Do it Anyway" dialogs).
    const lastCall = window.__cloneableCalibrateInflight[viewer.photoId] || 0;
    if (Date.now() - lastCall < CLONEABLE_CALIBRATE_COOLDOWN_MS) continue;
    try {
      window.__cloneableCalibrateInflight[viewer.photoId] = Date.now();
      controls.saveCalibration(viewer.photoId, null, null, null);
      calibrated++;
      photoIdsCalibrated.push(viewer.photoId);
    } catch (e) {
      console.warn('[Cloneable] auto-calibrate failed for', viewer.photoId, e);
    }
  }

  // Katapult's saveCalibration sometimes raises a "Do it Anyway" confirmation dialog
  // when the computed calibration is out of range. Auto-click it to complete the flow.
  if (calibrated > 0 && autoConfirm) autoConfirmDoItAnyway();

  return {
    applied: calibrated > 0,
    count: calibrated,
    photoIds: photoIdsCalibrated,
    message: calibrated > 0 ? `Calibrated ${calibrated} photo(s)` : 'No purple markers found'
  };
}

// Inject a one-time CSS rule that keeps any dialog containing the "Do it Anyway"
// button hidden. The dialog is still in the DOM (so its button can be clicked), but
// it never paints, so the user doesn't see the flash.
(function installDoItAnywayHider() {
  if (window.__cloneableDoItAnywayCssInstalled) return;
  window.__cloneableDoItAnywayCssInstalled = true;
  const style = document.createElement('style');
  style.textContent = `[data-cloneable-hide] { visibility: hidden !important; opacity: 0 !important; }`;
  (document.head || document.documentElement).appendChild(style);
})();

function findDoItAnywayButton() {
  const seen = new WeakSet();
  let btn = null;
  (function walk(r) {
    if (!r || btn || seen.has(r)) return;
    seen.add(r);
    const all = r.querySelectorAll?.('*') || [];
    for (const el of all) {
      if (el.tagName === 'KATAPULT-BUTTON' &&
          (el.textContent || '').trim().toLowerCase() === 'do it anyway') {
        btn = el; return;
      }
      if (el.shadowRoot) walk(el.shadowRoot);
    }
    if (r.shadowRoot) walk(r.shadowRoot);
  })(document);
  return btn;
}

// Watch for the "Do it Anyway" button; as soon as it appears, hide its dialog
// visually and click. Uses MutationObserver on every shadow root we can reach
// so the dialog is caught before the next paint.
function autoConfirmDoItAnyway() {
  const tryConfirm = () => {
    const btn = findDoItAnywayButton();
    if (!btn) return false;
    // Climb to the nearest dialog-like container and hide it
    let container = btn;
    while (container && container !== document.documentElement) {
      const tag = container.tagName || '';
      if (/DIALOG|MODAL/.test(tag) || container.getAttribute?.('role') === 'dialog') {
        container.setAttribute('data-cloneable-hide', '');
        break;
      }
      container = container.parentElement || (container.getRootNode && container.getRootNode().host);
    }
    try { btn.click(); } catch (e) {}
    return true;
  };

  if (tryConfirm()) return;

  // Otherwise observe for it briefly
  const observers = [];
  const seenRoots = new WeakSet();
  function observeRoot(root) {
    if (!root || seenRoots.has(root) || !root.querySelectorAll) return;
    seenRoots.add(root);
    try {
      const o = new MutationObserver(() => {
        if (tryConfirm()) {
          observers.forEach(x => x.disconnect());
        } else {
          // New elements may have new shadow roots — observe them too
          root.querySelectorAll('*').forEach(el => el.shadowRoot && observeRoot(el.shadowRoot));
        }
      });
      o.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['opened', 'aria-hidden'] });
      observers.push(o);
    } catch (e) {}
    root.querySelectorAll('*').forEach(el => el.shadowRoot && observeRoot(el.shadowRoot));
  }
  observeRoot(document);
  setTimeout(() => observers.forEach(o => o.disconnect()), 3000);
}

// Expose for manual debugging in console
window.autoCalibratePurpleMarkers = autoCalibratePurpleMarkers;

// Listen for reconstruction trigger from content script
window.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'cloneable-trigger-reconstruction') {
    performReconstructionFinalization();
  } else if (event.data && event.data.type === 'cloneable-get-websocket-data-dump') {

    // Send the WebSocket messages back to content script
    window.postMessage({
      type: 'cloneable-websocket-data-response',
      messages: window.katapultWebSocketMessages || [],
      messageCount: (window.katapultWebSocketMessages || []).length,
      timestamp: new Date().toISOString()
    }, '*');

  } else if (event.data && event.data.type === 'cloneable-auto-calibrate') {
    const result = autoCalibratePurpleMarkers({ autoConfirm: event.data.autoConfirm });
    window.postMessage({
      type: 'cloneable-auto-calibrate-result',
      requestId: event.data.requestId,
      result: result
    }, '*');
  }
});

// Run reconstruction multiple times to be extremely thorough
setTimeout(performReconstructionFinalization, 3000); // First pass
setTimeout(performReconstructionFinalization, 6000); // Second pass
setTimeout(performReconstructionFinalization, 10000); // Final thorough pass