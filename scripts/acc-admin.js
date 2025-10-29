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
  projectSearchTerm: '',
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

// ---------- Mini Account Members pane (right side) ----------
function renderMemberMini() {
  const box = document.getElementById('memberMiniList');
  if (!box) return;
  const q = (document.getElementById('memberMiniSearch')?.value || '').toLowerCase();

  const filtered = state.members.filter(m =>
    !q || (m.name && m.name.toLowerCase().includes(q)) || (m.email && m.email.toLowerCase().includes(q))
  );

  const rows = filtered.map(m => {
    const id = m.id || m.email;
    const checked = state.selectedMemberIds.has(id) ? 'checked' : '';
    return `
      <div class="mini-row">
        <label>
          <input type="checkbox" class="mini-member-cb" data-id="${id}" ${checked} />
          <span class="mini-name">${m.name || m.email}</span>
          <span class="mini-email">${m.email || ''}</span>
        </label>
      </div>
    `;
  }).join('');

  box.innerHTML = rows || '<div class="muted">No members</div>';

  box.querySelectorAll('.mini-member-cb').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      if (e.currentTarget.checked) state.selectedMemberIds.add(id);
      else state.selectedMemberIds.delete(id);
      // keep the left-side chips in sync too (if visible)
      renderSelectedMembers();
      enableAssignButtonIfReady();
    });
  });
}

// ---------------- Projects (with Select All + columns) ----------------

function renderProjects() {
  const container = document.getElementById('projectList');
  if (!container) return;

  const q = state.projectSearchTerm.toLowerCase().trim();
  const filtered = state.projects.filter(p => {
    const name = (p.name || '').toLowerCase();
    const number = (p.number || '').toLowerCase();
    return !q || name.includes(q) || number.includes(q);
  });

  const rows = filtered.map(p => {
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
      <colgroup>
        <col class="w-check"/>
        <col class="w-name"/>
        <col class="w-number"/>
      </colgroup>
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

  // individual project checkboxes
  container.querySelectorAll('.project-cb').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      if (e.currentTarget.checked) state.selectedProjectIds.add(id);
      else state.selectedProjectIds.delete(id);
      enableAssignButtonIfReady();
      syncSelectAllCheckbox();
    });
  });

  // NEW: wire the "Select All" toggle
  const selectAll = document.getElementById('selectAllProjects');
  if (selectAll) {
    selectAll.onchange = () => {
      if (selectAll.checked) {
        // select all currently FILTERED projects (what's visible in the table)
        state.selectedProjectIds = new Set(filtered.map(p => p.id));
      } else {
        // deselect all currently FILTERED projects
        filtered.forEach(p => state.selectedProjectIds.delete(p.id));
      }
      renderProjects();          // reflect checkboxes
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

  const url = `/.netlify/functions/acc-admin?mode=listMembers&accountId=${encodeURIComponent(state.accountId)}`;
  console.log('🔎 loadMembers:', url);

  let res;
  try {
    res = await fetch(url, { headers: { 'authorization': `Bearer ${token}` } });
  } catch (networkErr) {
    console.error('❌ loadMembers network error:', networkErr);
    notify('Network error loading members', 'error');
    throw networkErr;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('❌ loadMembers failed:', res.status, text?.slice(0, 300));
    notify(`Failed to load members (${res.status})`, 'error');
    throw new Error(`listMembers failed: ${res.status}`);
  }

  const data = await res.json();

  // Normalize to { id, name, email }
  state.members = (data.members || []).map(u => ({
    id: u.id || u.userId || u.uid || u.email,
    name: u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim(),
    email: u.email || u.emailId || u.mail || ''
  }));

  console.log(`👥 Members loaded: ${state.members.length}`);

  // Render the TOP mini pane (the one we're keeping)
  renderMemberMini();

  // If you want to keep the left-pane code around for now, you can still sync it:
  // renderMemberSelector();
}

async function loadProjects() {
  const token = await auth.getToken();
  if (!token) throw new Error('Missing token for listProjects');

  const res = await fetch(`/.netlify/functions/acc-admin?mode=listProjects&accountId=${encodeURIComponent(state.accountId)}`, {
    headers: { 'authorization': `Bearer ${token}` }
  });

  let data = { projects: [] };
  if (res.ok) {
    data = await res.json();
  } else {
    console.warn('listProjects failed from ACC Admin function:', res.status);
  }

  // Normalize from API, if present
  let projects = (data.projects || []).map(p => ({
    id: p.id || p.projectId || p.guid,
    name: p.name || p.projectName || p.title || '',
    number: p.number || p.projectNumber || p.code || ''
  })).filter(p => p.id);

  // Fallback: use dashboard's normalized cache if API returned none
  if (projects.length === 0) {
    try {
      const cached = JSON.parse(sessionStorage.getItem('castlink_hub_data') || '{}');
      const cachedProjects = cached?.projects || [];
      if (cachedProjects.length) {
        console.log(`ℹ️ Using cached hub projects (${cachedProjects.length}) from dashboard`);
        projects = cachedProjects.map(p => ({
          id: p.id,
          name: p.name || p.displayName || p.fullProjectName || '',
          number: p.number || p.projectNumber || ''
        })).filter(p => p.id);
      }
    } catch {}
  }

  state.projects = projects;
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

  console.log('➡️ assignUsersToProjects()', body);

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
    const projSearch = document.getElementById('projectSearch');
    if (projSearch) {
      projSearch.addEventListener('input', () => {
        state.projectSearchTerm = projSearch.value || '';
        renderProjects();
      });
    }

    const miniSearch = document.getElementById('memberMiniSearch');
    if (miniSearch) {
      miniSearch.addEventListener('input', () => renderMemberMini());
    }
    // initial render of the mini pane
    renderMemberMini();

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