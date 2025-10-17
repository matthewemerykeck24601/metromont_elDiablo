# Metromont DB Manager - Setup Guide

## Overview

The Metromont DB Manager provides a pseudo-database built on APS Object Storage Service (OSS). It allows admin users to manage application data including schedules, mappings, and configuration without requiring a traditional database.

## Architecture

### Authentication Model

**Hybrid Authentication (2LO for OSS + 3LO for User Auth):**

**User Authentication (3LO):**
- User identity comes from client's 3LO token (main app OAuth)
- Sent via `x-netlify-identity` header with email and hubId
- Used for authorization (admin check)
- NOT used for OSS operations

**OSS Operations (2LO):**
- Server generates 2-legged OAuth tokens for OSS bucket access
- Uses APS_CLIENT_ID/SECRET from environment variables
- Tokens are cached (58min TTL) for performance
- Required because app-managed buckets must use 2LO (not 3LO)

**Why This Split?**
- **APS Requirement:** App-owned OSS buckets MUST use 2LO tokens
- **3LO tokens** are for user data (ACC projects, BIM360, viewing models)
- **2LO tokens** are for app data (storage, databases, app-managed buckets)

**Flow:**
1. User authenticates via main El Diablo dashboard (3LO flow)
2. User profile cached in localStorage with email/hubId
3. DB Manager sends identity header for authorization
4. Netlify Function validates admin access (checks ADMIN_EMAILS)
5. Function generates 2LO token for OSS operations
6. OSS operations succeed with app-level permissions

### Storage Structure

```
Bucket: metromont-el-diablo-db-[env]

Key Structure:
/tenants/{hubId}/
  meta/db.json                        # DB config (version, admins)
  folders/{folderId}/meta.json        # Folder metadata
  tables/{tableId}/schema.json        # Table JSON schema
  tables/{tableId}/rows/{rowId}.json  # Individual row data
  views/{viewId}.json                 # Saved queries (future)
  imports/acc-snapshots/{date}/...    # ACC data snapshots (future)
```

### API Endpoints

- `GET /api/db/health` - Health check and status
- `GET /api/db/objects?prefix=` - List raw OSS objects
- `GET /api/db/folders` - List folders
- `POST /api/db/folders` - Create folder
- `GET /api/db/tables` - List tables
- `POST /api/db/tables` - Create table
- `GET /api/db/rows/:tableId` - List rows
- `POST /api/db/rows/:tableId` - Create row
- `PUT /api/db/rows/:tableId/:rowId` - Update row
- `DELETE /api/db/rows/:tableId/:rowId` - Delete row

## Prerequisites

### 1. APS Application Setup

Your APS application must have the following scopes:
```
data:read
data:write
data:create
bucket:create
bucket:read
bucket:update
bucket:delete
```

These are already configured in `scripts/index.js` - ACC_SCOPES.

### 2. Environment Variables

Add to your Netlify environment:

```bash
# Required - APS Credentials for 2LO Token
APS_CLIENT_ID=your-client-id
APS_CLIENT_SECRET=your-client-secret

# Required - DB Configuration  
PSEUDO_DB_BUCKET=metromont-el-diablo-db-dev
ADMIN_EMAILS=mkeck@metromont.com

# Optional
APS_REGION=US
NODE_ENV=production

# IMPORTANT: OSS operations require 2-legged (2LO) server-side tokens
# 2LO is for app-managed buckets (pseudo DB storage)
# 3LO is for ACC/BIM360 user data (model viewing, project access)
```

**Why 2LO for OSS?**
- App-managed buckets require server-side 2-legged OAuth
- Functions generate 2LO tokens using CLIENT_ID/SECRET
- Tokens are cached (3500s TTL) for performance
- Client's 3LO token is only used for user authentication/authorization

### 3. Create OSS Bucket

**Option A: Via APS Console**
1. Go to https://aps.autodesk.com
2. Navigate to OSS section
3. Create bucket: `metromont-el-diablo-db-dev`
4. Set retention policy: permanent (or your preference)

**Option B: Via API (Postman/curl)**
```bash
curl -X POST https://developer.api.autodesk.com/oss/v2/buckets \
  -H "Authorization: Bearer YOUR_2LO_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "bucketKey": "metromont-el-diablo-db-dev",
    "policyKey": "persistent"
  }'
```

