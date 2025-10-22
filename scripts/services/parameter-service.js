// Parameter Service Integration
// Fetches extended parameters from external service

/**
 * Fetch extended parameters from Parameter Service
 * @param {object} options - Options
 * @param {string} options.familyCategory - Optional family category filter
 * @returns {Promise<Array>} Array of parameter definitions
 */
export async function fetchExtendedParameters({ familyCategory } = {}) {
    console.log('🔧 Fetching extended parameters from Parameter Service...');
    console.log('   Family Category:', familyCategory || 'all');
    
    try {
        // TODO: Replace with your actual Parameter Service API endpoint
        // Example: const response = await fetch('/api/parameters', { method: 'GET' });
        // For now, simulate API call failure to show proper error handling
        
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Simulate service unavailable
        throw new Error('Parameter Service API not implemented - service unavailable');
        
        // When implemented, uncomment this:
        // const response = await fetch('/api/parameters', {
        //     method: 'GET',
        //     headers: {
        //         'Authorization': `Bearer ${getAccessToken()}`,
        //         'Content-Type': 'application/json'
        //     }
        // });
        // 
        // if (!response.ok) {
        //     throw new Error(`Parameter Service API error: ${response.status} ${response.statusText}`);
        // }
        // 
        // const data = await response.json();
        // return data.parameters || [];
        
    } catch (error) {
        console.warn('Parameter Service API unavailable:', error.message);
        throw error; // Re-throw to be handled by calling code
    }
}

/**
 * Normalize Parameter Service response to consistent format
 * Handles both flat arrays and grouped responses
 * @param {Array} resp - Parameter Service response
 * @returns {Array} Normalized parameter definitions
 */
export function normalizeParameterService(resp) {
    const out = [];
    
    const push = (p, group) => out.push({
        key: p.key,
        label: p.label || prettifyCanonical(p.key),
        group: group || p.group || '',
        description: p.description || '',
        source: 'EXTENDED'
    });

    if (Array.isArray(resp)) {
        if (resp.length && resp[0]?.params) {
            // Grouped form: [{ group: 'Logistics', params: [...] }]
            resp.forEach(g => g.params.forEach(p => push(p, g.group)));
        } else {
            // Flat form: [{ key, label, group, description }]
            resp.forEach(p => push(p));
        }
    }
    
    return out;
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
