# El Diablo Pseudo-DB Relationships Guide

## Overview
El Diablo's pseudo-database now supports full relational metadata with foreign key enforcement, cascade operations, and referential integrity checks.

## Features

✅ **Foreign Key Validation** - Server validates FKs on INSERT/UPDATE  
✅ **Cascade Deletes** - Automatically delete child rows  
✅ **Set Null** - Nullify FK fields when parent deleted  
✅ **Restrict** - Block deletes if child rows exist  
✅ **UI Display** - View relationships in schema viewer  
✅ **AI Integration** - Canonical tables include relationships  

## Relationship Metadata Format

### In Table Schema
```json
{
  "id": "projects",
  "name": "Projects",
  "folderId": "admin",
  "schema": {
    "type": "object",
    "properties": {
      "id": { "type": "string" },
      "name": { "type": "string" },
      "bim360_account_id": { "type": "string" }
    },
    "required": ["id", "name", "bim360_account_id"]
  },
  "relationships": {
    "bim360_account_id": {
      "references": "accounts.bim360_account_id",
      "onDelete": "restrict"
    }
  },
  "createdBy": "admin@metromont.com",
  "createdAt": "2025-10-20T..."
}
```

### Relationship Fields

**`references`** (required)
- Format: `"tableName.fieldName"`
- Example: `"accounts.bim360_account_id"`, `"users.id"`

**`onDelete`** (optional, default: "restrict")
- `restrict`: Block parent delete if children exist
- `setNull`: Set FK field to null in children
- `cascade`: Delete all child rows

## Enforcement Rules

### INSERT Validation
When inserting a row with FK fields:

```javascript
// Parent table must exist
await ensureTableExists('accounts');

// Parent row must exist with matching value
await insertRow('accounts', { bim360_account_id: 'acc-001', ... });

// Child insert validates FK
await insertRow('projects', { 
  id: 'proj-001',
  bim360_account_id: 'acc-001'  // ✅ Valid - exists in accounts
});

await insertRow('projects', { 
  id: 'proj-002',
  bim360_account_id: 'invalid'  // ❌ FK violation - doesn't exist
});
// Error: "Foreign key violation: projects.bim360_account_id -> accounts.bim360_account_id value 'invalid' not found"
```

### UPDATE Validation
Same rules apply when updating FK fields:

```javascript
await updateRow('projects', 'proj-001', {
  bim360_account_id: 'acc-002'  // Validated against accounts table
});
```

### DELETE Enforcement

#### Restrict (Default)
```javascript
// Setup
await insertRow('accounts', { bim360_account_id: 'acc-001', ... });
await insertRow('projects', { id: 'proj-001', bim360_account_id: 'acc-001', ... });

// Try to delete parent
await deleteRow('accounts', 'acc-001');
// Error: "Cannot delete: 1 projects row(s) reference this accounts. Remove references first or change onDelete policy."
```

#### Set Null
```json
"relationships": {
  "company_id": { "references": "companies.id", "onDelete": "setNull" }
}
```

```javascript
// Delete parent
await deleteRow('companies', 'comp-001');
// ✅ Success - child rows have company_id set to null
```

#### Cascade
```json
"relationships": {
  "project_id": { "references": "projects.id", "onDelete": "cascade" }
}
```

```javascript
// Delete parent
await deleteRow('projects', 'proj-001');
// ✅ Success - all child rows (project_users, project_companies, etc.) deleted
```

## Admin Pack Schemas

### Entity Hierarchy
```
accounts (root)
├── business_units
├── roles
├── users
├── companies
├── projects
│   ├── project_services
│   ├── project_products
│   ├── project_companies
│   ├── project_users
│   ├── project_roles
│   ├── project_user_roles
│   ├── project_user_companies
│   └── project_user_products
└── account_services
```

### Full Admin Schema Set (15 tables)