## Initial Setup

### 1. Seed Admin Configuration

Create the admin list in your bucket:

**Key:** `tenants/metromont-dev-hub/meta/db.json`

**Content:**
```json
{
  "version": 1,
  "admins": ["mkeck@metromont.com"],
  "createdAt": "2025-10-17T00:00:00.000Z",
  "features": {
    "schedules": true,
    "mappings": true,
    "snapshots": false
  }
}
```

### 2. Create Default Folders

**Schedules Folder:**
```json
{
  "id": "schedules",
  "name": "Schedules",
  "description": "Erection sequence schedules and timeline data",
  "createdBy": "system",
  "createdAt": "2025-10-17T00:00:00.000Z"
}
```

**Mappings Folder:**
```json
{
  "id": "mappings",
  "name": "Mappings",
  "description": "Property mappings and data transformation rules",
  "createdBy": "system",
  "createdAt": "2025-10-17T00:00:00.000Z"
}
```

### 3. Create Sample Tables

**Schedules Table Schema:**

**Key:** `tenants/metromont-dev-hub/tables/erection-schedules/schema.json`

```json
{
  "id": "erection-schedules",
  "name": "Erection Schedules",
  "folderId": "schedules",
  "schema": {
    "type": "object",
    "properties": {
      "projectId": { "type": "string", "description": "ACC Project ID" },
      "modelId": { "type": "string", "description": "AEC-DM Element Group ID" },
      "name": { "type": "string", "description": "Schedule name" },
      "description": { "type": "string", "description": "Schedule description" },
      "activities": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "activityId": { "type": "string" },
            "name": { "type": "string" },
            "controlNumbers": { 
              "type": "array", 
              "items": { "type": "string" },
              "description": "CONTROL_NUMBER values for elements in this activity"
            },
            "sequenceNumber": { "type": "integer" },
            "sequenceDate": { "type": "string", "format": "date" },
            "startDate": { "type": "string", "format": "date" },
            "endDate": { "type": "string", "format": "date" },
            "duration": { "type": "integer", "description": "Days" }
          },
          "required": ["activityId", "name", "controlNumbers", "sequenceDate"]
        }
      }
    },
    "required": ["projectId", "name", "activities"]
  },
  "createdBy": "system",
  "createdAt": "2025-10-17T00:00:00.000Z"
}
```

**Sample Schedule Row:**

**Key:** `tenants/metromont-dev-hub/tables/erection-schedules/rows/sample-001.json`

```json
{
  "id": "sample-001",
  "projectId": "b.proj-123",
  "modelId": "eg-456",
  "name": "Phase 1 Erection - North Wing",
  "description": "Initial erection sequence for north wing structural framing",
  "activities": [
    {
      "activityId": "act-001",
      "name": "Foundation Columns",
      "controlNumbers": ["CN-001", "CN-002", "CN-003"],
      "sequenceNumber": 1,
      "sequenceDate": "2025-01-15",
      "startDate": "2025-01-15",
      "endDate": "2025-01-17",
      "duration": 3
    },
    {
      "activityId": "act-002",
      "name": "Level 1 Beams",
      "controlNumbers": ["CN-010", "CN-011", "CN-012"],
      "sequenceNumber": 2,
      "sequenceDate": "2025-01-18",
      "startDate": "2025-01-18",
      "endDate": "2025-01-20",
      "duration": 3
    }
  ],
  "_meta": {
    "createdBy": "system",
    "createdAt": "2025-10-17T00:00:00.000Z"
  }
}
```

## Usage

### Accessing DB Manager

1. **From Dashboard:** Click the "Metromont DB" module card
2. **Direct URL:** Navigate to `/db-manager.html`

### Creating a Folder

1. Click "Add Folder" button
2. Enter folder name and description
3. Click "Create"

### Creating a Table

1. Click "Add Table" button
2. Enter table name
3. Select folder (optional)
4. Paste JSON Schema
5. Click "Create"

**Example Schema:**
```json
{
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "value": { "type": "number" },
    "date": { "type": "string", "format": "date" }
  },
  "required": ["name"]
}
```

### Adding Data

