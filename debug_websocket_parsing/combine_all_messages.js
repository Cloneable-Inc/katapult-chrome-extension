const fs = require('fs').promises;
const path = require('path');

async function combineAllMessages() {
  console.log('🔧 Combining ALL WebSocket messages into single JSON...');
  
  // Load the dump
  const dumpPath = path.join(__dirname, 'simple_url_test', 'no_attributes_dump_1755865418710.json');
  const data = JSON.parse(await fs.readFile(dumpPath, 'utf-8'));
  
  console.log(`Processing ${data.messages.length} messages...`);
  
  // Step 1: Combine ALL raw messages into one string
  let combinedRaw = '';
  data.messages.forEach((msg, idx) => {
    if (msg.raw) {
      combinedRaw += msg.raw;
    }
  });
  
  console.log(`Combined raw data size: ${combinedRaw.length} bytes (${(combinedRaw.length / 1024 / 1024).toFixed(2)} MB)`);
  
  // Step 2: Extract all complete JSON objects from the combined string
  const jsonObjects = [];
  let currentPos = 0;
  
  while (currentPos < combinedRaw.length) {
    // Find next JSON object start
    const jsonStart = combinedRaw.indexOf('{"t":"', currentPos);
    if (jsonStart === -1) break;
    
    // Find the matching closing brace
    let depth = 0;
    let jsonEnd = jsonStart;
    let inString = false;
    let escapeNext = false;
    
    for (let i = jsonStart; i < combinedRaw.length; i++) {
      const char = combinedRaw[i];
      
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      
      if (char === '"' && !escapeNext) {
        inString = !inString;
      }
      
      if (!inString) {
        if (char === '{') depth++;
        if (char === '}') depth--;
        
        if (depth === 0 && i > jsonStart) {
          jsonEnd = i + 1;
          break;
        }
      }
    }
    
    if (jsonEnd > jsonStart) {
      const jsonStr = combinedRaw.substring(jsonStart, jsonEnd);
      try {
        const parsed = JSON.parse(jsonStr);
        jsonObjects.push(parsed);
        
        // Check if this contains attributes
        if (parsed.d?.b?.p === '/models/attributes' && parsed.d?.b?.d) {
          console.log(`\n✅ FOUND /models/attributes at object ${jsonObjects.length - 1}!`);
          console.log(`  Response type: ${parsed.t}`);
          console.log(`  Data keys: ${Object.keys(parsed.d.b.d).length}`);
        }
      } catch (e) {
        // Not valid JSON, skip
      }
      currentPos = jsonEnd;
    } else {
      currentPos = jsonStart + 1;
    }
  }
  
  console.log(`\nExtracted ${jsonObjects.length} complete JSON objects`);
  
  // Step 3: Build complete data structure
  const completeData = {
    paths: {},
    requests: {},
    responses: {}
  };
  
  jsonObjects.forEach((obj, idx) => {
    // Track requests
    if (obj.d?.a === 'q' && obj.d?.r) {
      completeData.requests[obj.d.r] = {
        path: obj.d.b?.p,
        index: idx
      };
    }
    
    // Track responses
    if (obj.d?.b?.p && obj.d?.b?.d) {
      const path = obj.d.b.p;
      completeData.paths[path] = obj.d.b.d;
      
      if (obj.d?.r) {
        completeData.responses[obj.d.r] = {
          path: path,
          data: obj.d.b.d,
          index: idx
        };
      }
    }
  });
  
  console.log(`\nData structure built:`);
  console.log(`  Paths: ${Object.keys(completeData.paths).length}`);
  console.log(`  Requests: ${Object.keys(completeData.requests).length}`);
  console.log(`  Responses: ${Object.keys(completeData.responses).length}`);
  
  // Step 4: Check for /models/attributes
  if (completeData.paths['/models/attributes']) {
    console.log('\n✅ SUCCESS! Found /models/attributes in paths!');
    
    const attributes = completeData.paths['/models/attributes'];
    const attrPath = path.join(__dirname, 'simple_url_test', 'FOUND_ATTRIBUTES.json');
    await fs.writeFile(attrPath, JSON.stringify(attributes, null, 2));
    
    console.log(`💾 Attributes saved to: ${attrPath}`);
    console.log(`Contains ${Object.keys(attributes).length} attribute definitions`);
    
    // Show sample attributes
    const keys = Object.keys(attributes);
    if (keys.length > 0) {
      console.log('\nSample attributes:');
      keys.slice(0, 10).forEach(key => {
        const attr = attributes[key];
        console.log(`  - ${attr.name || key}: ${attr.display_name || attr.category || 'N/A'}`);
      });
    }
    
    return attributes;
  } else {
    console.log('\n❌ /models/attributes not found in paths');
    console.log('\nAvailable paths:');
    Object.keys(completeData.paths).forEach(p => {
      if (p.includes('attribute')) {
        console.log(`  ✅ ${p}`);
      } else {
        console.log(`  - ${p}`);
      }
    });
    
    // Check if request was made but not responded
    const attrRequest = Object.values(completeData.requests).find(r => r.path === '/models/attributes');
    if (attrRequest) {
      console.log(`\n⚠️ Request for /models/attributes was made (request #${Object.keys(completeData.requests).find(k => completeData.requests[k] === attrRequest)})`);
      
      // Check if there's a response
      const responseKey = Object.keys(completeData.requests).find(k => completeData.requests[k] === attrRequest);
      if (completeData.responses[responseKey]) {
        console.log('Response found but path mismatch!');
      } else {
        console.log('No response found for this request');
      }
    }
  }
  
  // Save complete data structure
  const completePath = path.join(__dirname, 'simple_url_test', 'complete_data_structure.json');
  await fs.writeFile(completePath, JSON.stringify(completeData, null, 2));
  console.log(`\n💾 Complete data structure saved to: ${completePath}`);
  
  // Save all JSON objects
  const allObjectsPath = path.join(__dirname, 'simple_url_test', 'all_json_objects.json');
  await fs.writeFile(allObjectsPath, JSON.stringify(jsonObjects, null, 2));
  console.log(`💾 All JSON objects saved to: ${allObjectsPath}`);
  
  // Save the combined raw for manual inspection
  const combinedPath = path.join(__dirname, 'simple_url_test', 'combined_raw.txt');
  await fs.writeFile(combinedPath, combinedRaw);
  console.log(`💾 Combined raw data saved to: ${combinedPath}`);
}

combineAllMessages().catch(console.error);