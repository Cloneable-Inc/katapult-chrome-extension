# Pole Annotation Definitions - Research Findings

## Overview

Pole image annotations in Katapult Pro are defined in Firebase under:
- **Attributes**: `photoheight/company_space/*/models/attributes`
- **Input Models**: `photoheight/company_space/*/models/input_models`

## Annotation Types (input_models)

### Measured Annotations (`element_type: "point"`)
These create height markers on pole images:

| Type | Description | Triggers Attribute | Trace Type |
|------|-------------|-------------------|------------|
| `equipment` | Equipment height | `equipment_type` | `equipment` |
| `guying` | Guy attachment height | `guying_type` | `down_guy` |
| `arm` | Crossarm height | - | - |
| `insulator` | Insulator height | - | - |
| `wire` | Wire attachment height | `cable_type` | - |
| `messenger` | Messenger wire | - | - |
| `anchor_calibration` | Anchor reference | - | - |

### Classification Tags (`element_type: "chip"`)
These are image classification chips without height measurement:
- `back`, `birthmark`, `cableTag`, `grounding`, `groundline_circumference`
- `hallway`, `inspection_tag`, `job`, `midspanHeight`, `miscellaneous`
- `note`, `photo_quality`, `poleHeight`, `pole_tag`

## Attribute Dependency Chain (`_call` mechanism)

The `_call` property in picklist items triggers dependent attributes when selected.

### Equipment Annotation Flow
```
equipment (annotation)
  └── equipment_type (attribute)
        ├── "transformer"   → _call: measurement_of
        ├── "street_light"  → _call: measurement_of
        ├── "drip_loop"     → _call: drip_loop_spec
        ├── "riser"         → _call: riser_type
        └── "capacitor"     → (no sub-attribute)
```

### Guying Annotation Flow
```
guying (annotation)
  └── guying_type (attribute)
        ├── "down guy"       → _call: wire_spec
        ├── "pushbrace"      → _call: pushbrace_spec
        └── "sidewalk brace" → (no sub-attribute)
```

## Picklist Definitions

### equipment_type
```json
{
  "transformer": { "_call": ["measurement_of"] },
  "capacitor": {},
  "drip_loop": { "_call": ["drip_loop_spec"] },
  "riser": { "_call": ["riser_type"] },
  "street_light": { "_call": ["measurement_of"] }
}
```

### measurement_of
```json
["top_bolt", "bottom_bolt", "top_of_equipment", "bottom_of_equipment", "top_of_bracket", "bottom_of_bracket"]
```

### guying_type
```json
{
  "down guy": { "_call": ["wire_spec"] },
  "sidewalk brace": {},
  "pushbrace": { "_call": ["pushbrace_spec"] }
}
```

### drip_loop_spec
```json
["primary", "secondary", "street light"]
```

### riser_type
```json
["Primary", "Secondary", "Service", "Communications"]
```

### company (shared across node & photo)
```json
{
  "power_companies": ["Power Company"],
  "tel_companies": ["Telephone Company"],
  "other_companies": ["Other Company", "CATV Company", "Fiber Company", "Unknown"]
}
```

### cable_type (for wire annotation)
```json
{
  "power": ["Primary", "Neutral", "Secondary", "Open Secondary", "Power Guy", "ADSS", "Bundled Primary", "Street Light Feed", "Power Drop", "Static Wire"],
  "communications": ["Telco Com", "Fiber Optic Com", "CATV Com", "Guy", "Com Drop", "Traffic Cable", "Alarm Cable", "Strand Only"]
}
```

## Key Attribute Properties

| Property | Description |
|----------|-------------|
| `attribute_types` | Where attribute can appear: `node`, `photo`, `connection`, `section` |
| `gui_element` | UI type: `dropdown`, `textbox`, `checkbox`, `textarea` |
| `editability` | `uneditable`, `only_picklist_items`, `editable` |
| `picklists` | Available options grouped by category |
| `_call` | Dependent attributes to trigger when this value is selected |
| `prevent_carry` | If true, value doesn't carry to next annotation |
| `priority` | Display order (lower = higher priority) |
| `category` | Grouping: `Data Collection`, `PLA`, etc. |

## Photo-Only Attributes

Attributes with `attribute_types: ["photo"]`:
- `equipment_type`, `measurement_of`, `guying_type`
- `cable_type`, `diameter`, `drip_loop_spec`, `riser_type`
- `company` (also node), `label`, `height`, `manual_height`
- `proposed`, `over`, `note`, `grounding`

## Data Sources

- **Captured data**: `attributes-only.json` (37.8 KB)
- **Full Firebase dump**: `example_data/katapult-firebase-complete-2025-10-06T13-45-35.json`
- **WebSocket capture**: Via `inject.js` intercepting Firebase realtime database
