// This script is injected at document_start to capture WebSockets early

// Store WebSocket messages
window.katapultWebSocketMessages = [];
window.katapultWebSockets = [];
window.katapultFragments = new Map(); // Store message fragments for reconstruction
window.katapultModelAttributesData = null; // Store the complete /models/attributes response

// Override WebSocket to intercept messages
const OriginalWebSocket = window.WebSocket;

window.WebSocket = function(...args) {
  console.log('[Cloneable Extension] WebSocket created:', args[0]);
  const ws = new OriginalWebSocket(...args);
  
  // Store reference to all WebSockets
  window.katapultWebSockets.push(ws);
  window.lastWebSocket = ws;
  
  // Intercept incoming messages
  ws.addEventListener('message', function(event) {
    // First, always store the raw message
    const rawMessage = {
      timestamp: new Date().toISOString(),
      type: 'received',
      raw: event.data,
      url: ws.url
    };
    window.katapultWebSocketMessages.push(rawMessage);
    
    // Check if this is a fragmented message that needs reconstruction
    if (typeof event.data === 'string' && !event.data.startsWith('{') && !event.data.startsWith('[')) {
      // This might be a fragment or continuation
      handleFragment(event.data);
      return;
    }
    
    try {
      const data = JSON.parse(event.data);
      const message = {
        timestamp: new Date().toISOString(),
        type: 'received',
        data: data,
        raw: event.data,
        url: ws.url
      };
      
      window.katapultWebSocketMessages.push(message);
      
      // Check for model attributes data dynamically
      if (data && data.t === 'd' && data.d) {
        // Check different response structures
        let path = null;
        let responseData = null;
        
        // Standard query response
        if (data.d.b) {
          path = data.d.b.p;
          responseData = data.d.b.d;
        }
        // Update/set response
        else if (data.d.p) {
          path = data.d.p;
          responseData = data.d.d;
        }
        
        // Log ALL responses to find attributes
        if (path && path.includes('attributes')) {
          console.log(`[Cloneable Extension] Attributes-related response for path: ${path}`);
          console.log('  Response is null?', responseData === null);
          console.log('  Response is undefined?', responseData === undefined);
          if (responseData && typeof responseData === 'object') {
            const keys = Object.keys(responseData);
            console.log(`  Has ${keys.length} keys`);
            if (keys.length > 0) {
              console.log(`  First 5 keys: ${keys.slice(0, 5).join(', ')}`);
            }
            if (keys.includes('node_type')) {
              console.log('  🎯 HAS node_type!');
            }
          }
        }
        
        // Check if this is the MODEL attributes path (including company-specific paths)
        // Note: path may not have leading slash in response
        if (path && (path === '/models/attributes' || 
                     path === 'models/attributes' ||
                     path.includes('/models/attributes') ||
                     path.includes('models/attributes') ||
                     (path.includes('company_space') && path.includes('models/attributes')))) {
          console.log('[Cloneable Extension] ⚡ FOUND ATTRIBUTES RESPONSE!');
          console.log('Path:', path);
          console.log('Response data:', responseData);
          
          if (responseData) {
            console.log('Data keys:', Object.keys(responseData));
            
            // Store MODEL attributes
            window.katapultModelAttributesData = responseData;
            
            // Also store in the schema format
            if (!window.katapultModelSchemaAttributes) {
              window.katapultModelSchemaAttributes = {};
            }
            
            // Merge the new MODEL attributes
            Object.assign(window.katapultModelSchemaAttributes, responseData);
            
            // Store this message in the history
            window.katapultModelAttributeMessages = window.katapultModelAttributeMessages || [];
            window.katapultModelAttributeMessages.push({
              timestamp: new Date().toISOString(),
              path: path,
              attributes: responseData,
              fullData: data
            });
            
            // Log a summary
            const totalAttributeNames = Object.keys(window.katapultModelSchemaAttributes);
            console.log(`[Cloneable Extension] Total MODEL attributes collected: ${totalAttributeNames.length}`);
            console.log('Attribute names:', totalAttributeNames.slice(0, 10), '...'); // Show first 10
            
            // Check if we have node_type now
            if (window.katapultModelSchemaAttributes.node_type) {
              console.log('[Cloneable Extension] 🎯 node_type attribute FOUND!');
              const nodeType = window.katapultModelSchemaAttributes.node_type;
              console.log('node_type structure:', nodeType);
              if (nodeType.picklists) {
                console.log('Node type categories:', Object.keys(nodeType.picklists));
                // Log sample data from each category
                Object.entries(nodeType.picklists).forEach(([cat, types]) => {
                  const typeCount = types ? Object.keys(types).length : 0;
                  console.log(`  ${cat}: ${typeCount} types`);
                });
              }
            } else {
              console.log('[Cloneable Extension] ⚠️ No node_type in attributes. Available attributes with "node":', totalAttributeNames.filter(n => n.includes('node')));
            }
          } else {
            console.log('[Cloneable Extension] Response is null/undefined for /models/attributes');
          }
        } else if (path && (path.includes('/models/') || path.includes('attributes'))) {
          // Log other model-related paths
          console.log('[Cloneable Extension] Found model-related path:', path);
          if (responseData && Object.keys(responseData).length > 0) {
            console.log('  Contains data:', Object.keys(responseData).slice(0, 5), '...');
          }
        } else if (path) {
          // This is some other data (user settings, company data, etc.)
          console.log('[Cloneable Extension] Found other data at path:', path);
          
          // Still store it but separately
          if (!window.katapultOtherAttributes) {
            window.katapultOtherAttributes = {};
          }
          if (responseData) {
            Object.assign(window.katapultOtherAttributes, responseData);
          }
        }
        
        // Store ALL messages in the general history
        window.katapultModelAttributes = window.katapultModelAttributes || [];
        window.katapultModelAttributes.push({
          timestamp: new Date().toISOString(),
          path: path,
          attributes: data.d.b.d,
          fullData: data
        });
      }
      
      // Log messages that might contain model data
      if (event.data.includes('model') || 
          event.data.includes('attributes') || 
          event.data.includes('schema') ||
          event.data.includes('cloneable')) {
        console.log('[Cloneable Extension] Potential model data:', data);
      }
    } catch (e) {
      // Not JSON, store raw
      window.katapultWebSocketMessages.push({
        timestamp: new Date().toISOString(),
        type: 'received',
        raw: event.data,
        url: ws.url
      });
    }
  });
  
  // Intercept outgoing messages
  const originalSend = ws.send;
  ws.send = function(data) {
    window.katapultWebSocketMessages.push({
      timestamp: new Date().toISOString(),
      type: 'sent',
      raw: data,
      url: ws.url
    });
    console.log('[Cloneable Extension] WebSocket send:', data);
    return originalSend.call(this, data);
  };
  
  return ws;
};

