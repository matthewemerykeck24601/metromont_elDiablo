// AEC Data Model GraphQL Helper for El Diablo / CastLink
// Uses Beta API schema: results (not items), pagination { cursor } (no hasMore)
// Resolves projects by NAME, not ACC ID, to avoid ID malformation errors

const AEC_GRAPHQL_URL = 'https://developer.api.autodesk.com/aec/graphql';

/**
 * Execute a GraphQL query against the AEC Data Model API
 * @param {object} options - Query options
 * @param {string} options.query - The GraphQL query string
 * @param {object} options.variables - Query variables
 * @param {string} options.token - APS access token
 * @param {string} options.region - Region: 'US' | 'EMEA' | 'AUS' (default 'US')
 * @returns {Promise<any>} Query result data
 */
async function aecdmQuery({ query, variables = {}, token, region = 'US' }) {
    if (!token && !window.forgeAccessToken) {
        throw new Error('No APS token available. Please authenticate first.');
    }

    const accessToken = token || window.forgeAccessToken;

    console.log('=== AEC DM GraphQL Query ===');
    console.log('Region:', region);
    console.log('Variables:', variables);

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
    };

    // Optional region header (US is default)
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
 * Get AEC-DM hub ID (by name or fallback to first hub)
 * @param {object} options - Options
 * @param {string} options.token - APS access token
 * @param {string} options.region - Region (default 'US')
 * @param {string} options.preferredHubName - Optional hub name to match
 * @returns {Promise<string>} AEC-DM hub ID
 */
async function getAecdmHubId({ token, region = 'US', preferredHubName }) {
    console.log('🔍 Getting AEC-DM hub ID...');
    
    const query = `
        query {
            hubs {
                pagination { cursor }
                results {
                    id
                    name
                    alternativeIdentifiers {
                        dataManagementAPIHubId
                    }
                }
            }
        }
    `;

    const data = await aecdmQuery({ token, region, query, variables: {} });
    
    if (!data?.hubs?.results?.length) {
        throw new Error('No AEC-DM hubs available');
    }

    console.log(`Found ${data.hubs.results.length} AEC-DM hub(s)`);

    // Try to match by name if provided
    if (preferredHubName) {
        const match = data.hubs.results.find(h => h.name === preferredHubName);
        if (match) {
            console.log(`✅ Matched hub by name: ${match.name} (${match.id})`);
            return match.id;
        }
    }

    // Fallback: use first hub
    const firstHub = data.hubs.results[0];
    console.log(`✅ Using first hub: ${firstHub.name} (${firstHub.id})`);
    return firstHub.id;
}

/**
 * Get AEC-DM project ID by project name within a hub
 * @param {object} options - Options
 * @param {string} options.token - APS access token
 * @param {string} options.region - Region (default 'US')
 * @param {string} options.hubId - AEC-DM hub ID
 * @param {string} options.projectName - Project name to find
 * @returns {Promise<string>} AEC-DM project ID
 */
