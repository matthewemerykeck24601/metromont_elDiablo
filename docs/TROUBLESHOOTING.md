# El Diablo Troubleshooting Guide

## Common Issues & Solutions

### 1. "Unexpected token 'T'" JSON Parse Error

**Symptom:** Client crashes with `Unexpected token 'T'` or `Unexpected token '<'`

**Cause:** Server returned HTML error page instead of JSON, and client tried to parse it as JSON.

**Solution:**
- ✅ **Fixed in latest version** - We now use robust `fetchJSON()` helper
- The helper checks content-type before parsing
- Shows helpful error messages instead of crashing
- Located in `scripts/fetch-helpers.js`

**If you still see this:**
1. Check that `fetch-helpers.js` is loaded in your HTML
2. Use `fetchJSON()` or `fetchWithIdentity()` instead of raw `fetch()`
3. Check browser console for actual error message

---

### 2. Edge Function Boot Failure ("subhoster origin not reachable")

**Symptom:** 
- "The subhoster origin ... is not reachable"
- 502 Bad Gateway errors
- Edge function won't boot

**Common Causes:**

**A. Netlify Platform Issues**
1. Check https://netlifystatus.com for incidents
2. Recent edge function logging outages can mask real errors
3. Wait 5-10 minutes and try again

**B. Deployment Issues**
1. Edge function not actually deployed
2. Function file renamed but config not updated
3. Build failed silently

**Solutions:**
1. **Verify deployment:**
   - Go to Netlify Dashboard → Edge Functions
   - Confirm function appears and is assigned to routes
   - Check deploy logs for errors

2. **Re-deploy:**
   ```bash
   git commit --allow-empty -m "Trigger redeploy"
   git push origin main
   ```

3. **Check netlify.toml:**
   - Ensure edge function paths are correct
   - Verify function names match file names

4. **Rollback if needed:**
   - In Netlify Dashboard → Deploys
   - Find last working deploy
   - Click "Publish deploy"

**C. Edge Function Code Issues**
1. **Module import errors** - Edge functions use Deno runtime
2. **Missing dependencies** - Some npm packages don't work in edge runtime
3. **Timeout** - Edge functions have stricter time limits than regular functions

**Our Fix:**
- ✅ Added try/catch to edge function
- ✅ Returns JSON errors instead of crashing
- ✅ Added proper CORS headers including `x-netlify-identity`

---

### 3. 403 Forbidden - Admin Access Required

**Symptom:** All API calls return 403 Forbidden

**Cause:** Your email is not in the `ADMIN_EMAILS` environment variable

**Solution:**
1. Go to Netlify Dashboard → Site Settings → Environment Variables
2. Find `ADMIN_EMAILS`
3. Add your email: `your.email@company.com,other@company.com`
4. Trigger redeploy for changes to take effect

**Temporary workaround:**
- Check `netlify/functions/_db-helpers.js`
- In development mode, it falls back to `mkeck@metromont.com`

---

### 4. AI Commands Failing

**Symptom:** AI returns errors or doesn't execute commands

**Possible Causes:**

**A. Missing OpenAI API Key**
```
Error: "AI service not configured - missing OPENAI_API_KEY"
```
Solution: Add `OPENAI_API_KEY` to environment variables

**B. Invalid Action**
```
Error: "Unknown action: xyz"
```
Solution: Check `/api/ai/health` for available actions

**C. FK Violations**
```
Error: "Foreign key violation: projects.bim360_account_id -> accounts.bim360_account_id value 'X' not found"
```
Solution: Create parent row first, then child rows

**D. Table Doesn't Exist**
```
Error: "Table 'xyz' does not exist"
```
Solution: Create table first or use canonical entity name (assets/issues/etc.)

**Testing:**
```javascript
// Check AI health
fetch('/api/ai/health').then(r => r.json()).then(console.log);

// Use direct mode (bypass OpenAI)
fetch('/api/ai', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-netlify-identity': getIdentityHeader()
  },
  body: JSON.stringify({
    direct: {
      action: 'db.ensure_canonical_table',
      args: { entity: 'assets' }
    }
  })
}).then(r => r.text()).then(console.log);
```

