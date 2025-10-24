// Netlify function: proxy to Autodesk Parameters Service for ACC
// Hard-code the Autodesk Parameters base URL (production).
const PARAMS_BASE = 'https://developer.api.autodesk.com/construction/parameters/v1';

// Expected frontend call: GET /api/parameters?projectId=b.xxxxx&familyCategory=Structural%20Framing&search=...
export async function handler(event) {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Forge-Access-Token',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    const url = new URL(event.rawUrl);
    const projectId = url.searchParams.get('projectId');
    const accountId = url.searchParams.get('accountId') || '';
    let projectGuid = url.searchParams.get('projectGuid') || projectId;
    const familyCategory = url.searchParams.get('familyCategory') || '';
    const search = url.searchParams.get('search') || '';

    // Defensively normalize GUID - strip b. prefix if present
    if (typeof projectGuid === 'string' && projectGuid.startsWith('b.')) {
      projectGuid = projectGuid.slice(2);
    }

    if (!projectId) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Missing required query param: projectId' })
      };
    }

    // Forward the user's APS 3-legged token; your frontend sets this header.
    const forgeToken =
      event.headers['x-forge-access-token'] ||
      event.headers['X-Forge-Access-Token'] ||
      event.headers['authorization']?.replace(/^Bearer\s+/i, '');

    if (!forgeToken) {
      return {
        statusCode: 401,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Missing Autodesk access token' })
      };
    }

    // Build Autodesk Parameters API request:
    // Try account-scoped route first, fallback to project-scoped
    let apiUrl;
    if (accountId && projectGuid) {
      // Account-scoped route: /accounts/{accountId}/projects/{projectGuid}/parameters
      apiUrl = new URL(`${PARAMS_BASE}/accounts/${encodeURIComponent(accountId)}/projects/${encodeURIComponent(projectGuid)}/parameters`);
    } else {
      // Fallback to project-scoped route: /projects/{projectId}/parameters
      apiUrl = new URL(`${PARAMS_BASE}/projects/${encodeURIComponent(projectId)}/parameters`);
    }
    if (familyCategory) apiUrl.searchParams.set('familyCategory', familyCategory);
    if (search) apiUrl.searchParams.set('search', search);

    const upstream = await fetch(apiUrl.toString(), {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${forgeToken}`,
      }
    });

    const text = await upstream.text();

    if (!upstream.ok) {
      return {
        statusCode: upstream.status,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
          error: 'Autodesk Parameters API error',
          status: upstream.status,
          details: text
        })
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: text
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Proxy failed', details: String(err.message || err) })
    };
  }
}
