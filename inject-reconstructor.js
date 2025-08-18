// WebSocket Message Reconstructor for Chrome Extension
// This reconstructs fragmented Firebase messages into complete JSON

class WebSocketReconstructor {
  constructor() {
    this.fragments = new Map();
    this.completeMessages = [];
    this.reconstructedData = {};
  }

  processMessage(message) {
    const { raw, data } = message;
    
    // Skip heartbeats
    if (!isNaN(raw)) {
      return;
    }

    // If already parsed, it's complete
    if (data) {
      this.completeMessages.push(message);
      return;
    }

    // Check if this is a fragment
    if (this.isFragment(raw)) {
      this.handleFragment(raw);
    } else {
      // Try to parse as complete message
      try {
        const parsed = JSON.parse(raw);
        this.completeMessages.push({
          ...message,
          parsed,
          reconstructed: false
        });
      } catch (e) {
        // Might be start of a new fragment sequence
        this.handleFragment(raw);
      }
    }
  }

  isFragment(raw) {
    const trimmed = raw.trim();
    
    // Check for obvious fragments
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      return true;
    }
    
    if (!trimmed.endsWith('}') && !trimmed.endsWith(']')) {
      return true;
    }

    // Try to parse - if it fails, likely a fragment
    try {
      JSON.parse(trimmed);
      return false;
    } catch (e) {
      return true;
    }
  }

  handleFragment(raw) {
    const key = 'current';
    
    if (!this.fragments.has(key)) {
      this.fragments.set(key, []);
    }

    const fragments = this.fragments.get(key);
    fragments.push(raw);
    
    // Try to reconstruct after each fragment
    this.tryReconstruct(key);
  }

  tryReconstruct(key) {
    const fragments = this.fragments.get(key);
    if (!fragments) return;

    const combined = fragments.join('');
    
    try {
      const parsed = JSON.parse(combined);
      
      // Success! We have a complete message
      this.completeMessages.push({
        raw: combined,
        parsed,
        reconstructed: true,
        fragmentCount: fragments.length
      });

      // Remove from fragments
      this.fragments.delete(key);
      
      console.log(`[Cloneable Reconstructor] Reconstructed message from ${fragments.length} fragments`);
      
      // Check if this contains attributes
      if (parsed.d && parsed.d.b && parsed.d.b.p && parsed.d.b.p.includes('attributes')) {
        console.log('[Cloneable Reconstructor] Found attributes in reconstructed message!');
        this.processAttributesMessage(parsed);
      }
    } catch (e) {
      // Still incomplete, keep collecting
      // Clear if too many fragments
      if (fragments.length > 100) {
        this.fragments.delete(key);
      }
    }
  }

  processAttributesMessage(parsed) {
    // Check different possible paths for the data
    let path = null;
    let data = null;
    
    if (parsed.d && parsed.d.b) {
      path = parsed.d.b.p;
      data = parsed.d.b.d;
    } else if (parsed.b) {
      path = parsed.b.p;
      data = parsed.b.d;
    }
    
    // Log all paths that contain 'attributes' to debug
    if (path && path.includes('attributes')) {
      console.log('[Cloneable Reconstructor] Found attributes path:', path);
      console.log('[Cloneable Reconstructor] Data is null?', data === null);
      console.log('[Cloneable Reconstructor] Data is undefined?', data === undefined);
      if (data && typeof data === 'object') {
        const keys = Object.keys(data);
        console.log('[Cloneable Reconstructor] Data has', keys.length, 'keys');
        if (keys.length > 0 && keys.length < 20) {
          console.log('[Cloneable Reconstructor] Keys:', keys);
        } else if (keys.length >= 20) {
          console.log('[Cloneable Reconstructor] First 10 keys:', keys.slice(0, 10));
          console.log('[Cloneable Reconstructor] Contains node_type?', keys.includes('node_type'));
        }
      }
    }
    
    if (data && path && (path.includes('models/attributes') || path.includes('models') && path.includes('attributes'))) {
      console.log('[Cloneable Reconstructor] Processing attributes from path:', path);
      
      // Store the attributes
      if (!window.katapultReconstructedAttributes) {
        window.katapultReconstructedAttributes = {};
      }
      
      Object.assign(window.katapultReconstructedAttributes, data);
      
      // Check for node_type
      if (data.node_type) {
        console.log('[Cloneable Reconstructor] 🎯 Found node_type!');
        window.katapultNodeTypeData = data.node_type;
        
        if (data.node_type.picklists) {
          console.log('Node type categories:', Object.keys(data.node_type.picklists));
          
          // Process into the format expected by content script
          const nodeTypes = [];
          Object.entries(data.node_type.picklists).forEach(([category, types]) => {
            if (types && typeof types === 'object') {
              Object.values(types).forEach(type => {
                nodeTypes.push({
                  category: category,
                  type: type.value || type
                });
              });
            }
          });
          
          window.katapultProcessedNodeTypes = nodeTypes;
          console.log(`[Cloneable Reconstructor] Processed ${nodeTypes.length} node types`);
        }
      } else {
        console.log('[Cloneable Reconstructor] No node_type in attributes data');
      }
    }
  }

  reconstructAll(messages) {
    console.log(`[Cloneable Reconstructor] Processing ${messages.length} messages`);
    
    messages.forEach(msg => {
      this.processMessage(msg);
    });
    
    // Final attempt on remaining fragments
    this.fragments.forEach((fragments, key) => {
      this.tryReconstruct(key);
    });
    
    console.log(`[Cloneable Reconstructor] Complete messages: ${this.completeMessages.length}`);
    console.log(`[Cloneable Reconstructor] Remaining fragments: ${this.fragments.size}`);
    
    // Now check all complete messages for attributes
    console.log('[Cloneable Reconstructor] Checking complete messages for attributes...');
    this.completeMessages.forEach(msg => {
      if (msg.parsed || msg.data) {
        const data = msg.parsed || msg.data;
        if (data && data.d && data.d.b && data.d.b.p && data.d.b.p.includes('attributes')) {
          console.log('[Cloneable Reconstructor] Found message with attributes path:', data.d.b.p);
          this.processAttributesMessage(data);
        }
      }
    });
    
    return this.completeMessages;
  }
}

// Create global reconstructor instance
window.katapultReconstructor = new WebSocketReconstructor();

// Function to trigger reconstruction
window.reconstructWebSocketData = function() {
  if (window.katapultWebSocketMessages && window.katapultWebSocketMessages.length > 0) {
    console.log('[Cloneable Reconstructor] Starting reconstruction...');
    const result = window.katapultReconstructor.reconstructAll(window.katapultWebSocketMessages);
    console.log('[Cloneable Reconstructor] Reconstruction complete');
    
    // Check if we found node types
    if (window.katapultProcessedNodeTypes && window.katapultProcessedNodeTypes.length > 0) {
      console.log('[Cloneable Reconstructor] Node types available:', window.katapultProcessedNodeTypes.length);
      return window.katapultProcessedNodeTypes;
    }
  }
  return null;
};

console.log('[Cloneable Extension] Reconstructor loaded');