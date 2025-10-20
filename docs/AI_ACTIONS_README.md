# El Diablo AI Action System

## Overview
The El Diablo AI Action System is a first-class, action-taking layer that enables natural language commands across all modules. Users can execute database operations, import ACC data, manage permissions, and more using simple conversational commands.

## Architecture

### Components

1. **AI Router** (`netlify/functions/ai-router.js`)
   - Single centralized endpoint: `/api/ai`
   - Parses natural language via OpenAI GPT-4
   - Validates actions against registry
   - Dispatches to appropriate handlers
   - Supports direct mode for testing (bypass OpenAI)

2. **Action Dispatcher** (`netlify/functions/ai/_dispatch.js`)
   - Routes validated actions to implementation functions
   - Organized by module: `db`, `acc`, `admin`, `erection`, `qc`
   - Reuses existing server-side code paths

3. **System Prompt** (`netlify/functions/ai/_system-prompt.txt`)
   - Unified prompt for all modules
   - Enforces JSON-only responses
   - Lists all available actions with examples

4. **ACC Schema Helper** (`netlify/functions/ai/_acc-schema.js`)
   - Canonical schemas for ACC entities
   - Maps ACC entities to database schemas
   - Supports: assets, issues, forms, rfis, checklists, locations, companies

5. **Audit Logger** (`netlify/functions/ai/_audit.js`)
   - Records every AI action
   - Stores: user, action, args, result, timestamp
   - Queryable audit trail
   - Location: `tenants/{hubId}/ai/audit/{date}/{id}.json`

## Usage

### API Endpoint
```
POST /api/ai
```

### Request Format

**AI Mode** (natural language):
```json
{
  "messages": [
    { "role": "user", "content": "Create the assets table" }
  ]
}
```

**Direct Mode** (testing/dev):
```json
{
  "direct": {
    "action": "db.ensure_canonical_table",
    "args": { "entity": "assets" }
  }
}
```

### Response Format
```json
{
  "ok": true,
  "action": "db.ensure_canonical_table",
  "result": {
    "tableId": "assets",
    "message": "Canonical table 'assets' created successfully"
  },
  "mode": "ai|direct"
}
```

## Action Registry

### Database Actions

#### `db.create_table`
Create a custom table with JSON schema.

**Args:**
- `table` (string): Table name
- `folderId` (string, optional): Parent folder ID
- `schema` (object): JSON Schema definition

**Example:**
```
"Create a table called Projects with name and status columns"
```

#### `db.ensure_canonical_table`
Create a canonical ACC entity table.

**Args:**
- `entity` (string): One of: assets, issues, forms, rfis, checklists, locations, companies

**Example:**
```
"Create the assets table"
"Set up the issues table"
```

#### `db.insert_rows`
Insert rows into a table (auto-creates if ACC entity).

**Args:**
- `table` (string): Table name
- `rows` (array): Array of row objects (max 200)

**Example:**
```
"Add 3 rows to assets with id, name, and status"
"Insert companies: Acme Corp and BuildCo"
```

### ACC Import Actions (Coming in v1.1)

- `acc.import.assets`
- `acc.import.issues`
- `acc.import.forms`
- `acc.import.rfis`
- `acc.import.locations`
- `acc.import.companies`

### Admin Actions (Coming in v1.1)

- `admin.user.assign_roles`
- `admin.module.enable`
- `admin.module.disable`

### Erection Sequencing Actions (Coming in v1.1)

- `erection.ensure_db_ready`
- `erection.create_sequence`
- `erection.attach_schedule`

### QC Actions (Coming in v1.1)

- `qc.upload_bed_report`
- `qc.list_reports`

## Security

### Authentication
- All AI requests require admin privileges
- Uses `x-netlify-identity` header
- Validates against `ADMIN_EMAILS` environment variable

### Authorization
- Per-action authorization (module-level in v1.1)
- Rate limiting (planned)
- Action validation against whitelist

### Audit Trail
- Every action logged with:
  - User email
  - Timestamp
  - Action + arguments
  - Success/failure status
  - IP address and user agent

## Error Handling

### Validation Errors (400)
- Invalid action name
- Missing required arguments
- Schema validation failures
- Row limit exceeded

### Authorization Errors (403)
- Non-admin user
- Insufficient module permissions (v1.1)

### Execution Errors (400)
- Table doesn't exist
- Unknown ACC entity
- Business logic failures

### System Errors (500)
- OpenAI API failures
- OSS/bucket errors
- Internal server errors

## Development

### Testing Actions

Use direct mode to test without OpenAI:

```javascript
fetch('/api/ai', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-netlify-identity': identityHeader
  },
  body: JSON.stringify({
    direct: {
      action: 'db.ensure_canonical_table',
      args: { entity: 'assets' }
    }
  })
});
```

### Adding New Actions

1. **Define in system prompt** (`ai/_system-prompt.txt`)
   - Add to ACTION REGISTRY section
   - Include example prompts

2. **Add to action registry** (`ai-router.js`)
   - Add action string to `ACTION_REGISTRY` array

3. **Implement handler** (`ai/_dispatch.js`)
   - Add function to appropriate action category
   - Follow async/await pattern
   - Return structured result object

4. **Test**
   - Use direct mode first
   - Test natural language variations
   - Verify audit logs

### Environment Variables

Required:
- `OPENAI_API_KEY` - OpenAI API key
- `ADMIN_EMAILS` - Comma-separated admin emails
- `APS_CLIENT_ID` - Autodesk Platform Services client ID
- `APS_CLIENT_SECRET` - APS client secret
- `PSEUDO_DB_BUCKET` - OSS bucket name

## Roadmap

### v1.0 (Current)
- ✅ Centralized AI router
- ✅ Database actions
- ✅ Audit logging
- ✅ System prompt
- ✅ ACC schema helpers
- ⏳ Global UI widget
- ⏳ Admin actions

### v1.1 (Next)
- ACC data import actions
- Admin role/permission management
- Erection sequencing actions
- QC bed report integration
- Module-level authorization
- Schema validation with AJV

### v1.2 (Future)
- Rate limiting
- Idempotent upserts
- Bulk operations
- Transaction support
- Scheduled actions
- Webhooks

## Examples

### Create ACC Tables
```
"Set up the assets table"
"Create issues, forms, and RFIs tables"
```

### Insert Data
```
"Add 5 test assets with names Asset-001 through Asset-005"
"Insert a company called Metromont"
```

### Custom Tables
```
"Create a schedules table with columns: id, activity, start_date, end_date, status"
```

### Complex Operations
```
"Create the locations table and add 3 locations: Building A, Building B, Site Office"
```

## Support

For issues or questions:
- Check audit logs: `tenants/{hubId}/ai/audit/`
- Review action registry in system prompt
- Test with direct mode first
- Check console logs for detailed errors

## License

Proprietary - Metromont Corporation

