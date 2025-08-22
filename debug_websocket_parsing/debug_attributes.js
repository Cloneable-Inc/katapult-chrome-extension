const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

async function debugAttributes() {
  console.log('🚀 Starting attributes debug session...');
  
  const sessionPath = path.join(__dirname, 'session_data_extension');
  const logsPath = path.join(__dirname, 'logs_attributes');
  const timestamp = Date.now();
  
  await fs.mkdir(logsPath, { recursive: true });
  
  // Use existing session with extension
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
  
  // Capture all WebSocket messages
  const wsMessages = [];
  const attributeMessages = [];
  
  page.on('console', msg => {
    const text = msg.text();
    
    // Capture WebSocket messages
    if (text.includes('WebSocket send:')) {
      const match = text.match(/WebSocket send: (.+)/);
      if (match) {
        try {
          const data = JSON.parse(match[1]);
          wsMessages.push({ type: 'sent', data, timestamp: new Date().toISOString() });
          
          // Check if this is the attributes request
          if (data.d?.a === 'q' && data.d?.b?.p === '/models/attributes') {
            console.log(`🎯 FOUND ATTRIBUTES REQUEST: #${data.d.r}`);
          }
        } catch (e) {}
      }
    }
    
    // Log important messages
    if (text.includes('models/attributes') || 
        text.includes('🎯') ||
        text.includes('📝 Stored data for path:')) {
      console.log(text);
    }
    
    // Capture stored paths
    if (text.includes('📝 Stored data for path:')) {
      const match = text.match(/path: ([^ ]+)/);
      if (match && match[1].includes('attributes')) {
        attributeMessages.push(text);
      }
    }
  });
  
  // Navigate with the EXACT URL format
  console.log('🌐 Navigating to: https://katapultpro.com/model-editor/#cloneable&period;ai_squan_Squan_O-Calc/');
  await page.goto('https://katapultpro.com/model-editor/#cloneable&period;ai_squan_Squan_O-Calc/', {
    waitUntil: 'networkidle',
    timeout: 60000
  });
  
  console.log('⏳ Waiting 45 seconds for all data to load...');
  await page.waitForTimeout(45000);
  
  // Extract all data
  console.log('\n📊 Extracting captured data...');
  const capturedData = await page.evaluate(() => {
    const extractPaths = (messages) => {
      const paths = new Set();
      if (!messages) return [];
      
      messages.forEach(msg => {
        // Check different path locations
        if (msg.data?.d?.b?.p) paths.add(msg.data.d.b.p);
        if (msg.data?.d?.b?.b?.p) paths.add(msg.data.d.b.b.p);
        if (msg.parsed?.d?.b?.p) paths.add(msg.parsed.d.b.p);
      });
      return Array.from(paths);
    };
    
    return {
      websocketMessages: window.katapultWebSocketMessages || [],
      reconstructedAttributes: window.katapultReconstructedAttributes || {},
      modelAttributesData: window.katapultModelAttributesData || {},
      processedNodeTypes: window.katapultProcessedNodeTypes || [],
      processedConnectionTypes: window.katapultProcessedConnectionTypes || [],
      paths: extractPaths(window.katapultWebSocketMessages)
    };
  });
  
  // Check for attributes in paths
  const attributePaths = capturedData.paths.filter(p => p.includes('attributes'));
  const modelsAttributePath = capturedData.paths.find(p => p === '/models/attributes' || p.endsWith('/models/attributes'));
  
  console.log(`\n📋 RESULTS:`);
  console.log(`Total WebSocket messages: ${capturedData.websocketMessages.length}`);
  console.log(`Unique paths: ${capturedData.paths.length}`);
  console.log(`Attribute-related paths: ${attributePaths.length}`);
  console.log(`/models/attributes found: ${!!modelsAttributePath}`);
  
  if (attributePaths.length > 0) {
    console.log('\nAttribute paths found:');
    attributePaths.forEach(p => console.log(`  - ${p}`));
  }
  
  // Check the actual messages for attributes data
  let attributesData = null;
  for (const msg of capturedData.websocketMessages) {
    if (msg.data?.d?.b?.p === '/models/attributes' && msg.data?.d?.b?.d) {
      attributesData = msg.data.d.b.d;
      console.log('\n✅ FOUND ATTRIBUTES DATA IN MESSAGE!');
      break;
    }
  }
  
  // Save everything
  const fullDataPath = path.join(logsPath, `full_capture_${timestamp}.json`);
  await fs.writeFile(fullDataPath, JSON.stringify(capturedData, null, 2));
  console.log(`\n💾 Full data saved to: ${fullDataPath}`);
  
  if (attributesData) {
    const attrPath = path.join(logsPath, `attributes_data_${timestamp}.json`);
    await fs.writeFile(attrPath, JSON.stringify(attributesData, null, 2));
    console.log(`💾 Attributes data saved to: ${attrPath}`);
    
    const keys = Object.keys(attributesData);
    console.log(`\n📊 Attributes data contains ${keys.length} keys`);
    if (keys.length > 0) {
      console.log('Sample keys:', keys.slice(0, 10));
    }
  } else {
    console.log('\n❌ No attributes data found in messages');
    
    // Try to find why
    const attributesRequest = wsMessages.find(m => 
      m.data?.d?.a === 'q' && m.data?.d?.b?.p === '/models/attributes'
    );
    
    if (attributesRequest) {
      console.log(`\n⚠️ Attributes request was sent (request #${attributesRequest.data.d.r}) but no response received`);
      
      // Check if there's a response for that request number
      const responseFound = capturedData.websocketMessages.some(msg => 
        msg.data?.d?.r === attributesRequest.data.d.r
      );
      
      if (!responseFound) {
        console.log('❌ No response found for the attributes request');
      }
    }
  }
  
  // Look for large messages that might be fragments
  const largeMessages = capturedData.websocketMessages.filter(msg => {
    const size = msg.raw?.length || 0;
    return size > 50000;
  });
  
  if (largeMessages.length > 0) {
    console.log(`\n⚠️ Found ${largeMessages.length} large messages (>50KB) that might contain fragmented data`);
    
    // Try to extract and parse them
    for (let i = 0; i < largeMessages.length; i++) {
      const msg = largeMessages[i];
      const fragmentPath = path.join(logsPath, `large_message_${i}_${timestamp}.json`);
      await fs.writeFile(fragmentPath, JSON.stringify(msg, null, 2));
      console.log(`  Saved large message ${i} (${msg.raw?.length || 0} bytes)`);
    }
  }
  
  console.log('\n✅ Debug session complete. Browser kept open for inspection.');
}

debugAttributes().catch(console.error);