// Function to handle message fragments
function handleFragment(data) {
  // Simple fragment handling - you may need to adjust based on actual protocol
  const fragmentKey = 'current';
  
  if (!window.katapultFragments.has(fragmentKey)) {
    window.katapultFragments.set(fragmentKey, []);
  }
  
  const fragments = window.katapultFragments.get(fragmentKey);
  fragments.push(data);
  
  // Try to parse combined fragments
  const combined = fragments.join('');
  try {
    const parsed = JSON.parse(combined);
    console.log('[Cloneable Extension] Successfully reconstructed fragmented message');
    
    // Process the reconstructed message
    if (parsed && parsed.d && parsed.d.b && parsed.d.b.p === '/models/attributes') {
      console.log('[Cloneable Extension] 🎉 Reconstructed /models/attributes data!');
      window.katapultModelAttributesData = parsed.d.b.d;
      window.katapultModelSchemaAttributes = parsed.d.b.d;
    }
    
    // Clear fragments after successful parse
    window.katapultFragments.delete(fragmentKey);
  } catch (e) {
    // Not complete yet, keep collecting
    if (fragments.length > 100) {
      // Safety: clear if too many fragments
      console.log('[Cloneable Extension] Clearing fragment buffer (too many fragments)');
      window.katapultFragments.delete(fragmentKey);
    }
  }
}

// Copy static properties
Object.setPrototypeOf(window.WebSocket, OriginalWebSocket);
Object.setPrototypeOf(window.WebSocket.prototype, OriginalWebSocket.prototype);

console.log('[Cloneable Extension] WebSocket interceptor installed');

