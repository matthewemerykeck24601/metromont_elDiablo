# Relationships Testing Checklist

## Setup Phase

### 1. Create Admin Pack
```javascript
const identityHeader = getIdentityHeader();

const response = await fetch('/api/ai', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-netlify-identity': identityHeader
  },
  body: JSON.stringify({
    direct: {
      action: 'db.ensure_admin_pack',
      args: { folderId: 'admin' }
    }
  })
});

const result = await response.json();
console.log('Admin pack created:', result);
// Expected: { created: 15, skipped: 0, ... }
```

## Test Cases

### Test 1: Valid FK Insert ✅
```javascript
// Insert parent
await fetch('/api/db/rows/accounts', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-netlify-identity': identityHeader },
  body: JSON.stringify({
    data: {
      bim360_account_id: 'test-acc-001',
      display_name: 'Test Account'
    }
  })
});

// Insert child with valid FK
const res = await fetch('/api/db/rows/projects', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-netlify-identity': identityHeader },
  body: JSON.stringify({
    data: {
      id: 'test-proj-001',
      bim360_account_id: 'test-acc-001',  // ✅ Valid
      name: 'Test Project',
      status: 'active'
    }
  })
});

console.assert(res.ok, 'Should succeed with valid FK');
```

### Test 2: Invalid FK Insert ❌
```javascript
const res = await fetch('/api/db/rows/projects', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-netlify-identity': identityHeader },
  body: JSON.stringify({
    data: {
      id: 'test-proj-002',
      bim360_account_id: 'invalid-account',  // ❌ Doesn't exist
      name: 'Invalid Project',
      status: 'active'
    }
  })
});

console.assert(!res.ok, 'Should fail with invalid FK');
console.assert(res.status === 400, 'Should return 400');

const error = await res.json();
console.assert(error.error.includes('Foreign key violation'), 'Should mention FK violation');
```

### Test 3: Restrict Delete ❌
```javascript
// Try to delete account that has projects
const res = await fetch('/api/db/rows/accounts/test-acc-001', {
  method: 'DELETE',
  headers: { 'x-netlify-identity': identityHeader }
});

console.assert(!res.ok, 'Should fail - has child rows');
console.assert(res.status === 409, 'Should return 409 Conflict');

const error = await res.json();
console.assert(error.error.includes('Cannot delete'), 'Should explain restriction');
```

### Test 4: Cascade Delete ✅
```javascript
// Create project with cascading children
await fetch('/api/db/rows/project_users', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-netlify-identity': identityHeader },
  body: JSON.stringify({
    data: {
      bim360_project_id: 'test-proj-001',
      bim360_account_id: 'test-acc-001',
      user_id: 'user-001',
      status: 'active',
      access_level: 'project_user'
    }
  })
});

// Delete project (should cascade to project_users)
const res = await fetch('/api/db/rows/projects/test-proj-001', {
  method: 'DELETE',
  headers: { 'x-netlify-identity': identityHeader }
});

console.assert(res.ok, 'Should succeed with cascade');

const result = await res.json();
console.assert(result.cascaded, 'Should indicate cascade occurred');

// Verify child was deleted
const childCheck = await fetch('/api/db/rows/project_users');
const children = await childCheck.json();
const stillExists = children.some(r => r.bim360_project_id === 'test-proj-001');
console.assert(!stillExists, 'Child rows should be deleted');
```

### Test 5: Set Null Delete ✅
```javascript
// Create user with company (onDelete: setNull)
await fetch('/api/db/rows/companies', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-netlify-identity': identityHeader },
  body: JSON.stringify({
    data: {
      id: 'test-comp-001',
      bim360_account_id: 'test-acc-001',
      name: 'Test Company',
      status: 'active'
    }
  })
});

await fetch('/api/db/rows/project_users', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-netlify-identity': identityHeader },
  body: JSON.stringify({
    data: {
      bim360_project_id: 'test-proj-002',
      bim360_account_id: 'test-acc-001',
      user_id: 'user-002',
      company_id: 'test-comp-001',  // Will be set to null on company delete
      status: 'active',
      access_level: 'project_user'
    }
  })
});

// Delete company
const res = await fetch('/api/db/rows/companies/test-comp-001', {
  method: 'DELETE',
  headers: { 'x-netlify-identity': identityHeader }
});

console.assert(res.ok, 'Should succeed with setNull');

// Verify company_id was nullified
const userCheck = await fetch('/api/db/rows/project_users');
const users = await userCheck.json();
const affected = users.find(r => r.user_id === 'user-002');
console.assert(affected.company_id === null, 'company_id should be null');
```

