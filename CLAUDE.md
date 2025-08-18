# Katapult to Cloneable Chrome Extension - Technical Documentation

## Project Overview

This Chrome extension intercepts and extracts infrastructure modeling data from Katapult Pro's web application, with the goal of enabling data export to Cloneable's systems. The extension captures WebSocket traffic, reconstructs fragmented messages, and presents structured data through a user-friendly interface.

## Core Objectives

1. **Data Extraction**: Capture infrastructure model attributes from Katapult Pro
2. **Data Reconstruction**: Handle fragmented Firebase messages and reconstruct complete JSON
3. **User Interface**: Provide an accessible way to view and export captured data
4. **Schema Documentation**: Map Katapult's data structure for integration purposes

## Technical Architecture

### WebSocket Interception Strategy

Katapult Pro uses Firebase Realtime Database over WebSocket for data synchronization. The extension intercepts these messages using a three-layer approach:

```
┌─────────────────┐
│  Content Script │ (content.js)
│  - UI Management│
│  - Message Pass │
└────────┬────────┘
         │
┌────────▼────────┐
│  Injected Script│ (inject.js)
│  - WebSocket    │
│    Override     │
│  - Message      │
│    Capture      │
└────────┬────────┘
         │
┌────────▼────────┐
│  Reconstructor  │ (inject-reconstructor.js)
│  - Fragment     │
│    Assembly     │
│  - JSON Parse   │
└─────────────────┘
```

### How WebSocket Interception Works

1. **WebSocket Override**: We replace the native WebSocket constructor with our own wrapper
2. **Message Capture**: All incoming/outgoing messages are stored in `window.katapultWebSocketMessages`
3. **Fragment Detection**: Messages that don't parse as complete JSON are treated as fragments
4. **Reconstruction**: Fragments are concatenated until they form valid JSON
5. **Data Extraction**: Complete messages are parsed for specific paths (e.g., `/models/attributes`)

### Firebase Protocol Details

Firebase messages follow this structure:
```javascript
{
  "t": "d",           // Type: 'd' for data
  "d": {              // Data payload
    "r": 1,           // Request ID
    "a": "q",         // Action: 'q' for query, 'auth' for auth, etc.
    "b": {            // Body
      "p": "/path",   // Path in Firebase
      "d": {...}      // Actual data (may be null initially)
    }
  }
}
```

### Key Paths We Monitor

- `/models/attributes` - Global model attributes
- `/photoheight/company_space/{company}/models/attributes` - Company-specific attributes
- `/photoheight/company_space/{company}/models/input_models` - Input models
- `/users/{company}/{userId}` - User data

## Data Structure

### Katapult Attribute System

Total of **85 attributes** discovered, categorized as:

#### Attributes with Picklists (32)
These have predefined selectable values:

1. **Infrastructure Types**
   - `node_type`: Main categorization (osp, anchor, fiber_callouts, note, underground)
   - `node_sub_type`: Sub-categorization (underground obstacles)
   - `connection_type`: How elements connect (aerial, overlash, guy types)

2. **Cable & Equipment**
   - `cable_type`: Communications vs Power cables
   - `equipment_type`: Transformers, capacitors, risers, etc.
   - `riser_type`: Primary, Secondary, Service, Communications

3. **Pole Specifications**
   - `pole_class`: Structural classification (0-9, H1-H6)
   - `pole_height`: 20-120 feet in standard increments
   - `pole_species`: Wood type

4. **Status & Workflow**
   - `post_construction_inspection`: Pass/Fail states
   - `post_construction_status`: Workflow states
   - `pickup_required`: Field visit status

#### Attributes without Picklists (53)
Free-form fields including:
- Measurements (height, diameter, elevation)
- Text fields (notes, addresses)
- Identifiers (pole_tag, scid)
- Location data (county, state, zip_code)
- Dates and timestamps

### Node Types Structure

The `node_type` attribute contains picklists organized by category:

```javascript
{
  "node_type": {
    "display_name": "node_type",
    "picklists": {
      "osp": {
        "0": { "value": "pole" },
        "1": { "value": "building attachment" },
        // ... more OSP types
      },
      "anchor": {
        "0": { "value": "existing anchor" },
        "1": { "value": "new anchor" },
        "2": { "value": "house" }
      },
      "fiber_callouts": {
        "0": { "value": "slack loop" },
        "1": { "value": "splice" }
      },
      "note": {
        "0": { "value": "map note" }
      },
      "underground": {
        "0": { "value": "break point" },
        "1": { "value": "handhole" },
        // ... more underground types
      }
    }
  }
}
```

## Current Implementation

### Files and Their Purposes

#### Core Extension Files
- **manifest.json** - Chrome extension configuration
- **content.js** - Main content script, manages UI and communication
- **inject.js** - WebSocket interceptor, captures all messages
- **inject-reconstructor.js** - Reconstructs fragmented messages
- **fallback-data.js** - Hardcoded node types for demo/fallback

#### UI Components
- **styles.css** - Styling for export button and modal
- **popup.html/js** - Extension popup (minimal implementation)
- **background.js** - Service worker for extension

#### Analysis Tools
- **websocket-parser.js** - Parses Firebase protocol
- **websocket-reconstructor.js** - Node.js version of reconstructor
- **analyze-attributes.js** - Analyzes captured attribute data

### UI Features

1. **Export Button**
   - Fixed position at bottom-right of screen
   - Appears only on model-editor pages
   - Shows count of captured data

2. **Modal Dialog**
   - Displays node types grouped by category
   - Statistics showing total categories and types
   - Export to JSON functionality
   - Clean, modern interface with hover effects

## WebSocket Message Flow

### Typical Session Flow

