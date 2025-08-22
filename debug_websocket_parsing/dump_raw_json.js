const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

async function dumpRawJSON() {
  console.log('🚀 Starting raw JSON dump...');
  
  const sessionPath = path.join(__dirname, 'session_data_extension');
  const logsPath = path.join(__dirname, 'raw_dumps');
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
  
  // Navigate to the URL
  console.log('🌐 Navigating to model page...');
  await page.goto('https://katapultpro.com/model-editor/#cloneable&period;ai_squan_Squan_O-Calc/', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  }).catch(e => console.log('Navigation timeout, continuing...'));
  
  // Wait for WebSocket data
  console.log('⏳ Waiting 30 seconds for WebSocket data...');
  await page.waitForTimeout(30000);
  
  // Execute dump in page context
  console.log('📦 Dumping all WebSocket data...');
  const dumpData = await page.evaluate(() => {
    const dump = {
      timestamp: new Date().toISOString(),
      url: window.location.href,
      messages: window.katapultWebSocketMessages || [],
      reconstructedAttributes: window.katapultReconstructedAttributes || {},
      modelAttributesData: window.katapultModelAttributesData || {},
      processedNodeTypes: window.katapultProcessedNodeTypes || [],
      processedConnectionTypes: window.katapultProcessedConnectionTypes || []
    };
    
    // Also try to trigger the extension's dump function if it exists
    if (window.postMessage) {
      window.postMessage({ type: 'DUMP_WEBSOCKET_DATA' }, '*');
    }
    
    return dump;
  });
  
  // Save the raw dump
  const dumpPath = path.join(logsPath, `websocket_dump_${timestamp}.json`);
  await fs.writeFile(dumpPath, JSON.stringify(dumpData, null, 2));
  console.log(`✅ Raw dump saved to: ${dumpPath}`);
  
  // Extract just the raw messages
  const rawMessages = dumpData.messages.map(m => m.raw).filter(Boolean);
  const rawPath = path.join(logsPath, `raw_messages_${timestamp}.json`);
  await fs.writeFile(rawPath, JSON.stringify(rawMessages, null, 2));
  console.log(`✅ Raw messages saved to: ${rawPath}`);
  
  // Try to extract and save large messages separately
  const largeMessages = [];
  const fragments = [];
  
  dumpData.messages.forEach((msg, idx) => {
    if (msg.raw) {
      const size = msg.raw.length;
      
      if (size > 10000) {
        largeMessages.push({
          index: idx,
          size: size,
          preview: msg.raw.substring(0, 500),
          full: msg.raw
        });
      }
      
      // Check if it looks like a fragment
      if (!msg.raw.startsWith('{"t":')) {
        fragments.push({
          index: idx,
          size: size,
          content: msg.raw
        });
      }
    }
  });
  
  if (largeMessages.length > 0) {
    const largePath = path.join(logsPath, `large_messages_${timestamp}.json`);
    await fs.writeFile(largePath, JSON.stringify(largeMessages, null, 2));
    console.log(`✅ ${largeMessages.length} large messages saved to: ${largePath}`);
  }
  
  if (fragments.length > 0) {
    const fragmentsPath = path.join(logsPath, `fragments_${timestamp}.json`);
    await fs.writeFile(fragmentsPath, JSON.stringify(fragments, null, 2));
    console.log(`✅ ${fragments.length} fragments saved to: ${fragmentsPath}`);
  }
  
  // Analysis
  console.log('\n📊 DUMP ANALYSIS:');
  console.log(`Total messages: ${dumpData.messages.length}`);
  console.log(`Large messages (>10KB): ${largeMessages.length}`);
  console.log(`Potential fragments: ${fragments.length}`);
  console.log(`Reconstructed attributes: ${Object.keys(dumpData.reconstructedAttributes).length}`);
  console.log(`Model attributes paths: ${Object.keys(dumpData.modelAttributesData).length}`);
  
  // Check for attributes in messages
  let attributesFound = false;
  dumpData.messages.forEach((msg, idx) => {
    if (msg.data?.d?.b?.p === '/models/attributes' && msg.data?.d?.b?.d) {
      console.log(`\n✅ FOUND /models/attributes at message ${idx}!`);
      const attrPath = path.join(logsPath, `attributes_msg_${idx}_${timestamp}.json`);
      fs.writeFile(attrPath, JSON.stringify(msg.data.d.b.d, null, 2));
      attributesFound = true;
    }
  });
  
  if (!attributesFound) {
    console.log('\n❌ No /models/attributes found in messages');
    
    // Check what paths we did get
    const paths = new Set();
    dumpData.messages.forEach(msg => {
      if (msg.data?.d?.b?.p) {
        paths.add(msg.data.d.b.p);
      }
    });
    
    console.log('\nPaths received:');
    Array.from(paths).sort().forEach(p => {
      console.log(`  - ${p}`);
    });
  }
  
  console.log('\n✅ Dump complete. Check raw_dumps folder.');
  
  // Keep browser open
  console.log('Browser kept open for inspection.');
}

dumpRawJSON().catch(console.error);