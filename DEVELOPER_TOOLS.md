# Developer Tools & Cache Management

## Quick Cache Clearing Methods

### Method 1: Cache Cleaner Page (EASIEST)
Navigate to: `https://your-site.netlify.app/clear-cache.html`

**Features:**
- One-click cache clearing
- Multiple clearing options
- Visual feedback
- Keyboard shortcuts

### Method 2: Browser DevTools (FASTEST)
1. Open DevTools: `F12` or `Ctrl+Shift+I`
2. Right-click the **Refresh** button (next to address bar)
3. Select **"Empty Cache and Hard Reload"**

### Method 3: Keyboard Shortcuts
- **Windows/Linux**: `Ctrl + Shift + R` or `Ctrl + F5`
- **Mac**: `Cmd + Shift + R`

### Method 4: Browser-Specific

#### Chrome/Edge
1. Open DevTools (`F12`)
2. Go to **Application** tab
3. Expand **Storage** in left sidebar
4. Click **Clear site data**
5. Check all boxes → Click **Clear site data**

#### Firefox
1. `Ctrl + Shift + Delete`
2. Select **"Everything"** for time range
3. Check **"Cache"** and **"Site Data"**
4. Click **Clear Now**

### Method 5: Incognito/Private Mode (TESTING)
- Always loads fresh content
- No cache, no stored data
- **Chrome**: `Ctrl + Shift + N`
- **Firefox**: `Ctrl + Shift + P`
- **Edge**: `Ctrl + Shift + N`

### Method 6: URL Cache Busting (QUICK TEST)
Add `?v=timestamp` to any URL:
```
https://your-site.netlify.app/index.html?v=1234567890
```

Our `clear-cache.html` does this automatically with `Date.now()`

---

## Netlify Monitoring & Logging

### A) Netlify CLI (Real-Time Logs)

#### Install Netlify CLI
```bash
npm install -g netlify-cli
```

#### Login to Netlify
```bash
netlify login
```

#### Link to Your Site
```bash
cd c:\Users\mstri\Documents\elDiablo\metromont_elDiablo
netlify link
```

#### Watch Deploy Logs
```bash
netlify watch
```

#### View Function Logs (Real-Time)
```bash
netlify functions:log
```

#### Specific Function
```bash
netlify functions:log auth
netlify functions:log oss-storage
```

### B) Netlify Dashboard (Web UI)

#### Live Deploy Logs
1. Go to https://app.netlify.com
2. Select your site: **metromont_elDiablo**
3. Click **Deploys** tab
4. Click on the latest deploy
5. View **Deploy log** in real-time

#### Function Logs
1. In your site dashboard
2. Click **Functions** tab
3. Click on a function (e.g., `auth`, `oss-storage`)
4. View **Recent invocations**
5. Click on an invocation to see details

#### Real-Time Function Logs (New Feature)
1. Navigate to **Functions** → Select function
2. Click **Real-time logs** button (if available)
3. Logs stream in real-time as requests come in

### C) Browser Console (Client-Side)

Our modules have extensive console logging:

#### Enable Verbose Logging
Open DevTools Console (`F12` → Console) and run:
```javascript
// See all logs
localStorage.setItem('debug', 'true');

// Filter by module
console.log('Erection Sequencing logs:', 
  performance.getEntriesByType('navigation'));
```

#### Key Log Patterns
- `=== AEC DM GraphQL Query ===` - GraphQL requests
- `✅` - Success operations
- `❌` - Error operations
- `🔍` - Search/query operations
- `📂` - Data loading operations

#### Network Tab Monitoring
1. Open DevTools → **Network** tab
2. Filter by:
   - `XHR` - API calls
   - `JS` - JavaScript files
   - `Doc` - HTML pages
3. Click on requests to see:
   - Headers (including Authorization)
   - Response body
   - Timing

---

## Common Cache Issues & Solutions

### Issue: JavaScript Not Updating
**Symptoms:** Old code running after deploy

**Solutions:**
1. Hard reload: `Ctrl + Shift + R`
2. Clear cache via `clear-cache.html`
3. Check DevTools → Network → Disable cache checkbox
4. Verify deploy completed on Netlify

### Issue: "Cannot query field X" GraphQL Error
**Symptoms:** 400 errors from AEC DM API

**Solutions:**
1. Check GraphQL query syntax
2. Verify schema at: https://aps.autodesk.com/aec-data-model-api-docs
3. Test query in GraphQL playground
4. Check browser console for full error

### Issue: Old Auth Token Cached
**Symptoms:** 401/403 errors, "token expired"

**Solutions:**
```javascript
// Run in console
sessionStorage.removeItem('forge_token');
localStorage.removeItem('forge_token_backup');
location.reload();
```

### Issue: Service Worker Caching
**Symptoms:** Content not updating despite hard reload

**Solutions:**
1. DevTools → Application → Service Workers
2. Check "Update on reload"
3. Click "Unregister" for any workers
4. Hard reload

---

## Development Workflow

### 1. Local Development
```bash
# Make changes to files
# Test locally if possible
```

### 2. Commit & Push
```bash
git add .
git commit -m "Description of changes"
git push origin main
```

### 3. Monitor Deploy
```bash
# Option A: CLI
netlify watch

# Option B: Dashboard
# https://app.netlify.com → Your Site → Deploys
```

### 4. Test Deploy
```bash
# Option A: Fresh browser
# Open incognito window

# Option B: Clear cache
# Navigate to /clear-cache.html

# Option C: Hard reload
# Ctrl + Shift + R
```

### 5. Check Logs
```bash
# Function logs
netlify functions:log

# Or browser console
# F12 → Console
```

---

## Bookmarklet for Quick Cache Clear

Drag this link to your bookmarks bar:

```javascript
javascript:(function(){localStorage.clear();sessionStorage.clear();if('caches'in window){caches.keys().then(names=>{names.forEach(name=>caches.delete(name))});}location.href=location.href.split('?')[0]+'?v='+Date.now();})();
```

**Name it:** "🧹 Clear El Diablo Cache"

**Click it** whenever you need to force fresh content.

---

## Cache Headers (Reference)

Our `_headers` file configures:

```
/scripts/*
  Cache-Control: public, max-age=3600, must-revalidate

/styles/*
  Cache-Control: public, max-age=3600, must-revalidate

/assets/*
  Cache-Control: public, max-age=86400
```

**What this means:**
- Scripts/Styles: Cache 1 hour, revalidate
- Assets: Cache 24 hours
- Hard reload always bypasses these

---

## Pro Tips

### Disable Cache During Development
DevTools → Network → Check "Disable cache" (keep DevTools open)

### See What's Cached
DevTools → Application → Cache Storage → Expand to see cached files

### Force Netlify Rebuild
```bash
netlify deploy --prod --build
```

### Clear Netlify Cache
In Netlify Dashboard:
1. Site Settings → Build & Deploy
2. Scroll to "Deploy settings"
3. Click "Clear cache and retry deploy"

### Version Your Deploys
Add to git commit messages:
```bash
git commit -m "feat: Add feature X [v1.2.0]"
```

Netlify automatically tags deploys with commit hash.

---

## Support

If cache issues persist:
1. Check Netlify deploy log for errors
2. Verify files uploaded correctly
3. Test in incognito mode
4. Check browser console for errors
5. Review Network tab for 404s

---

**Last Updated:** 2025-10-07

