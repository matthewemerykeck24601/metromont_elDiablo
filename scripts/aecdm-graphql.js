// AEC Data Model GraphQL Helper
// Provides proper ID resolution from ACC to AEC DM format

const AEC_GRAPHQL_URL = 'https://developer.api.autodesk.com/aec/graphql';

/**
 * Execute a GraphQL query against the AEC Data Model API
 * @param {string} query - The GraphQL query string
 * @param {object} variables - Query variables
 * @param {string} region - Region: 'US' | 'EMEA' | 'AUS' (default 'US')
 * @returns {Promise<any>} Query result data
 */
async function aecdmQuery(query, variables = {}, region = 'US') {
    if (!window.forgeAccessToken) {
        throw new Error('No APS token available. Please authenticate first.');
    }

    console.log('=== AEC DM GraphQL Query ===');
    console.log('Region:', region);
    console.log('Variables:', variables);

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${window.forgeAccessToken}`
    };

    // Optional region header (US is default). Use EMEA or AUS if your hub lives there.
    if (region && region !== 'US') {
        headers['x-ads-region'] = region;
        console.log('Using region header:', region);
    }

    try {
        const response = await fetch(AEC_GRAPHQL_URL, {
            method: 'POST',
            headers,
            body: JSON.stringify({ query, variables })
        });

        console.log('GraphQL response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('GraphQL HTTP error:', response.status, errorText);
            throw new Error(`GraphQL request failed: ${response.status} - ${errorText}`);
        }

        const json = await response.json();

        if (json.errors) {
            console.error('GraphQL errors:', json.errors);
            const errorMessages = json.errors.map(e => e.message).join('; ');
            throw new Error(`GraphQL Error: ${errorMessages}`);
        }

        console.log('✅ GraphQL query successful');
        return json.data;

    } catch (error) {
        console.error('❌ AEC DM GraphQL error:', error);
        throw error;
    }
}

/**
 * Resolve AEC DM Hub ID by matching ACC hub name
 * @param {object} options - Options object
 * @param {string} options.hubName - ACC hub name to match
 * @returns {Promise<string>} AEC DM hub ID
 */
async function resolveAecdmHubId({ hubName } = {}) {
    console.log('🔍 Resolving AEC DM Hub ID for:', hubName);
    
    const Q_HUBS = `
        query {
            hubs(pagination: { limit: 100 }) {
                results {
                    id
                    name
                }
            }
        }
    `;
    
    const data = await aecdmQuery(Q_HUBS, {});
    const hubs = data?.hubs?.results || [];
    
    console.log(`Found ${hubs.length} AEC DM hubs`);
    
    if (!hubs.length) {
        throw new Error('No AEC DM hubs visible to this user');
    }

    // Try name match first
    if (hubName) {
        const byName = hubs.find(h => h.name?.toLowerCase() === hubName.toLowerCase());
        if (byName) {
            console.log(`✅ Matched hub by name: ${byName.name} (${byName.id})`);
            return byName.id;
        }
    }
    
    // Fallback to first hub
    console.log(`⚠️ Using first available hub: ${hubs[0].name} (${hubs[0].id})`);
    return hubs[0].id;
}

/**
 * Resolve AEC DM Project ID from ACC project ID
 * @param {object} options - Options object
 * @param {string} options.aecdmHubId - AEC DM hub ID
 * @param {string} options.accProjectId - ACC project ID (b.xxx format)
 * @param {string} options.projectName - Project name for fallback matching
 * @returns {Promise<string>} AEC DM project ID
 */
async function resolveAecdmProjectId({ aecdmHubId, accProjectId, projectName }) {
    console.log('🔍 Resolving AEC DM Project ID');
    console.log('  AEC DM Hub ID:', aecdmHubId);
    console.log('  ACC Project ID:', accProjectId);
    console.log('  Project Name:', projectName);
    
    const Q_PROJECTS = `
        query GetProjects($hubId: ID!) {
            projects(hubId: $hubId, pagination: { limit: 100 }) {
                results {
                    id
                    name
                    alternativeIdentifiers {
                        dataManagementAPIProjectId
                    }
                }
            }
        }
    `;
    
    // Single page (limit 100) for initial test
    const data = await aecdmQuery(Q_PROJECTS, { hubId: aecdmHubId });
    const projects = data?.projects?.results || [];
    
    console.log(`Found ${projects.length} AEC DM projects in hub`);

    // Try exact match on ACC project ID
    if (accProjectId) {
        const byAccId = projects.find(p => 
            p.alternativeIdentifiers?.dataManagementAPIProjectId === accProjectId
        );
        if (byAccId) {
            console.log(`✅ Matched project by ACC ID: ${byAccId.name} (${byAccId.id})`);
            return byAccId.id;
        }
    }
    
    // Try by name as fallback
    if (projectName) {
        const byName = projects.find(p => 
            p.name?.toLowerCase() === projectName.toLowerCase()
        );
        if (byName) {
            console.log(`✅ Matched project by name: ${byName.name} (${byName.id})`);
            return byName.id;
        }
    }
    
    console.error('❌ Could not resolve AEC DM project ID');
    console.error('Available projects:', projects.map(p => ({
        id: p.id,
        name: p.name,
        accId: p.alternativeIdentifiers?.dataManagementAPIProjectId
    })));
    
    throw new Error('Could not resolve AEC DM project ID from ACC project');
}

// --- BEGIN REPLACEMENT: getElementGroupsForProject ---
async function getElementGroupsForProject(accProjectId, region = 'US', opts = {}) {
    try {
        console.log('📂 Getting element groups for ACC project:', accProjectId);

        // 0) Try to resolve an AEC DM project id from the ACC id
        const aecdmProjectId = await (async () => {
            // (a) direct resolver: projectByDataManagementAPIId
            const Q_PROJECT_BY_DM_ID = `
                query GetProjectByDMID($accId: ID!) {
                    projectByDataManagementAPIId(dataManagementAPIProjectId: $accId) {
                        id
                        name
                    }
                }
            `;
            // First attempt: raw ACC id
            try {
                const projA = await aecdmQuery(Q_PROJECT_BY_DM_ID, { accId: accProjectId }, region);
                const pA = projA?.projectByDataManagementAPIId;
                if (pA?.id) {
                    console.log('✅ Resolved via direct DM id:', pA.name, pA.id);
                    return pA.id;
                }
            } catch (e) {
                console.warn('Direct DM id lookup failed:', e.message);
            }

            // Second attempt: try URN form if b.-prefixed
            if (typeof accProjectId === 'string' && accProjectId.startsWith('b.')) {
                const uuid = accProjectId.slice(2);
                const dmUrn = `urn:adsk.wipprod:dm.project:${uuid}`;
                try {
                    const projB = await aecdmQuery(Q_PROJECT_BY_DM_ID, { accId: dmUrn }, region);
                    const pB = projB?.projectByDataManagementAPIId;
                    if (pB?.id) {
                        console.log('✅ Resolved via DM URN:', pB.name, pB.id);
                        return pB.id;
                    }
                } catch (e) {
                    console.warn('DM URN lookup failed:', e.message);
                }
            }

            // (b) fallback: scan hubs -> projects and match alt ids or name
            const Q_HUBS = `
                query {
                    hubs(pagination: { limit: 100 }) {
                        results { id name }
                    }
                }
            `;
            const hubsData = await aecdmQuery(Q_HUBS, {}, region);
            const hubs = hubsData?.hubs?.results ?? [];
            if (!hubs.length) throw new Error('No AEC DM hubs visible to this user');

            const Q_PROJECTS = `
                query GetProjects($hubId: ID!) {
                    projects(hubId: $hubId, pagination: { limit: 100 }) {
                        results {
                            id
                            name
                            alternativeIdentifiers { dataManagementAPIProjectId }
                        }
                    }
                }
            `;

            for (const hub of hubs) {
                const projsData = await aecdmQuery(Q_PROJECTS, { hubId: hub.id }, region);
                const projs = projsData?.projects?.results ?? [];

                // match by ACC id
                const byAcc = projs.find(p => p?.alternativeIdentifiers?.dataManagementAPIProjectId === accProjectId);
                if (byAcc?.id) {
                    console.log(`✅ Matched project by ACC id in hub ${hub.name}:`, byAcc.name, byAcc.id);
                    return byAcc.id;
                }

                // optional match by name from UI
                if (opts.projectName) {
                    const byName = projs.find(p => (p.name || '').toLowerCase() === opts.projectName.toLowerCase());
                    if (byName?.id) {
                        console.log(`✅ Matched project by name in hub ${hub.name}:`, byName.name, byName.id);
                        return byName.id;
                    }
                }
            }

            throw new Error('Could not resolve AEC DM project ID from ACC project');
        })();

        // 1) With a verified AEC DM project id, list element groups
        const Q_ELEMENT_GROUPS = `
            query GetElementGroups($projectId: ID!) {
                elementGroupsByProject(projectId: $projectId, pagination: { limit: 100 }) {
                    results {
                        id
                        name
                        alternativeIdentifiers { fileVersionUrn }
                    }
                }
            }
        `;
        const egData = await aecdmQuery(Q_ELEMENT_GROUPS, { projectId: aecdmProjectId }, region);
        const elementGroups = egData?.elementGroupsByProject?.results || [];

        console.log(`✅ Found ${elementGroups.length} element groups`);
        return elementGroups.map(eg => ({
            id: eg.id,
            name: eg.name,
            fileVersionUrn: eg.alternativeIdentifiers?.fileVersionUrn || null
        }));

    } catch (error) {
        console.error('Error fetching element groups:', error);
        throw error;
    }
}
// --- END REPLACEMENT ---

/**
 * Get elements from an element group with filter
 * @param {string} elementGroupId - The AEC DM element group ID
 * @param {string} filter - GraphQL filter string
 * @param {string} region - Region (default 'US')
 * @returns {Promise<Array>} Array of elements with properties
 */
async function getElementsByElementGroup(elementGroupId, filter, region = 'US') {
    try {
        console.log('🔍 Fetching elements from element group:', elementGroupId);
        console.log('Filter:', filter);

        const Q_ELEMENTS = `
            query ElementsByElementGroup($elementGroupId: ID!, $filter: String!) {
                elementsByElementGroup(
                    elementGroupId: $elementGroupId,
                    filter: { query: $filter },
                    pagination: { limit: 100 }
                ) {
                    results {
                        id
                        name
                        properties(filter: { names: ["External ID", "Mark", "Category", "Element Context"] }) {
                            results {
                                name
                                value
                            }
                        }
                    }
                }
            }
        `;

        const data = await aecdmQuery(Q_ELEMENTS, { elementGroupId, filter }, region);
        const page = data?.elementsByElementGroup;
        const results = page?.results || [];

        console.log(`✅ Found ${results.length} elements`);

        // Map to simpler format with property dictionary
        return results.map(element => {
            const props = {};
            if (element.properties && element.properties.results) {
                element.properties.results.forEach(p => {
                    props[p.name] = p.value;
                });
            }

            return {
                id: element.id,
                name: element.name,
                externalId: props['External ID'] || null,
                mark: props['Mark'] || null,
                category: props['Category'] || null,
                context: props['Element Context'] || null,
                properties: props
            };
        });

    } catch (error) {
        console.error('Error fetching elements:', error);
        throw error;
    }
}

/**
 * Build a GraphQL filter string for elements
 * @param {Array<string>} markValues - Array of Mark values to match
 * @param {string} category - Optional category filter
 * @returns {string} GraphQL filter string
 */
function buildElementFilter(markValues, category = null) {
    let filter = "('property.name.Element Context'==Instance)";

    if (category) {
        filter += ` and ('property.name.Category'=='${category}')`;
    }

    if (markValues && markValues.length > 0) {
        const markList = markValues.map(m => `'${m}'`).join(',');
        filter += ` and ('property.name.Mark' in [${markList}])`;
    }

    return filter;
}

// Export functions for global access
window.AECDataModel = {
    query: aecdmQuery,
    getElementGroups: getElementGroupsForProject,
    getElements: getElementsByElementGroup,
    buildFilter: buildElementFilter
};

console.log('✅ AEC Data Model GraphQL helper loaded with direct project resolution');