---

### 5. CORS Errors

**Symptom:** 
- "CORS policy: No 'Access-Control-Allow-Origin' header"
- "Request blocked by CORS"

**Cause:** Missing or incorrect CORS headers

**Solution:**
- ✅ **Fixed** - Edge function now sets proper CORS headers
- Includes `x-netlify-identity` in allowed headers
- Allows GET, POST, PUT, DELETE, OPTIONS

**If still occurring:**
1. Clear browser cache
2. Check edge function is deployed
3. Verify `_headers` file doesn't override

---

### 6. Authentication Loop

**Symptom:** Keeps redirecting to Autodesk login

**Causes:**
1. Token expired
2. User not in allowlist (ACL)
3. Session storage cleared

**Solution:**
1. **Check allowlist:**
   ```javascript
   ACL.isAllowed('your.email@company.com').then(console.log);
   ```

2. **Clear and re-auth:**
   ```javascript
   localStorage.clear();
   sessionStorage.clear();
   location.reload();
   ```

3. **Check user-profile.js console logs:**
   - Look for "User not allowlisted" message
   - Add user to `data/users.seed.json` or via Admin panel

---

### 7. Database Operations Failing

**Symptom:** Can't create tables, insert rows, etc.

**Checks:**

**A. Bucket exists?**
```javascript
fetch('/api/db/health')
  .then(r => r.json())
  .then(console.log);
// Should show bucket name and "ok: true"
```

**B. APS credentials configured?**
- Environment variables: `APS_CLIENT_ID`, `APS_CLIENT_SECRET`
- Check Netlify dashboard

**C. Table exists for row operations?**
```javascript
fetch('/api/db/tables')
  .then(r => r.json())
  .then(tables => console.log('Tables:', tables.map(t => t.name)));
```

---

### 8. Foreign Key Violations

**Symptom:** 
```
"Foreign key violation: table.field -> ref.field value 'X' not found"
```

**Solution:**
1. **Check parent table exists:**
   ```javascript
   fetch('/api/db/tables').then(r => r.json()).then(console.log);
   ```

2. **Check parent row exists:**
   ```javascript
   fetch('/api/db/rows/accounts').then(r => r.json()).then(console.log);
   ```

3. **Insert parent first:**
   ```javascript
   // Insert parent
   await fetch('/api/db/rows/accounts', {
     method: 'POST',
     body: JSON.stringify({
       data: { bim360_account_id: 'acc-001', display_name: 'Test' }
     })
   });
   
   // Then child
   await fetch('/api/db/rows/projects', {
     method: 'POST',
     body: JSON.stringify({
       data: { id: 'proj-001', bim360_account_id: 'acc-001', name: 'Project' }
     })
   });
   ```

---

### 9. Cannot Delete Row (409 Conflict)

**Symptom:**
```
"Cannot delete: N child row(s) reference this parent"
```

**Cause:** onDelete policy is "restrict" and child rows exist

**Solutions:**

**Option 1: Delete children first**
```javascript
// Delete all child rows
// Then delete parent
```

**Option 2: Change onDelete policy**
- Edit table schema to use "cascade" or "setNull"
- Recreate table (or update schema manually in OSS)

**Option 3: Use cascade policy**
- If table has `"onDelete": "cascade"`, children auto-delete
- Check schema: Click "Schema" button in UI

---

### 10. Slow Performance

**Symptom:** FK validation or cascade deletes take a long time

**Cause:** Current implementation scans all rows (no indexes yet)

**Workarounds:**
1. **Batch operations** - Insert multiple rows at once
2. **Pre-validate** - Check FKs client-side before submitting
3. **Use direct mode** - Bypass AI for faster execution

**Future optimizations:**
- Index referenced fields
- Cache table schemas
- Async cascade jobs

---

### 11. Edge Function Debugging

**Enable detailed logs:**

