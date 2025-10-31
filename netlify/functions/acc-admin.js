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

  // Map UI access to legacy values many tenants expect for services
  // UI: project_user | project_admin  → services: user | admin
  const accessMapped = (accessLevel === 'project_admin') ? 'admin' : 'user';
  const project_role_id = roleId || null; // optional; your tenant currently has none

  const results = [];

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

  // Per-project execution; inside each project we add each member individually
  for (const projectId of projectIds) {
    const url = `${HQv1(accountId)}/projects/${projectId}/users`;
    let projectOk = true;
    const details = [];

    for (const m of members) {
      // Prefer email; fall back to id if present and accepted by your tenant
      const email = m.email || null;
      const id = m.id || null;

      // Variant 1: EMAIL + SERVICES (most common and usually required)
      const basePayload = {
        services: { document_management: { access_level: accessMapped } }
      };
      const payloadEmail = {
        ...basePayload,
        ...(email ? { email } : {}),
        ...(project_role_id ? { project_role_id } : {})
      };

      let last = { ok: false, status: 0, data: null };

      // Try email path first (recommended)
      if (email) {
        const { r, data } = await postJSON(url, payloadEmail);
        last = { ok: r.ok, status: r.status, data };
        if (r.ok || isAlready(r, data)) {
          details.push({ member: email, status: r.status, ok: true, skipped: !r.ok, variant: 'email+services', data });
          continue; // next member
        }
      }

      // Variant 2: ID + SERVICES (some tenants accept user_id instead of email)
      if (id) {
        const payloadId = {
          ...basePayload,
          user_id: id,
          ...(project_role_id ? { project_role_id } : {})
        };
        const { r, data } = await postJSON(url, payloadId);
        last = { ok: r.ok, status: r.status, data };
        if (r.ok || isAlready(r, data)) {
          details.push({ member: id, status: r.status, ok: true, skipped: !r.ok, variant: 'id+services', data });
          continue;
        }
      }

      // If neither path succeeded
      projectOk = false;
      details.push({
        member: email || id || '(unknown)',
        status: last.status,
        ok: false,
        skipped: false,
        variant: 'failed',
        message: (last.data && (last.data.message || last.data.developerMessage || last.data.error)) || 'Unknown error'
      });
    }

    // Summarize project result as OK only if all member adds were ok/already
    results.push({
      projectId,
      ok: projectOk,
      status: projectOk ? 200 : 400,
      data: { details }
    });
  }

  const anyFailed = results.some(x => !x.ok);
  return response(anyFailed ? 207 : 200, { ok: !anyFailed, mode: '2LO', results });
}
