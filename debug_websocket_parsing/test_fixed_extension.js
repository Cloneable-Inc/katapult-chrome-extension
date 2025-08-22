const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

async function testFixedExtension() {
  console.log('🚀 Testing FIXED extension with original URL...');
  
  const sessionPath = path.join(__dirname, 'session_data_extension');
  const logsPath = path.join(__dirname, 'fixed_test');
  const timestamp = Date.now();
  
  await fs.mkdir(logsPath, { recursive: true });
  
  // Use existing session with the FIXED extension
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
  
  // Track console logs
  let attributesDetected = false;
  let attributesPath = null;
  let attributesCount = 0;
  
  page.on('console', msg => {
    const text = msg.text();
    
    // Check for successful attributes detection
    if (text.includes('🎯 Found attributes data at path:')) {
      attributesDetected = true;
      const match = text.match(/path: ([^\s]+)/);
      if (match) {
        attributesPath = match[1];
      }
      console.log('✅ ATTRIBUTES DETECTED:', text);
    }
    
    if (text.includes('Attributes data keys:')) {
      const match = text.match(/(\d+) attributes/);
      if (match) {
        attributesCount = parseInt(match[1]);
      }
    }
    
    // Log important messages
    if (text.includes('[Cloneable Extension]') && 
        (text.includes('🎯') || text.includes('✅') || text.includes('FINAL'))) {
      console.log(text);
    }
  });
  
  // Navigate to the ORIGINAL URL
  const targetUrl = 'https://katapultpro.com/model-editor/#cloneable&period;ai_squan_Squan_O-Calc/attributes';
  console.log(`🌐 Navigating to: ${targetUrl}`);
  
  await page.goto(targetUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  }).catch(e => console.log('Navigation timeout, continuing...'));
  
  // Wait for WebSocket data
  console.log('⏳ Waiting 30 seconds for WebSocket data and processing...');
  await page.waitForTimeout(30000);
  
  // Get the results
  console.log('\n📊 Extracting results...');
  const results = await page.evaluate(() => {
    return {
      messages: window.katapultWebSocketMessages?.length || 0,
      reconstructedAttributes: Object.keys(window.katapultReconstructedAttributes || {}),
      modelAttributesData: Object.keys(window.katapultModelAttributesData || {}),
      processedNodeTypes: window.katapultProcessedNodeTypes || [],
      processedConnectionTypes: window.katapultProcessedConnectionTypes || [],
      
      // Get sample attribute data
      sampleAttribute: window.katapultReconstructedAttributes ? 
        Object.entries(window.katapultReconstructedAttributes)[0] : null
    };
  });
  
  // Analysis
  console.log('\n📋 TEST RESULTS:');
  console.log('━'.repeat(50));
  console.log(`WebSocket messages captured: ${results.messages}`);
  console.log(`Attributes detected: ${attributesDetected ? '✅ YES' : '❌ NO'}`);
  
  if (attributesDetected) {
    console.log(`Attributes path: ${attributesPath}`);
    console.log(`Attributes count: ${attributesCount}`);
  }
  
  console.log(`\nReconstructed attributes: ${results.reconstructedAttributes.length}`);
  if (results.reconstructedAttributes.length > 0) {
    console.log('Sample attributes:', results.reconstructedAttributes.slice(0, 10));
  }
  
  console.log(`\nProcessed node types: ${results.processedNodeTypes.length}`);
  if (results.processedNodeTypes.length > 0) {
    console.log('Sample node types:', results.processedNodeTypes.slice(0, 5));
  }
  
  console.log(`\nProcessed connection types: ${results.processedConnectionTypes.length}`);
  if (results.processedConnectionTypes.length > 0) {
    console.log('Sample connection types:', results.processedConnectionTypes.slice(0, 5));
  }
  
  // Save the results
  const resultsPath = path.join(logsPath, `test_results_${timestamp}.json`);
  await fs.writeFile(resultsPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    url: targetUrl,
    attributesDetected,
    attributesPath,
    attributesCount,
    results
  }, null, 2));
  
  console.log(`\n💾 Results saved to: ${resultsPath}`);
  
  // Final verdict
  console.log('\n' + '═'.repeat(50));
  if (attributesDetected && results.reconstructedAttributes.length > 0) {
    console.log('✅ SUCCESS! Extension is now correctly parsing attributes!');
    console.log(`   - Found ${attributesCount} attributes at ${attributesPath}`);
    console.log(`   - Extracted ${results.processedNodeTypes.length} node types`);
    console.log(`   - Extracted ${results.processedConnectionTypes.length} connection types`);
  } else {
    console.log('❌ FAILED - Attributes not properly detected/parsed');
    console.log('   Check the extension console for error messages');
  }
  
  console.log('\nBrowser kept open for inspection.');
}

testFixedExtension().catch(console.error);