// WebSocket Message Reconstructor for Chrome Extension
// This reconstructs fragmented Firebase messages into complete JSON

class WebSocketReconstructor {
  constructor() {
    this.fragments = [];
    this.completeMessages = [];
  }

  processMessage(message) {
    const { raw, data } = message;

    if (!isNaN(raw)) {
      return; // Skip heartbeats
    }

    if (data) {
      this.completeMessages.push(message);
      return;
    }

    this.handleFragment(raw);
  }

  handleFragment(raw) {
    this.fragments.push(raw);
    this.tryReconstruct();
  }

  tryReconstruct() {
    if (this.fragments.length === 0) {
      return;
    }

    let combined = this.fragments.join('');
    let jsonStart = combined.indexOf('{');

    if (jsonStart === -1) {
      // No opening brace found, so we can't have a complete JSON object yet.
      return;
    }

    // Start the potential JSON from the first opening brace
    let potentialJson = combined.substring(jsonStart);

    try {
      const sanitizedJson = potentialJson.replace(/\|/g, ' ').replace(/\(/g, ' ').replace(/\)/g, ' ');
      const parsed = JSON.parse(sanitizedJson);
      // If parsing succeeds, we have a complete message.
      this.completeMessages.push({
        raw: potentialJson,
        parsed,
        reconstructed: true,
        fragmentCount: this.fragments.length,
      });

      // Clear the fragments buffer as we've successfully parsed a message.
      this.fragments = [];

      if (parsed.d && parsed.d.b && parsed.d.b.p && parsed.d.b.p.includes('attributes')) {
        this.processAttributesMessage(parsed);
      }
    } catch (e) {
      // JSON is not yet complete, keep the fragments and wait for more.
      // Optional: Add a check to prevent the buffer from growing indefinitely
      if (this.fragments.length > 500) { // Increased limit
        this.fragments.shift(); // Remove the oldest fragment
      }
    }
  }

  processAttributesMessage(parsed) {
    let path = null;
    let data = null;

    if (parsed.d && parsed.d.b) {
      path = parsed.d.b.p;
      data = parsed.d.b.d;
    } else if (parsed.b) {
      path = parsed.b.p;
      data = parsed.b.d;
    }

    if (data && path && (path.includes('models/attributes') || path.includes('models') && path.includes('attributes'))) {
      if (!window.katapultReconstructedAttributes) {
        window.katapultReconstructedAttributes = {};
      }
      Object.assign(window.katapultReconstructedAttributes, data);

      if (data.node_type && data.node_type.picklists) {
        const nodeTypes = [];
        Object.entries(data.node_type.picklists).forEach(([category, types]) => {
          if (types && typeof types === 'object') {
            Object.values(types).forEach(type => {
              nodeTypes.push({
                category: category,
                type: type.value || type,
              });
            });
          }
        });
        window.katapultProcessedNodeTypes = nodeTypes;
      }
    }
  }

  reconstructAll(messages) {
    messages.forEach(msg => {
      this.processMessage(msg);
    });

    this.completeMessages.forEach(msg => {
      if (msg.parsed || msg.data) {
        const data = msg.parsed || msg.data;
        if (data && data.d && data.d.b && data.d.b.p && data.d.b.p.includes('attributes')) {
          this.processAttributesMessage(data);
        }
      }
    });

    return this.completeMessages;
  }
}

window.katapultReconstructor = new WebSocketReconstructor();

window.reconstructWebSocketData = function() {
  if (window.katapultWebSocketMessages && window.katapultWebSocketMessages.length > 0) {
    const result = window.katapultReconstructor.reconstructAll(window.katapultWebSocketMessages);
    if (window.katapultProcessedNodeTypes && window.katapultProcessedNodeTypes.length > 0) {
      return window.katapultProcessedNodeTypes;
    }
  }
  return null;
};

console.log('[Cloneable Extension] Reconstructor loaded');