async function getAecdmProjectIdByName({ token, region = 'US', hubId, projectName }) {
    console.log(`🔍 Looking up AEC-DM project by name: "${projectName}" in hub: ${hubId}`);
    
    const query = `
        query GetProjects($hubId: ID!, $name: String!) {
            projects(hubId: $hubId, filter: { name: $name }) {
                pagination { cursor }
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

    const variables = { hubId, name: projectName };
    const data = await aecdmQuery({ token, region, query, variables });

    const hit = data?.projects?.results?.find(p => p.name === projectName);
    
    if (!hit) {
        throw new Error(`AEC-DM project not found by name: "${projectName}"`);
    }

    console.log(`✅ Found AEC-DM project: ${hit.name} (${hit.id})`);
    return hit.id; // This is the AEC-DM project ID to use downstream
}

/**
 * Fetch element groups by AEC-DM project ID
 * @param {object} options - Options
 * @param {string} options.token - APS access token
 * @param {string} options.region - Region (default 'US')
 * @param {string} options.projectId - AEC-DM project ID (NOT ACC ID!)
 * @returns {Promise<Array>} Array of element groups
 */
async function fetchElementGroupsByAecProjectId({ token, region = 'US', projectId }) {
    console.log('📂 Fetching element groups for AEC-DM project:', projectId);
    
    const query = `
        query GetElementGroups($projectId: ID!) {
            elementGroupsByProject(projectId: $projectId, pagination: { limit: 100 }) {
                pagination { cursor }
                results {
                    id
                    name
                    createdAt
                    updatedAt
                    alternativeIdentifiers {
                        fileVersionUrn
                        fileUrn
                    }
                }
            }
        }
    `;

    const variables = { projectId };
    const data = await aecdmQuery({ token, region, query, variables });

    const results = data?.elementGroupsByProject?.results || [];
    console.log(`✅ Found ${results.length} element group(s)`);

    return results.map(eg => ({
        id: eg.id,
        name: eg.name,
        fileVersionUrn: eg.alternativeIdentifiers?.fileVersionUrn || null,
        fileUrn: eg.alternativeIdentifiers?.fileUrn || null,
        createdAt: eg.createdAt,
        updatedAt: eg.updatedAt
    }));
}

/**
 * Get element groups for a project (by project name, NOT ACC ID)
 * @param {object} options - Options
 * @param {string} options.token - APS access token
 * @param {string} options.region - Region (default 'US')
 * @param {string} options.projectName - Project name (from ACC project dropdown)
 * @param {string} options.preferredHubName - Optional hub name to match
 * @returns {Promise<Array>} Array of element groups
 */
async function getElementGroupsForProject({ token, region = 'US', projectName, preferredHubName }) {
    try {
        console.log('📂 Getting element groups for project name:', projectName);

        // Step 1: Get AEC-DM hub ID
        const hubId = await getAecdmHubId({ token, region, preferredHubName });

        // Step 2: Get AEC-DM project ID by name
        const aecProjectId = await getAecdmProjectIdByName({ token, region, hubId, projectName });

        // Step 3: Fetch element groups using the AEC-DM project ID
        return await fetchElementGroupsByAecProjectId({ token, region, projectId: aecProjectId });

    } catch (error) {
        console.error('Error fetching element groups:', error);
        throw error;
    }
}

/**
 * Build a GraphQL filter string for element queries
 * @param {object} options - Filter options
 * @param {string} options.category - Filter by category name
 * @param {string} options.property - Property name to filter on
 * @param {string} options.value - Property value to match
 * @returns {string} GraphQL filter string
 */
function buildElementFilter({ category, property, value }) {
    const filters = [];
    
    if (category) {
        filters.push(`property.name=="Category" && property.value=="${category}"`);
    }
    
    if (property && value) {
        filters.push(`property.name=="${property}" && property.value=="${value}"`);
    }
    
    return filters.length > 0 ? filters.join(' && ') : 'true';
}

/**
 * Get elements from an element group with filter
 * @param {object} options - Options
 * @param {string} options.token - APS access token
 * @param {string} options.region - Region (default 'US')
 * @param {string} options.elementGroupId - AEC-DM element group ID
 * @param {string} options.filter - GraphQL filter string
 * @param {number} options.limit - Max results (default 100, max 500)
 * @returns {Promise<Array>} Array of elements
 */
async function getElementsByElementGroup({ token, region = 'US', elementGroupId, filter = 'true', limit = 100 }) {
    console.log('🔍 Fetching elements from element group:', elementGroupId);
    console.log('Filter:', filter);

    const query = `
        query ElementsByElementGroup($elementGroupId: ID!, $filter: String!, $limit: Int) {
            elementsByElementGroup(
                elementGroupId: $elementGroupId,
                filter: { query: $filter },
                pagination: { limit: $limit }
            ) {
                pagination { cursor }
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

    const variables = { 
        elementGroupId, 
        filter, 
        limit: Math.min(limit, 500) // Ensure limit ≤ 500
    };

    const data = await aecdmQuery({ token, region, query, variables });
    const results = data?.elementsByElementGroup?.results || [];

    console.log(`✅ Found ${results.length} element(s)`);

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
            properties: props
        };
    });
}

// === GraphQL Introspection Helper (for debugging) ===
async function introspectSchema({ token, region = 'US' }) {
    const query = `
        query IntrospectionQuery {
            __schema {
                queryType { name }
                types {
                    name
                    kind
                    description
                }
            }
        }
    `;

    return await aecdmQuery({ token, region, query, variables: {} });
}

// === Public API ===
window.AECDataModel = {
    query: aecdmQuery,
    getElementGroups: getElementGroupsForProject,
    getElements: getElementsByElementGroup,
    buildFilter: buildElementFilter,
    introspect: introspectSchema,
    // Lower-level helpers (exported for advanced use)
    getHubId: getAecdmHubId,
    getProjectIdByName: getAecdmProjectIdByName,
    fetchElementGroups: fetchElementGroupsByAecProjectId
};

console.log('✅ AEC Data Model GraphQL helper loaded (Beta API with results/pagination schema)');
