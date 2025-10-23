// scripts/admin.js
// Admin Panel Logic - User & Module Access Management

console.log('Admin module loaded');

// Import DB client functions
import { dbListUsers, dbGetUserById, dbUpsertUser, dbDeleteUserByEmail, getIdentityHeader } from './db-client.js';

let currentUserEmail = null;
let table, tbody, checkAll, removeBtn, addBtn, nameInput, emailInput;
let identityHeader = null;

async function initAdmin() {
  console.log('Initializing Admin panel...');
  
  table = document.getElementById('usersTable');
  tbody = document.getElementById('usersTbody');
  checkAll = document.getElementById('checkAll');
  removeBtn = document.getElementById('removeSelectedBtn');
  addBtn = document.getElementById('addUserBtn');
  nameInput = document.getElementById('newUserName');
  emailInput = document.getElementById('newUserEmail');

  try {
    // Get current user from localStorage (set by user-profile.js)
    const profileStore = localStorage.getItem('user_profile_data');
    const profile = profileStore ? JSON.parse(profileStore) : null;
    currentUserEmail = profile?.userInfo?.email || '';

    console.log('Current user:', currentUserEmail);

    if (!currentUserEmail) {
      showError('No user profile found. Please authenticate first.');
      setTimeout(() => location.href = 'index.html', 2000);
      return;
    }

    // Get identity header for DB calls
    identityHeader = getIdentityHeader();
    if (!identityHeader) {
      showError('Unable to get identity information. Please refresh and try again.');
      return;
    }

    // Check if current user is admin using DB
    const isAdmin = await checkUserIsAdmin(currentUserEmail);
    console.log('Is admin:', isAdmin);
    
    if (!isAdmin) {
      showNotification('Access restricted. Admins only.', 'error');
      setTimeout(() => location.href = 'index.html', 2000);
      return;
    }

    // Lock Matt as admin (hardcoded v1 - cannot be removed or demoted)
    await ensureMattIsAdmin();

    // Wire up events
    wireEvents();
    
    // Render the user table
    await renderTable();

    // Hide auth overlay
    hideAuthOverlay();
    
    showNotification('Admin panel loaded', 'success');

  } catch (error) {
    console.error('❌ Admin init error:', error);
    showError('Failed to initialize admin panel: ' + error.message);
  }
}

// DB helper functions
async function checkUserIsAdmin(email) {
  try {
    const rowId = normalizeId(email);
    const user = await dbGetUserById(rowId, identityHeader);
    return user?.admin || false;
  } catch (error) {
    console.error('Failed to check admin status:', error);
    return false;
  }
}

async function loadUsersForGrid() {
  try {
    const rows = await dbListUsers(identityHeader);
    return rows.map(row => ({
      email: row.email,
      name: row.full_name || row.name || row.email,
      admin: row.admin || false,
      modules: row.modules || {},
      status: row.status || 'active'
    }));
  } catch (error) {
    console.error('Failed to load users:', error);
    return [];
  }
}

async function saveUserFromGrid(user) {
  try {
    return await dbUpsertUser({
      ...user,
      hub_id: identityHeader?.user_metadata?.hubId || null,
      updatedAt: new Date().toISOString(),
      updatedBy: identityHeader?.email
    }, identityHeader);
  } catch (error) {
    console.error('Failed to save user:', error);
    throw error;
  }
}

async function deleteUsersFromGrid(emails) {
  try {
    for (const email of emails) {
      await dbDeleteUserByEmail(email, identityHeader);
    }
  } catch (error) {
    console.error('Failed to delete users:', error);
    throw error;
  }
}

function normalizeId(s) {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function ensureMattIsAdmin() {
  try {
    const mattEmail = 'mkeck@metromont.com';
    const rowId = normalizeId(mattEmail);
    const matt = await dbGetUserById(rowId, identityHeader);
    
    if (!matt) {
      // Create Matt as admin if doesn't exist
      await dbUpsertUser({
        email: mattEmail,
        full_name: 'Matt K',
        admin: true,
        modules: ['admin', 'db-manager', 'erection', 'qc', 'quality', 'design', 'production', 'inventory', 'haul', 'fab'],
        status: 'active',
        hub_id: identityHeader?.user_metadata?.hubId || null,
        createdAt: new Date().toISOString(),
        createdBy: 'system'
      }, identityHeader);
      console.log('✅ Created Matt K as admin');
    } else if (!matt.admin) {
      // Ensure Matt is always admin
      matt.admin = true;
      await dbUpsertUser(matt, identityHeader);
      console.log('✅ Restored Matt K admin status');
    }
  } catch (error) {
    console.error('Failed to ensure Matt is admin:', error);
  }
}

function wireEvents() {
  // Select all checkbox
  checkAll.addEventListener('change', () => {
    tbody.querySelectorAll('input.row-check').forEach(cb => {
      if (!cb.disabled) cb.checked = checkAll.checked;
    });
    toggleRemoveState();
  });

  // Remove selected button
  removeBtn.addEventListener('click', async () => {
    const emails = Array.from(tbody.querySelectorAll('input.row-check:checked'))
      .map(cb => cb.dataset.email.toLowerCase());
    
    if (emails.length === 0) return;
    
    // Prevent removing the hardcoded admin
    const filtered = emails.filter(e => e !== 'mkeck@metromont.com');
    
    if (filtered.length === 0) {
      showNotification('Cannot remove the system administrator', 'warning');
      return;
    }
    
    if (!confirm(`Remove ${filtered.length} user(s)?`)) return;
    
    await deleteUsersFromGrid(filtered);
    showNotification(`Removed ${filtered.length} user(s)`, 'success');
    await renderTable();
    checkAll.checked = false;
    toggleRemoveState();
  });

  // Add user button
  addBtn.addEventListener('click', onAddUser);
  
  // Enter key in email field
  emailInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') onAddUser();
  });
}

