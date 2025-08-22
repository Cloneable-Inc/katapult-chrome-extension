# SOLUTION: WebSocket Attributes Parsing Fix

## Root Cause
The attributes data IS being sent by Katapult, but at a **company-specific path** instead of the global path:
- ❌ Extension looks for: `/models/attributes`  
- ✅ Actual path: `photoheight/company_space/cloneable&period;ai/models/attributes`

## The Fix

### Update inject.js (Line ~150-160)
Replace the path checking logic:

```javascript
// OLD CODE - WRONG
if (path === '/models/attributes') {
  // Process attributes
}

// NEW CODE - CORRECT
if (path.includes('/models/attributes') || 
    path.endsWith('/attributes')) {
  console.log(`[Cloneable Extension] 🎯 ATTRIBUTES found at ${path}!`);
  window.katapultReconstructedAttributes = data;
  window.katapultModelAttributesData[path] = data;
  processAttributesData(data);
}
```

### Complete Fix for inject.js

```javascript
// Around line 115 in performReconstructionFinalization()
// Update the path extraction and checking:

messages.forEach((messageObj, idx) => {
  const payload = messageObj.raw || messageObj;
  
  if (typeof payload !== 'string') return;
  
  try {
    const parsed = JSON.parse(payload);
    
    // Extract path and data
    let path = null;
    let responseData = null;
    
    // Check various path locations
    if (parsed.d?.b?.p) {
      path = parsed.d.b.p;
      responseData = parsed.d.b.d;
    }
    
    if (path && responseData) {
      // Store ALL data by path
      dataByPath[path] = responseData;
      
      // CHECK FOR ATTRIBUTES AT ANY PATH
      if (path.includes('/models/attributes')) {
        console.log(`[Cloneable Extension] 🎯 FOUND ATTRIBUTES at: ${path}`);
        window.katapultReconstructedAttributes = responseData;
        processAttributesData(responseData);
      }
      
      // Also check for attribute_groups
      if (path.includes('/models/attribute_groups')) {
        console.log(`[Cloneable Extension] 📊 Found attribute groups at: ${path}`);
        window.katapultAttributeGroups = responseData;
      }
    }
  } catch (e) {
    // Fragment - will be reconstructed
  }
});
```

### Also Update processAttributesData() function

```javascript
function processAttributesData(data) {
  console.log('[Cloneable Extension] Processing attributes data...');
  console.log(`[Cloneable Extension] Found ${Object.keys(data).length} attributes`);
  
  const nodeTypes = new Set();
  const connectionTypes = new Set();
  
  Object.entries(data).forEach(([key, attr]) => {
    // Check for node types in picklists
    if (attr.picklists) {
      Object.values(attr.picklists).forEach(category => {
        Object.values(category).forEach(item => {
          if (item.value) {
            // Determine type based on attribute name or category
            if (key.includes('node') || attr.attribute_types?.['0'] === 'node') {
              nodeTypes.add(item.value);
            } else if (key.includes('cable') || key.includes('connection') || 
                      attr.attribute_types?.['2'] === 'connection') {
              connectionTypes.add(item.value);
            }
          }
        });
      });
    }
  });
  
  window.katapultProcessedNodeTypes = Array.from(nodeTypes);
  window.katapultProcessedConnectionTypes = Array.from(connectionTypes);
  
  console.log(`[Cloneable Extension] Extracted ${nodeTypes.size} node types, ${connectionTypes.size} connection types`);
}
```

## Testing
After implementing the fix:
1. The extension should detect attributes at the company-specific path
2. It should extract 86 attributes
3. Node types and connection types should be properly extracted from picklists

## Files to Update
1. **inject.js**: Update path checking to use `.includes('/models/attributes')` instead of exact match
2. **content.js**: Update to handle company-specific paths in the ImportInterface class

## Verification
The fixed extension should:
- ✅ Detect attributes at `photoheight/company_space/*/models/attributes`
- ✅ Parse all 86 attributes correctly
- ✅ Extract picklist values for node and connection types
- ✅ Send the data to the content script for the UI