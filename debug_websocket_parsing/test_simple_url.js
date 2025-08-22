const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

async function testSimpleURL() {
  console.log('🚀 Testing simpler URL for attributes...');
  
  const sessionPath = path.join(__dirname, 'session_data_extension');
  const logsPath = path.join(__dirname, 'simple_url_test');
  const timestamp = Date.now();
  
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
  
  // Track important logs
  const importantLogs = [];
  let attributesRequestSent = false;
  let attributesResponseReceived = false;
  
  page.on('console', msg => {
    const text = msg.text();
    
    // Check for attributes request
    if (text.includes('"/models/attributes"')) {
      attributesRequestSent = true;
      console.log('📤 Attributes request detected');
    }
    
    // Check for attributes response
    if (text.includes('🎯') && text.includes('attributes')) {
      attributesResponseReceived = true;
      console.log('📥 Attributes response detected:', text);
    }
    
    // Log paths being stored
    if (text.includes('📝 Stored data for path:')) {
      const match = text.match(/path: ([^ ]+)/);
      if (match) {
        importantLogs.push(match[1]);
        if (match[1].includes('attributes')) {
          console.log('✅ ATTRIBUTES PATH FOUND:', match[1]);
        }
      }
    }
  });
  
  // Navigate to simpler URL
  console.log('🌐 Navigating to: https://katapultpro.com/model-editor/#cloneable&period;ai');
  await page.goto('https://katapultpro.com/model-editor/#cloneable&period;ai', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  }).catch(e => console.log('Navigation timeout, continuing...'));
  
  // Wait for data
  console.log('⏳ Waiting 30 seconds for WebSocket data...');
  await page.waitForTimeout(30000);
  
  // Dump data
  console.log('📦 Extracting WebSocket data...');
  const data = await page.evaluate(() => {
    return {
      messages: window.katapultWebSocketMessages || [],
      reconstructedAttributes: window.katapultReconstructedAttributes || {},
      modelAttributesData: window.katapultModelAttributesData || {},
      paths: Object.keys(window.katapultModelAttributesData || {})
    };
  });
  
  // Check for /models/attributes
  let attributesFound = false;
  let attributesData = null;
  
  data.messages.forEach((msg, idx) => {
    if (msg.data?.d?.b?.p === '/models/attributes') {
      console.log(`\n✅ Found /models/attributes request at message ${idx}`);
      
      // Look for response
      const responseMsg = data.messages.find(m => 
        m.data?.d?.r === msg.data.d.r && m.data?.d?.b?.d
      );
      
      if (responseMsg) {
        console.log('✅ Found response for /models/attributes!');
        attributesData = responseMsg.data.d.b.d;
        attributesFound = true;
      } else {
        console.log('❌ No response found for /models/attributes request');
      }
    }
  });
  
  // Analysis
  console.log('\n📊 RESULTS:');
  console.log(`Total messages: ${data.messages.length}`);
  console.log(`Paths received: ${data.paths.length}`);
  console.log(`Attributes request sent: ${attributesRequestSent}`);
  console.log(`Attributes response received: ${attributesResponseReceived}`);
  console.log(`/models/attributes found: ${attributesFound}`);
  
  console.log('\nPaths received:');
  data.paths.forEach(p => {
    if (p.includes('attributes')) {
      console.log(`  ✅ ${p}`);
    } else {
      console.log(`  - ${p}`);
    }
  });
  
  // Save data
  if (attributesData) {
    const attrPath = path.join(logsPath, `attributes_${timestamp}.json`);
    await fs.writeFile(attrPath, JSON.stringify(attributesData, null, 2));
    console.log(`\n💾 Attributes saved to: ${attrPath}`);
    
    // Show sample
    const keys = Object.keys(attributesData);
    console.log(`Contains ${keys.length} attribute definitions`);
    if (keys.length > 0) {
      console.log('Sample attributes:', keys.slice(0, 10));
    }
  } else {
    console.log('\n❌ No attributes data found');
    
    // Save full dump for analysis
    const dumpPath = path.join(logsPath, `no_attributes_dump_${timestamp}.json`);
    await fs.writeFile(dumpPath, JSON.stringify(data, null, 2));
    console.log(`💾 Full dump saved to: ${dumpPath}`);
  }
  
  console.log('\n✅ Test complete. Browser kept open.');
}

testSimpleURL().catch(console.error);