# Photo Classification System - Katapult Pro

## Overview
Katapult uses a photo classification and measurement system called **input_models** that allows users to tag and measure infrastructure elements directly on photos. These classifications serve as training data for computer vision models and measurement routines.

## Complete List of Photo Classifications

Based on the UI screenshot and captured data, here are the 20+ photo classification types:

### 1. **Anchor Point** (a)
- Purpose: Mark anchor points in photos
- Routine: `anchor_point`

### 2. **Back** (b)
- Purpose: Mark back/rear view of infrastructure
- Element Type: chip
- Color: Red (`var(--paper-red-500)`)
- Editability: uneditable

### 3. **Birthmark** (i)
- Purpose: Capture pole identification markings
- Attributes:
  - `class`: Pole class
  - `height`: Pole height  
  - `species`: Wood species abbreviation
- Element Type: chip
- Color: Brown (`var(--paper-brown-500)`)
- Shortcut Key: 'i'

### 4. **CableTag** (c)
- Purpose: Identify cable/wire tags
- Element Type: chip
- Color: Amber (`var(--paper-amber-500)`)

### 5. **Grounding** (g)
- Purpose: Mark grounding equipment
- Has picklist values:
  - Grounded
  - Not Grounded
  - Broken Ground
- Attribute Types: node, photo

### 6. **Groundline Circumference** (d)
- Purpose: Measure pole circumference at ground level
- Maps to: `measured_groundline_circumference`
- GUI Element: textbox

### 7. **Hallway** (h)
- Purpose: Mark hallway/corridor views
- Element Type: chip

### 8. **MidspanHeight** (m)
- Purpose: Measure height at mid-span
- Has calibration routine
- Includes help text for measurement

### 9. **Miscellaneous** (l)
- Purpose: General/other classifications
- Element Type: chip

### 10. **No Birthmark** (z)
- Purpose: Explicitly mark absence of birthmark
- Routine: `no_birthmark`

### 11. **No Tag** (x)
- Purpose: Explicitly mark absence of tags

### 12. **Note** (n)
- Purpose: Add text notes to photos
- Attribute Types: node, connection, section, photo
- GUI Element: textarea

### 13. **Osmose** (o)
- Purpose: Mark Osmose inspection tags
- Has specific attributes and color coding

### 14. **Pole Tag** (t)
- Purpose: Capture pole identification tags
- GUI Element: `pole_tag`
- Category: Data Collection

### 15. **Pole Top** (4)
- Purpose: Mark the top of poles
- Help text: "click on the pole top, mark a second time for pole top extension"

### 16. **PoleHeight** (p)
- Purpose: Measure full pole height
- Has calibration routine
- Maps to: `measured_pole_height`

### 17. **Rubbish** (r)
- Purpose: Mark debris/waste/unwanted objects
- Element Type: chip

### 18. **Side** (s)
- Purpose: Mark side view perspectives
- Element Type: chip

### 19. **Sync And Job** (j)
- Purpose: Synchronization and job-related markers

### 20. **Upshot** (u)
- Purpose: Mark upward-looking photo angles
- Element Type: chip

## Additional Measurement Routines Found

### Calibration Elements
- **anchor_calibration**: For calibrating measurements using anchors
- **calibration**: General calibration routine (`stick_align_pole`)

### Equipment Measurements
- **arm**: Measure crossarm heights
- **equipment**: Mark and measure equipment positions
- **wire/messenger**: Track cable attachments

## Technical Implementation

### Element Types
- **chip**: Visual tag/label on photo
- **point**: Clickable measurement point
- **group**: Collection of related attributes

### Color Coding System
```javascript
{
  back: "red",
  birthmark: "brown",
  cableTag: "amber",
  calibration: "lightblue",
  equipment: "rgba(165,42,42,0.7)", // brown-red
  grounding: varies,
  // etc.
}
```

### Measurement Types
- `feet-inches`: Standard height measurements
- `pixel_selection`: Click points on photos
- `_measured_height`: Calculated heights
- `_calibration`: Calibration-based measurements

## Use Cases

### 1. Photo Tagging for ML Training
Each classification creates labeled training data:
- Object detection (poles, equipment, cables)
- Perspective classification (back, side, upshot)
- Condition assessment (grounding status, rubbish)

### 2. Measurement Collection
- Automated height calculations from photos
- Circumference measurements
- Mid-span sag calculations

### 3. Quality Control
- Verify birthmarks/tags are captured
- Flag missing information (No Birthmark, No Tag)
- Note issues (Rubbish, Notes)

### 4. Field Data Collection Workflow
The counts in parentheses (from the UI screenshot) indicate:
- How many photos have each classification applied
- Progress tracking for field crews
- Completeness metrics for jobs

## Integration with Attributes System

These photo classifications link to the model attributes:
- `birthmark` → pole identification attributes
- `grounding` → grounding status picklist
- `pole_tag` → pole_tag attribute
- `poleHeight` → pole_height picklist (20-120 ft)
- `note` → note text field

## Data Structure Example

```javascript
{
  "birthmark": {
    "_attributes": {
      "class": { "_placeholder": "pole class" },
      "height": { "_placeholder": "pole height" },
      "species": { "_placeholder": "species abbreviation" }
    },
    "_color": "var(--paper-brown-500)",
    "element_type": "chip",
    "shortcut": "i"
  }
}
```

## Summary

This photo classification system enables:
1. **Structured photo annotation** for computer vision training
2. **Field measurement collection** directly from images
3. **Quality assurance** through explicit presence/absence marking
4. **Standardized perspectives** (back, side, upshot, hallway)
5. **Infrastructure cataloging** via tags and birthmarks

The system appears designed to support both manual field data collection and automated ML-based infrastructure recognition.