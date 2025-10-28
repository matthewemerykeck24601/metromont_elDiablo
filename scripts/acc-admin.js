// scripts/acc-admin.js
import AuthManager from './auth-manager.js';

const auth = new AuthManager();

let state = {
  accountId: null,
  selectedMemberIds: new Set(),
  selectedProjectIds: new Set(),
  members: [],
  projects: [],
  roles: [],
};

function notify(msg, type='info') {
  const el = document.getElementById('notification');
  const content = document.getElementById('notificationContent');
  if (el && content) {
    content.textContent = msg;
    el.className = `notification ${type} show`;
    setTimeout(() => el.classList.remove('show'), 4000);
  } else {
    console.log(`[${type}] ${msg}`);
  }
}

function hideAuthOverlay(successMsg) {
  try {
    const authProcessing = document.getElementById('authProcessing');
    const authTitle = document.getElementById('authTitle');
    const authMessage = document.getElementById('authMessage');
    if (authTitle) authTitle.textContent = 'Success!';
    if (authMessage) authMessage.textContent = successMsg || 'Connected to ACC';
    setTimeout(() => {
      authProcessing?.classList.remove('active');
      document.body.classList.remove('auth-loading');
    }, 500);
  } catch (e) {
    console.warn('Failed to hide auth overlay:', e);
  }
}

function parseAccountIdFromProfile(profile) {
  // Prefer selectedHub.id (e.g., "b.f61b9f7b-...") from User Profile storage
  const selectedHubId =
    profile?.selectedHub?.id ||
    profile?.user_metadata?.hubId ||
    profile?.userInfo?.hubId ||
    null;

  if (!selectedHubId) return null;

  // Hubs typically look like "b.<ACCOUNT_GUID>"
  if (selectedHubId.startsWith('b.')) {
    return selectedHubId.substring(2);
  }
  return selectedHubId;
}

async function init() {
  try {
    // 1) Read stored Autodesk profile (UserProfile already persisted this in localStorage)
    const profile = auth.getUserProfile();
    if (!profile) {
      notify('No user profile found. Please sign in via the dashboard first.', 'error');
      throw new Error('Missing user profile');
    }

    // 2) Parse ACC Account ID from hub
    const accountId = parseAccountIdFromProfile(profile);
    if (!accountId) {
      notify('No ACC account (hub) selected. Pick a hub in the dashboard first.', 'error');
      throw new Error('Missing accountId/hub');
    }
    state.accountId = accountId;

    // 3) Get token (hard fail if not present)
    const token = await auth.getToken();
    if (!token) {
      notify('Not authenticated to ACC. Please re-open ACC Admin after signing in.', 'error');
      throw new Error('Missing 3LO token');
    }

    // 4) Load initial data in parallel
    await Promise.all([loadMembers(), loadProjects(), loadRoles(null)]);

    // 5) Wire UI
    document.getElementById('memberSearch')?.addEventListener('input', renderMembers);
    document.getElementById('assignBtn')?.addEventListener('click', assignUsersToProjects);
    document.getElementById('btnAddUsersToProjects')?.addEventListener('click', () => {
      notify('Add Users to Projects ready.', 'success');
    });

    // 6) If we got this far, dismiss the overlay
    hideAuthOverlay('ACC Admin is ready');

  } catch (err) {
    console.error('ACC Admin init failed:', err);
    const authTitle = document.getElementById('authTitle');
    const authMessage = document.getElementById('authMessage');
    if (authTitle) authTitle.textContent = 'Authentication Error';
    if (authMessage) authMessage.textContent = err?.message || 'Failed to initialize ACC Admin';
  }
}

function renderMembers() {
  const q = (document.getElementById('memberSearch')?.value || '').toLowerCase();
  const list = document.getElementById('memberList');
  list.innerHTML = '';

  state.members
    .filter(m => !q || m.name?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q))
    .forEach(m => {
      const id = m.id || m.email;
      const row = document.createElement('div');
      row.className = 'row checkbox-row';
      row.innerHTML = `
        <label>
          <input type="checkbox" data-id="${id}" ${state.selectedMemberIds.has(id) ? 'checked' : ''}/>
          <span>${m.name || m.email} — ${m.email}</span>
        </label>
      `;
      row.querySelector('input').addEventListener('change', (e) => {
        if (e.target.checked) state.selectedMemberIds.add(id);
        else state.selectedMemberIds.delete(id);
      });
      list.appendChild(row);
    });
}

