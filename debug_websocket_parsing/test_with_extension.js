const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

class ExtensionTester {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.extensionPath = path.join(__dirname, '..');
    this.sessionDataPath = path.join(__dirname, 'session_data_extension');
    this.logsPath = path.join(__dirname, 'logs_extension');
  }

  async init() {
    console.log('🚀 Initializing Extension Tester...');
    
    // Create directories
    await fs.mkdir(this.sessionDataPath, { recursive: true });
    await fs.mkdir(this.logsPath, { recursive: true });

    // Launch browser with extension
    this.context = await chromium.launchPersistentContext(this.sessionDataPath, {
      headless: false,
      devtools: true,
      viewport: { width: 1920, height: 1080 },
      args: [
        `--disable-extensions-except=${this.extensionPath}`,
        `--load-extension=${this.extensionPath}`,
        '--disable-blink-features=AutomationControlled'
      ]
    });

    this.page = await this.context.newPage();
    
    // Set up console logging
    this.page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      
      if (text.includes('[Cloneable Extension]') || 
          text.includes('[ImportInterface]') ||
          text.includes('WebSocket')) {
        console.log(`[${type.toUpperCase()}] ${text}`);
      }
    });

    this.page.on('pageerror', error => {
      console.error('Page error:', error);
    });

    console.log('✅ Browser initialized with extension loaded');
  }

  async navigateAndWait(url) {
    console.log(`🌐 Navigating to: ${url}`);
    
    await this.page.goto(url, { 
      waitUntil: 'networkidle',
      timeout: 60000 
    });
    
    // Check for login
    const needsLogin = await this.page.evaluate(() => {
      return window.location.href.includes('login') || 
             document.querySelector('input[type="password"]') !== null;
    });
    
    if (needsLogin) {
      console.log('🔐 Please login manually...');
      await this.page.waitForURL('**/model-editor/**', { timeout: 300000 });
      console.log('✅ Login successful');
    }
    
    // Wait for WebSocket connections
    console.log('⏳ Waiting for WebSocket connections...');
    await this.page.waitForTimeout(10000);
  }

  async captureExtensionData() {
    console.log('📸 Capturing extension data...');
    
    // Check what the extension has captured
    const extensionData = await this.page.evaluate(() => {
      const data = {
        hasKatapultWebSocketMessages: typeof window.katapultWebSocketMessages !== 'undefined',
        messageCount: window.katapultWebSocketMessages?.length || 0,
        hasReconstructedAttributes: typeof window.katapultReconstructedAttributes !== 'undefined',
        reconstructedKeys: Object.keys(window.katapultReconstructedAttributes || {}),
        hasModelAttributesData: typeof window.katapultModelAttributesData !== 'undefined',
        modelAttributesKeys: Object.keys(window.katapultModelAttributesData || {}),
        processedNodeTypes: window.katapultProcessedNodeTypes || [],
        processedConnectionTypes: window.katapultProcessedConnectionTypes || []
      };
      
      // Try to get actual messages
      if (window.katapultWebSocketMessages) {
        data.sampleMessages = window.katapultWebSocketMessages.slice(0, 5);
        data.messageSizes = window.katapultWebSocketMessages.map(m => {
          if (m.raw) {
            return m.raw.length;
          }
          return 0;
        });
      }
      
      return data;
    });
    
    console.log('📊 Extension Data Summary:');
    console.log(`  Messages captured: ${extensionData.messageCount}`);
    console.log(`  Reconstructed attributes: ${extensionData.reconstructedKeys.length > 0}`);
    console.log(`  Model attributes: ${extensionData.modelAttributesKeys.length > 0}`);
    
    if (extensionData.messageSizes) {
      const totalSize = extensionData.messageSizes.reduce((a, b) => a + b, 0);
      const avgSize = totalSize / extensionData.messageSizes.length;
      const maxSize = Math.max(...extensionData.messageSizes);
      
      console.log(`  Total data size: ${totalSize} bytes`);
      console.log(`  Average message size: ${avgSize.toFixed(0)} bytes`);
      console.log(`  Largest message: ${maxSize} bytes`);
    }
    
    // Save the data
    const timestamp = Date.now();
    const dataPath = path.join(this.logsPath, `extension_data_${timestamp}.json`);
    await fs.writeFile(dataPath, JSON.stringify(extensionData, null, 2));
    
    return extensionData;
  }

  async triggerDump() {
    console.log('🎯 Triggering WebSocket data dump...');
    
    // Click the extension icon and dump button
    try {
      // Send message directly to content script
      await this.page.evaluate(() => {
        window.postMessage({ type: 'DUMP_WEBSOCKET_DATA' }, '*');
      });
      
      await this.page.waitForTimeout(2000);
      
      // Check for downloaded file
      const downloads = await this.page.context().waitForEvent('download', { timeout: 5000 }).catch(() => null);
      if (downloads) {
        const downloadPath = path.join(this.logsPath, 'websocket_dump.json');
        await downloads.saveAs(downloadPath);
        console.log(`✅ WebSocket dump saved to: ${downloadPath}`);
        
        // Analyze the dump
        const dumpContent = await fs.readFile(downloadPath, 'utf-8');
        const dumpData = JSON.parse(dumpContent);
        
        console.log(`📊 Dump Analysis:`);
        console.log(`  Total messages: ${dumpData.messages?.length || 0}`);
        console.log(`  Has reconstructed data: ${!!dumpData.reconstructedAttributes}`);
        console.log(`  Has model attributes: ${!!dumpData.modelAttributes}`);
      }
    } catch (error) {
      console.log('⚠️ Could not trigger dump via extension popup');
    }
  }

  async analyzeParsingIssues() {
    console.log('\n🔍 Analyzing parsing issues...');
    
    // Get all WebSocket messages from the page
    const messages = await this.page.evaluate(() => {
      if (!window.katapultWebSocketMessages) return [];
      
      return window.katapultWebSocketMessages.map(msg => {
        const analysis = {
          timestamp: msg.timestamp,
          type: msg.type,
          size: msg.raw?.length || 0,
          hasData: !!msg.data,
          parseError: null,
          isFragment: false,
          startsWithJSON: false,
          endsWithJSON: false
        };
        
        if (msg.raw) {
          const rawStr = msg.raw.toString();
          analysis.startsWithJSON = rawStr.trim().startsWith('{');
          analysis.endsWithJSON = rawStr.trim().endsWith('}');
          
          // Check if it's a fragment
          if (!analysis.startsWithJSON || !analysis.endsWithJSON) {
            analysis.isFragment = true;
          }
          
          // Try to parse
          try {
            JSON.parse(rawStr);
          } catch (e) {
            analysis.parseError = e.message;
          }
        }
        
        return analysis;
      });
    });
    
    // Analyze results
    const fragments = messages.filter(m => m.isFragment);
    const parseErrors = messages.filter(m => m.parseError);
    const largeMsgs = messages.filter(m => m.size > 50000);
    
    console.log(`\n📊 Parsing Analysis:`);
    console.log(`  Total messages: ${messages.length}`);
    console.log(`  Fragments detected: ${fragments.length}`);
    console.log(`  Parse errors: ${parseErrors.length}`);
    console.log(`  Large messages (>50KB): ${largeMsgs.length}`);
    
    if (fragments.length > 0) {
      console.log('\n⚠️ Fragment Pattern Analysis:');
      const consecutiveFragments = [];
      let currentGroup = [];
      
      for (let i = 0; i < messages.length; i++) {
        if (messages[i].isFragment) {
          currentGroup.push(i);
        } else if (currentGroup.length > 0) {
          consecutiveFragments.push(currentGroup);
          currentGroup = [];
        }
      }
      
      if (currentGroup.length > 0) {
        consecutiveFragments.push(currentGroup);
      }
      
      console.log(`  Fragment groups: ${consecutiveFragments.length}`);
      consecutiveFragments.forEach((group, idx) => {
        const totalSize = group.reduce((sum, i) => sum + messages[i].size, 0);
        console.log(`    Group ${idx + 1}: ${group.length} fragments, ${totalSize} bytes total`);
      });
    }
    
    // Save analysis
    const analysisPath = path.join(this.logsPath, `parsing_analysis_${Date.now()}.json`);
    await fs.writeFile(analysisPath, JSON.stringify({
      summary: {
        totalMessages: messages.length,
        fragments: fragments.length,
        parseErrors: parseErrors.length,
        largeMessages: largeMsgs.length
      },
      messages: messages
    }, null, 2));
    
    return { fragments, parseErrors, largeMsgs };
  }

  async testReconstructionLogic() {
    console.log('\n🧪 Testing reconstruction logic...');
    
    // Execute reconstruction in page context
    const reconstructionResult = await this.page.evaluate(() => {
      // Call the extension's reconstruction function
      if (typeof performReconstructionFinalization === 'function') {
        performReconstructionFinalization();
        
        return {
          success: true,
          hasReconstructed: Object.keys(window.katapultReconstructedAttributes || {}).length > 0,
          reconstructedKeys: Object.keys(window.katapultReconstructedAttributes || {}),
          modelAttributesKeys: Object.keys(window.katapultModelAttributesData || {})
        };
      } else if (typeof reconstructFullModel === 'function') {
        reconstructFullModel();
        
        return {
          success: true,
          hasReconstructed: Object.keys(window.katapultReconstructedAttributes || {}).length > 0,
          reconstructedKeys: Object.keys(window.katapultReconstructedAttributes || {}),
          modelAttributesKeys: Object.keys(window.katapultModelAttributesData || {})
        };
      } else {
        return {
          success: false,
          error: 'Reconstruction function not found'
        };
      }
    });
    
    console.log('Reconstruction result:', reconstructionResult);
    
    if (reconstructionResult.success && reconstructionResult.hasReconstructed) {
      console.log('✅ Reconstruction successful!');
      console.log(`  Keys found: ${reconstructionResult.reconstructedKeys.join(', ')}`);
    } else {
      console.log('❌ Reconstruction failed or no data reconstructed');
    }
    
    return reconstructionResult;
  }

  async runFullTest(url) {
    await this.init();
    await this.navigateAndWait(url);
    
    // Give extension time to capture data
    console.log('⏳ Waiting 20 seconds for data capture...');
    await this.page.waitForTimeout(20000);
    
    // Capture and analyze
    const extensionData = await this.captureExtensionData();
    const parsingIssues = await this.analyzeParsingIssues();
    
    // Try reconstruction
    await this.testReconstructionLogic();
    
    // Try to dump
    await this.triggerDump();
    
    // Generate final report
    await this.generateFinalReport(extensionData, parsingIssues);
  }

  async generateFinalReport(extensionData, parsingIssues) {
    const report = {
      timestamp: new Date().toISOString(),
      url: this.page.url(),
      extensionCaptured: extensionData.messageCount,
      reconstructionSuccess: extensionData.reconstructedKeys.length > 0,
      issues: {
        fragments: parsingIssues.fragments.length,
        parseErrors: parsingIssues.parseErrors.length,
        largeMessages: parsingIssues.largeMsgs.length
      },
      recommendations: []
    };
    
    // Generate recommendations
    if (parsingIssues.fragments.length > 0) {
      report.recommendations.push('Implement better fragment handling - messages are being split');
    }
    
    if (parsingIssues.largeMsgs.length > 0) {
      report.recommendations.push('Large messages detected - may need streaming parser');
    }
    
    if (!extensionData.hasReconstructedAttributes) {
      report.recommendations.push('Reconstruction failed - check fragment reassembly logic');
    }
    
    const reportPath = path.join(this.logsPath, 'final_report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    console.log('\n📋 FINAL REPORT:');
    console.log(`✅ Messages captured: ${report.extensionCaptured}`);
    console.log(`${report.reconstructionSuccess ? '✅' : '❌'} Reconstruction: ${report.reconstructionSuccess ? 'SUCCESS' : 'FAILED'}`);
    console.log(`⚠️ Issues found: ${report.issues.fragments + report.issues.parseErrors} total`);
    
    if (report.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      report.recommendations.forEach(rec => {
        console.log(`  - ${rec}`);
      });
    }
    
    return report;
  }

  async cleanup() {
    // Keep browser open for session persistence
    console.log('Browser kept open for session persistence');
  }
}

// Main execution
async function main() {
  const tester = new ExtensionTester();
  const targetUrl = 'https://katapultpro.com/model-editor/#cloneable.ai_squan_Squan_O-Calc/attributes';
  
  try {
    await tester.runFullTest(targetUrl);
    console.log('\n✅ Test complete - check logs_extension folder for details');
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

main().catch(console.error);