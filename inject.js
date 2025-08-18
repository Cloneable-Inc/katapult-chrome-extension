// Cloneable Extension - WebSocket Interceptor with DUMPER-STYLE reconstruction
// This script must be injected into the page context to intercept WebSockets

// Global storage for WebSocket messages  
window.katapultWebSocketMessages = [];
window.katapultReconstructedAttributes = {};
window.katapultModelAttributesData = {};
window.katapultProcessedNodeTypes = [];
window.katapultProcessedConnectionTypes = [];

// Timer for delayed reconstruction
let reconstructionTimer = null;

console.log('[Cloneable Extension] Debug function available: window.debugNodeTypes()');

const originalWebSocket = window.WebSocket;
window.WebSocket = function(url, protocols) {
  console.log('[Cloneable Extension] WebSocket created:', url);
  
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
        console.log('[Cloneable Extension] Triggering delayed reconstruction with', window.katapultWebSocketMessages.length, 'messages');
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
          console.log(`[Cloneable Extension] 🎯 IMMEDIATE attributes found at ${path}!`);
          console.log(`[Cloneable Extension] Keys:`, Object.keys(data));
          
          window.katapultReconstructedAttributes = data;
          window.katapultModelAttributesData = data;
          processAttributesData(data);
        }
      }
      
    } catch (e) {
      // Fragment - will be handled by dumper-style reconstruction
      console.log(`[Cloneable Extension] 📦 Fragment stored for dumper-style reconstruction`);
    }
    
    // Call original handler if it exists
    if (originalOnMessage) {
      originalOnMessage.call(this, event);
    }
  });
  
  // Intercept send
  const originalSend = ws.send;
  ws.send = function(data) {
    console.log('[Cloneable Extension] WebSocket send:', data);
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

console.log('[Cloneable Extension] WebSocket interceptor installed');

// Alias for reconstruction function
function reconstructFullModel() {
  performReconstructionFinalization();
}

// DUMPER-STYLE RECONSTRUCTION - exactly like our working dumper scripts
function performReconstructionFinalization() {
  console.log('[Cloneable Extension] 📦 DUMPER-STYLE RECONSTRUCTION - processing ALL messages exactly like dumper...');
  
  const messages = window.katapultWebSocketMessages || [];
  console.log(`[Cloneable Extension] Processing ALL ${messages.length} WebSocket messages...`);
  
  // EXACT DUMPER APPROACH: Store all messages first, then process
  const dataByPath = {};
  const parsedMessages = [];
  
  // Process every single message like the dumper does
  messages.forEach((messageObj, id) => {
    const payload = messageObj.raw || messageObj;
    
    if (typeof payload !== 'string') return;
    
    try {
      // Try to parse each message as JSON (like dumper analyzeMessage)
      const parsed = JSON.parse(payload);
      
      // Store parsed message (like dumper)
      parsedMessages.push({
        id,
        direction: 'RECEIVED',
        timestamp: messageObj.timestamp || Date.now(),
        type: detectMessageType(parsed),
        raw: payload,
        parsed
      });
      
      // Extract path and data (like dumper extractPath and storeData)
      let path = null;
      let responseData = null;
      
      // Try various path locations (like dumper)
      if (parsed.d?.b?.p) path = parsed.d.b.p;
      if (parsed.d?.b?.b?.p) path = parsed.d.b.b.p; 
      if (parsed.b?.p) path = parsed.b.p;
      
      // Extract response data
      if (parsed.d?.b?.d) responseData = parsed.d.b.d;
      if (parsed.d?.d) responseData = parsed.d.d;
      if (parsed.b?.d) responseData = parsed.b.d;
      
      // Store data by path (like dumper storeData)
      if (path && responseData) {
        if (!dataByPath[path]) {
          dataByPath[path] = {};
        }
        
        if (typeof responseData === 'object') {
          Object.assign(dataByPath[path], responseData);
        } else {
          dataByPath[path] = responseData;
        }
        
        console.log(`[Cloneable Extension] 📝 Stored data for path: ${path} (${typeof responseData === 'object' ? Object.keys(responseData).length + ' keys' : 'primitive'})`);
      }
      
    } catch (e) {
      // Not JSON - store as unknown (like dumper)
      parsedMessages.push({
        id,
        direction: 'RECEIVED', 
        timestamp: messageObj.timestamp || Date.now(),
        type: 'fragment_or_unknown',
        raw: payload
      });
    }
  });
  
  console.log(`[Cloneable Extension] 📊 Processed ${parsedMessages.length} messages into ${Object.keys(dataByPath).length} data paths`);
  
  // Extract attributes data (like dumper final processing)
  let reconstructedAttributes = {};
  
  Object.entries(dataByPath).forEach(([path, data]) => {
    if (path.includes('attributes') && path.includes('models')) {
      console.log(`[Cloneable Extension] 🎯 Found attributes data at path: ${path}`);
      console.log(`[Cloneable Extension] Attributes data keys:`, Object.keys(data));
      Object.assign(reconstructedAttributes, data);
    }
  });
  
  // If no complete attributes found, try fragment reconstruction for /models/attributes
  if (Object.keys(reconstructedAttributes).length === 0) {
    console.log('[Cloneable Extension] 🔧 No complete /models/attributes found, attempting fragment reconstruction...');
    
    // Look for fragments containing /models/attributes
    let attributesFragments = [];
    let foundStart = false;
    
    for (let i = 0; i < messages.length; i++) {
      const messageObj = messages[i];
      const raw = messageObj.raw || messageObj;
      
      if (typeof raw !== 'string') continue;
      
      // Look for start of /models/attributes message
      if (raw.includes('/models/attributes') && raw.includes('"d":{')) {
        console.log(`[Cloneable Extension] 🎯 Found /models/attributes FRAGMENT START at message ${i}`);
        foundStart = true;
        attributesFragments.push(raw);
      }
      // Collect subsequent fragments if we found the start
      else if (foundStart && attributesFragments.length < 20) {
        const looksLikeAttributeFragment = raw.includes('attribute_types') || 
                                         raw.includes('PCI_1') || 
                                         raw.includes('poles_built') ||
                                         raw.includes('node_type') ||
                                         raw.includes('cable_type') ||
                                         raw.includes('picklists') ||
                                         raw.startsWith(':') || 
                                         raw.startsWith(',') ||
                                         (!raw.startsWith('{"t":"d"') && raw.length < 500);
                                         
        if (looksLikeAttributeFragment) {
          console.log(`[Cloneable Extension] 📎 Adding attributes fragment ${attributesFragments.length + 1}: ${raw.substring(0, 50)}...`);
          attributesFragments.push(raw);
        } else if (raw.startsWith('{"t":"d"')) {
          // Hit a new complete message, stop collecting
          break;
        }
      }
    }
    
    // Try to reconstruct the complete /models/attributes message
    if (attributesFragments.length > 1) {
      console.log(`[Cloneable Extension] 🔨 Attempting fragment reconstruction from ${attributesFragments.length} fragments...`);
      const reconstructed = attributesFragments.join('');
      
      try {
        const parsed = JSON.parse(reconstructed);
        console.log('[Cloneable Extension] ✅ FRAGMENT RECONSTRUCTION SUCCESS!');
        
        if (parsed.d?.b?.d && parsed.d?.b?.p?.includes('attributes')) {
          const attributesData = parsed.d.b.d;
          console.log(`[Cloneable Extension] 🎉 Reconstructed /models/attributes with ${Object.keys(attributesData).length} keys!`);
          console.log('[Cloneable Extension] Found keys:', Object.keys(attributesData));
          
          Object.assign(reconstructedAttributes, attributesData);
          
          if (attributesData.node_type) {
            console.log('[Cloneable Extension] ✅ Found node_type with picklists:', Object.keys(attributesData.node_type.picklists || {}));
          }
          if (attributesData.cable_type) {
            console.log('[Cloneable Extension] ✅ Found cable_type with picklists:', Object.keys(attributesData.cable_type.picklists || {}));
          }
        }
      } catch (e) {
        console.log(`[Cloneable Extension] ❌ Fragment reconstruction failed: ${e.message}`);
        console.log('Reconstructed preview:', reconstructed.substring(0, 200));
      }
    }
  }
  
  // Store globally
  window.katapultModelAttributesData = dataByPath;
  window.katapultReconstructedAttributes = reconstructedAttributes;
  
  // Process attributes if found
  if (Object.keys(reconstructedAttributes).length > 0) {
    console.log('[Cloneable Extension] 🚀 Processing reconstructed attributes into interface format...');
    processAttributesData(reconstructedAttributes);
  }
  
  console.log('[Cloneable Extension] 📊 FINAL RECONSTRUCTION SUMMARY:');
  console.log(`  Parsed messages: ${parsedMessages.length}`);
  console.log(`  Data paths found: ${Object.keys(dataByPath).length}`);
  console.log(`  Reconstructed attributes keys: ${Object.keys(reconstructedAttributes).length}`);
  console.log(`  Node types processed: ${window.katapultProcessedNodeTypes ? window.katapultProcessedNodeTypes.length : 0}`);
  console.log(`  Connection types processed: ${window.katapultProcessedConnectionTypes ? window.katapultProcessedConnectionTypes.length : 0}`);
  
  // Send complete reconstructed data to content script
  console.log('[Cloneable Extension] 📤 Sending reconstructed data to content script...');
  window.postMessage({
    type: 'cloneable-data-updated',
    nodeTypes: window.katapultProcessedNodeTypes || [],
    connectionTypes: window.katapultProcessedConnectionTypes || [],
    attributes: reconstructedAttributes,
    processedAttributes: window.katapultProcessedAttributes || { withPicklists: [], withoutPicklists: [] },
    imageClassifications: window.katapultProcessedImageClassifications || [],
    modelData: dataByPath,
    nodeTypesCount: window.katapultProcessedNodeTypes ? window.katapultProcessedNodeTypes.length : 0,
    connectionTypesCount: window.katapultProcessedConnectionTypes ? window.katapultProcessedConnectionTypes.length : 0,
    attributesCount: Object.keys(reconstructedAttributes).length,
    processedPicklistsCount: window.katapultProcessedAttributes ? window.katapultProcessedAttributes.withPicklists.length : 0,
    processedFreeformCount: window.katapultProcessedAttributes ? window.katapultProcessedAttributes.withoutPicklists.length : 0,
    imageClassificationsCount: window.katapultProcessedImageClassifications ? window.katapultProcessedImageClassifications.length : 0
  }, '*');
  
  console.log('[Cloneable Extension] ✅ Data sent to content script:', {
    nodeTypes: window.katapultProcessedNodeTypes ? window.katapultProcessedNodeTypes.length : 0,
    connectionTypes: window.katapultProcessedConnectionTypes ? window.katapultProcessedConnectionTypes.length : 0,
    attributes: Object.keys(reconstructedAttributes).length
  });
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
  console.log('[Cloneable Extension] 🔧 Processing attributes data:', Object.keys(attributesData));
  
  // Reset global arrays
  window.katapultProcessedNodeTypes = [];
  window.katapultProcessedConnectionTypes = [];
  
  // Process node types
  if (attributesData.node_type && attributesData.node_type.picklists) {
    const nodePicklists = attributesData.node_type.picklists;
    console.log('[Cloneable Extension] Processing node type picklists:', Object.keys(nodePicklists));
    
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
    
    console.log(`[Cloneable Extension] ✅ Processed ${window.katapultProcessedNodeTypes.length} node types`);
  }
  
  // Process connection types (cable_type)
  if (attributesData.cable_type && attributesData.cable_type.picklists) {
    const cablePicklists = attributesData.cable_type.picklists;
    console.log('[Cloneable Extension] Processing cable type picklists:', Object.keys(cablePicklists));
    
    Object.entries(cablePicklists).forEach(([category, types]) => {
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
    
    console.log(`[Cloneable Extension] ✅ Processed ${window.katapultProcessedConnectionTypes.length} connection types`);
  }
  
  // Process all other attributes 
  console.log('[Cloneable Extension] 🔧 Processing general attributes...');
  window.katapultProcessedAttributes = {
    withPicklists: [],
    withoutPicklists: []
  };
  
  Object.entries(attributesData).forEach(([attrName, attrData]) => {
    // Skip node_type and cable_type as they're handled separately above
    if (attrName === 'node_type' || attrName === 'cable_type') {
      return;
    }
    
    if (attrData && typeof attrData === 'object') {
      // Check if this attribute has picklists
      if (attrData.picklists && Object.keys(attrData.picklists).length > 0) {
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
        
        console.log(`[Cloneable Extension] ✅ Processed picklist attribute: ${attrName} (${categories.length} categories)`);
      } else {
        // This is a free-form attribute
        window.katapultProcessedAttributes.withoutPicklists.push({
          name: attrName,
          displayName: attrName.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
          dataType: 'text', // simplified for now
          required: attrData.required || false,
          attribute_types: attrData.attribute_types || {}
        });
        
        console.log(`[Cloneable Extension] ✅ Processed free-form attribute: ${attrName}`);
      }
    }
  });
  
  console.log(`[Cloneable Extension] 📊 Processed ${window.katapultProcessedAttributes.withPicklists.length} picklist attributes and ${window.katapultProcessedAttributes.withoutPicklists.length} free-form attributes`);
  
  // Process image classifications from input_models
  console.log('[Cloneable Extension] 📸 Processing image classifications...');
  window.katapultProcessedImageClassifications = [];
  
  // Look for input_models data in the globally stored model data
  // Try multiple possible paths since company name may vary
  const possiblePaths = [
    'photoheight/company_space/cloneable&period;ai/models/input_models',
    // Check all paths that contain /models/input_models
    ...Object.keys(window.katapultModelAttributesData).filter(path => path.includes('/models/input_models'))
  ];
  
  let inputModelsData = null;
  let foundPath = null;
  
  for (const path of possiblePaths) {
    if (window.katapultModelAttributesData[path]) {
      inputModelsData = window.katapultModelAttributesData[path];
      foundPath = path;
      break;
    }
  }
  
  if (inputModelsData && typeof inputModelsData === 'object') {
    console.log(`[Cloneable Extension] Found input_models at ${foundPath} with ${Object.keys(inputModelsData).length} items`);
    
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
          
          console.log(`[Cloneable Extension] ✅ Processed image classification: ${displayName} (${shortcut})`);
        }
      }
    });
    
    console.log(`[Cloneable Extension] 📊 Processed ${window.katapultProcessedImageClassifications.length} image classifications`);
  } else {
    console.log('[Cloneable Extension] ⚠️ No input_models data found for image classifications');
    console.log('[Cloneable Extension] Available paths:', Object.keys(window.katapultModelAttributesData).filter(p => p.includes('models')));
  }
}

