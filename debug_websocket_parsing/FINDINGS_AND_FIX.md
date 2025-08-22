# WebSocket Data Parsing Issue - Findings and Solution

## Problem Summary
The Chrome extension fails to capture `/models/attributes` data from Katapult Pro's WebSocket connection, even though the request is sent.

## Key Findings

### 1. Request is Sent But No Response Received
- Extension sends request #12: `{"t":"d","d":{"r":12,"a":"q","b":{"p":"/models/attributes","h":""}}}`
- NO response with `/models/attributes` data is received from the server
- Other paths like `/photoheight/build_numbers`, `/photoheight/white_label` etc. are received successfully

### 2. Paths Actually Received
From the logs, these paths ARE being captured:
- `photoheight/build_numbers`
- `photoheight/white_label`
- `photoheight/company_space/cloneable&period;ai_squan_Squan_O-Calc/models/input_models`
- `photoheight/company_space/cloneable&period;ai_squan_Squan_O-Calc/models/custom_icons`
- Various user and feature flag paths

But notably MISSING:
- `/models/attributes`
- `/models/attribute_groups`
- `/models/tags`

### 3. Root Cause Analysis

The issue appears to be that **Katapult's Firebase is not sending the `/models/attributes` data** for this specific model/company combination. This could be because:

1. **Permission Issue**: The user/company might not have access to global `/models/attributes`
2. **Path Format**: The attributes might be at a company-specific path like:
   - `/photoheight/company_space/cloneable&period;ai_squan_Squan_O-Calc/models/attributes`
   - Instead of the global `/models/attributes`
3. **Lazy Loading**: The attributes might be loaded separately or on-demand
4. **Different Endpoint**: Attributes might come from a different WebSocket connection or REST API

## Immediate Solution

### Fix 1: Check Company-Specific Paths
Modify `inject.js` to also look for company-specific attribute paths:

```javascript
// Add to line ~67 in inject.js
if (path.includes('models/attributes') || 
    path.includes('models/attribute_groups') ||
    path.includes('company_space') && path.includes('attributes')) {
  console.log(`[Cloneable Extension] 🎯 ATTRIBUTES found at ${path}!`);
  // Process the data...
}
```

### Fix 2: Fallback to Default Attributes
Since the extension already has `fallback-data.js` with predefined attributes, enhance it to be used when WebSocket data is unavailable:

```javascript
// In inject.js, add after line ~300
if (Object.keys(window.katapultReconstructedAttributes).length === 0) {
  console.log('[Cloneable Extension] ⚠️ No attributes from WebSocket, using fallback data');
  // Load from fallback-data.js
  loadFallbackAttributes();
}
```

### Fix 3: Request Company-Specific Attributes
Add a new WebSocket request for the company-specific path:

```javascript
// Monitor when authentication succeeds, then send:
ws.send(JSON.stringify({
  "t": "d",
  "d": {
    "r": requestId++,
    "a": "q",
    "b": {
      "p": `/photoheight/company_space/${companyId}/models/attributes`,
      "h": ""
    }
  }
}));
```

## Testing the Fix

1. Check if attributes exist at company-specific paths
2. Monitor for any REST API calls that might load attributes
3. Use browser DevTools to inspect the actual Katapult app's network traffic

## Long-term Solution

1. **Implement Multiple Data Sources**: 
   - Primary: WebSocket with company-specific paths
   - Secondary: REST API endpoints
   - Tertiary: Fallback hardcoded data

2. **Add Debug Mode**: 
   - Log all WebSocket traffic to identify patterns
   - Export raw WebSocket data for analysis

3. **Dynamic Path Discovery**:
   - Parse successful responses to discover the actual path structure
   - Adapt requests based on discovered patterns

## Files to Modify

1. **inject.js**: 
   - Lines 65-75: Expand path matching
   - Lines 290-310: Add fallback logic
   
2. **content.js**:
   - Lines 85-95: Update schema loading to check multiple sources

3. **fallback-data.js**:
   - Ensure comprehensive attribute definitions

## Verification Steps

1. Test with different Katapult models/companies
2. Compare WebSocket traffic between working and non-working scenarios
3. Check if attributes load when navigating to different pages within Katapult

## Conclusion

The core issue is that `/models/attributes` is not being sent by Katapult's server for this specific context. The solution is to:
1. Check company-specific paths
2. Use fallback data when WebSocket fails
3. Implement multiple data source strategies