function renderProjects() {
  const list = document.getElementById('projectList');
  list.innerHTML = '';
  state.projects.forEach(p => {
    const id = p.id;
    const row = document.createElement('div');
    row.className = 'row checkbox-row';
    row.innerHTML = `
      <label>
        <input type="checkbox" data-id="${id}" ${state.selectedProjectIds.has(id) ? 'checked' : ''}/>
        <span>${p.name || id}</span>
      </label>
    `;
    row.querySelector('input').addEventListener('change', (e) => {
      if (e.target.checked) state.selectedProjectIds.add(id);
      else state.selectedProjectIds.delete(id);
    });
    list.appendChild(row);
  });
}

function renderRoles() {
  const sel = document.getElementById('roleSelect');
  sel.innerHTML = '';
  state.roles.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.id;
    opt.textContent = r.name || r.id;
    sel.appendChild(opt);
  });
}

async function loadMembers() {
  const token = await auth.getToken();
  if (!token) throw new Error('Missing token for listMembers');

  const res = await fetch(`/.netlify/functions/acc-admin?mode=listMembers&accountId=${encodeURIComponent(state.accountId)}`, {
    headers: { 'authorization': `Bearer ${token}` }
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`listMembers failed: ${res.status} ${txt.slice(0,150)}`);
  }

  const data = await res.json();
  state.members = data.members || [];
  renderMembers();
}

async function loadProjects() {
  const token = await auth.getToken();
  if (!token) throw new Error('Missing token for listProjects');

  const res = await fetch(`/.netlify/functions/acc-admin?mode=listProjects&accountId=${encodeURIComponent(state.accountId)}`, {
    headers: { 'authorization': `Bearer ${token}` }
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`listProjects failed: ${res.status} ${txt.slice(0,150)}`);
  }

  const data = await res.json();
  state.projects = data.projects || [];
  renderProjects();
}

async function loadRoles(projectId /* optional */) {
  const token = await auth.getToken();
  if (!token) throw new Error('Missing token for listRoles');

  const url = projectId
    ? `/.netlify/functions/acc-admin?mode=listRoles&accountId=${encodeURIComponent(state.accountId)}&projectId=${encodeURIComponent(projectId)}`
    : `/.netlify/functions/acc-admin?mode=listAccountRoles&accountId=${encodeURIComponent(state.accountId)}`;

  const res = await fetch(url, { headers: { 'authorization': `Bearer ${token}` }});
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`listRoles failed: ${res.status} ${txt.slice(0,150)}`);
  }

  const data = await res.json();
  state.roles = data.roles || [];
  renderRoles();
}

async function assignUsersToProjects() {
  const token = await auth.getToken();
  const roleId = document.getElementById('roleSelect').value;
  const accessLevel = document.getElementById('accessLevel').value;

  if (!token) return notify('Not authenticated to ACC', 'error');
  if (state.selectedMemberIds.size === 0) return notify('Select at least one member', 'warning');
  if (state.selectedProjectIds.size === 0) return notify('Select at least one project', 'warning');

  const body = {
    accountId: state.accountId,
    memberIdsOrEmails: Array.from(state.selectedMemberIds),
    projectIds: Array.from(state.selectedProjectIds),
    roleId,
    accessLevel,
  };

  const res = await fetch(`/.netlify/functions/acc-admin`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ mode: 'assignUsersToProjects', ...body })
  });

  let data = null;
  try { data = await res.json(); } catch {}
  if (res.ok && data?.ok) {
    notify(`Added ${body.memberIdsOrEmails.length} user(s) to ${body.projectIds.length} project(s)`, 'success');
  } else {
    notify(`Failed: ${(data && (data.error || data.message)) || res.statusText}`, 'error');
    console.error('assignUsersToProjects error:', data || res.statusText);
  }
}

document.addEventListener('DOMContentLoaded', init);
export default {};