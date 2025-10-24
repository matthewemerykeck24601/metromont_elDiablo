// Parameter Service Integration
// Fetches extended parameters from external service

/**
 * Fetch extended parameters from Autodesk Parameters Service (ACC) via our Netlify proxy.
 * Accepts optional filters such as familyCategory and search.
 * Requires window.forgeAccessToken and window.selectedProjectId to be set.
 */
export async function fetchExtendedParameters({ familyCategory, search } = {}) {
  console.log('🔧 Fetching extended parameters from Autodesk Parameters Service...');
  console.log('   Family Category:', familyCategory || 'all');

  const projectId = window.selectedProjectId || '';
  const accountId = window.selectedAccountId || '';
  const projectGuid = window.selectedProjectGuid || projectId;
  
  if (!projectId) {
    throw new Error('No ACC project selected (selectedProjectId missing).');
  }

  const params = new URLSearchParams();
  params.set('projectId', projectId);
  params.set('accountId', accountId);
  params.set('projectGuid', projectGuid);
  if (familyCategory) params.set('familyCategory', familyCategory);
  if (search) params.set('search', search);

  const url = `/api/parameters?${params.toString()}`;

  const headers = {
    'Accept': 'application/json',
    // Forward the user's 3-legged token to the Netlify function
    'X-Forge-Access-Token': window.forgeAccessToken || ''
  };

  const resp = await fetch(url, { method: 'GET', headers });
  const text = await resp.text();

  if (!resp.ok) {
    // Surface upstream error (401/403 often means token expired or scopes)
    console.warn('Parameter proxy URL:', url);
    throw new Error(`Parameters API ${resp.status}: ${text}`);
  }

  // The API commonly returns: { parameters: [ { id, key, displayName, description, ... }, ... ] }
  // But we also allow a raw array. Parse defensively.
  let data = {};
  try { data = JSON.parse(text); } catch { data = { parameters: [] }; }

  return data.parameters || data;
}

/**
 * Normalize Autodesk parameters into the flat structure our UI expects.
 * Accepts either:
 *   - array of parameter objects, or
 *   - { parameters: [...] }
 * Produces: [{ key, label, group, description }]
 */
export function normalizeParameterService(input) {
  const list = Array.isArray(input) ? input : (input?.parameters || []);
  return list.map(p => ({
    key: p.key || p.name || p.id,            // prefer stable key; fall back safely
    label: p.displayName || p.label || p.key || p.id,
    group: p.group || 'Extended',
    description: p.description || ''
  }));
}

/**
 * Prettify canonical key names for display
 * @param {string} key - Canonical key (e.g., 'CONTROL_NUMBER')
 * @returns {string} Prettified label (e.g., 'Control Number')
 */
function prettifyCanonical(key) {
    return key.split('_').map(w => w[0] + w.slice(1).toLowerCase()).join(' ');
}

/**
 * Deduplicate array by key property
 * @param {Array} arr - Array of objects with key property
 * @returns {Array} Deduplicated array
 */
export function dedupeByKey(arr) {
    const seen = new Set();
    return arr.filter(x => !seen.has(x.key) && seen.add(x.key));
}

/**
 * Escape HTML characters for safe display
 * @param {string} s - String to escape
 * @returns {string} HTML-escaped string
 */
export function escapeHtml(s = '') {
    return s.replace(/[&<>"]/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;'
    }[c]));
}
