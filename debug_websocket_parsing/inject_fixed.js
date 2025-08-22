// Enhanced WebSocket Interceptor with Better Path Detection
// This is the FIXED version that handles company-specific paths

window.katapultWebSocketMessages = [];
window.katapultReconstructedAttributes = {};
window.katapultModelAttributesData = {};
window.katapultProcessedNodeTypes = [];
window.katapultProcessedConnectionTypes = [];

// Store company information
window.katapultCompanyInfo = {
  companyId: null,
  modelId: null
};

// Extract company info from URL
function extractCompanyInfo() {
  const hash = window.location.hash;
  if (hash) {
    const match = hash.match(/#([^\/]+)\//);
    if (match) {
      window.katapultCompanyInfo.companyId = match[1];
      console.log(`[Cloneable Extension] Detected company: ${match[1]}`);
    }
  }
}

extractCompanyInfo();

let reconstructionTimer = null;
let requestCounter = 100; // Start from 100 to avoid conflicts

console.log('[Cloneable Extension] Enhanced WebSocket interceptor loading...');

const originalWebSocket = window.WebSocket;
window.WebSocket = function(url, protocols) {
  console.log('[Cloneable Extension] WebSocket created:', url);
  
  const ws = new originalWebSocket(url, protocols);
  
  // Track authentication status
  let isAuthenticated = false;
  
  // Intercept send to detect authentication
  const originalSend = ws.send;
  ws.send = function(data) {
    console.log('[Cloneable Extension] WebSocket send:', data);
    
    try {
      const parsed = JSON.parse(data);
      
      // Check if this is an auth message
      if (parsed.d?.a === 'auth' || parsed.d?.a === 's') {
        isAuthenticated = true;
        
        // After authentication, request company-specific attributes
        setTimeout(() => {
          if (window.katapultCompanyInfo.companyId) {
            // Request company-specific attributes
            const companyAttributesRequest = {
              "t": "d",
              "d": {
                "r": requestCounter++,
                "a": "q",
                "b": {
                  "p": `/photoheight/company_space/${window.katapultCompanyInfo.companyId}/models/attributes`,
                  "h": ""
                }
              }
            };
            
            console.log('[Cloneable Extension] 🎯 Requesting company-specific attributes:', companyAttributesRequest.d.b.p);
            originalSend.call(this, JSON.stringify(companyAttributesRequest));
            
            // Also try the model-specific path
            const modelPath = window.location.hash.substring(1);
            if (modelPath) {
              const modelAttributesRequest = {
                "t": "d",
                "d": {
                  "r": requestCounter++,
                  "a": "q",
                  "b": {
                    "p": `/photoheight/company_space/${modelPath}/models/attributes`,
                    "h": ""
                  }
                }
              };
              
              console.log('[Cloneable Extension] 🎯 Requesting model-specific attributes:', modelAttributesRequest.d.b.p);
              originalSend.call(this, JSON.stringify(modelAttributesRequest));
            }
          }
        }, 2000); // Wait 2 seconds after auth
      }
    } catch (e) {}
    
    return originalSend.call(this, data);
  };
  
  // Intercept messages
  ws.addEventListener('message', function(event) {
    const messageIndex = window.katapultWebSocketMessages.length;
    const dataStr = event.data.toString();
    
    const messageObj = {
      timestamp: new Date().toISOString(),
      type: 'received',
      raw: event.data,
      messageIndex
    };
    
    window.katapultWebSocketMessages.push(messageObj);
    
    // Try to parse and process
    try {
      const parsed = JSON.parse(event.data);
      messageObj.data = parsed;
      
      // Check for attributes in various locations
      if (parsed.d?.b?.p && parsed.d?.b?.d) {
        const path = parsed.d.b.p;
        const data = parsed.d.b.d;
        
        // Enhanced attribute detection
        if (path.includes('attributes') || 
            path.includes('attribute_groups') ||
            path.includes('picklists')) {
          
          console.log(`[Cloneable Extension] 🎯 ATTRIBUTES-RELATED DATA found at ${path}!`);
          console.log(`[Cloneable Extension] Keys:`, Object.keys(data));
          
          // Store as attributes regardless of exact path
          window.katapultReconstructedAttributes = data;
          window.katapultModelAttributesData[path] = data;
          
          // Process the data
          processAttributesData(data);
        }
        
        // Also check for model data that might contain attributes
        if (path.includes('input_models') && data) {
          console.log(`[Cloneable Extension] 📊 Checking input_models for embedded attributes...`);
          
          // Look for attributes in model data
          Object.values(data).forEach(model => {
            if (model.attributes) {
              console.log(`[Cloneable Extension] 🎯 Found embedded attributes in model!`);
              window.katapultReconstructedAttributes = model.attributes;
              processAttributesData(model.attributes);
            }
          });
        }
      }
      
    } catch (e) {
      console.log(`[Cloneable Extension] 📦 Fragment or non-JSON message`);
    }
    
    // Schedule reconstruction
    if (reconstructionTimer) {
      clearTimeout(reconstructionTimer);
    }
    reconstructionTimer = setTimeout(() => {
      if (window.katapultWebSocketMessages.length > 0) {
        console.log('[Cloneable Extension] Triggering reconstruction with', window.katapultWebSocketMessages.length, 'messages');
        performEnhancedReconstruction();
      }
    }, 3000);
  });
  
  return ws;
};

// Copy static properties
Object.setPrototypeOf(window.WebSocket, originalWebSocket);
for (const key in originalWebSocket) {
  if (originalWebSocket.hasOwnProperty(key)) {
    window.WebSocket[key] = originalWebSocket[key];
  }
}

function processAttributesData(data) {
  console.log('[Cloneable Extension] Processing attributes data...');
  
  // Extract node types
  const nodeTypes = [];
  const connectionTypes = [];
  
  Object.entries(data).forEach(([key, attr]) => {
    if (attr.name === 'node_type' || attr.name === 'node_sub_type') {
      if (attr.picklists) {
        Object.values(attr.picklists).forEach(item => {
          if (item.value) nodeTypes.push(item.value);
        });
      }
    }
    
    if (attr.name === 'cable_type' || attr.name === 'connection_type') {
      if (attr.picklists) {
        Object.values(attr.picklists).forEach(item => {
          if (item.value) connectionTypes.push(item.value);
        });
      }
    }
  });
  
  window.katapultProcessedNodeTypes = nodeTypes;
  window.katapultProcessedConnectionTypes = connectionTypes;
  
  console.log(`[Cloneable Extension] Processed ${nodeTypes.length} node types, ${connectionTypes.length} connection types`);
}

function performEnhancedReconstruction() {
  console.log('[Cloneable Extension] 🔧 Enhanced reconstruction starting...');
  
  const messages = window.katapultWebSocketMessages || [];
  const dataByPath = {};
  
  messages.forEach((messageObj) => {
    if (messageObj.data?.d?.b?.p && messageObj.data?.d?.b?.d) {
      const path = messageObj.data.d.b.p;
      dataByPath[path] = messageObj.data.d.b.d;
    }
  });
  
  console.log('[Cloneable Extension] Found data for paths:', Object.keys(dataByPath));
  
  // Look for any path containing attributes
  const attributePaths = Object.keys(dataByPath).filter(p => 
    p.includes('attribute') || p.includes('picklist')
  );
  
  if (attributePaths.length > 0) {
    console.log('[Cloneable Extension] ✅ Found attribute paths:', attributePaths);
    
    // Merge all attribute data
    let mergedAttributes = {};
    attributePaths.forEach(path => {
      Object.assign(mergedAttributes, dataByPath[path]);
    });
    
    window.katapultReconstructedAttributes = mergedAttributes;
    processAttributesData(mergedAttributes);
  } else {
    console.log('[Cloneable Extension] ⚠️ No attribute data found, will use fallback');
    
    // Load fallback data
    if (typeof loadFallbackAttributes === 'function') {
      loadFallbackAttributes();
    }
  }
  
  // Send to content script
  window.postMessage({
    type: 'cloneable-reconstructed-data',
    data: {
      nodeTypes: window.katapultProcessedNodeTypes,
      connectionTypes: window.katapultProcessedConnectionTypes,
      attributes: window.katapultReconstructedAttributes,
      modelData: dataByPath
    }
  }, '*');
}

// Function to manually trigger attribute loading
window.debugLoadAttributes = function() {
  console.log('[Cloneable Extension] Manual attribute load triggered');
  performEnhancedReconstruction();
  
  if (Object.keys(window.katapultReconstructedAttributes).length === 0) {
    console.log('[Cloneable Extension] Still no attributes, checking all messages...');
    
    // Deep search through all messages
    window.katapultWebSocketMessages.forEach((msg, idx) => {
      if (msg.raw && msg.raw.includes('attribute')) {
        console.log(`Message ${idx} contains 'attribute':`, msg.raw.substring(0, 200));
      }
    });
  }
  
  return {
    messages: window.katapultWebSocketMessages.length,
    attributes: Object.keys(window.katapultReconstructedAttributes).length,
    nodeTypes: window.katapultProcessedNodeTypes.length,
    connectionTypes: window.katapultProcessedConnectionTypes.length
  };
};

console.log('[Cloneable Extension] Enhanced WebSocket interceptor installed');
console.log('[Cloneable Extension] Debug with: window.debugLoadAttributes()');