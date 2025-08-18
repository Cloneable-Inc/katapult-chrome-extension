# Katapult to Cloneable Chrome Extension

A Chrome extension that extracts and displays node types from Katapult Pro's model editor, enabling easy export of model data.

## Features

- 🔘 Export button appears automatically on model-editor pages
- 📊 Modal display showing node types organized by category
- 💾 Export node types as JSON
- 🔄 WebSocket message interception and reconstruction
- 📦 Fallback data support when live data isn't available

## Installation

1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension directory
5. The extension will now be active on katapultpro.com

## Usage

1. Navigate to a Katapult Pro model editor page (e.g., `https://katapultpro.com/model-editor/#company/model/`)
2. Look for the green "Export" button in the bottom right corner
3. Click the button to open the node types modal
4. View node types organized by category:
   - **OSP**: Poles, guys, spans, risers, etc.
   - **Anchor**: Physical and virtual anchors
   - **Fiber Callouts**: Splitters, terminals, closures
   - **Note**: Note markers
   - **Underground**: Vaults, handholes, cabinets
5. Click "Export as JSON" to download the data

## Project Structure

```
├── manifest.json           # Chrome extension manifest
├── content.js             # Main content script
├── inject.js              # WebSocket interceptor
├── inject-reconstructor.js # Message reconstruction logic
├── fallback-data.js       # Fallback node types data
├── background.js          # Background service worker
├── popup.html/js          # Extension popup interface
├── styles.css             # Extension styles
└── icons/                 # Extension icons
```

## Technical Details

### WebSocket Interception
The extension intercepts WebSocket messages to capture model data from Firebase Realtime Database. It handles:
- Message fragmentation and reconstruction
- Firebase protocol parsing
- Path-based data extraction

### Data Sources
1. **Live WebSocket Data**: Captures and reconstructs messages from the page
2. **Fallback Data**: Pre-configured node types for demonstration

### Node Type Categories

- **OSP (Outside Plant)**: Infrastructure elements like poles, crossarms, guys
- **Anchor**: Ground anchoring points
- **Fiber Callouts**: Fiber optic equipment markers
- **Note**: Annotation markers
- **Underground**: Below-ground infrastructure

## Development

To modify the extension:

1. Edit the source files
2. Reload the extension in Chrome (chrome://extensions/ → Reload)
3. Refresh the Katapult Pro page to see changes

## License

Private repository - All rights reserved