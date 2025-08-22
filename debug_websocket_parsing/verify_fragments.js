const fs = require('fs').promises;
const path = require('path');

async function verifyFragments() {
  console.log('🔍 Analyzing fragment reconstruction...');
  
  // Load the most recent dump
  const dumpPath = path.join(__dirname, 'simple_url_test', 'no_attributes_dump_1755865418710.json');
  const data = JSON.parse(await fs.readFile(dumpPath, 'utf-8'));
  
  console.log(`Total messages: ${data.messages.length}`);
  
  // Find the attributes fragment start
  let fragmentStart = -1;
  let fragmentMessages = [];
  
  data.messages.forEach((msg, idx) => {
    // Check if this is the attributes response
    if (msg.raw && msg.raw.includes('"p":"/models/attributes"')) {
      console.log(`\n✅ Found /models/attributes at message ${idx}`);
      fragmentStart = idx;
    }
    
    // Check if it's a fragment (not valid JSON)
    if (msg.raw) {
      try {
        JSON.parse(msg.raw);
      } catch (e) {
        // This is a fragment
        if (idx >= 290 && idx <= 310) { // Around message 292
          fragmentMessages.push({
            index: idx,
            size: msg.raw.length,
            preview: msg.raw.substring(0, 100)
          });
        }
      }
    }
  });
  
  console.log(`\nFound ${fragmentMessages.length} fragments around message 292`);
  
  // Try to reconstruct the attributes message
  console.log('\n🔧 Attempting to reconstruct /models/attributes...');
  
  // Method 1: Concatenate sequential fragments starting from 292
  let reconstructed = '';
  let inAttributesSection = false;
  
  for (let i = 290; i < Math.min(306, data.messages.length); i++) {
    const msg = data.messages[i];
    
    if (!msg.raw) continue;
    
    // Check if this starts the attributes section
    if (msg.raw.includes('"p":"/models/attributes"')) {
      inAttributesSection = true;
      console.log(`Starting reconstruction at message ${i}`);
    }
    
    if (inAttributesSection) {
      // Check if this is the end (starts with a new complete message)
      if (i > 292 && msg.raw.startsWith('{"t":"')) {
        console.log(`Ending reconstruction at message ${i}`);
        break;
      }
      
      reconstructed += msg.raw;
      console.log(`Added message ${i} (${msg.raw.length} bytes)`);
    }
  }
  
  console.log(`\nReconstructed size: ${reconstructed.length} bytes`);
  
  // Try to parse the reconstructed data
  try {
    // Find JSON boundaries
    const jsonStart = reconstructed.indexOf('{"t":"');
    const lastBrace = reconstructed.lastIndexOf('}');
    
    if (jsonStart >= 0 && lastBrace > jsonStart) {
      const jsonStr = reconstructed.substring(jsonStart, lastBrace + 1);
      const parsed = JSON.parse(jsonStr);
      
      console.log('✅ Successfully parsed reconstructed data!');
      
      // Extract attributes
      if (parsed.d?.b?.d) {
        const attributes = parsed.d.b.d;
        const attrPath = path.join(__dirname, 'simple_url_test', 'reconstructed_attributes.json');
        await fs.writeFile(attrPath, JSON.stringify(attributes, null, 2));
        
        console.log(`💾 Attributes saved to: ${attrPath}`);
        console.log(`Contains ${Object.keys(attributes).length} attribute definitions`);
        
        // Show sample
        const keys = Object.keys(attributes);
        if (keys.length > 0) {
          console.log('\nSample attributes:');
          keys.slice(0, 10).forEach(key => {
            const attr = attributes[key];
            console.log(`  - ${key}: ${attr.name || attr.display_name || 'unknown'}`);
          });
        }
      }
    } else {
      throw new Error('Could not find JSON boundaries');
    }
  } catch (e) {
    console.log('❌ Parse failed:', e.message);
    
    // Save the raw reconstruction attempt
    const rawPath = path.join(__dirname, 'simple_url_test', 'raw_reconstruction_attempt.txt');
    await fs.writeFile(rawPath, reconstructed);
    console.log(`💾 Raw reconstruction saved to: ${rawPath}`);
    
    // Try alternative: combine ALL fragments
    console.log('\n🔧 Trying alternative: combine all non-JSON messages...');
    
    let allFragments = '';
    data.messages.forEach((msg, idx) => {
      if (msg.raw && !msg.data) {
        // This is likely a fragment
        allFragments += msg.raw;
      }
    });
    
    console.log(`Combined fragments size: ${allFragments.length} bytes`);
    
    // Look for attributes in the combined data
    const attrIndex = allFragments.indexOf('"attributes"');
    if (attrIndex > 0) {
      console.log('✅ Found "attributes" in combined fragments');
      
      // Try to extract JSON around it
      let start = attrIndex;
      let depth = 0;
      let foundStart = false;
      
      // Search backwards for start
      for (let i = attrIndex; i >= 0; i--) {
        if (allFragments[i] === '{') {
          if (!foundStart) {
            start = i;
            foundStart = true;
            break;
          }
        }
      }
      
      if (foundStart) {
        // Search forward for matching close
        let end = start;
        depth = 0;
        for (let i = start; i < allFragments.length; i++) {
          if (allFragments[i] === '{') depth++;
          if (allFragments[i] === '}') depth--;
          if (depth === 0 && i > start) {
            end = i + 1;
            break;
          }
        }
        
        if (end > start) {
          const extracted = allFragments.substring(start, end);
          try {
            const parsed = JSON.parse(extracted);
            const extractedPath = path.join(__dirname, 'simple_url_test', 'extracted_attributes.json');
            await fs.writeFile(extractedPath, JSON.stringify(parsed, null, 2));
            console.log(`✅ Extracted attributes saved to: ${extractedPath}`);
          } catch (e) {
            console.log('❌ Extraction parse failed');
          }
        }
      }
    }
    
    const allFragmentsPath = path.join(__dirname, 'simple_url_test', 'all_fragments_combined.txt');
    await fs.writeFile(allFragmentsPath, allFragments);
    console.log(`💾 All fragments saved to: ${allFragmentsPath}`);
  }
}

verifyFragments().catch(console.error);