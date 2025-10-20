# Subfolder Implementation Documentation

## Overview
This document describes the subfolder feature implementation for the Metromont El Diablo Database Manager, built on Autodesk Platform Services (APS) Object Storage Service (OSS).

## Architecture

### Storage Model
The database uses APS OSS as a pseudo-database with the following structure:
```
tenants/{hubId}/
  ├── folders/{folderId}/
  │   ├── meta.json          # Folder metadata including parentId
  │   ├── objects/...         # Folder-specific objects
  │   └── ...
  ├── tables/{tableId}/
  │   ├── schema.json         # Table schema with folderId reference
  │   └── rows/{rowId}.json   # Table data
  └── ...
```

### Folder Hierarchy
Folders support parent-child relationships through a `parentId` field in the folder metadata:

**Folder Metadata Schema:**
```json
{
  "id": "string",
  "name": "string",
  "description": "string",
  "parentId": "string|null",    // References parent folder ID
  "createdBy": "string",
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "updatedBy": "string"
}
```

## Implementation Details

### Server-Side (netlify/functions/db-folders.js)

**POST /api/db/folders** - Create folder or subfolder
```javascript
// Request body
{
  "name": "Folder Name",
  "description": "Optional description",
  "parentId": "parent-folder-id"  // null for root folders
}
```

The `parentId` field enables subfolder creation by referencing an existing folder's ID.

**PUT /api/db/folders/:id** - Rename folder
```javascript
// Request body
{
  "name": "New Folder Name"
}
```

Renaming preserves the folder hierarchy (parentId remains unchanged).

### Client-Side (scripts/db-manager.js)

**Folder Rendering:**
- Root folders are displayed first (where `parentId === null`)
- Subfolders are indented under their parent
- Visual hierarchy with "↳" indicator for subfolders
- CSS class `.subfolder` for styling

**Key Functions:**
- `renderFolders()`: Organizes and displays folder hierarchy
- `selectFolder()`: Sets active folder and updates UI state
- `applyFolderScope()`: Filters tables and OSS objects by selected folder
- `addSubfolder()`: Creates a new subfolder under the selected parent

**Folder Selection:**
- Clicking a folder selects it
- Selected folders are highlighted (`.active` class)
- Tables are filtered to show only those in the selected folder
- OSS prefix is updated to scope to the folder's path

### UI Components (db-manager.html + db-manager.css)

**Folder Panel Structure:**
```html
<div class="panel-section">
  <div class="panel-header">
    <h3>Folders</h3>
    <div class="panel-actions">
      <button id="btnRenameFolder">Rename</button>
      <button id="btnAddFolder">Add Folder</button>
      <button id="btnAddSubfolder">Add Subfolder</button>
    </div>
  </div>
  <ul id="folderList" class="folder-list">
    <!-- Dynamically rendered folder items -->
  </ul>
</div>
```

**Styling:**
- `.folder-item`: Base folder style
- `.folder-item.active`: Selected folder (highlighted in blue)
- `.folder-item.subfolder`: Indented with left border
- Button states: Rename and Add Subfolder disabled when no folder selected

## Usage Workflow

### Creating a Root Folder
1. Click "Add Folder" button
2. Enter folder name and optional description
3. Leave parentId as null (handled automatically)

### Creating a Subfolder
1. Select a parent folder from the list (it becomes highlighted)
2. Click "Add Subfolder" button
3. Enter subfolder name
4. Subfolder is created with parentId pointing to selected folder

### Renaming Folders
1. Select a folder (root or subfolder)
2. Click "Rename" button
3. Enter new name
4. Hierarchy is preserved

### Folder Scoping
When a folder is selected:
- **Tables View**: Shows only tables with matching `folderId`
- **OSS Objects**: Prefix updates to `tenants/{hubId}/folders/{folderId}/`
- **Database Tree**: Updates to show scoped structure

## Autodesk Platform Services Integration

### OSS (Object Storage Service)
- **API Used**: OSS v2 (buckets, objects)
- **Authentication**: 2-legged OAuth (2LO) for server-side operations
- **Bucket**: Configured via `PSEUDO_DB_BUCKET` environment variable
- **Region**: Configured via `APS_REGION` (default: "US")

### Key Concepts
1. **Buckets**: Top-level containers (one per environment)
2. **Objects**: Files stored with unique keys (paths)
3. **Prefixes**: Simulated folders using key naming conventions

### OSS API Calls
```javascript
// List objects (simulated folder contents)
await oss.listObjects(bucketKey, prefix);

// Get object (read metadata)
await oss.getObject(bucketKey, key);

// Put object (write metadata)
await oss.putJson(bucketKey, key, data);

// Check existence
await oss.exists(bucketKey, key);
```

## Best Practices

1. **Folder IDs**: Generated from folder names using `normalizeId()` (lowercase, hyphenated)
2. **Metadata Storage**: All folder metadata stored as JSON objects in OSS
3. **Hierarchy Depth**: No technical limit, but recommend max 3 levels for UX
4. **Naming**: Use descriptive names; IDs are auto-generated
5. **Deletion**: Currently not implemented (folders are immutable except rename)

## Future Enhancements

1. **Move Folders**: Allow changing a folder's parent
2. **Delete Folders**: Safely remove folders and update child references
3. **Folder Permissions**: Add access control at folder level
4. **Breadcrumbs**: Show folder path in UI (e.g., "Root > Projects > 2025")
5. **Drag & Drop**: Enable reordering and moving folders via UI
6. **Folder Search**: Filter folders by name or metadata

## API Reference

### Endpoints

**GET /api/db/folders**
- Returns: Array of folder objects
- Auth: Admin required

**POST /api/db/folders**
- Body: `{ name, description?, parentId? }`
- Returns: Created folder object
- Auth: Admin required

**PUT /api/db/folders/:id**
- Body: `{ name }`
- Returns: Updated folder object
- Auth: Admin required

## Testing

### Manual Test Cases

1. **Create Root Folder**
   - Action: Add folder "Projects"
   - Expected: Folder appears in list, no indentation

2. **Create Subfolder**
   - Action: Select "Projects", add subfolder "2025"
   - Expected: "2025" appears indented under "Projects"

3. **Rename Folder**
   - Action: Select "Projects", rename to "Active Projects"
   - Expected: Name updates, hierarchy unchanged

4. **Folder Scoping**
   - Action: Select "Projects"
   - Expected: Only tables with folderId="projects" visible

5. **Multi-level Hierarchy**
   - Action: Create "Projects" > "2025" > "Q1"
   - Expected: Three-level hierarchy displays correctly

## Troubleshooting

**Subfolder Button Disabled**
- Cause: No folder selected
- Solution: Click a folder to select it first

**Folder Not Appearing**
- Check: Browser console for errors
- Verify: Admin permissions
- Check: Folder created successfully (check OSS bucket)

**Tables Not Filtered**
- Verify: Table's `folderId` matches folder's `id`
- Check: `applyFolderScope()` called after selection

**OSS Prefix Not Updating**
- Check: `ossPrefix` input element exists
- Verify: `applyFolderScope()` updates the value

## Conclusion

The subfolder feature provides hierarchical organization of database tables and objects within the Metromont El Diablo system. It leverages APS OSS for storage while implementing logical folder structures through metadata references. The implementation is production-ready and follows Autodesk Platform Services best practices.

