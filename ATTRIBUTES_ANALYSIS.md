# Katapult Model Attributes Analysis

## Overview
- **Total Attributes**: 85
- **Attributes with Picklists**: 32 (37.6%)
- **Attributes without Picklists**: 53 (62.4%)

## Key Findings

### Data Types
Unfortunately, the data_type field is not populated for any of the attributes in the captured data. All attributes show `null` for data_type. However, based on the attribute names and picklist values, we can infer the following types:

1. **Boolean/Binary** (Yes/No choices):
   - anchor_was_installed
   - cable_was_bonded
   - coms_as_designed
   - down_guy_installed
   - new_attacher_constructed
   - new_attachment_as_designed
   - power_as_designed

2. **Categorical/Enum** (Multiple choice from list):
   - node_type (5 categories: osp, anchor, fiber_callouts, note, underground)
   - cable_type (communications vs power types)
   - company (power, telephone, other companies)
   - equipment_type (transformer, capacitor, etc.)
   - pole_class (0-9, H1-H6)
   - pole_height (20-120 ft)

3. **Text/String** (Free text - no picklist):
   - note
   - internal_note
   - street_address
   - street_name
   - job_name
   - label

4. **Numeric** (Likely numbers - no picklist):
   - height
   - diameter
   - elevation fields (anc_elevation, google_elevation, measured_elevation)
   - pole_count
   - measured_groundline_circumference

5. **Date/Time**:
   - PCI_1_date
   - time_bucket
   - time_zone (has picklist: -3 to -10)

## Attributes with Picklists (32 total)

### Infrastructure Types
1. **node_type** - Main categorization of infrastructure elements
   - osp: 8 types (pole, building attachment, bridge attachment, etc.)
   - anchor: 3 types (existing anchor, new anchor, house)
   - fiber_callouts: 2 types (slack loop, splice)
   - note: 1 type (map note)
   - underground: 4 types (break point, handhole, manhole, obstacle)

2. **node_sub_type** - Sub-categorization
   - underground_obstacles: 6 types (fire hydrant, handhole, manhole, etc.)

3. **connection_type** - How elements connect
   - osp: 9 types (aerial cable, overlash, slack span, various guy types)

### Cable & Equipment
4. **cable_type** - Type of cable/wire
   - communications: 8 types (Telco, Fiber Optic, CATV, etc.)
   - power: 10 types (Primary, Neutral, Secondary, etc.)

5. **equipment_type** - Equipment on poles
   - default: 5 types (transformer, capacitor, drip_loop, riser, street_light)

6. **riser_type** - Vertical cable runs
   - riser_type: 4 types (Primary, Secondary, Service, Communications)

### Pole Specifications
7. **pole_class** - Structural classification (0-9, H1-H6)
8. **pole_height** - Heights from 20-120 feet
9. **pole_species** - Wood type (Unknown, Southern Pine)

### Construction & Inspection
10. **post_construction_inspection** - 6 status values (Pass, Fails, etc.)
11. **post_construction_status** - 7 workflow states
12. **PCI_failure_type** - 5 failure reasons
13. **pickup_required** - 3 states (field visit required, fielding complete, etc.)

### Company/Ownership
14. **company** - Entity categories
    - other_companies: 4 types
    - power_companies: 1 type
    - tel_companies: 1 type

### Location Context
15. **over** - What's beneath the span
    - default: 10 types (Yard, Roadway, Railroad, Waterway, etc.)

16. **time_zone** - UTC offsets (-3 to -10)

### Yes/No Binary Attributes
- anchor_was_installed
- cable_was_bonded
- coms_as_designed
- down_guy_installed
- new_attacher_constructed
- new_attachment_as_designed
- power_as_designed
- PCI_passed_NESC_safety_check
- PCI_proper_guying_was_installed

## Attributes without Picklists (53 total)

These appear to be primarily:
- **Measurements**: height, diameter, elevations, circumference
- **Text fields**: notes, addresses, descriptions
- **Identifiers**: scid, pole_tag, app_number
- **Location data**: county, municipality, state, zip_code
- **Status flags**: done, field_completed, flag_for_review

## Picklist Categories

The system uses 17 unique picklist category names:
- anchor
- communications
- default (most common - used for general picklists)
- fiber_callouts
- note
- original
- osp
- other_companies
- pci_failure_type
- post_construction_options
- power
- power_companies
- riser_type
- tel_companies
- underground
- underground_obstacles
- untitled

## Recommendations for Extension

Based on this analysis, the Chrome extension could be enhanced to:

1. **Export all picklist attributes** - Not just node_type but all 32 attributes with their picklist values
2. **Group by category** - Organize attributes by their picklist categories
3. **Show data type hints** - Even though not in the data, we can infer types from names/values
4. **Provide attribute metadata** - Display name, required status, picklist values
5. **Create a searchable interface** - Allow filtering by attribute name or picklist value
6. **Export comprehensive schema** - Full attribute definitions for integration purposes