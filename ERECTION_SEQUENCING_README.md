# Erection Sequence Scheduling Module

## Overview

The **Erection Sequence Scheduling** module is a new 4D construction phasing tool integrated into El Diablo (Metromont CastLink). It enables users to visualize construction sequences using BIM models from Autodesk Construction Cloud, powered by the AEC Data Model GraphQL API.

## Features

- **4D Visualization**: Time-based construction sequencing with Autodesk Forge Viewer
- **AEC Data Model Integration**: Direct GraphQL queries to ACC for element data
- **CSV-Driven Scheduling**: Import activity schedules with date ranges and element mappings
- **Interactive Playback**: Play, pause, step, and scrub through construction phases
- **Element Isolation**: Automatically isolate and highlight elements by activity and date
- **Multi-Project Support**: Work with any ACC project with AEC Data Model enabled

## Architecture

### File Structure

```
metromont_elDiablo/
├── scheduling-hub.html              # Hub page with module selection
├── erection-sequencing.html         # Main 4D sequencing interface
├── scripts/
│   ├── scheduling-hub.js            # Hub navigation logic
│   ├── aecdm-graphql.js            # AEC Data Model GraphQL helper
│   └── erection-sequencing.js      # Main sequencing logic
├── styles/
│   └── erection-sequencing.css     # Styling for sequencing UI
└── assets/
    └── phasing.csv                 # Sample construction schedule
```

### Routing Flow

1. **Dashboard** (`index.html`) → "Production" button
2. **Scheduling Hub** (`scheduling-hub.html`) → Choose between:
   - Erection Sequence Scheduling (NEW)
   - Production Bed Scheduling (existing)
3. **Erection Sequencing** (`erection-sequencing.html`) → 4D visualization

## Prerequisites

### Autodesk Account Setup

1. **AEC Data Model Activation**: Must be activated on your ACC account
   - Contact your Autodesk Account Admin
   - Activation must occur BEFORE uploading models

2. **Model Requirements**:
   - Revit 2024 or newer
   - Models must be uploaded/published AFTER AEC DM activation
   - Elements must have a link property (default: "Mark")

3. **OAuth Scopes**: The following scopes are already configured:
   - `data:read` - Read project/folder data
   - `account:read` - Read account information
   - `viewables:read` - View models in Forge Viewer

4. **Region Support**: Default is US. If your hub is in EMEA or AUS, modify the region parameter in GraphQL queries.

## Usage Guide

### 1. Access the Module

1. Log into El Diablo
2. Click **"Production"** on the main dashboard
3. Select **"Erection Sequence Scheduling"** from the Scheduling Hub

### 2. Select Project and Model

1. **Project Dropdown**: Choose your ACC project
   - Auto-populated from your authenticated ACC account
   - Displays project name and number

2. **Model Dropdown**: Select a design (element group)
   - Populated via AEC Data Model GraphQL
   - Shows all Revit models with AEC data in the project

3. **Link Property**: Specify the property to link activities to elements
   - Default: "Mark"
   - Can be changed to "Type Mark", "Assembly Code", etc.

### 3. Load Schedule

**Option A: Use Sample CSV**
- Click "Use Sample CSV" button
- Loads a demonstration schedule with 11 activities

**Option B: Upload Custom CSV**
- Click "CSV Schedule" file input
- Select your CSV file with the following format:

```csv
ActivityName,StartDate,DurationDays,EndDate,Type,Description,ElementValues
Foundation Work,2025-01-01,3,2025-01-03,Construct,Pour foundation,MK-001|MK-002|MK-003
Column Erection,2025-01-04,2,2025-01-05,Construct,Install columns,MK-004|MK-005
```

**CSV Column Definitions**:
- `ActivityName`: Unique activity identifier
- `StartDate`: Activity start date (YYYY-MM-DD)
- `DurationDays`: Number of days (integer)
- `EndDate`: Activity end date (YYYY-MM-DD)
- `Type`: Activity type (Construct, Demo, Temp)
- `Description`: Human-readable description
- `ElementValues`: Pipe-separated list of element property values (e.g., Mark values)