// Listen for messages from content script
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'cloneable-get-websocket-data') {
    // Send back the WebSocket data
    window.postMessage({
      type: 'cloneable-websocket-data',
      messages: window.katapultWebSocketMessages || [],
      socketCount: window.katapultWebSockets ? window.katapultWebSockets.length : 0
    }, '*');
  }
  
  if (event.data && event.data.type === 'cloneable-get-model-attributes') {
    // First try to reconstruct any fragmented messages
    let nodeTypes = null;
    if (window.reconstructWebSocketData) {
      console.log('[Cloneable Extension] Attempting to reconstruct WebSocket data...');
      nodeTypes = window.reconstructWebSocketData();
    }
    
    // Use fallback data if reconstruction didn't find node types
    if (!nodeTypes && window.fallbackNodeTypes) {
      console.log('[Cloneable Extension] Using fallback node types data');
      nodeTypes = window.fallbackNodeTypes;
    }
    
    // Send back the model attributes data - prioritize reconstructed data
    window.postMessage({
      type: 'cloneable-model-attributes',
      nodeTypes: nodeTypes || window.katapultProcessedNodeTypes || window.fallbackNodeTypes || null,
      modelAttributes: window.katapultModelAttributeMessages || window.katapultModelAttributes || [],
      latestAttributes: window.katapultReconstructedAttributes || window.katapultModelSchemaAttributes || window.katapultOtherAttributes || null,
      combinedAttributes: window.katapultReconstructedAttributes || window.katapultModelSchemaAttributes || null,
      otherAttributes: window.katapultOtherAttributes || null
    }, '*');
    
    // Also log current state for debugging
    console.log('[Cloneable Extension] Model attributes requested:');
    if (nodeTypes) {
      console.log('🎯 Reconstructed node types available:', nodeTypes.length);
    }
    if (window.katapultReconstructedAttributes) {
      console.log('Reconstructed attributes available:', Object.keys(window.katapultReconstructedAttributes).length + ' attributes');
      if (window.katapultReconstructedAttributes.node_type) {
        console.log('node_type attribute found in reconstructed data!');
      }
    } else if (window.katapultModelSchemaAttributes) {
      console.log('MODEL schema attributes available:', Object.keys(window.katapultModelSchemaAttributes).length + ' attributes');
      if (window.katapultModelSchemaAttributes.node_type) {
        console.log('node_type attribute found in MODEL schema!');
      }
    } else {
      console.log('No MODEL schema attributes found yet');
    }
    
    if (window.katapultOtherAttributes) {
      console.log('Other attributes available:', Object.keys(window.katapultOtherAttributes).length + ' attributes');
    }
  }
  
  if (event.data && event.data.type === 'cloneable-log-websocket-data') {
    // Log all WebSocket messages
    console.log('\n=== ALL WEBSOCKET MESSAGES (FULL JSON) ===');
    console.log('Total WebSocket messages captured:', window.katapultWebSocketMessages ? window.katapultWebSocketMessages.length : 0);
    
    if (window.katapultWebSocketMessages && window.katapultWebSocketMessages.length > 0) {
      const receivedMessages = window.katapultWebSocketMessages.filter(msg => msg.type === 'received');
      const sentMessages = window.katapultWebSocketMessages.filter(msg => msg.type === 'sent');
      
      console.log(`\n=== ALL SENT MESSAGES (${sentMessages.length} total) ===\n`);
      
      sentMessages.forEach((msg, index) => {
        console.log(`\n========== SENT MESSAGE ${index + 1} ==========`);
        console.log('Timestamp:', msg.timestamp);
        console.log('URL:', msg.url);
        console.log('Full JSON:');
        try {
          const parsed = JSON.parse(msg.raw);
          console.log(JSON.stringify(parsed, null, 2));
        } catch (e) {
          console.log('Raw data:', msg.raw);
        }
        console.log('========== END SENT MESSAGE ==========\n');
      });
      
      console.log(`\n=== ALL RECEIVED MESSAGES (${receivedMessages.length} total) ===\n`);
      
      receivedMessages.forEach((msg, index) => {
        console.log(`\n========== RECEIVED MESSAGE ${index + 1} ==========`);
        console.log('Timestamp:', msg.timestamp);
        console.log('URL:', msg.url);
        console.log('Full JSON (copy and paste into JSON viewer):');
        if (msg.data) {
          console.log(JSON.stringify(msg.data, null, 2));
        } else {
          try {
            const parsed = JSON.parse(msg.raw);
            console.log(JSON.stringify(parsed, null, 2));
          } catch (e) {
            console.log('Raw data:', msg.raw);
          }
        }
        console.log('========== END RECEIVED MESSAGE ==========\n');
      });
      
      // Analyze ALL messages for node data
      console.log('\n=== ANALYZING ALL MESSAGES FOR NODE DATA ===');
      const nodeKeywords = ['node', 'nodes', 'vertex', 'vertices', 'edge', 'edges', 'graph', 'connection', 'link', 'parent', 'child', 'tree', 'attributes', 'model'];
      
      window.katapultWebSocketMessages.forEach((msg, msgIndex) => {
        const msgStr = JSON.stringify(msg.data || msg.raw).toLowerCase();
        const foundKeywords = nodeKeywords.filter(keyword => msgStr.includes(keyword));
        
        if (foundKeywords.length > 0) {
          console.log(`\n${msg.type.toUpperCase()} Message ${msgIndex + 1} contains keywords: ${foundKeywords.join(', ')}`);
          
          try {
            const data = msg.data || JSON.parse(msg.raw);
            
            // Look for paths in the data structure
            const possibleNodePaths = ['nodes', 'data.nodes', 'graph.nodes', 'vertices', 'elements.nodes', 'd', 'b', 'p'];
            
            possibleNodePaths.forEach(path => {
              const parts = path.split('.');
              let current = data;
              
              for (let part of parts) {
                if (current && current[part]) {
                  current = current[part];
                } else {
                  current = null;
                  break;
                }
              }
              
              if (current) {
                console.log(`Found at path "${path}":`);
                console.log(JSON.stringify(current, null, 2));
              }
            });
            
            // Also log the full message if it looks important
            if (msgStr.includes('attributes') || msgStr.includes('cloneable')) {
              console.log('Full important message:');
              console.log(JSON.stringify(data, null, 2));
            }
          } catch (e) {
            console.log('Could not parse message data');
          }
        }
      });
    } else {
      console.log('No WebSocket messages captured. The page may need to be refreshed after the extension is loaded.');
    }
  }
});