async function onAddUser() {
  const name = (nameInput.value || '').trim();
  const email = (emailInput.value || '').trim().toLowerCase();
  
  if (!email) {
    showNotification('Email is required', 'warning');
    emailInput.focus();
    return;
  }
  
  // Check if user already exists
  const rowId = normalizeId(email);
  const existing = await dbGetUserById(rowId, identityHeader);
  
  if (existing) {
    showNotification('User already exists', 'warning');
    return;
  }
  
  await saveUserFromGrid({
    email,
    full_name: name || email,
    admin: false,
    modules: {},
    status: 'active'
  });
  
  showNotification(`User ${name || email} added`, 'success');
  nameInput.value = '';
  emailInput.value = '';
  await renderTable();
}

function toggleRemoveState() {
  const anyChecked = tbody.querySelector('input.row-check:checked');
  removeBtn.disabled = !anyChecked;
}

async function renderTable() {
  const users = await loadUsersForGrid();
  tbody.innerHTML = '';

  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" class="empty-row">No users yet</td></tr>';
    return;
  }

  const MODULES = ['quality', 'design', 'production', 'db-manager', 'inventory', 'haul', 'fab'];

  users.forEach(u => {
    const tr = document.createElement('tr');
    
    // Row checkbox (cannot select Matt for deletion)
    const isMatt = (u.email || '').toLowerCase() === 'mkeck@metromont.com';
    const canSelect = !isMatt;
    
    const checkboxHtml = canSelect 
      ? `<input type="checkbox" class="row-check" data-email="${escapeHtml(u.email || '')}"/>` 
      : `<input type="checkbox" class="row-check" disabled title="System administrator cannot be removed"/>`;
    
    // Module toggles
    const modulesHtml = MODULES.map(m => {
      const checked = u.admin || u.modules?.[m];
      const disabled = u.admin;
      return `
        <td>
          <input type="checkbox" 
                 class="mod-toggle" 
                 data-email="${escapeHtml(u.email || '')}" 
                 data-module="${m}" 
                 ${checked ? 'checked' : ''} 
                 ${disabled ? 'disabled' : ''}
                 title="${disabled ? 'Admins have access to all modules' : 'Toggle module access'}"/>
        </td>
      `;
    }).join('');
    
    // Admin toggle
    const adminChecked = u.admin ? 'checked' : '';
    const adminDisabled = isMatt ? 'disabled' : '';
    const adminTitle = isMatt ? 'System administrator (locked)' : 'Grant admin privileges';
    
    tr.innerHTML = `
      <td>${checkboxHtml}</td>
      <td class="user-name">${escapeHtml(u.name || '')}</td>
      <td class="user-email">${escapeHtml(u.email || '')}</td>
      ${modulesHtml}
      <td>
        <input type="checkbox" 
               class="admin-toggle" 
               data-email="${escapeHtml(u.email || '')}" 
               ${adminChecked} 
               ${adminDisabled}
               title="${adminTitle}"/>
      </td>
    `;

    tbody.appendChild(tr);
  });

  // Wire up events for checkboxes
  tbody.querySelectorAll('input.row-check').forEach(cb => {
    cb.addEventListener('change', toggleRemoveState);
  });

  tbody.querySelectorAll('input.mod-toggle').forEach(cb => {
    cb.addEventListener('change', async (e) => {
      const email = e.target.dataset.email;
      const mod = e.target.dataset.module;
      
      try {
        const rowId = normalizeId(email);
        const user = await dbGetUserById(rowId, identityHeader);
        if (!user) return;
        
        user.modules = user.modules || {};
        user.modules[mod] = !!e.target.checked;
        await saveUserFromGrid(user);
        
        console.log(`Updated ${email} - ${mod}: ${user.modules[mod]}`);
      } catch (error) {
        console.error('Failed to update module access:', error);
        showNotification('Failed to update module access', 'error');
      }
    });
  });

  tbody.querySelectorAll('input.admin-toggle').forEach(cb => {
    cb.addEventListener('change', async (e) => {
      const email = e.target.dataset.email;
      
      try {
        const rowId = normalizeId(email);
        const user = await dbGetUserById(rowId, identityHeader);
        if (!user) return;
        
        user.admin = !!e.target.checked;
        
        // If admin → enable all modules
        if (user.admin) {
          user.modules = Object.fromEntries(MODULES.map(m => [m, true]));
        }
        
        await saveUserFromGrid(user);
        console.log(`Updated ${email} - admin: ${user.admin}`);
        
        // Re-render to lock module toggles when admin
        await renderTable();
      } catch (error) {
        console.error('Failed to update admin status:', error);
        showNotification('Failed to update admin status', 'error');
      }
    });
  });
}

function hideAuthOverlay() {
  const overlay = document.getElementById('authProcessing');
  if (overlay) {
    overlay.classList.remove('active');
  }
  document.body.classList.remove('auth-loading');
}

function showError(message) {
  const overlay = document.getElementById('authProcessing');
  if (overlay) {
    document.getElementById('authTitle').textContent = 'Error';
    document.getElementById('authMessage').textContent = message;
    overlay.querySelector('.loading').style.display = 'none';
  }
  showNotification(message, 'error');
}

function showNotification(message, type = 'info') {
  console.log(`Notification (${type}): ${message}`);
  
  const notification = document.getElementById('notification');
  const content = document.getElementById('notificationContent');
  
  if (notification && content) {
    content.textContent = message;
    notification.className = `notification ${type} show`;
    
    setTimeout(() => {
      notification.classList.remove('show');
    }, 4000);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', initAdmin);

