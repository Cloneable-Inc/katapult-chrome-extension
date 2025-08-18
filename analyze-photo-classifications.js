#!/usr/bin/env node

const fs = require('fs');

// Photo classifications from the UI image
const photoClassifications = [
  'Anchor Point',
  'Back',
  'Birthmark',
  'CableTag',
  'Grounding',
  'Groundline Circumference',
  'Hallway',
  'MidspanHeight',
  'Miscellaneous',
  'No Birthmark',
  'No Tag',
  'Note',
  'Osmose',
  'Pole Tag',
  'Pole Top',
  'PoleHeight',
  'Rubbish',
  'Side',
  'Sync And Job',
  'Upshot'
];

// Read the reconstructed data
const data = JSON.parse(fs.readFileSync('websocket-dump-1755522024524-reconstructed.json', 'utf8'));

console.log('=' .repeat(80));
console.log('PHOTO CLASSIFICATION ANALYSIS');
console.log('=' .repeat(80));
console.log('\nSearching for photo classifications in captured data...\n');

// Search through all data paths
const foundClassifications = {};

// Helper to search recursively
function searchObject(obj, path = '') {
  if (!obj || typeof obj !== 'object') return;
  
  Object.entries(obj).forEach(([key, value]) => {
    // Check if key matches any of our classifications (case insensitive)
    photoClassifications.forEach(classification => {
      const searchTerm = classification.toLowerCase().replace(/\s+/g, '');
      const keyLower = key.toLowerCase().replace(/\s+/g, '');
      
      if (keyLower === searchTerm || keyLower === classification.toLowerCase()) {
        if (!foundClassifications[classification]) {
          foundClassifications[classification] = [];
        }
        foundClassifications[classification].push({
          path: path + '/' + key,
          value: value,
          context: typeof value === 'object' ? Object.keys(value).slice(0, 5) : value
        });
      }
    });
    
    // Recurse
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      searchObject(value, path + '/' + key);
    }
  });
}

// Search through all data
searchObject(data);

// Also check the attributes specifically
const attributesPath = "photoheight/company_space/cloneable&period;ai/models/attributes";
if (data.dataByPath && data.dataByPath[attributesPath]) {
  const attributes = data.dataByPath[attributesPath][0];
  
  console.log('\n📋 CHECKING MODEL ATTRIBUTES:');
  console.log('-'.repeat(40));
  
  // Map classification names to attribute names
  const attributeMapping = {
    'Birthmark': 'birthmark',
    'No Birthmark': 'no_birthmark',
    'CableTag': 'cableTag',
    'Grounding': 'grounding',
    'Groundline Circumference': ['groundline_circumference', 'measured_groundline_circumference'],
    'Hallway': 'hallway',
    'MidspanHeight': 'midspanHeight',
    'Miscellaneous': 'miscellaneous',
    'Osmose': 'osmose',
    'Pole Tag': 'pole_tag',
    'PoleHeight': ['poleHeight', 'pole_height', 'measured_pole_height'],
    'Rubbish': 'rubbish',
    'Upshot': 'upshot',
    'Note': 'note',
    'Anchor Point': 'anchor_point',
    'Back': 'back',
    'Side': 'side',
    'Pole Top': 'pole_top',
    'Sync And Job': 'sync_and_job',
    'No Tag': 'no_tag'
  };
  
  Object.entries(attributeMapping).forEach(([classification, attrNames]) => {
    const names = Array.isArray(attrNames) ? attrNames : [attrNames];
    
    names.forEach(attrName => {
      if (attributes[attrName]) {
        console.log(`\n✅ Found: ${classification} -> ${attrName}`);
        const attr = attributes[attrName];
        
        // Show key properties
        if (attr.attribute_types) {
          console.log(`   Attribute Types: ${JSON.stringify(attr.attribute_types)}`);
        }
        if (attr.category) {
          console.log(`   Category: ${attr.category}`);
        }
        if (attr.gui_element) {
          console.log(`   GUI Element: ${attr.gui_element}`);
        }
        if (attr._routine) {
          console.log(`   Routine: ${attr._routine}`);
        }
        if (attr._help_text) {
          console.log(`   Help Text: ${attr._help_text}`);
        }
      }
    });
  });
}

// Display results
console.log('\n\n' + '=' .repeat(80));
console.log('PHOTO CLASSIFICATIONS FOUND IN DATA:');
console.log('=' .repeat(80));

photoClassifications.forEach(classification => {
  if (foundClassifications[classification]) {
    console.log(`\n📸 ${classification}:`);
    foundClassifications[classification].slice(0, 3).forEach(found => {
      console.log(`   Path: ${found.path}`);
      if (typeof found.value === 'object') {
        console.log(`   Context: ${JSON.stringify(found.context)}`);
      }
    });
  } else {
    console.log(`❌ ${classification}: Not found`);
  }
});

// Summary
console.log('\n\n' + '=' .repeat(80));
console.log('SUMMARY:');
console.log('=' .repeat(80));
const foundCount = Object.keys(foundClassifications).length;
console.log(`Found ${foundCount} out of ${photoClassifications.length} classifications`);
console.log('\nThese appear to be photo measurement/tagging routines used to:');
console.log('1. Mark specific points on photos (Pole Top, Pole Tag, Anchor Point)');
console.log('2. Identify objects (Birthmark, CableTag, Osmose tags)');
console.log('3. Take measurements (PoleHeight, MidspanHeight, Groundline Circumference)');
console.log('4. Mark photo perspectives (Back, Side, Upshot, Hallway)');
console.log('5. Flag issues or notes (Rubbish, Miscellaneous, Note)');
console.log('\nThe numbers in parentheses likely indicate count of photos with each tag.');