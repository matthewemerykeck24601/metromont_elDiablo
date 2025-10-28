// scripts/acc-admin.js
import AuthManager from './auth-manager.js';

const auth = new AuthManager();

let state = {
  accountId: null, // set from user profile hub metadata if available
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

async function init() {
  // Get identity/hub info from your existing localStorage profile
  const profile = auth.getUserProfile(); // from AuthManager
  const hubId = profile?.userInfo?.hubId || profile?.user_metadata?.hubId || 'default-hub';

  // If you store the ACC Account/HQ ID in identity (you reference hubId already in admin.js)
  state.accountId = profile?.userInfo?.accAccountId || profile?.user_metadata?.accAccountId || hubId;

  // Load initial lists
  await Promise.all([loadMembers(), loadProjects(), loadRoles(null)]);

  // Wire UI
  document.getElementById('memberSearch')?.addEventListener('input', renderMembers);
  document.getElementById('assignBtn')?.addEventListener('click', assignUsersToProjects);
  document.getElementById('btnAddUsersToProjects')?.addEventListener('click', () => {
    notify('Add Users to Projects ready.', 'success');
  });
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
  const token = await auth.getToken(); // from AuthManager
  const res = await fetch(`/.netlify/functions/acc-admin?mode=listMembers&accountId=${encodeURIComponent(state.accountId)}`, {
    headers: {
      'authorization': `Bearer ${token}`, // ACC 3LO token forwarded to function
    }
  });
  const data = await res.json();
  state.members = data.members || [];
  renderMembers();
}

async function loadProjects() {
  const token = await auth.getToken();
  const res = await fetch(`/.netlify/functions/acc-admin?mode=listProjects&accountId=${encodeURIComponent(state.accountId)}`, {
    headers: { 'authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  state.projects = data.projects || [];
  renderProjects();
}

async function loadRoles(projectId /* optional, list account/project roles */) {
  const token = await auth.getToken();
  const url = projectId
    ? `/.netlify/functions/acc-admin?mode=listRoles&accountId=${encodeURIComponent(state.accountId)}&projectId=${encodeURIComponent(projectId)}`
    : `/.netlify/functions/acc-admin?mode=listAccountRoles&accountId=${encodeURIComponent(state.accountId)}`;
  const res = await fetch(url, { headers: { 'authorization': `Bearer ${token}` }});
  const data = await res.json();
  state.roles = data.roles || [];
  renderRoles();
}

async function assignUsersToProjects() {
  const token = await auth.getToken();
  const roleId = document.getElementById('roleSelect').value;
  const accessLevel = document.getElementById('accessLevel').value;

  if (state.selectedMemberIds.size === 0) return notify('Select at least one member', 'warning');
  if (state.selectedProjectIds.size === 0) return notify('Select at least one project', 'warning');

  const body = {
    accountId: state.accountId,
    memberIdsOrEmails: Array.from(state.selectedMemberIds),
    projectIds: Array.from(state.selectedProjectIds),
    roleId,
    accessLevel, // "project_user" | "project_admin"
  };

  const res = await fetch(`/.netlify/functions/acc-admin`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ mode: 'assignUsersToProjects', ...body })
  });

  const data = await res.json();
  if (res.ok && data?.ok) {
    notify(`Added ${body.memberIdsOrEmails.length} user(s) to ${body.projectIds.length} project(s)`, 'success');
  } else {
    notify(`Failed: ${data?.error || res.statusText}`, 'error');
    console.error(data);
  }
}

document.addEventListener('DOMContentLoaded', init);
export default {};