### 4. Playback Controls

- **Play**: Auto-advance through days (2 seconds per day)
- **Pause**: Stop auto-playback
- **Step**: Advance one day forward
- **Reset**: Return to day 1
- **Timeline Scrubber**: Drag to jump to any day

### 5. Viewer Interaction

The Forge Viewer toolbar provides:
- **Reset View**: Return to default camera
- **Fit to View**: Zoom to fit visible elements
- **Isolate Selection**: Isolate selected elements
- **Show All**: Display all model elements

## Technical Details

### AEC Data Model GraphQL

The module uses two main GraphQL queries:

**1. List Element Groups (Designs)**
```graphql
query GetElementGroups($projectId: ID!) {
  elementGroupsByProject(projectId: $projectId, pagination: { limit: 100 }) {
    results {
      id
      name
      alternativeIdentifiers {
        fileVersionUrn
      }
    }
  }
}
```

**2. Get Elements by Filter**
```graphql
query ElementsByElementGroup($elementGroupId: ID!, $filter: String!) {
  elementsByElementGroup(
    elementGroupId: $elementGroupId,
    filter: { query: $filter },
    pagination: { limit: 200 }
  ) {
    results {
      id
      name
      properties(filter: { names: ["External ID", "Mark"] }) {
        results { name value }
      }
    }
  }
}
```

### Filter Syntax

Example filter for elements with specific Mark values:
```
('property.name.Element Context'==Instance) and ('property.name.Mark' in ['MK-001','MK-002'])
```

### Element Isolation Workflow

1. **Parse CSV** → Build activity-to-element and day-to-activity maps
2. **Select Day** → Identify active activities for that day
3. **Collect Element Values** → Gather all Mark (or other property) values
4. **GraphQL Query** → Fetch elements matching those values from AEC DM
5. **Extract External IDs** → Get element External IDs from GraphQL response
6. **Map to dbIds** → Use Viewer's `getExternalIdMapping()` to convert External IDs to Viewer dbIds
7. **Isolate** → Call `viewer.isolate(dbIds)` and `viewer.fitToView()`

## Troubleshooting

### "No AEC Data Model designs found"

**Possible Causes**:
- AEC Data Model not activated on account
- Models uploaded before AEC DM activation
- Wrong region (try EMEA or AUS)

**Solutions**:
1. Verify AEC DM is activated with your Account Admin
2. Re-upload models after activation
3. Check the region parameter in `aecdm-graphql.js`

### "No elements found matching Mark values"

**Possible Causes**:
- Property name mismatch (not using "Mark")
- Element values in CSV don't match model properties
- Elements are not Instances (might be Types)

**Solutions**:
1. Verify the link property name in your model
2. Check element property values in Revit
3. Update the `esLinkProperty` input field
4. Ensure CSV `ElementValues` match exactly

### "Model translation in progress"

**Solution**: Wait a few minutes and try loading the model again. Forge is processing the model for viewing.

### "Authentication expired"

**Solution**: Refresh the page to re-authenticate with ACC.

## API Rate Limits

- **GraphQL Queries**: Standard APS rate limits apply
- **Pagination**: Use `limit: 200` and follow `cursor` for large datasets
- **Best Practice**: Pre-compute element mappings to reduce query frequency during playback

## Future Enhancements

### Short Term
- Color-coding by activity type (Construct=green, Demo=red, Temp=yellow)
- Activity legend and mini Gantt chart
- Export/import schedule to ACC

### Long Term
- Inline schedule editor (replace CSV)
- Persist schedules per project/model to ACC or backend
- Pull activity data from ACC Build or Cost APIs
- Cross-model/project-level queries
- Real-time collaboration and schedule updates

## Support

For issues or questions:
- Email: support@metromont.com
- Phone: (123) 456-7890
- Web: metromont.com

## Version History

- **v1.0** (2025-10-07): Initial release with CSV-driven 4D phasing

---

Built with ❤️ by Metromont for El Diablo MES

