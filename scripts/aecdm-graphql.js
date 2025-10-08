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
                pagination {
                    cursor
                    hasMore
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
        query GetProjects($hubId: ID!, $cursor: String) {
            projects(hubId: $hubId, pagination: { limit: 100, cursor: $cursor }) {
                results {
                    id
                    name
                    alternativeIdentifiers {
                        dataManagementAPIProjectId
                    }
                }
                pagination {
                    cursor
                    hasMore
                }
            }
        }
    `;
    
    // Page through all projects
    let cursor = null;
    const projects = [];
    do {
        const data = await aecdmQuery(Q_PROJECTS, { hubId: aecdmHubId, cursor });
        const page = data?.projects;
        if (page?.results?.length) projects.push(...page.results);
        cursor = page?.pagination?.hasMore ? page.pagination.cursor : null;
    } while (cursor);
    
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

/**
 * Get element groups (designs/models) for a project
 * @param {string} accProjectId - ACC project ID (b.xxx format)
 * @param {string} region - Region (default 'US')
 * @returns {Promise<Array>} Array of element groups with id, name, fileVersionUrn
 */
async function getElementGroupsForProject(accProjectId, region = 'US') {
    try {
        console.log('📂 Getting element groups for ACC project:', accProjectId);

        // Step 1: Resolve AEC DM Hub ID
        const hubName = window.UserProfile?.getSelectedHub?.()?.name || null;
        const aecdmHubId = await resolveAecdmHubId({ hubName });

        // Step 2: Resolve AEC DM Project ID from ACC project ID
        const aecdmProjectId = await resolveAecdmProjectId({
            aecdmHubId,
            accProjectId,
            projectName: null
        });

        console.log('✅ Resolved to AEC DM Project ID:', aecdmProjectId);

        // Step 3: Query element groups using the AEC DM project ID
        const Q_ELEMENT_GROUPS = `
            query GetElementGroups($projectId: ID!) {
                elementGroupsByProject(projectId: $projectId, pagination: { limit: 100 }) {
                    results {
                        id
                        name
                        alternativeIdentifiers {
                            fileVersionUrn
                        }
                    }
                }
            }
        `;

        const result = await aecdmQuery(Q_ELEMENT_GROUPS, { projectId: aecdmProjectId }, region);
        const elementGroups = result?.elementGroupsByProject?.results || [];

        console.log(`✅ Found ${elementGroups.length} element groups`);

        // Map to simpler format
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
            query ElementsByElementGroup($elementGroupId: ID!, $filter: String!, $cursor: String) {
                elementsByElementGroup(
                    elementGroupId: $elementGroupId,
                    filter: { query: $filter },
                    pagination: { limit: 100, cursor: $cursor }
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
                    pagination {
                        cursor
                        hasMore
                    }
                }
            }
        `;

        // Page through all results
        let cursor = null;
        const results = [];
        do {
            const data = await aecdmQuery(Q_ELEMENTS, { elementGroupId, filter, cursor }, region);
            const page = data?.elementsByElementGroup;
            if (page?.results?.length) results.push(...page.results);
            cursor = page?.pagination?.hasMore ? page.pagination.cursor : null;
        } while (cursor);

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
    buildFilter: buildElementFilter,
    resolveHubId: resolveAecdmHubId,
    resolveProjectId: resolveAecdmProjectId
};

console.log('✅ AEC Data Model GraphQL helper loaded with ID resolution');