1. Click on a table in the sidebar
2. Switch to "Rows" tab
3. Click "Add Row"
4. Paste JSON data
5. Click "Save"

**Example Row:**
```json
{
  "name": "Sample Entry",
  "value": 42,
  "date": "2025-10-17"
}
```

## Integration with Erection Sequencing

### Loading Schedules from DB

Instead of CSV upload, modules can query schedules:

```javascript
async function loadScheduleFromDB(scheduleId) {
  const response = await fetch(`/api/db/rows/erection-schedules`);
  const schedules = await response.json();
  
  const schedule = schedules.find(s => s.id === scheduleId);
  
  // Convert to internal format
  const activities = schedule.activities.map(act => ({
    name: act.name,
    controlNumbers: act.controlNumbers,
    sequenceDate: act.sequenceDate,
    // ... other fields
  }));
  
  return activities;
}
```

### Saving Schedules to DB

```javascript
async function saveScheduleToDB(projectId, modelId, activities) {
  const scheduleData = {
    projectId,
    modelId,
    name: `Schedule ${new Date().toISOString()}`,
    activities: activities.map(act => ({
      activityId: generateId(),
      name: act.name,
      controlNumbers: act.elementControlNumbers,
      sequenceNumber: act.sequence,
      sequenceDate: act.date,
      startDate: act.start,
      endDate: act.end,
      duration: act.durationDays
    }))
  };
  
  await fetch('/api/db/rows/erection-schedules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: scheduleData })
  });
}
```

## Security

### Admin Access

Only users in the `ADMIN_EMAILS` environment variable can:
- View DB Manager
- Create/modify folders and tables
- Add/edit/delete rows
- View OSS objects

### Authentication

- Uses existing APS OAuth session
- Admin check happens server-side in Netlify Functions
- Token validation on every request

## Troubleshooting

### "Forbidden - Admin access required"

**Cause:** Your email is not in the admin allowlist.

**Solution:** 
1. Go to Netlify → Site Settings → Environment Variables
2. Add/Update `ADMIN_EMAILS` variable
3. Set value: `mkeck@metromont.com` (or add more with commas)
4. Redeploy or trigger a new build

### "AUTH-001: client_id does not have access to the api product"

**Cause:** APS application not configured for Data Management API / OSS access.

**Solution:**
1. Go to https://aps.autodesk.com
2. Select your application
3. Enable "Data Management API" product
4. Ensure bucket:* scopes are enabled
5. Regenerate CLIENT_SECRET if needed
6. Update Netlify environment variables
7. Redeploy

### "Failed to create bucket"

**Cause:** Bucket already exists or insufficient permissions.

**Solution:** 
1. Check if bucket exists in APS console
2. Verify 2LO token has `bucket:create` scope
3. Use existing bucket name in `PSEUDO_DB_BUCKET` env var
4. Check that APS_CLIENT_ID/SECRET are correct
5. Verify app has Data Management API enabled

### "No objects found"

This is normal for a new installation. The bucket is empty until you create folders/tables.

### "OSS list failed: 404"

**Cause:** Bucket doesn't exist yet.

**Solution:** Create the bucket via APS console or API first.

## Migration from CSV

To migrate existing CSV schedules to DB:

1. Parse CSV as usual
2. Convert to JSON format matching schema
3. POST to `/api/db/rows/erection-schedules`
4. Activities can then be loaded from DB instead of file upload

## Performance

- **List operations:** ~100-500ms (depends on object count)
- **Single read:** ~50-100ms
- **Write:** ~100-200ms
- **Pagination:** Supported via `startAfter` parameter (future)

## Backup & Export

All data can be exported as JSON:
1. Go to "OSS Objects" tab
2. See all raw object keys
3. Download via API or APS console
4. Store backups externally

## Next Steps

1. **Deploy:** Push to Netlify with environment variables set
2. **Seed:** Upload initial admin config and folder structure
3. **Test:** Create a test table and add sample rows
4. **Integrate:** Update erection-sequencing.js to read from DB
5. **Migrate:** Convert existing CSV workflows to DB storage

---

**Status:** Infrastructure Complete  
**Next:** Deploy and seed initial data  
**Admin:** mkeck@metromont.com

