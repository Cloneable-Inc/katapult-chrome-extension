const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

async function captureWebSocketData() {
  console.log('🚀 Starting WebSocket capture with existing session...');
  
  const sessionPath = path.join(__dirname, 'session_data_extension');
  const logsPath = path.join(__dirname, 'logs_capture');
  
  // Create logs directory
  await fs.mkdir(logsPath, { recursive: true });
  
  // Use existing session
  const context = await chromium.launchPersistentContext(sessionPath, {
    headless: false,
    devtools: true,
    viewport: { width: 1920, height: 1080 },
    args: [
      `--disable-extensions-except=${path.join(__dirname, '..')}`,
      `--load-extension=${path.join(__dirname, '..')}`,
      '--disable-blink-features=AutomationControlled'
    ]
  });
  
  const page = await context.newPage();
  
  // Capture all console messages
  const consoleLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push({
      type: msg.type(),
      text: text,
      timestamp: new Date().toISOString()
    });
    
    // Log important messages
    if (text.includes('[Cloneable Extension]') || 
        text.includes('models/attributes') ||
        text.includes('🎯')) {
      console.log(`[${msg.type()}] ${text}`);
    }
  });
  
  // Navigate to the URL (should already be logged in)
  console.log('🌐 Navigating to target URL...');
  await page.goto('https://katapultpro.com/model-editor/#cloneable.ai_squan_Squan_O-Calc/attributes', {
    waitUntil: 'networkidle',
    timeout: 60000
  });
  
  console.log('⏳ Waiting for WebSocket data (30 seconds)...');
  await page.waitForTimeout(30000);
  
  // Extract all captured data from the page
  console.log('📊 Extracting captured data...');
  const capturedData = await page.evaluate(() => {
    const data = {
      websocketMessages: window.katapultWebSocketMessages || [],
      reconstructedAttributes: window.katapultReconstructedAttributes || {},
      modelAttributesData: window.katapultModelAttributesData || {},
      processedNodeTypes: window.katapultProcessedNodeTypes || [],
      processedConnectionTypes: window.katapultProcessedConnectionTypes || [],
      timestamp: new Date().toISOString()
    };
    
    // Get message summary
    data.messageSummary = {
      total: data.websocketMessages.length,
      byType: {},
      paths: new Set(),
      largestMessage: 0,
      fragments: 0
    };
    
    data.websocketMessages.forEach(msg => {
      // Count types
      data.messageSummary.byType[msg.type] = (data.messageSummary.byType[msg.type] || 0) + 1;
      
      // Extract paths
      if (msg.data?.d?.b?.p) {
        data.messageSummary.paths.add(msg.data.d.b.p);
      }
      
      // Check size
      const size = msg.raw?.length || 0;
      if (size > data.messageSummary.largestMessage) {
        data.messageSummary.largestMessage = size;
      }
      
      // Check for fragments
      if (msg.raw && !msg.data) {
        data.messageSummary.fragments++;
      }
    });
    
    data.messageSummary.paths = Array.from(data.messageSummary.paths);
    
    return data;
  });
  
  // Save all data
  const timestamp = Date.now();
  
  // Save raw captured data
  const dataPath = path.join(logsPath, `captured_data_${timestamp}.json`);
  await fs.writeFile(dataPath, JSON.stringify(capturedData, null, 2));
  console.log(`💾 Saved captured data to: ${dataPath}`);
  
  // Save console logs
  const consoleLogsPath = path.join(logsPath, `console_logs_${timestamp}.json`);
  await fs.writeFile(consoleLogsPath, JSON.stringify(consoleLogs, null, 2));
  
  // Generate analysis report
  console.log('\n📋 CAPTURE ANALYSIS:');
  console.log(`Total messages: ${capturedData.messageSummary.total}`);
  console.log(`Largest message: ${capturedData.messageSummary.largestMessage} bytes`);
  console.log(`Fragments detected: ${capturedData.messageSummary.fragments}`);
  console.log(`Unique paths: ${capturedData.messageSummary.paths.length}`);
  
  if (capturedData.messageSummary.paths.length > 0) {
    console.log('\nPaths captured:');
    capturedData.messageSummary.paths.forEach(p => {
      console.log(`  - ${p}`);
    });
  }
  
  // Check for attributes
  const hasAttributes = capturedData.messageSummary.paths.some(p => p.includes('attributes'));
  const hasReconstructed = Object.keys(capturedData.reconstructedAttributes).length > 0;
  
  console.log(`\n${hasAttributes ? '✅' : '❌'} Attributes path found`);
  console.log(`${hasReconstructed ? '✅' : '❌'} Attributes reconstructed`);
  
  // Try manual reconstruction if needed
  if (!hasReconstructed && capturedData.websocketMessages.length > 0) {
    console.log('\n🔧 Attempting manual reconstruction...');
    await attemptManualReconstruction(capturedData, logsPath);
  }
  
  // Keep browser open
  console.log('\n✅ Capture complete. Browser kept open for further inspection.');
  console.log('Check the logs_capture folder for detailed data.');
}

async function attemptManualReconstruction(data, logsPath) {
  // Look for messages that might contain attributes
  const attributeMessages = data.websocketMessages.filter(msg => {
    const raw = msg.raw?.toString() || '';
    return raw.includes('attributes') || 
           raw.includes('node_type') || 
           raw.includes('cable_type') ||
           raw.includes('equipment_type') ||
           raw.includes('picklist');
  });
  
  console.log(`Found ${attributeMessages.length} potential attribute messages`);
  
  if (attributeMessages.length > 0) {
    // Try to reconstruct from fragments
    let reconstructed = '';
    const fragments = [];
    
    for (const msg of data.websocketMessages) {
      if (msg.raw && !msg.data) {
        // This is a fragment
        fragments.push(msg.raw);
      }
    }
    
    if (fragments.length > 0) {
      console.log(`Found ${fragments.length} fragments to reconstruct`);
      
      // Try concatenation
      reconstructed = fragments.join('');
      
      // Try to find JSON boundaries
      const jsonStart = reconstructed.indexOf('{"');
      const jsonEnd = reconstructed.lastIndexOf('}') + 1;
      
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        try {
          const parsed = JSON.parse(reconstructed.substring(jsonStart, jsonEnd));
          
          const reconstructedPath = path.join(logsPath, `manual_reconstruction_${Date.now()}.json`);
          await fs.writeFile(reconstructedPath, JSON.stringify(parsed, null, 2));
          
          console.log('✅ Manual reconstruction successful!');
          console.log(`Saved to: ${reconstructedPath}`);
          
          // Check for attributes in the reconstructed data
          if (parsed.d?.b?.d) {
            const keys = Object.keys(parsed.d.b.d);
            console.log(`Found ${keys.length} keys in reconstructed data`);
            if (keys.length > 0) {
              console.log('Sample keys:', keys.slice(0, 5));
            }
          }
        } catch (e) {
          console.log('❌ Manual reconstruction failed:', e.message);
          
          // Save the raw fragments for analysis
          const fragmentsPath = path.join(logsPath, `raw_fragments_${Date.now()}.txt`);
          await fs.writeFile(fragmentsPath, reconstructed);
          console.log(`Saved raw fragments to: ${fragmentsPath}`);
        }
      }
    }
  }
}

// Run the capture
captureWebSocketData().catch(console.error);