1. **Check Netlify Functions logs:**
   - Dashboard → Functions → Recent logs
   - Look for boot errors or exceptions

2. **Edge function logs:**
   - Dashboard → Edge Functions → Logs
   - Note: Logging has had recent outages

3. **Local testing:**
   ```bash
   netlify dev
   ```

**If edge function won't boot:**

1. **Simplify edge function:**
   ```javascript
   export default async (request, context) => {
     // Comment out all logic
     return await context.next();
   };
   ```

2. **Check dependencies:**
   - Edge functions can't use all npm packages
   - Deno runtime is more restrictive

3. **Move logic to regular function:**
   - Use regular Netlify Functions instead
   - They have more capabilities

---

### 12. Module Access Denied

**Symptom:** "You do not have access to this module"

**Cause:** ACL permissions not granted

**Solution:**
1. **Check your permissions:**
   ```javascript
   const email = 'your.email@company.com';
   ACL.canAccess(email, 'db-manager').then(console.log);
   ```

2. **Grant access:**
   - Open Admin panel (admin.html)
   - Find your user
   - Toggle module checkboxes
   - Or make yourself admin (grants all)

3. **Add yourself to allowlist:**
   - Edit `data/users.seed.json`
   - Or use Admin panel to add

---

## Emergency Recovery

### Nuclear Option (Reset Everything)

```javascript
// Clear all local data
localStorage.clear();
sessionStorage.clear();

// Clear cache
caches.keys().then(names => names.forEach(name => caches.delete(name)));

// Reload
location.href = 'index.html';
```

### Rollback Deployment

1. Go to Netlify Dashboard → Deploys
2. Find last working deployment
3. Click "Publish deploy"
4. Wait for rollback to complete

### Contact Support

If platform issues persist:
- Email: helpdesk@metromont.com
- Check: https://netlifystatus.com
- Netlify Support: https://answers.netlify.com

---

## Diagnostic Commands

### Quick Health Check
```javascript
// AI System
fetch('/api/ai/health').then(r => r.json()).then(console.log);

// Database
fetch('/api/db/health').then(r => r.json()).then(console.log);

// Your identity
console.log(getIdentityHeader());

// ACL status
const email = JSON.parse(localStorage.getItem('user_profile_data'))?.userInfo?.email;
Promise.all([
  ACL.isAllowed(email),
  ACL.isAdmin(email),
  ACL.canAccess(email, 'db-manager')
]).then(console.log);
```

### Verbose Mode
```javascript
// Enable in console for detailed logging
localStorage.setItem('debug_mode', 'true');
location.reload();
```

---

## Performance Tips

1. **Use Direct Mode** for testing (faster, no AI cost)
2. **Batch inserts** instead of one-by-one
3. **Pre-validate FKs** client-side
4. **Use folder scoping** to reduce data scanned
5. **Clear audit logs** periodically (they accumulate)

---

## Getting Help

1. **Check browser console** - Most errors show detailed logs
2. **Review audit logs** - `tenants/{hubId}/ai/audit/`
3. **Test with direct mode** - Isolates AI vs. execution issues
4. **Check documentation** - See `/docs` folder
5. **Review recent commits** - `git log --oneline -10`

---

## Known Limitations

### V1.0
- ⚠️ FK validation scans all rows (no indexes)
- ⚠️ Cascade deletes can be slow with many children
- ⚠️ No transaction support (operations are atomic per-row)
- ⚠️ No joins (use separate queries or GraphQL later)

### Planned for V1.1
- ✅ Indexed FK lookups
- ✅ Cached schema loads
- ✅ Async cascade operations
- ✅ Batch FK validation
- ✅ GraphQL overlay for joins

---

## Success Indicators

When everything works:
- ✅ AI FAB appears (purple gradient circle)
- ✅ Tables load in sidebar
- ✅ Folders show in panel
- ✅ AI responds to commands
- ✅ FK validation works
- ✅ No console errors

---

**Still stuck? Check the docs folder for detailed guides!**

