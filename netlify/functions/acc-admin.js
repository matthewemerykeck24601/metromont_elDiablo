// netlify/functions/acc-admin.js
import { response, parseUser, requireAdmin } from './_db-helpers.js';

/**
 * APS Admin (ACC/BIM 360 HQ) endpoints used here.
 * Verify in your environment and tweak if needed.
 * Keeping them centralized makes it easy to adjust:
 */
const APS_BASE = 'https://developer.api.autodesk.com';
const HQv2 = (accountId) => `${APS_BASE}/hq/v2/accounts/${accountId}`;
const HQv1 = (accountId) => `${APS_BASE}/hq/v1/accounts/${accountId}`; // sometimes roles/users still under v1 in older tenants

export async function handler(event) {
  try {
    // CORS preflight
    if (event.httpMethod === 'OPTIONS') {
      return response(200, {}, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' });
    }

    // AuthZ: CastLink Admins only (internal admin list)
    const user = parseUser(event);
    const adminCheck = requireAdmin(user);
    if (adminCheck) return adminCheck;

    // Client's 3LO token for ACC API
    const clientAuth = event.headers['authorization'] || event.headers['Authorization'];
    if (!clientAuth) return response(401, { error: 'Missing Authorization (3LO) token' });

    const qs = new URLSearchParams(event.queryStringParameters || {});
    const body = event.httpMethod === 'POST' ? (JSON.parse(event.body || '{}')) : {};
    const mode = qs.get('mode') || body.mode;

    // Route modes
    if (event.httpMethod === 'GET') {
      if (mode === 'listMembers') return listMembers(clientAuth, qs.get('accountId'));
      if (mode === 'listProjects') return listProjects(clientAuth, qs.get('accountId'));
      if (mode === 'listAccountRoles') return listAccountRoles(clientAuth, qs.get('accountId'));
      if (mode === 'listRoles') return listProjectRoles(clientAuth, qs.get('accountId'), qs.get('projectId'));
      return response(400, { error: 'Unknown mode' });
    }

    if (event.httpMethod === 'POST') {
      if (mode === 'assignUsersToProjects') {
        const { accountId, memberIdsOrEmails = [], projectIds = [], roleId, accessLevel } = body;
        return assignUsersToProjects(clientAuth, { accountId, memberIdsOrEmails, projectIds, roleId, accessLevel });
      }
      return response(400, { error: 'Unknown mode' });
    }

    return response(405, { error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    return response(500, { error: e.message || 'Server error' });
  }
}

async function listMembers(authHeader, accountId) {
  // --- HQ v1/v2 attempt ---
  const members = [];
  let tried = [];

  // Try v2 users (admin API)
  try {
    const urlV2 = `${HQv2(accountId)}/users?limit=200&offset=0`;
    const r2 = await fetch(urlV2, { headers: { authorization: authHeader } });
    tried.push(urlV2);
    if (r2.ok) {
      const json = await r2.json();
      if (Array.isArray(json) && json.length) {
        return response(200, { members: json, tried });
      }
    }
  } catch (e) { /* ignored */ }

  // Try v1 users (admin API)
  try {
    const urlV1 = `${HQv1(accountId)}/users`;
    const r1 = await fetch(urlV1, { headers: { authorization: authHeader } });
    tried.push(urlV1);
    if (r1.ok) {
      const json = await r1.json();
      if (Array.isArray(json) && json.length) {
        return response(200, { members: json, tried });
      }
    }
  } catch (e) { /* ignored */ }

  // --- Fallback: search (3LO-friendly) ---
  try {
    const searchUrl = `${APS_BASE}/hq/v1/users/search`;
    const rs = await fetch(searchUrl, { headers: { authorization: authHeader } });
    tried.push(searchUrl);
    if (rs.ok) {
      const json = await rs.json();
      if (Array.isArray(json) && json.length) {
        return response(200, { members: json, tried });
      }
    }
  } catch (e) { /* ignored */ }

  console.warn('⚠️ No members returned from HQ endpoints', tried);
  return response(200, { members: [], tried });
}

async function listProjects(authHeader, accountId) {
  // Try v2 projects first
  const urlV2 = `${HQv2(accountId)}/projects?limit=200&offset=0`;
  const r2 = await fetch(urlV2, { headers: { authorization: authHeader } });
  if (r2.ok) {
    const items = await r2.json();
    if (Array.isArray(items) && items.length) {
      return response(200, { projects: items });
    }
  }

  // Fallback: v1 projects
  const urlV1 = `${HQv1(accountId)}/projects`;
  const r1 = await fetch(urlV1, { headers: { authorization: authHeader } });
  const v1Projects = r1.ok ? await r1.json() : [];
  return response(200, { projects: Array.isArray(v1Projects) ? v1Projects : [] });
}

async function listAccountRoles(authHeader, accountId) {
  // Try v2 roles
  const urlV2 = `${HQv2(accountId)}/roles?limit=200&offset=0`;
  const r2 = await fetch(urlV2, { headers: { authorization: authHeader } });
  if (r2.ok) {
    const items = await r2.json();
    if (Array.isArray(items) && items.length) {
      return response(200, { roles: items });
    }
  }

  // Fallback: v1 roles
  const urlV1 = `${HQv1(accountId)}/roles`;
  const r1 = await fetch(urlV1, { headers: { authorization: authHeader } });
  const v1Roles = r1.ok ? await r1.json() : [];
  return response(200, { roles: Array.isArray(v1Roles) ? v1Roles : [] });
}

async function listProjectRoles(authHeader, accountId, projectId) {
  // Roles configured for a specific project
  const url = `${HQv2(accountId)}/projects/${projectId}/roles`;
  const r = await fetch(url, { headers: { authorization: authHeader } });
  const roles = r.ok ? await r.json() : [];
  return response(200, { roles });
}

async function assignUsersToProjects(authHeader, { accountId, memberIdsOrEmails, projectIds, roleId, accessLevel }) {
  if (!accountId || projectIds.length === 0 || memberIdsOrEmails.length === 0) {
    return response(400, { error: 'accountId, memberIdsOrEmails, projectIds are required' });
  }

  // Typical HQ add-user-to-project body
  // Accept both IDs and emails; the API generally supports user identifiers.
  const payloadForProject = (projectId) => ({
    users: memberIdsOrEmails.map(u => ({
      id: u, // or 'email': u  ← if your tenant expects emails, switch here
      roleIds: roleId ? [roleId] : [],
      accessLevel: accessLevel || 'project_user' // "project_user" | "project_admin"
    }))
  });

  const results = [];
  for (const projectId of projectIds) {
    const url = `${HQv2(accountId)}/projects/${projectId}/users`; // verify; older tenants use /hq/v1
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: authHeader,
        'content-type': 'application/json'
      },
      body: JSON.stringify(payloadForProject(projectId))
    });

    let data = null;
    try { data = await r.json(); } catch { /* some endpoints return empty */ }
    results.push({ projectId, status: r.status, ok: r.ok, data });
  }

  const anyFailed = results.some(x => !x.ok);
  return response(anyFailed ? 207 : 200, { ok: !anyFailed, results });
}
