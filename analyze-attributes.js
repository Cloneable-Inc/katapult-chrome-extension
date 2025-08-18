#!/usr/bin/env node

const fs = require('fs');

// Read the reconstructed data
const data = JSON.parse(fs.readFileSync('websocket-dump-1755522024524-reconstructed.json', 'utf8'));

// Get the attributes data
const attributesPath = "photoheight/company_space/cloneable&period;ai/models/attributes";
const attributes = data.dataByPath[attributesPath][0];

if (!attributes) {
  console.log('No attributes found');
  process.exit(1);
}

console.log('=' .repeat(80));
console.log('KATAPULT MODEL ATTRIBUTES ANALYSIS');
console.log('=' .repeat(80));
console.log(`Total attributes found: ${Object.keys(attributes).length}\n`);

// Categorize attributes
const attributesWithPicklists = [];
const attributesWithoutPicklists = [];

// Analyze each attribute
Object.entries(attributes).forEach(([name, config]) => {
  if (config && typeof config === 'object') {
    if (config.picklists) {
      attributesWithPicklists.push({ name, config });
    } else {
      attributesWithoutPicklists.push({ name, config });
    }
  }
});

// Display attributes with picklists
console.log('=' .repeat(80));
console.log(`ATTRIBUTES WITH PICKLISTS (${attributesWithPicklists.length})`);
console.log('=' .repeat(80));

attributesWithPicklists.forEach(({ name, config }) => {
  console.log(`\n📋 ${name.toUpperCase()}`);
  console.log('-'.repeat(40));
  
  // Basic info
  console.log(`  Display Name: ${config.display_name || name}`);
  console.log(`  Data Type: ${config.data_type || 'Not specified'}`);
  console.log(`  Required: ${config.required ? 'Yes' : 'No'}`);
  
  // Picklist categories and values
  if (config.picklists) {
    console.log(`  Picklist Categories: ${Object.keys(config.picklists).length}`);
    
    Object.entries(config.picklists).forEach(([category, values]) => {
      const valueCount = values ? Object.keys(values).length : 0;
      console.log(`\n  🔹 ${category} (${valueCount} values):`);
      
      if (values && valueCount <= 10) {
        // Show all values if 10 or fewer
        Object.values(values).forEach(item => {
          const value = item.value || item;
          console.log(`     - ${value}`);
        });
      } else if (values && valueCount > 10) {
        // Show first 5 for large lists
        const items = Object.values(values).slice(0, 5);
        items.forEach(item => {
          const value = item.value || item;
          console.log(`     - ${value}`);
        });
        console.log(`     ... and ${valueCount - 5} more`);
      }
    });
  }
});

// Display attributes without picklists
console.log('\n\n' + '=' .repeat(80));
console.log(`ATTRIBUTES WITHOUT PICKLISTS (${attributesWithoutPicklists.length})`);
console.log('=' .repeat(80));

// Group by data type
const byDataType = {};
attributesWithoutPicklists.forEach(({ name, config }) => {
  const dataType = config.data_type || 'unspecified';
  if (!byDataType[dataType]) {
    byDataType[dataType] = [];
  }
  byDataType[dataType].push({
    name,
    display_name: config.display_name || name,
    required: config.required || false
  });
});

// Display grouped by data type
Object.entries(byDataType).forEach(([dataType, attrs]) => {
  console.log(`\n📊 ${dataType.toUpperCase()} (${attrs.length} attributes)`);
  console.log('-'.repeat(40));
  
  attrs.sort((a, b) => a.name.localeCompare(b.name));
  attrs.forEach(attr => {
    const req = attr.required ? ' [REQUIRED]' : '';
    console.log(`  • ${attr.name}${req}`);
    if (attr.display_name !== attr.name) {
      console.log(`    Display: "${attr.display_name}"`);
    }
  });
});

// Summary statistics
console.log('\n\n' + '=' .repeat(80));
console.log('SUMMARY STATISTICS');
console.log('=' .repeat(80));

const dataTypes = {};
Object.values(attributes).forEach(config => {
  if (config && config.data_type) {
    dataTypes[config.data_type] = (dataTypes[config.data_type] || 0) + 1;
  }
});

console.log('\nData Type Distribution:');
Object.entries(dataTypes).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
  const percentage = ((count / Object.keys(attributes).length) * 100).toFixed(1);
  console.log(`  ${type}: ${count} (${percentage}%)`);
});

console.log('\nAttribute Categories:');
console.log(`  With Picklists: ${attributesWithPicklists.length}`);
console.log(`  Without Picklists: ${attributesWithoutPicklists.length}`);
console.log(`  Total: ${Object.keys(attributes).length}`);

// Find all unique picklist categories across all attributes
const allPicklistCategories = new Set();
attributesWithPicklists.forEach(({ config }) => {
  if (config.picklists) {
    Object.keys(config.picklists).forEach(cat => allPicklistCategories.add(cat));
  }
});

console.log('\nUnique Picklist Categories:');
Array.from(allPicklistCategories).sort().forEach(cat => {
  console.log(`  • ${cat}`);
});

// Export detailed schema
const schema = {
  totalAttributes: Object.keys(attributes).length,
  attributesWithPicklists: attributesWithPicklists.map(({ name, config }) => ({
    name,
    displayName: config.display_name,
    dataType: config.data_type,
    required: config.required || false,
    picklistCategories: config.picklists ? Object.keys(config.picklists) : [],
    picklistValues: config.picklists ? Object.fromEntries(
      Object.entries(config.picklists).map(([cat, values]) => [
        cat,
        values ? Object.values(values).map(v => v.value || v) : []
      ])
    ) : {}
  })),
  attributesWithoutPicklists: attributesWithoutPicklists.map(({ name, config }) => ({
    name,
    displayName: config.display_name,
    dataType: config.data_type,
    required: config.required || false
  })),
  dataTypes: dataTypes,
  uniquePicklistCategories: Array.from(allPicklistCategories)
};

// Save schema to file
fs.writeFileSync('attributes-schema.json', JSON.stringify(schema, null, 2));
console.log('\n📁 Detailed schema saved to: attributes-schema.json');