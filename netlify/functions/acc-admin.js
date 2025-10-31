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
        return assignUsersToProjects(clientAuth, body);
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

async function listProjectRoles(_userAuthHeader, accountId, projectId) {
  const adminToken = await getTwoLeggedToken('account:read');
  const tried = [];

  // Try v2 first
  try {
    const url = `${HQv2(accountId)}/projects/${projectId}/roles`;
    tried.push(url);
    const r = await fetch(url, { headers: { authorization: `Bearer ${adminToken}` } });
    if (r.ok) {
      const arr = await r.json();
      if (Array.isArray(arr) && arr.length) return response(200, { roles: arr, mode: '2LO', tried });
    }
  } catch {}

  // Try v1 fallback
  try {
    const url = `${HQv1(accountId)}/projects/${projectId}/roles`;
    tried.push(url);
    const r = await fetch(url, { headers: { authorization: `Bearer ${adminToken}` } });
    if (r.ok) {
      const arr = await r.json();
      if (Array.isArray(arr) && arr.length) return response(200, { roles: arr, mode: '2LO', tried });
    }
  } catch {}

  return response(200, { roles: [], mode: '2LO', tried });
}

async function assignUsersToProjects(_userAuthHeader, payloadIn) {
  const { accountId, members = [], projectIds = [], roleId, accessLevel } = payloadIn || {};
  if (!accountId || !projectIds.length || !members.length) {
    return response(400, { error: 'accountId, members[], projectIds[] are required' });
  }

  const adminToken = await getTwoLeggedToken('account:read account:write');

  // Map UI access to classic values some tenants expect
  const accessMapped = (accessLevel === 'project_admin') ? 'admin' : 'user';
  const role_ids = roleId ? [roleId] : [];

  const triedByProject = {};
  const results = [];

  // Helpers
  const postJSON = async (url, body) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    let data = null; try { data = await r.json(); } catch {}
    return { r, data };
  };

  const isAlready = (r, data) => {
    const msg = (data && (data.message || data.developerMessage || data.error || '')) + '';
    return r.status === 409 || /already/i.test(msg) || /exists/i.test(msg);
  };

  // Build variants up-front
  const emails = members.map(m => m.email).filter(Boolean);
  const ids    = members.map(m => m.id).filter(Boolean);

  for (const projectId of projectIds) {
    const url = `${HQv1(accountId)}/projects/${projectId}/users`;
    const tried = [];
    let ok = false, skipped = false, last = { status: 0, data: null };

    // Variant A: batch by emails (most common)
    if (emails.length) {
      const bodyA = { emails, access_level: accessMapped, ...(role_ids.length ? { role_ids } : {}) };
      tried.push({ variant: 'A_emails_batch', body: bodyA });
      const { r, data } = await postJSON(url, bodyA);
      last = { status: r.status, data };
      if (r.ok || isAlready(r, data)) { ok = true; skipped = !r.ok; results.push({ projectId, status: r.status, ok, skipped, data }); triedByProject[projectId] = tried; continue; }
    }

    // Variant B: batch "users" collection (your current shape)
    {
      const users = members.map(m => ({
        ...(m.id ? { id: m.id } : (m.email ? { email: m.email } : {})),
        ...(role_ids.length ? { roleIds: role_ids } : {}),
        accessLevel: accessMapped
      }));
      const bodyB = { users };
      tried.push({ variant: 'B_users_batch', body: bodyB });
      const { r, data } = await postJSON(url, bodyB);
      last = { status: r.status, data };
      if (r.ok || isAlready(r, data)) { ok = true; skipped = !r.ok; results.push({ projectId, status: r.status, ok, skipped, data }); triedByProject[projectId] = tried; continue; }
    }

    // Variant C: per-user legacy (id first, then email)
    for (const m of members) {
      const one = m.id ? { user_id: m.id } : (m.email ? { email: m.email } : null);
      if (!one) continue;
      const bodyC = { ...one, access_level: accessMapped, ...(role_ids.length ? { role_ids } : {}) };
      tried.push({ variant: 'C_one_by_one', body: bodyC });
      const { r, data } = await postJSON(url, bodyC);
      last = { status: r.status, data };
      if (!(r.ok || isAlready(r, data))) { ok = false; skipped = false; break; }
      ok = true; // keep ok if all single posts are ok/already
    }
    results.push({ projectId, status: last.status, ok, skipped, data: last.data });
    triedByProject[projectId] = tried;
  }

  const anyFailed = results.some(x => !x.ok);
  return response(anyFailed ? 207 : 200, { ok: !anyFailed, results, mode: '2LO', triedByProject });
}
