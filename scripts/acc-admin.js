// scripts/acc-admin.js
import AuthManager from './auth-manager.js';

const auth = new AuthManager();

let state = {
  accountId: null,
  selectedMemberIds: new Set(),
  selectedProjectIds: new Set(),
  members: [],       // { id, name, email }
  projects: [],      // { id, name, number }
  roles: [],         // { id, name }
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
  const authProcessing = document.getElementById('authProcessing');
  const authTitle = document.getElementById('authTitle');
  const authMessage = document.getElementById('authMessage');
  if (authTitle) authTitle.textContent = 'Success!';
  if (authMessage) authMessage.textContent = successMsg || 'Connected to ACC';
  setTimeout(() => {
    authProcessing?.classList.remove('active');
    document.body.classList.remove('auth-loading');
  }, 400);
}

function parseAccountIdFromProfile(profile) {
  const hubId = profile?.selectedHub?.id || profile?.user_metadata?.hubId || profile?.userInfo?.hubId || null;
  if (!hubId) return null;
  return hubId.startsWith('b.') ? hubId.substring(2) : hubId;
}

function enableAssignButtonIfReady() {
  const btn = document.getElementById('assignBtn');
  const ready = state.selectedMemberIds.size > 0 && state.selectedProjectIds.size > 0 && document.getElementById('roleSelect')?.value;
  if (btn) btn.disabled = !ready;
}

// ---------------- Member Selector ----------------

function renderMemberSelector() {
  const search = (document.getElementById('memberSelectSearch')?.value || '').toLowerCase();
  const dropdown = document.getElementById('memberDropdown');
  const selectedBox = document.getElementById('memberSelected');

  if (!dropdown || !selectedBox) return;

  // Dropdown list (filter by search)
  dropdown.innerHTML = '';
  state.members
    .filter(m => !search || m.name?.toLowerCase().includes(search) || m.email?.toLowerCase().includes(search))
    .slice(0, 200) // safety cap
    .forEach(m => {
      const id = m.id || m.email;
      const row = document.createElement('div');
      row.className = 'member-row';
      row.innerHTML = `
        <label class="member-option">
          <input type="checkbox" data-id="${id}" ${state.selectedMemberIds.has(id) ? 'checked' : ''} />
          <span class="member-name">${m.name || m.email}</span>
          <span class="member-email">${m.email || ''}</span>
        </label>
      `;
      row.querySelector('input').addEventListener('change', (e) => {
        if (e.target.checked) state.selectedMemberIds.add(id);
        else state.selectedMemberIds.delete(id);
        renderSelectedMembers();
        enableAssignButtonIfReady();
      });
      dropdown.appendChild(row);
    });

  renderSelectedMembers();
}

function renderSelectedMembers() {
  const selectedBox = document.getElementById('memberSelected');
  if (!selectedBox) return;

  const ids = Array.from(state.selectedMemberIds);
  if (ids.length === 0) { selectedBox.innerHTML = '<div class="muted">No members selected</div>'; return; }

  // Show badges of selected
  const chips = ids.map(id => {
    const m = state.members.find(x => (x.id || x.email) === id);
    const label = m ? (m.name || m.email) : id;
    return `<span class="chip" data-id="${id}">${label} <button class="chip-x" title="Remove" data-id="${id}">×</button></span>`;
  }).join(' ');

  selectedBox.innerHTML = `<div class="chip-row">${chips}</div>`;

  selectedBox.querySelectorAll('.chip-x').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      state.selectedMemberIds.delete(id);
      // also uncheck in dropdown
      const cb = document.querySelector(`.member-option input[data-id="${CSS.escape(id)}"]`);
      if (cb) cb.checked = false;
      renderSelectedMembers();
      enableAssignButtonIfReady();
    });
  });
}

// ---------------- Projects (with Select All + columns) ----------------

