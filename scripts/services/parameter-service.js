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
    
    // TODO: Replace with your actual Parameter Service API
    // For now, return mock data that matches your Metromont workflow
    const mockParameters = [
        // Logistics & Fabrication
        { 
            key: 'FABRICATION_STATUS', 
            label: 'Fabrication Status', 
            group: 'Logistics', 
            description: 'Shop/yard fabrication status (Not Started, In Progress, Complete)' 
        },
        { 
            key: 'TRUCK_LOAD', 
            label: 'Truck Load', 
            group: 'Logistics',
            description: 'Truck load number for shipping'
        },
        { 
            key: 'SHIPPING_DATE', 
            label: 'Shipping Date', 
            group: 'Logistics',
            description: 'Date shipped from fabrication yard'
        },
        
        // Field Operations
        { 
            key: 'ERECTION_CREW', 
            label: 'Erection Crew', 
            group: 'Field',
            description: 'Assigned erection crew identifier'
        },
        { 
            key: 'FIELD_STATUS', 
            label: 'Field Status', 
            group: 'Field',
            description: 'Current field installation status'
        },
        { 
            key: 'ERECTION_DATE', 
            label: 'Erection Date', 
            group: 'Field',
            description: 'Actual erection completion date'
        },
        
        // Scheduling & Sequencing
        { 
            key: 'SEQUENCE_NUMBER', 
            label: 'Sequence Number', 
            group: 'Scheduling',
            description: 'Erection sequence number (already in PROPERTY_MAP)'
        },
        { 
            key: 'SEQUENCE_DATE', 
            label: 'Sequence Date', 
            group: 'Scheduling',
            description: 'Scheduled erection date (already in PROPERTY_MAP)'
        },
        { 
            key: 'PRIORITY_LEVEL', 
            label: 'Priority Level', 
            group: 'Scheduling',
            description: 'Installation priority (High, Medium, Low)'
        },
        
        // Quality Control
        { 
            key: 'QC_STATUS', 
            label: 'QC Status', 
            group: 'Quality',
            description: 'Quality control inspection status'
        },
        { 
            key: 'INSPECTOR', 
            label: 'Inspector', 
            group: 'Quality',
            description: 'Assigned quality control inspector'
        },
        { 
            key: 'QC_DATE', 
            label: 'QC Date', 
            group: 'Quality',
            description: 'Quality control inspection date'
        },
        
        // Safety
        { 
            key: 'SAFETY_REQUIREMENTS', 
            label: 'Safety Requirements', 
            group: 'Safety',
            description: 'Special safety requirements for this element'
        },
        { 
            key: 'SAFETY_CREW', 
            label: 'Safety Crew', 
            group: 'Safety',
            description: 'Assigned safety crew for installation'
        }
    ];
    
    // Filter by family category if provided
    let filtered = mockParameters;
    if (familyCategory) {
        // In a real implementation, you'd filter based on the service response
        // For now, we'll return all parameters
        console.log(`   Filtering by category: ${familyCategory}`);
    }
    
    console.log(`✅ Fetched ${filtered.length} extended parameters`);
    return filtered;
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
