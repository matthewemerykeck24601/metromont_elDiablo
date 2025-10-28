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
  // Members (HQ users)
  const url = `${HQv2(accountId)}/users`; // verify v2 in your tenant; fallback could be /hq/v1/.../users
  const r = await fetch(url, { headers: { authorization: authHeader } });
  const members = r.ok ? await r.json() : [];
  return response(200, { members });
}

async function listProjects(authHeader, accountId) {
  // Projects in account
  const url = `${HQv2(accountId)}/projects`; // verify path in your tenant
  const r = await fetch(url, { headers: { authorization: authHeader } });
  const projects = r.ok ? await r.json() : [];
  return response(200, { projects });
}

async function listAccountRoles(authHeader, accountId) {
  // Account-level roles catalog
  const url = `${HQv2(accountId)}/roles`; // sometimes v1 in older tenants
  const r = await fetch(url, { headers: { authorization: authHeader } });
  const roles = r.ok ? await r.json() : [];
  return response(200, { roles });
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
