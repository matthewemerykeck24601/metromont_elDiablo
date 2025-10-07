// AEC Data Model GraphQL Helper
// Provides a simple interface to query the AEC Data Model API

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
 * Query to list element groups (designs/models) for a project
 */
const Q_ELEMENT_GROUPS_BY_PROJECT = `
    query GetElementGroups($projectId: ID!) {
        elementGroupsByProject(projectId: $projectId, pagination: { limit: 100 }) {
            results {
                id
                name
                alternativeIdentifiers {
                    fileVersionUrn
                }
            }
            pagination {
                cursor
                limit
            }
        }
    }
`;

/**
 * Query to get elements by element group with filtering
 */
const Q_ELEMENTS_BY_ELEMENTGROUP = `
    query ElementsByElementGroup($elementGroupId: ID!, $filter: String!, $limit: Int) {
        elementsByElementGroup(
            elementGroupId: $elementGroupId,
            filter: { query: $filter },
            pagination: { limit: $limit }
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
                limit
            }
        }
    }
`;

/**
 * Helper: Get element groups (designs) for a project
 * @param {string} projectId - The ACC project ID
 * @param {string} region - Region (default 'US')
 * @returns {Promise<Array>} Array of element groups with id, name, fileVersionUrn
 */
async function getElementGroupsForProject(projectId, region = 'US') {
    try {
        console.log('📂 Fetching element groups for project:', projectId);

        const data = await aecdmQuery(Q_ELEMENT_GROUPS_BY_PROJECT, { projectId }, region);

        if (!data || !data.elementGroupsByProject) {
            console.warn('No element groups found in response');
            return [];
        }

        const results = data.elementGroupsByProject.results || [];
        console.log(`✅ Found ${results.length} element groups`);

        // Map to simpler format
        return results.map(eg => ({
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
 * Helper: Get elements from an element group with filter
 * @param {string} elementGroupId - The element group ID
 * @param {string} filter - GraphQL filter string
 * @param {string} region - Region (default 'US')
 * @param {number} limit - Max results (default 200)
 * @returns {Promise<Array>} Array of elements with properties
 */
async function getElementsByElementGroup(elementGroupId, filter, region = 'US', limit = 200) {
    try {
        console.log('🔍 Fetching elements from element group:', elementGroupId);
        console.log('Filter:', filter);

        const data = await aecdmQuery(
            Q_ELEMENTS_BY_ELEMENTGROUP,
            { elementGroupId, filter, limit },
            region
        );

        if (!data || !data.elementsByElementGroup) {
            console.warn('No elements found in response');
            return [];
        }

        const results = data.elementsByElementGroup.results || [];
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
 * Helper: Build a GraphQL filter string for elements
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
    queries: {
        ELEMENT_GROUPS_BY_PROJECT: Q_ELEMENT_GROUPS_BY_PROJECT,
        ELEMENTS_BY_ELEMENTGROUP: Q_ELEMENTS_BY_ELEMENTGROUP
    }
};

console.log('✅ AEC Data Model GraphQL helper loaded');