function renderProjects() {
  const container = document.getElementById('projectList');
  if (!container) return;

  const rows = state.projects.map(p => {
    const checked = state.selectedProjectIds.has(p.id) ? 'checked' : '';
    return `
      <tr>
        <td class="col-check">
          <input type="checkbox" class="project-cb" data-id="${p.id}" ${checked} />
        </td>
        <td class="col-name">${p.name || p.id}</td>
        <td class="col-number">${p.number || ''}</td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <table class="table projects-table">
      <thead>
        <tr>
          <th class="col-check"></th>
          <th class="col-name">Project Name</th>
          <th class="col-number">Project Number</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  // Wire individual checkboxes
  container.querySelectorAll('.project-cb').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      if (e.currentTarget.checked) state.selectedProjectIds.add(id);
      else state.selectedProjectIds.delete(id);
      enableAssignButtonIfReady();
      // Keep Select All in sync
      syncSelectAllCheckbox();
    });
  });

  // Wire Select All
  const selectAll = document.getElementById('selectAllProjects');
  if (selectAll) {
    selectAll.onchange = () => {
      if (selectAll.checked) {
        state.selectedProjectIds = new Set(state.projects.map(p => p.id));
      } else {
        state.selectedProjectIds.clear();
      }
      renderProjects(); // re-render to reflect all checks
      enableAssignButtonIfReady();
    };
  }
  syncSelectAllCheckbox();
}

function syncSelectAllCheckbox() {
  const selectAll = document.getElementById('selectAllProjects');
  if (!selectAll) return;
  const total = state.projects.length;
  const selected = state.selectedProjectIds.size;
  selectAll.indeterminate = selected > 0 && selected < total;
  selectAll.checked = selected > 0 && selected === total;
}

// ---------------- Roles ----------------

function renderRoles() {
  const sel = document.getElementById('roleSelect');
  if (!sel) return;
  sel.innerHTML = '';
  state.roles.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.id;
    opt.textContent = r.name || r.id;
    sel.appendChild(opt);
  });
  sel.onchange = enableAssignButtonIfReady;
}

// ---------------- Data loads (Netlify function) ----------------

async function loadMembers() {
  const token = await auth.getToken();
  if (!token) throw new Error('Missing token for listMembers');

  const res = await fetch(`/.netlify/functions/acc-admin?mode=listMembers&accountId=${encodeURIComponent(state.accountId)}`, {
    headers: { 'authorization': `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`listMembers failed: ${res.status}`);
  const data = await res.json();

  // Normalize to { id, name, email }
  state.members = (data.members || []).map(u => ({
    id: u.id || u.userId || u.uid || u.email,
    name: u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim(),
    email: u.email || u.emailId || u.mail || ''
  }));
  renderMemberSelector();
}

async function loadProjects() {
  const token = await auth.getToken();
  if (!token) throw new Error('Missing token for listProjects');

  const res = await fetch(`/.netlify/functions/acc-admin?mode=listProjects&accountId=${encodeURIComponent(state.accountId)}`, {
    headers: { 'authorization': `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`listProjects failed: ${res.status}`);
  const data = await res.json();

  // Normalize to { id, name, number }
  state.projects = (data.projects || []).map(p => ({
    id: p.id || p.projectId || p.guid,
    name: p.name || p.projectName || p.title || '',
    number: p.number || p.projectNumber || p.code || ''
  })).filter(p => p.id);
  renderProjects();
}

async function loadRoles(projectId /* optional */) {
  const token = await auth.getToken();
  if (!token) throw new Error('Missing token for listRoles');

  const url = projectId
    ? `/.netlify/functions/acc-admin?mode=listRoles&accountId=${encodeURIComponent(state.accountId)}&projectId=${encodeURIComponent(projectId)}`
    : `/.netlify/functions/acc-admin?mode=listAccountRoles&accountId=${encodeURIComponent(state.accountId)}`;

  const res = await fetch(url, { headers: { 'authorization': `Bearer ${token}` }});
  if (!res.ok) throw new Error(`listRoles failed: ${res.status}`);
  const data = await res.json();

  // Normalize to { id, name }
  state.roles = (data.roles || []).map(r => ({ id: r.id || r.roleId, name: r.name || r.displayName || r.roleName || r.id }));
  renderRoles();
}

// ---------------- Assign ----------------

async function assignUsersToProjects() {
  const token = await auth.getToken();
  if (!token) return notify('Not authenticated to ACC', 'error');

  const roleId = document.getElementById('roleSelect').value;
  const accessLevel = document.getElementById('accessLevel').value;

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
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${token}` },
    body: JSON.stringify({ mode: 'assignUsersToProjects', ...body })
  });

  let data = null;
  try { data = await res.json(); } catch {}
  if (res.ok && data?.ok) {
    notify(`Added ${body.memberIdsOrEmails.length} user(s) to ${body.projectIds.length} project(s)`, 'success');
    // Clear selections if you want:
    // state.selectedMemberIds.clear(); state.selectedProjectIds.clear(); renderMemberSelector(); renderProjects(); enableAssignButtonIfReady();
  } else {
    notify(`Failed: ${(data && (data.error || data.message)) || res.statusText}`, 'error');
    console.error('assignUsersToProjects error:', data || res.statusText);
  }
}

// ---------------- Init ----------------

async function init() {
  try {
    const profile = auth.getUserProfile();
    if (!profile) throw new Error('Missing user profile');
    const accountId = parseAccountIdFromProfile(profile);
    if (!accountId) throw new Error('Missing account (hub) selection');
    state.accountId = accountId;

    const token = await auth.getToken();
    if (!token) throw new Error('Missing 3LO token');

    // Load data in parallel
    await Promise.all([loadMembers(), loadProjects(), loadRoles(null)]);

    // Wire UI
    const memberSearch = document.getElementById('memberSelectSearch');
    if (memberSearch) memberSearch.addEventListener('input', () => {
      // tiny debounce
      clearTimeout(window._memberSearchT);
      window._memberSearchT = setTimeout(renderMemberSelector, 100);
    });

    document.getElementById('assignBtn')?.addEventListener('click', assignUsersToProjects);
    document.getElementById('btnAddUsersToProjects')?.addEventListener('click', () => notify('Add Users to Projects ready.', 'success'));

    hideAuthOverlay('ACC Admin is ready');
    enableAssignButtonIfReady();
  } catch (err) {
    console.error('ACC Admin init failed:', err);
    const authTitle = document.getElementById('authTitle');
    const authMessage = document.getElementById('authMessage');
    if (authTitle) authTitle.textContent = 'Authentication Error';
    if (authMessage) authMessage.textContent = err?.message || 'Failed to initialize ACC Admin';
  }
}

document.addEventListener('DOMContentLoaded', init);
export default {};