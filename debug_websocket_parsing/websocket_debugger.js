const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

class WebSocketDebugger {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.websocketMessages = [];
    this.fragmentBuffer = new Map();
    this.sessionDataPath = path.join(__dirname, 'session_data');
    this.logsPath = path.join(__dirname, 'logs');
  }

  async init() {
    console.log('🚀 Initializing WebSocket Debugger...');
    
    // Create directories
    await fs.mkdir(this.sessionDataPath, { recursive: true });
    await fs.mkdir(this.logsPath, { recursive: true });

    // Launch browser with persistent context
    this.browser = await chromium.launchPersistentContext(this.sessionDataPath, {
      headless: false,
      devtools: true,
      viewport: { width: 1920, height: 1080 },
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage'
      ]
    });

    this.page = await this.browser.newPage();
    
    // Set up WebSocket interception
    await this.setupWebSocketInterception();
    
    console.log('✅ Browser initialized with persistent session');
  }

  async setupWebSocketInterception() {
    // Inject WebSocket interceptor before page navigation
    await this.page.addInitScript(() => {
      console.log('[DEBUGGER] Injecting WebSocket interceptor...');
      
      window.__debuggerMessages = [];
      window.__debuggerFragments = new Map();
      window.__debuggerReconstructed = {};
      
      const OriginalWebSocket = window.WebSocket;
      
      window.WebSocket = new Proxy(OriginalWebSocket, {
        construct(target, args) {
          const [url, protocols] = args;
          console.log('[DEBUGGER] WebSocket created:', url);
          
          const ws = new target(url, protocols);
          
          // Track all events
          const events = ['open', 'message', 'error', 'close'];
          events.forEach(eventType => {
            ws.addEventListener(eventType, (event) => {
              if (eventType === 'message') {
                const messageData = {
                  timestamp: new Date().toISOString(),
                  type: 'received',
                  size: event.data.length,
                  raw: event.data,
                  url: url
                };
                
                // Try to parse as JSON
                try {
                  const parsed = JSON.parse(event.data);
                  messageData.parsed = parsed;
                  messageData.isJson = true;
                  
                  // Check for fragmentation indicators
                  if (parsed.s !== undefined && parsed.e !== undefined) {
                    messageData.isFragment = true;
                    messageData.fragmentInfo = {
                      start: parsed.s,
                      end: parsed.e,
                      hasMore: parsed.m
                    };
                  }
                } catch (e) {
                  messageData.isJson = false;
                  messageData.parseError = e.message;
                  
                  // Check if it looks like a fragment
                  if (event.data.length > 1000 && !event.data.startsWith('{')) {
                    messageData.possibleFragment = true;
                  }
                }
                
                window.__debuggerMessages.push(messageData);
                
                // Post to window for external capture
                window.postMessage({
                  type: 'DEBUGGER_WS_MESSAGE',
                  data: messageData
                }, '*');
              } else {
                console.log(`[DEBUGGER] WebSocket ${eventType}:`, event);
              }
            });
          });
          
          // Intercept send method
          const originalSend = ws.send.bind(ws);
          ws.send = function(data) {
            console.log('[DEBUGGER] WebSocket send:', data);
            window.__debuggerMessages.push({
              timestamp: new Date().toISOString(),
              type: 'sent',
              raw: data,
              size: data.length
            });
            return originalSend(data);
          };
          
          return ws;
        }
      });
      
      console.log('[DEBUGGER] WebSocket interceptor installed');
    });

    // Listen for messages from the page
    await this.page.exposeFunction('captureWebSocketMessage', async (message) => {
      this.websocketMessages.push(message);
      await this.analyzeMessage(message);
    });

    await this.page.evaluate(() => {
      window.addEventListener('message', (event) => {
        if (event.data.type === 'DEBUGGER_WS_MESSAGE') {
          window.captureWebSocketMessage(event.data.data);
        }
      });
    });
  }

  async analyzeMessage(message) {
    const timestamp = new Date().toISOString();
    
    // Log raw message
    const rawLogPath = path.join(this.logsPath, `raw_${timestamp.replace(/[:.]/g, '-')}.json`);
    await fs.writeFile(rawLogPath, JSON.stringify(message, null, 2));
    
    // Analyze fragmentation
    if (message.isFragment || message.possibleFragment) {
      console.log(`⚠️ Fragment detected: ${message.size} bytes`);
      
      if (message.fragmentInfo) {
        const key = `${message.fragmentInfo.start}-${message.fragmentInfo.end}`;
        this.fragmentBuffer.set(key, message);
        
        // Try to reconstruct if we have enough fragments
        await this.attemptReconstruction();
      }
    }
    
    // Check for Firebase paths
    if (message.parsed?.d?.b?.p) {
      const path = message.parsed.d.b.p;
      console.log(`📍 Firebase path detected: ${path}`);
      
      if (path.includes('models/attributes')) {
        console.log('🎯 ATTRIBUTES DATA FOUND!');
        await this.saveAttributesData(message.parsed.d.b.d);
      }
    }
  }

  async attemptReconstruction() {
    console.log('🔧 Attempting fragment reconstruction...');
    
    const fragments = Array.from(this.fragmentBuffer.values())
      .sort((a, b) => a.fragmentInfo.start - b.fragmentInfo.start);
    
    if (fragments.length > 0) {
      let reconstructed = '';
      let lastEnd = -1;
      
      for (const fragment of fragments) {
        if (fragment.fragmentInfo.start === lastEnd + 1) {
          reconstructed += fragment.raw;
          lastEnd = fragment.fragmentInfo.end;
          
          if (!fragment.fragmentInfo.hasMore) {
            // Complete message reconstructed
            try {
              const parsed = JSON.parse(reconstructed);
              console.log('✅ Successfully reconstructed message!');
              
              const reconstructedPath = path.join(this.logsPath, `reconstructed_${Date.now()}.json`);
              await fs.writeFile(reconstructedPath, JSON.stringify(parsed, null, 2));
              
              // Clear fragment buffer
              this.fragmentBuffer.clear();
              
              // Analyze reconstructed data
              await this.analyzeReconstructedData(parsed);
            } catch (e) {
              console.error('❌ Reconstruction parse error:', e.message);
            }
          }
        }
      }
    }
  }

  async analyzeReconstructedData(data) {
    // Deep search for attributes
    const findAttributes = (obj, path = '') => {
      if (!obj || typeof obj !== 'object') return;
      
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;
        
        if (key === 'attributes' || currentPath.includes('attributes')) {
          console.log(`📊 Found attributes at: ${currentPath}`);
          this.saveAttributesData(value);
        }
        
        if (typeof value === 'object' && value !== null) {
          findAttributes(value, currentPath);
        }
      }
    };
    
    findAttributes(data);
  }

  async saveAttributesData(data) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const attributesPath = path.join(this.logsPath, `attributes_${timestamp}.json`);
    await fs.writeFile(attributesPath, JSON.stringify(data, null, 2));
    console.log(`💾 Saved attributes data to: ${attributesPath}`);
  }

  async navigateToTarget(url) {
    console.log(`🌐 Navigating to: ${url}`);
    
    try {
      await this.page.goto(url, { 
        waitUntil: 'networkidle',
        timeout: 60000 
      });
      
      console.log('✅ Page loaded');
      
      // Wait for WebSocket connections
      await this.page.waitForTimeout(5000);
      
      // Check if we need to login
      const needsLogin = await this.page.evaluate(() => {
        return window.location.href.includes('login') || 
               document.querySelector('input[type="password"]') !== null;
      });
      
      if (needsLogin) {
        console.log('🔐 Login required - please login manually');
        console.log('After logging in, press Enter to continue...');
        
        // Wait for user to complete login
        await this.page.waitForURL('**/model-editor/**', { timeout: 300000 });
        console.log('✅ Login successful');
      }
      
    } catch (error) {
      console.error('❌ Navigation error:', error);
    }
  }

  async startRecording() {
    console.log('📹 Starting WebSocket recording...');
    
    // Clear previous messages
    this.websocketMessages = [];
    this.fragmentBuffer.clear();
    
    // Record for specified duration
    const duration = 30000; // 30 seconds
    console.log(`Recording for ${duration/1000} seconds...`);
    
    await this.page.waitForTimeout(duration);
    
    console.log(`📊 Captured ${this.websocketMessages.length} WebSocket messages`);
    
    // Save all messages
    const allMessagesPath = path.join(this.logsPath, `all_messages_${Date.now()}.json`);
    await fs.writeFile(allMessagesPath, JSON.stringify(this.websocketMessages, null, 2));
    console.log(`💾 Saved all messages to: ${allMessagesPath}`);
    
    // Generate report
    await this.generateReport();
  }

  async generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      totalMessages: this.websocketMessages.length,
      messageTypes: {},
      fragmentsDetected: 0,
      parseErrors: 0,
      attributesFound: false,
      paths: new Set(),
      largestMessage: 0,
      issues: []
    };
    
    for (const msg of this.websocketMessages) {
      // Count message types
      report.messageTypes[msg.type] = (report.messageTypes[msg.type] || 0) + 1;
      
      // Track fragments
      if (msg.isFragment || msg.possibleFragment) {
        report.fragmentsDetected++;
      }
      
      // Track parse errors
      if (msg.parseError) {
        report.parseErrors++;
        report.issues.push({
          timestamp: msg.timestamp,
          error: msg.parseError,
          size: msg.size
        });
      }
      
      // Track paths
      if (msg.parsed?.d?.b?.p) {
        report.paths.add(msg.parsed.d.b.p);
        if (msg.parsed.d.b.p.includes('attributes')) {
          report.attributesFound = true;
        }
      }
      
      // Track largest message
      if (msg.size > report.largestMessage) {
        report.largestMessage = msg.size;
      }
    }
    
    report.paths = Array.from(report.paths);
    
    const reportPath = path.join(this.logsPath, `report_${Date.now()}.json`);
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    console.log('\n📋 REPORT SUMMARY:');
    console.log(`Total Messages: ${report.totalMessages}`);
    console.log(`Fragments: ${report.fragmentsDetected}`);
    console.log(`Parse Errors: ${report.parseErrors}`);
    console.log(`Attributes Found: ${report.attributesFound}`);
    console.log(`Largest Message: ${report.largestMessage} bytes`);
    console.log(`Unique Paths: ${report.paths.length}`);
    
    if (report.issues.length > 0) {
      console.log('\n⚠️ ISSUES DETECTED:');
      report.issues.slice(0, 5).forEach(issue => {
        console.log(`  - ${issue.error} (${issue.size} bytes)`);
      });
    }
    
    return report;
  }

  async runFullDebug(url) {
    await this.init();
    await this.navigateToTarget(url);
    await this.startRecording();
    
    // Try manual reconstruction
    console.log('\n🔍 Attempting manual reconstruction...');
    await this.performManualReconstruction();
  }

  async performManualReconstruction() {
    // Get all messages from the page
    const pageMessages = await this.page.evaluate(() => {
      return window.__debuggerMessages || [];
    });
    
    console.log(`Found ${pageMessages.length} messages in page context`);
    
    // Group potential fragments
    const potentialFragments = pageMessages.filter(m => 
      !m.isJson || m.possibleFragment || m.size > 10000
    );
    
    if (potentialFragments.length > 0) {
      console.log(`🧩 Found ${potentialFragments.length} potential fragments`);
      
      // Try to concatenate and parse
      let concatenated = '';
      for (const fragment of potentialFragments) {
        concatenated += fragment.raw;
      }
      
      // Try different parsing strategies
      const strategies = [
        // Strategy 1: Direct parse
        () => JSON.parse(concatenated),
        
        // Strategy 2: Find JSON boundaries
        () => {
          const jsonStart = concatenated.indexOf('{');
          const jsonEnd = concatenated.lastIndexOf('}') + 1;
          if (jsonStart >= 0 && jsonEnd > jsonStart) {
            return JSON.parse(concatenated.substring(jsonStart, jsonEnd));
          }
          throw new Error('No JSON boundaries found');
        },
        
        // Strategy 3: Split by newlines and parse each
        () => {
          const lines = concatenated.split('\n');
          const parsed = [];
          for (const line of lines) {
            if (line.trim()) {
              try {
                parsed.push(JSON.parse(line));
              } catch (e) {
                // Skip non-JSON lines
              }
            }
          }
          return parsed;
        }
      ];
      
      for (let i = 0; i < strategies.length; i++) {
        try {
          console.log(`Trying strategy ${i + 1}...`);
          const result = strategies[i]();
          
          const strategyPath = path.join(this.logsPath, `strategy_${i + 1}_success.json`);
          await fs.writeFile(strategyPath, JSON.stringify(result, null, 2));
          
          console.log(`✅ Strategy ${i + 1} successful!`);
          break;
        } catch (e) {
          console.log(`❌ Strategy ${i + 1} failed: ${e.message}`);
        }
      }
    }
  }

  async cleanup() {
    if (this.browser) {
      // Don't close to maintain session
      console.log('Browser kept open to maintain session');
    }
  }
}

// Main execution
async function main() {
  const debugger = new WebSocketDebugger();
  const targetUrl = 'https://katapultpro.com/model-editor/#cloneable.ai_squan_Squan_O-Calc/attributes';
  
  try {
    await debugger.runFullDebug(targetUrl);
    
    console.log('\n✅ Debug session complete');
    console.log('Check the logs folder for detailed analysis');
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

// Run the debugger
main().catch(console.error);