1. **Authentication**
   ```javascript
   → {"t":"d","d":{"r":2,"a":"auth","b":{"cred":"[JWT_TOKEN]"}}}
   ← Auth confirmation
   ```

2. **Initial Queries**
   ```javascript
   → {"t":"d","d":{"r":3,"a":"q","b":{"p":"/models/attributes","h":""}}}
   → {"t":"d","d":{"r":4,"a":"q","b":{"p":"/models/input_models","h":""}}}
   ```

3. **Data Responses**
   - May come as null initially: `{"d":{"b":{"p":"/models/attributes"}}}`
   - Actual data comes in separate messages or fragments
   - Large responses are split across multiple WebSocket frames

### Message Fragmentation

Firebase splits large JSON payloads across multiple messages. Our reconstructor:
1. Detects incomplete JSON (doesn't start with `{` or end with `}`)
2. Concatenates fragments
3. Attempts parsing after each addition
4. Clears buffer if too many fragments accumulate

## Testing & Debugging

### Manual Testing in Browser Console

```javascript
// Check captured messages
window.katapultWebSocketMessages

// Check reconstructed attributes
window.katapultReconstructedAttributes

// Check processed node types
window.katapultProcessedNodeTypes

// Trigger reconstruction manually
window.reconstructWebSocketData()

// View fallback data
window.fallbackNodeTypes
```

### Playwright Testing

```bash
# Run automated test
node test-extension-playwright.js

# Test uses persistent session in katapult-session/
# Maintains login state across test runs
```

### Debug Logging

Enable console to see:
- `[Cloneable Extension]` - General extension logs
- `[Cloneable Reconstructor]` - Message reconstruction
- `[DEBUG]` - Detailed debugging info

## Known Issues & Limitations

1. **Data Type Missing**: All attributes show `null` for data_type field
2. **Timing Dependency**: Attributes only load when specific model is opened
3. **Fragment Detection**: Simple heuristic may miss some fragments
4. **Authentication**: Extension doesn't handle auth, relies on user being logged in
5. **Cross-Origin**: Can only access data from katapultpro.com domains

## Data Capture Results

From our analysis of captured WebSocket traffic:
- **Total Messages**: 347-400+ per session
- **Message Size**: ~4.2MB total
- **Reconstruction Success**: ~50% of fragments successfully reconstructed
- **Attributes Found**: 85 unique attributes
- **Picklist Categories**: 17 unique categories

## Future Enhancements

### Immediate Improvements
1. Export all 32 picklist attributes, not just node_type
2. Add search/filter functionality in modal
3. Implement real-time data updates as WebSocket messages arrive
4. Better fragment reconstruction algorithm

### Advanced Features
1. **Full Schema Export**: Complete attribute definitions with all metadata
2. **Data Validation**: Verify captured data against expected schema
3. **Batch Operations**: Export multiple models at once
4. **Integration API**: Direct connection to Cloneable backend
5. **Visual Mapping**: Show relationships between node types
6. **Change Tracking**: Monitor attribute changes over time

### Architecture Improvements
1. Use IndexedDB for persistent storage
2. Implement message queuing for reliability
3. Add error recovery and retry logic
4. Create unit tests for reconstructor
5. Add TypeScript for better type safety

## Important URLs and Patterns

### Model Editor URLs
- Pattern: `https://katapultpro.com/model-editor/#[company]/[model]/`
- Example: `https://katapultpro.com/model-editor/#cloneable.ai/attributes/`

### Firebase WebSocket
- URL: `wss://s-usc1b-nss-[####].firebaseio.com/.ws?v=5&ns=katapult-production`
- Protocol: Firebase Realtime Database wire protocol

### Key Request Paths
- `/models/attributes` - Global attributes
- `/photoheight/company_space/[company]/models/attributes` - Company attributes
- `/photoheight/company_space/[company]/models/input_models` - Input models

## Security Considerations

1. **No Data Transmission**: Extension only reads, never sends data externally
2. **Local Storage Only**: All captured data stays in browser memory
3. **No Authentication Handling**: Doesn't store or transmit credentials
4. **Content Security**: Only runs on katapultpro.com domains
5. **User Initiated**: All exports require explicit user action

## Development Commands

```bash
# Install dependencies
npm install

# Run attribute analysis
node analyze-attributes.js

# Test WebSocket reconstruction
node websocket-reconstructor.js [dump-file.json]

# Run Playwright tests
node test-extension-playwright.js

# Parse WebSocket dump
node parse-websocket-json.js
```

## Repository Structure

```
.
├── Chrome Extension Core
│   ├── manifest.json
│   ├── content.js
│   ├── inject.js
│   ├── inject-reconstructor.js
│   └── fallback-data.js
├── Analysis Tools
│   ├── websocket-parser.js
│   ├── websocket-reconstructor.js
│   └── analyze-attributes.js
├── Test Infrastructure
│   ├── test-extension-playwright.js
│   └── katapult-session/
├── Documentation
│   ├── README.md
│   ├── CLAUDE.md (this file)
│   └── ATTRIBUTES_ANALYSIS.md
└── Captured Data
    ├── websocket-dump-*.json
    └── attributes-schema.json
```

## Quick Start for New Development

1. **Load Extension**: Chrome → Extensions → Load Unpacked → Select folder
2. **Test on Katapult**: Navigate to model-editor page
3. **Open Console**: F12 → Console tab to see logs
4. **Click Export**: Button appears at bottom-right
5. **View Modal**: See node types organized by category
6. **Export JSON**: Download structured data

## Contact & Context

- **Project**: Katapult to Cloneable data extraction
- **Company**: Cloneable.ai
- **Purpose**: Infrastructure modeling data interoperability
- **Status**: Functional prototype with fallback data support

---

*This documentation should be kept updated as the extension evolves. Last updated: August 2024*