// Robust Fetch Helpers
// Prevents crashes when server returns HTML error pages instead of JSON

/**
 * Fetch JSON with proper error handling
 * Prevents crashes when server returns HTML error pages
 */
export async function fetchJSON(url, init = {}) {
  try {
    const res = await fetch(url, init);

    // Always read the body once
    const raw = await res.text();
    const ctype = (res.headers.get('content-type') || '').toLowerCase();

    // Check if response is OK
    if (!res.ok) {
      // Try to parse as JSON first
      if (ctype.includes('application/json')) {
        try {
          const errorData = JSON.parse(raw);
          throw new Error(errorData.error || errorData.message || `HTTP ${res.status}: ${res.statusText}`);
        } catch (parseErr) {
          // JSON parse failed, use raw text
          throw new Error(`HTTP ${res.status} ${res.statusText}\n${raw.slice(0, 500)}`);
        }
      } else {
        // Not JSON, surface the first chunk of the error page
        throw new Error(`HTTP ${res.status} ${res.statusText}\n${raw.slice(0, 500)}`);
      }
    }

    // Response is OK, verify it's JSON
    if (!ctype.includes('application/json')) {
      console.warn(`Expected JSON but got: ${ctype}`);
      // Try to parse anyway (some servers don't set content-type correctly)
      if (raw.trim().startsWith('{') || raw.trim().startsWith('[')) {
        try {
          return JSON.parse(raw);
        } catch (e) {
          throw new Error(`Expected JSON but got: ${ctype}\n${raw.slice(0, 200)}`);
        }
      }
      throw new Error(`Expected JSON but got: ${ctype}\n${raw.slice(0, 200)}`);
    }

    // Parse JSON
    try {
      return JSON.parse(raw);
    } catch (e) {
      throw new Error(`Bad JSON: ${e.message}\n${raw.slice(0, 200)}`);
    }

  } catch (error) {
    // Re-throw with context
    if (error.message.includes('HTTP') || error.message.includes('Expected JSON')) {
      throw error;
    }
    throw new Error(`Network error: ${error.message}`);
  }
}

/**
 * Fetch with identity header helper
 */
export async function fetchWithIdentity(url, options = {}) {
  const identityHeader = window.getIdentityHeader ? window.getIdentityHeader() : null;
  
  if (!identityHeader) {
    throw new Error('Not authenticated. Please sign in first.');
  }
  
  const init = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-netlify-identity': identityHeader,
      ...(options.headers || {})
    }
  };
  
  return fetchJSON(url, init);
}

/**
 * Safe JSON parse that doesn't crash on HTML
 */
export function safeJSONParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error('JSON parse failed:', e.message);
    console.error('Text was:', text.slice(0, 200));
    return fallback;
  }
}

// Make available globally
window.fetchJSON = fetchJSON;
window.fetchWithIdentity = fetchWithIdentity;
window.safeJSONParse = safeJSONParse;

console.log('✅ Fetch helpers loaded');