// Debug function
window.debugNodeTypes = function() {
  console.log('📊 Debug Node Types:');
  console.log('  Total messages:', window.katapultWebSocketMessages?.length || 0);
  console.log('  Node types:', window.katapultProcessedNodeTypes?.length || 0);
  console.log('  Connection types:', window.katapultProcessedConnectionTypes?.length || 0);
  console.log('  Reconstructed attributes:', Object.keys(window.katapultReconstructedAttributes || {}));
  
  if (window.katapultProcessedNodeTypes?.length > 0) {
    console.log('  Sample node types:', window.katapultProcessedNodeTypes.slice(0, 5));
  }
  
  return {
    messages: window.katapultWebSocketMessages?.length || 0,
    nodeTypes: window.katapultProcessedNodeTypes?.length || 0,
    connectionTypes: window.katapultProcessedConnectionTypes?.length || 0,
    attributes: Object.keys(window.katapultReconstructedAttributes || {}).length
  };
};

// Listen for reconstruction trigger from content script
window.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'cloneable-trigger-reconstruction') {
    console.log('[Cloneable Extension] 🚀 Received immediate reconstruction trigger from content script');
    performReconstructionFinalization();
  }
});

// Run reconstruction multiple times to be extremely thorough
setTimeout(performReconstructionFinalization, 3000); // First pass
setTimeout(performReconstructionFinalization, 6000); // Second pass
setTimeout(performReconstructionFinalization, 10000); // Final thorough pass

console.log('[Cloneable Extension] Reconstructor loaded');