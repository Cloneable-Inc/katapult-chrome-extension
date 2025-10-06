#!/usr/bin/env node
// Extract attributes from Firebase JSON dump
// Usage: node extract-attributes.js your-firebase-dump.json

const fs = require('fs');

if (process.argv.length < 3) {
  console.log('Usage: node extract-attributes.js <firebase-dump.json>');
  process.exit(1);
}

const filename = process.argv[2];

console.log(`Reading ${filename}...`);
const data = JSON.parse(fs.readFileSync(filename, 'utf8'));

console.log('\n=== Firebase Paths ===');
if (data.completeFirebaseData) {
  const paths = Object.keys(data.completeFirebaseData);
  console.log(`Found ${paths.length} total paths:\n`);
  paths.forEach(path => console.log(`  ${path}`));

  console.log('\n=== Paths containing "attributes" ===');
  const attrPaths = paths.filter(p => p.includes('attributes'));
  if (attrPaths.length > 0) {
    attrPaths.forEach(path => {
      console.log(`\n📍 ${path}`);
      const attrData = data.completeFirebaseData[path];
      if (attrData && typeof attrData === 'object') {
        const keys = Object.keys(attrData);
        console.log(`   Contains ${keys.length} attributes:`);
        console.log(`   ${keys.slice(0, 10).join(', ')}${keys.length > 10 ? ', ...' : ''}`);
      }
    });

    console.log('\n=== Saving attributes to attributes-only.json ===');
    const attributesOnly = {};
    attrPaths.forEach(path => {
      attributesOnly[path] = data.completeFirebaseData[path];
    });
    fs.writeFileSync('attributes-only.json', JSON.stringify(attributesOnly, null, 2));
    console.log('✅ Saved to attributes-only.json');
  } else {
    console.log('❌ No paths containing "attributes" found');
  }
} else {
  console.log('❌ No completeFirebaseData found in dump');
}

console.log('\n=== Summary ===');
console.log(`Total messages: ${data.metadata?.totalMessages || 'unknown'}`);
console.log(`Parsed messages: ${data.metadata?.parsedMessages || 'unknown'}`);
console.log(`Firebase paths: ${data.metadata?.firebasePaths || 'unknown'}`);
