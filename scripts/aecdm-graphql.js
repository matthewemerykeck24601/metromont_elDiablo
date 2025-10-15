// AEC Data Model GraphQL Helper
// Provides proper ID resolution from ACC to AEC DM format
// Uses Beta API schema: items (not results), pageInfo (not pagination)

const AEC_GRAPHQL_URL = 'https://developer.api.autodesk.com/aec/graphql';

// --- AEC-DM GraphQL queries ---
// List hubs
const GQL_LIST_HUBS = `
  query ListHubs($pagination: PaginationInput) {
    hubs(pagination: $pagination) {
      items {
        id
        name
        alternativeIdentifiers {
          dataManagementAPIHubId
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

// List projects for a hub
const GQL_LIST_PROJECTS_BY_HUB = `
  query ListProjectsByHub($hubId: ID!, $pagination: PaginationInput) {
    projects(hubId: $hubId, pagination: $pagination) {
      items {
        id
        name
        alternativeIdentifiers {
          dataManagementAPIProjectId
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

// Element groups by AEC-DM project id
const GQL_ELEMENT_GROUPS_BY_PROJECT = `
  query ElGroupsByProject($projectId: ID!, $pagination: PaginationInput) {
    elementGroupsByProject(projectId: $projectId, pagination: $pagination) {
      items {
        id
        name
        createdAt
        updatedAt
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

/**
 * Normalize ACC project ID to handle both b.guid and bare guid formats
 * @param {string} id - ACC project ID
 * @returns {object} Normalized ID object
 */
function normalizeAccProjectId(id) {
    if (!id) return null;
    // Accept `b.<guid>` or `<guid>`; compare both
    const bare = id.startsWith('b.') ? id.slice(2) : id;
    return { raw: id, bare };
}

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

/**
 * Resolve ACC project ID to AEC-DM project ID
 * @param {string} accProjectId - ACC project ID (b.xxx format)
 * @returns {Promise<string>} AEC-DM project ID
 */
async function resolveAecdmProjectIdFromAcc(accProjectId) {
    const norm = normalizeAccProjectId(accProjectId);
    if (!norm) throw new Error('No ACC project id provided');

    console.log('🔍 Resolving AEC-DM project from ACC:', accProjectId);

    // 1) enumerate hubs (paginate up to 100 at a time)
    let next = null;
    const hubs = [];
    do {
        const res = await aecdmQuery(GQL_LIST_HUBS, { pagination: { limit: 100, cursor: next } });
        const page = res?.hubs;
        if (!page) break;
        hubs.push(...(page.items || []));
        next = page.pageInfo?.hasNextPage ? page.pageInfo.endCursor : null;
    } while (next);

    console.log(`Found ${hubs.length} AEC-DM hubs`);

    // 2) for each hub, enumerate projects and match alternativeIdentifiers.dataManagementAPIProjectId
    for (const hub of hubs) {
        let pNext = null;
        do {
            const pRes = await aecdmQuery(GQL_LIST_PROJECTS_BY_HUB, { hubId: hub.id, pagination: { limit: 100, cursor: pNext } });
            const pPage = pRes?.projects;
            const items = pPage?.items || [];
            const match = items.find(p => {
                const alt = p.alternativeIdentifiers?.dataManagementAPIProjectId;
                return alt === norm.raw || alt === norm.bare;
            });
            if (match) {
                console.log(`✅ Matched project in hub ${hub.name}:`, match.name, match.id);
                return match.id; // <-- AEC-DM project id
            }
            pNext = pPage?.pageInfo?.hasNextPage ? pPage.pageInfo.endCursor : null;
        } while (pNext);
    }

    throw new Error(`AEC-DM project not found for ACC id: ${accProjectId}`);
}

/**
 * Get element groups (designs/models) for a project
 * @param {string} accProjectId - ACC project ID (b.xxx format)
 * @returns {Promise<Array>} Array of element groups with id, name
 */
async function getElementGroupsForProject(accProjectId) {
    try {
        console.log('📂 Getting element groups for ACC project:', accProjectId);

        // Step 1: Resolve to AEC-DM project ID (never pass b.xxx beyond this point)
        const aecdmProjectId = await resolveAecdmProjectIdFromAcc(accProjectId);

        console.log('Using AEC-DM project ID:', aecdmProjectId);

        // Step 2: Fetch element groups with pagination
        const groups = [];
        let cursor = null;
        do {
            const res = await aecdmQuery(GQL_ELEMENT_GROUPS_BY_PROJECT, {
                projectId: aecdmProjectId,
                pagination: { limit: 100, cursor }
            });
            const page = res?.elementGroupsByProject;
            if (!page) break;
            groups.push(...(page.items || []));
            cursor = page.pageInfo?.hasNextPage ? page.pageInfo.endCursor : null;
        } while (cursor);

        console.log(`✅ Found ${groups.length} element groups`);

        return groups;
        
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
 * @param {number} limit - Limit (max 500 for elements)
 * @returns {Promise<Array>} Array of elements with properties
 */
async function getElementsByElementGroup(elementGroupId, filter, region = 'US', limit = 100) {
    try {
        console.log('🔍 Fetching elements from element group:', elementGroupId);
        console.log('Filter:', filter);

        const Q_ELEMENTS = `
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

        const data = await aecdmQuery(Q_ELEMENTS, { 
            elementGroupId, 
            filter, 
            limit: Math.min(limit, 500) // Ensure limit ≤ 500
        }, region);
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
    resolveProjectId: resolveAecdmProjectIdFromAcc,
    getElementGroups: getElementGroupsForProject,
    getElements: getElementsByElementGroup,
    buildFilter: buildElementFilter
};

console.log('✅ AEC Data Model GraphQL helper loaded (Beta API with proper ID resolution)');