### Test 6: Null FK Allowed ✅
```javascript
// Insert row with null FK (should be allowed)
const res = await fetch('/api/db/rows/users', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-netlify-identity': identityHeader },
  body: JSON.stringify({
    data: {
      id: 'user-003',
      bim360_account_id: 'test-acc-001',
      email: 'test@example.com',
      default_role_id: null  // ✅ Null is OK
    }
  })
});

console.assert(res.ok, 'Should allow null FK values');
```

### Test 7: Update with FK Validation
```javascript
// Update to valid FK
let res = await fetch('/api/db/rows/projects/test-proj-001', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', 'x-netlify-identity': identityHeader },
  body: JSON.stringify({
    data: {
      bim360_account_id: 'test-acc-001'  // ✅ Valid
    }
  })
});
console.assert(res.ok, 'Should allow update to valid FK');

// Update to invalid FK
res = await fetch('/api/db/rows/projects/test-proj-001', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', 'x-netlify-identity': identityHeader },
  body: JSON.stringify({
    data: {
      bim360_account_id: 'invalid'  // ❌ Invalid
    }
  })
});
console.assert(!res.ok, 'Should reject invalid FK on update');
```

## UI Testing

### 1. View Relationships in Schema
1. Open DB Manager
2. Go to Tables tab
3. Find a table with relationships (e.g., "projects")
4. Click "Schema" button
5. Verify:
   - ✅ Foreign key relationships listed
   - ✅ onDelete policies shown with color-coded badges
   - ✅ Field types and descriptions displayed

### 2. Check Relationships Badge
1. Tables overview should show relationship count
2. Tables with FKs display green badge: "3 FK(s)"
3. Tables without FKs show "-"

### 3. AI Commands
```
"Create the projects table"
→ Should show relationships in success message

"Show me the schema for projects"
→ AI widget should display FK info

"Create all admin tables"
→ Should create 15 tables with proper relationships
```

## Expected Behaviors

### On Valid Operations
- ✅ 201 Created (POST)
- ✅ 200 OK (PUT/DELETE)
- ✅ Data saved to OSS
- ✅ Audit log written

### On FK Violations
- ❌ 400 Bad Request
- ❌ Error message: "Foreign key violation: table.field -> ref.field value 'X' not found"
- ❌ No data written
- ✅ Audit log records failure

### On Delete Restrictions
- ❌ 409 Conflict
- ❌ Error message: "Cannot delete: N child row(s) reference this parent"
- ❌ No data deleted
- ✅ Helpful message about removing references

### On Cascade/SetNull
- ✅ 200 OK with message
- ✅ Parent deleted
- ✅ Children updated/deleted per policy
- ✅ Metadata includes cascade reason

## Performance Notes

⚠️ **Current Implementation:**
- FKvalidation scans all rows in referenced table
- Delete enforcement scans all tables for relationships
- Suitable for datasets < 10,000 rows per table

💡 **Future Optimizations:**
- Index referenced fields for O(1) lookup
- Cache table schemas (currently loaded per operation)
- Batch FK checks for bulk inserts
- GraphQL overlay for joins

## Troubleshooting

**FK validation too slow:**
- Consider indexing referenced fields
- Use batch inserts instead of one-by-one
- Pre-validate data client-side

**Cascade deletes taking long:**
- Expected with many child rows
- Check audit logs for cascade count
- Consider async cascade jobs for large datasets

**Can't delete important row:**
- Check onDelete policy (might be "restrict")
- Find and remove child references first
- Or change policy to "setNull" or "cascade" (use carefully!)

## Audit Trail

All FK operations are logged:
```
tenants/{hubId}/ai/audit/{date}/{id}.json
```

Check logs for:
- FK validation failures
- Cascade operation details
- Performance metrics

