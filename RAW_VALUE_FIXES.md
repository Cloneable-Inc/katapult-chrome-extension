# Critical Fixes for Raw Value Usage

## Problem Summary
The extension is using display names (cleaned, human-readable values) instead of raw values from Katapult when exporting data. This affects:
1. Node types
2. Connection types  
3. Attribute values in picklists

## Data Flow Analysis

### From inject.js:
```javascript
// Each processed type has:
{
  category: "communications",
  key: "0",                    // Numeric key
  displayName: "Telco Com",    // What we're INCORRECTLY using
  cleanName: "Telco Com",      // What we're INCORRECTLY using
  originalName: { value: "Telco Com", require: {...} }  // Contains RAW value
}
```

### Current WRONG Flow:
1. inject.js sends full objects with all properties
2. content.js Line 181 & 205: Extracts ONLY `cleanName` or `displayName`
3. Checkboxes store display names
4. Export uses display names

### CORRECT Flow Needed:
1. inject.js already sends full objects ✅
2. content.js should store FULL objects, not just names
3. Checkboxes should have raw values in data attributes
4. Export should use raw values

## Required Fixes

### FIX 1: content.js Lines 175-186 (Node Types)
```javascript
// OLD - WRONG
this.availableAttributes.nodeTypes.values[category] = typesInCategory.map(n => n.cleanName || n.displayName || n.name);

// NEW - CORRECT
this.availableAttributes.nodeTypes.values[category] = typesInCategory; // Keep full objects
```

### FIX 2: content.js Lines 199-206 (Connection Types)
```javascript
// OLD - WRONG
this.availableAttributes.connectionTypes.values[category] = typesInCategory.map(c => c.cleanName || c.displayName || c.name);

// NEW - CORRECT
this.availableAttributes.connectionTypes.values[category] = typesInCategory; // Keep full objects
```

### FIX 3: content.js Lines 1222-1229 (Node Type Rendering)
```javascript
// OLD - WRONG
types.forEach(type => {
  html += `
    <label class="node-type-item">
      <input type="checkbox" value="${category}:${type}" data-category="${category}" data-type="${type}">
      <span>${type}</span>
    </label>
  `;
});

// NEW - CORRECT
types.forEach(typeObj => {
  const rawValue = typeObj.originalName?.value || typeObj.displayName || typeObj.key;
  const displayName = typeObj.cleanName || typeObj.displayName;
  html += `
    <label class="node-type-item">
      <input type="checkbox" 
        value="${category}:${rawValue}" 
        data-category="${category}" 
        data-type="${rawValue}"
        data-display-name="${displayName}"
        data-item-type="node" 
        class="selection-checkbox">
      <span>${displayName}</span>
    </label>
  `;
});
```

### FIX 4: content.js Lines 1265-1272 (Connection Type Rendering)
```javascript
// OLD - WRONG
types.forEach(type => {
  html += `
    <label class="connection-type-item">
      <input type="checkbox" value="${category}:${type}" data-category="${category}" data-type="${type}">
      <span>${type}</span>
    </label>
  `;
});

// NEW - CORRECT
types.forEach(typeObj => {
  const rawValue = typeObj.originalName?.value || typeObj.displayName || typeObj.key;
  const displayName = typeObj.cleanName || typeObj.displayName;
  html += `
    <label class="connection-type-item">
      <input type="checkbox" 
        value="${category}:${rawValue}" 
        data-category="${category}" 
        data-type="${rawValue}"
        data-display-name="${displayName}"
        data-item-type="connection" 
        class="selection-checkbox">
      <span>${displayName}</span>
    </label>
  `;
});
```

### FIX 5: content.js Lines 1306-1350 (Selection Handling)
```javascript
// OLD - WRONG
const [category, type] = checkbox.value.split(':');

// NEW - CORRECT
const [category, rawType] = checkbox.value.split(':');
const displayName = checkbox.dataset.displayName;

if (itemType === 'node') {
  if (checkbox.checked) {
    const exists = this.selectedNodes.some(n => 
      n.category === category && n.rawType === rawType
    );
    if (!exists) {
      this.selectedNodes.push({ 
        category, 
        rawType,           // Store raw value
        displayName,       // Store display name separately
        id: Date.now() 
      });
    }
  }
  // Similar for unchecking...
}
```

### FIX 6: content.js Lines 2736-2786 (Export Data)
```javascript
// OLD - WRONG
nodes: this.selectedNodes.map(node => {
  return {
    type: node.type,  // This was display name
    category: node.category,
    ...
  }
})

// NEW - CORRECT
nodes: this.selectedNodes.map(node => {
  return {
    type: node.rawType,       // Use raw value for export
    displayName: node.displayName,  // Include display name separately if needed
    category: node.category,
    ...
  }
})
```

### FIX 7: Attribute Values in Picklists
For attributes with picklists, we need to ensure we're using the raw picklist values, not display names.

The attribute names themselves are CORRECT (using raw names like "cable_type", "node_type").
But picklist VALUES need checking.

## Testing Checklist
1. ✅ Node types export with raw values (e.g., exact value from Katapult)
2. ✅ Connection types export with raw values
3. ✅ Attribute names remain raw (e.g., "cable_type" not "Cable Type")
4. ✅ Picklist values are raw from Katapult
5. ✅ UI still shows human-readable names
6. ✅ Export JSON contains only raw values for Cloneable compatibility