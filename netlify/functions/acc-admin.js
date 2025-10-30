// netlify/functions/acc-admin.js
import { response, parseUser, requireAdmin } from './_db-helpers.js';
import { getTwoLeggedToken } from '../../server/aps-auth.js';

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

async function listMembers(_userAuthHeader, accountId) {
  const adminToken = await getTwoLeggedToken('account:read');
  const tried = [];

  // v1 users/search (often most reliable)
  try {
    const url = `${HQv1(accountId)}/users/search`;
    tried.push(url);
    const r = await fetch(url, { headers: { authorization: `Bearer ${adminToken}` } });
    if (r.ok) {
      const arr = await r.json();
      if (Array.isArray(arr) && arr.length) return response(200, { members: arr, tried, mode: '2LO' });
    }
  } catch {}

  // v1 users
  try {
    const url = `${HQv1(accountId)}/users`;
    tried.push(url);
    const r = await fetch(url, { headers: { authorization: `Bearer ${adminToken}` } });
    if (r.ok) {
      const arr = await r.json();
      if (Array.isArray(arr) && arr.length) return response(200, { members: arr, tried, mode: '2LO' });
    }
  } catch {}

  // v2 users
  try {
    const url = `${HQv2(accountId)}/users?limit=200&offset=0`;
    tried.push(url);
    const r = await fetch(url, { headers: { authorization: `Bearer ${adminToken}` } });
    if (r.ok) {
      const arr = await r.json();
      if (Array.isArray(arr) && arr.length) return response(200, { members: arr, tried, mode: '2LO' });
    }
  } catch {}

  return response(200, { members: [], tried, mode: '2LO' });
}

async function listProjects(_userAuthHeader, accountId) {
  const adminToken = await getTwoLeggedToken('account:read');

  // v1 first
  {
    const url = `${HQv1(accountId)}/projects`;
    const r = await fetch(url, { headers: { authorization: `Bearer ${adminToken}` } });
    if (r.ok) {
      const arr = await r.json();
      if (Array.isArray(arr) && arr.length) return response(200, { projects: arr, mode: '2LO' });
    }
  }
  // v2 fallback
  {
    const url = `${HQv2(accountId)}/projects?limit=200&offset=0`;
    const r = await fetch(url, { headers: { authorization: `Bearer ${adminToken}` } });
    if (r.ok) {
      const arr = await r.json();
      if (Array.isArray(arr) && arr.length) return response(200, { projects: arr, mode: '2LO' });
    }
  }
  return response(200, { projects: [], mode: '2LO' });
}

async function listAccountRoles(_userAuthHeader, accountId) {
  const adminToken = await getTwoLeggedToken('account:read');

  // v1 then v2
  {
    const url = `${HQv1(accountId)}/roles`;
    const r = await fetch(url, { headers: { authorization: `Bearer ${adminToken}` } });
    if (r.ok) {
      const arr = await r.json();
      if (Array.isArray(arr) && arr.length) return response(200, { roles: arr, mode: '2LO' });
    }
  }
  {
    const url = `${HQv2(accountId)}/roles?limit=200&offset=0`;
    const r = await fetch(url, { headers: { authorization: `Bearer ${adminToken}` } });
    if (r.ok) {
      const arr = await r.json();
      if (Array.isArray(arr) && arr.length) return response(200, { roles: arr, mode: '2LO' });
    }
  }
  return response(200, { roles: [], mode: '2LO' });
}

async function listProjectRoles(authHeader, accountId, projectId) {
  // Roles configured for a specific project
  const url = `${HQv2(accountId)}/projects/${projectId}/roles`;
  const r = await fetch(url, { headers: { authorization: authHeader } });
  const roles = r.ok ? await r.json() : [];
  return response(200, { roles });
}

async function assignUsersToProjects(_userAuthHeader, { accountId, memberIdsOrEmails, projectIds, roleId, accessLevel }) {
  if (!accountId || projectIds.length === 0 || memberIdsOrEmails.length === 0) {
    return response(400, { error: 'accountId, memberIdsOrEmails, projectIds are required' });
  }

  const adminToken = await getTwoLeggedToken('account:read account:write');

  // Many tenants expect email identifiers; switch to { id: u } if needed
  const useEmail = true;
  const payload = {
    users: memberIdsOrEmails.map(u => ({
      ...(useEmail ? { email: u } : { id: u }),
      roleIds: roleId ? [roleId] : [],
      accessLevel: accessLevel || 'project_user'
    }))
  };

  const results = [];
  for (const projectId of projectIds) {
    const url = `${HQv1(accountId)}/projects/${projectId}/users`;
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${adminToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    let data = null;
    try { data = await r.json(); } catch { /* some endpoints return empty */ }
    results.push({ projectId, status: r.status, ok: r.ok, data });
  }

  const anyFailed = results.some(x => !x.ok);
  return response(anyFailed ? 207 : 200, { ok: !anyFailed, results, mode: '2LO' });
}