1. **accounts** - Root entity, no FKs
2. **business_units** - FK: `bim360_account_id` → accounts (restrict), `parent_id` → business_units (setNull)
3. **roles** - FK: `bim360_account_id` → accounts (restrict)
4. **users** - FK: `bim360_account_id` → accounts (restrict), `default_role_id` → roles (setNull)
5. **companies** - FK: `bim360_account_id` → accounts (restrict)
6. **projects** - FK: `bim360_account_id` → accounts (restrict)
7. **account_services** - FK: `bim360_account_id` → accounts (restrict)
8. **project_services** - FK: `project_id` → projects (cascade), `bim360_account_id` → accounts (restrict)
9. **project_products** - FK: `bim360_project_id` → projects (cascade), `bim360_account_id` → accounts (restrict)
10. **project_companies** - FK: `project_id` → projects (cascade), `company_id` → companies (cascade), `bim360_account_id` → accounts (restrict)
11. **project_users** - FK: `bim360_project_id` → projects (cascade), `user_id` → users (cascade), `company_id` → companies (setNull), `bim360_account_id` → accounts (restrict)
12. **project_roles** - FK: `bim360_project_id` → projects (cascade), `role_id` → roles (restrict), `bim360_account_id` → accounts (restrict)
13. **project_user_roles** - FK: `project_id` → projects (cascade), `user_id` → users (cascade), `role_id` → roles (restrict), `bim360_account_id` → accounts (restrict)
14. **project_user_companies** - FK: `project_id` → projects (cascade), `user_id` → users (cascade), `bim360_account_id` → accounts (restrict)
15. **project_user_products** - FK: `bim360_project_id` → projects (cascade), `user_id` → users (cascade), `bim360_account_id` → accounts (restrict)

## Usage Examples

### Create Admin Pack via AI

**Natural Language:**
```
"Set up the complete admin database"
"Create all admin tables"
```

**Direct Mode:**
```javascript
fetch('/api/ai', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-netlify-identity': identityHeader
  },
  body: JSON.stringify({
    direct: {
      action: 'db.ensure_admin_pack',
      args: { folderId: 'admin' }  // Optional: put in specific folder
    }
  })
});
```

**Response:**
```json
{
  "ok": true,
  "action": "db.ensure_admin_pack",
  "result": {
    "created": 15,
    "skipped": 0,
    "tables": [
      { "entity": "accounts", "tableId": "accounts", "hasRelationships": false },
      { "entity": "business_units", "tableId": "business-units", "hasRelationships": true },
      ...
    ],
    "message": "Admin pack: created 15 table(s), skipped 0 existing"
  }
}
```

### Insert Data with FK Validation

```javascript
// 1. Create account
await fetch('/api/db/rows/accounts', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-netlify-identity': identityHeader
  },
  body: JSON.stringify({
    data: {
      bim360_account_id: 'b.f61b9f7b-5481-4d25-a552-365ba99077b8',
      display_name: 'Metromont LLC',
      start_date: '2025-01-01T00:00:00Z',
      end_date: '2026-12-31T23:59:59Z'
    }
  })
});

// 2. Create project (FK validated)
await fetch('/api/db/rows/projects', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-netlify-identity': identityHeader
  },
  body: JSON.stringify({
    data: {
      id: 'b.f61b9f7b-5481-4d25-a552-365ba99077b8.proj-001',
      bim360_account_id: 'b.f61b9f7b-5481-4d25-a552-365ba99077b8',
      name: 'Charlotte Office Tower',
      status: 'active',
      job_number: 'JOB-2025-001',
      created_at: new Date().toISOString()
    }
  })
});
// ✅ Success - bim360_account_id exists in accounts table
```

### Test FK Violation

```javascript
await fetch('/api/db/rows/projects', {
  method: 'POST',
  body: JSON.stringify({
    data: {
      id: 'proj-002',
      bim360_account_id: 'does-not-exist',
      name: 'Invalid Project'
    }
  })
});
// ❌ Error 400: "Foreign key violation: projects.bim360_account_id -> accounts.bim360_account_id value 'does-not-exist' not found"
```

### Test Delete Policies

#### Restrict
```javascript
// Try to delete account that has projects
await fetch('/api/db/rows/accounts/acc-001', { method: 'DELETE' });
// ❌ Error 409: "Cannot delete: 5 projects row(s) reference this accounts. Remove references first or change onDelete policy."
```

#### Cascade
```javascript
// Delete project (cascades to project_users, project_companies, etc.)
await fetch('/api/db/rows/projects/proj-001', { method: 'DELETE' });
// ✅ Success - all child rows deleted automatically
// Response: { ok: true, message: 'Row deleted successfully', cascaded: true }
```

#### Set Null
```javascript
// Delete company (sets company_id to null in project_users)
await fetch('/api/db/rows/companies/comp-001', { method: 'DELETE' });
// ✅ Success - project_users.company_id set to null
```

### AI Commands

The AI understands relationships and will guide you:

```
"Create the projects table"
→ Creates projects with FK to accounts

"Create all admin tables"
→ Creates full admin pack with relationships

"Add a project for account acc-001"
→ Validates account exists before inserting
```

## Troubleshooting
