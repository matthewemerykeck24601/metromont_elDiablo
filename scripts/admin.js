// scripts/admin.js
// Admin Panel Logic - User & Module Access Management

console.log('Admin module loaded');

let currentUserEmail = null;
let table, tbody, checkAll, removeBtn, addBtn, nameInput, emailInput;

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
    // Wait for ACL to be available
    if (!window.ACL) {
      console.error('❌ ACL not loaded');
      showError('Access control system not loaded');
      return;
    }

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

    // Enforce: Only admins can access this page
    const isAdmin = await ACL.isAdmin(currentUserEmail);
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

async function ensureMattIsAdmin() {
  const db = await ACL.getDb();
  const matt = db.users.find(u => (u.email || '').toLowerCase() === 'mkeck@metromont.com');
  
  if (!matt) {
    // Create Matt as admin if doesn't exist
    await ACL.upsert({
      name: 'Matt K',
      email: 'mkeck@metromont.com',
      admin: true,
      modules: Object.fromEntries(ACL.MODULES.map(m => [m, true]))
    });
    console.log('✅ Created Matt K as admin');
  } else if (!matt.admin) {
    // Ensure Matt is always admin
    matt.admin = true;
    await ACL.upsert(matt);
    console.log('✅ Restored Matt K admin status');
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
    
    await ACL.removeMany(filtered);
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
  const db = await ACL.getDb();
  const existing = db.users.find(u => (u.email || '').toLowerCase() === email);
  
  if (existing) {
    showNotification('User already exists', 'warning');
    return;
  }
  
  await ACL.upsert({
    name: name || email,
    email,
    admin: false,
    modules: Object.fromEntries(ACL.MODULES.map(m => [m, false]))
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
  const users = await ACL.list();
  tbody.innerHTML = '';

  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" class="empty-row">No users yet</td></tr>';
    return;
  }

  users.forEach(u => {
    const tr = document.createElement('tr');
    
    // Row checkbox (cannot select Matt for deletion)
    const isMatt = (u.email || '').toLowerCase() === 'mkeck@metromont.com';
    const canSelect = !isMatt;
    
    const checkboxHtml = canSelect 
      ? `<input type="checkbox" class="row-check" data-email="${escapeHtml(u.email || '')}"/>` 
      : `<input type="checkbox" class="row-check" disabled title="System administrator cannot be removed"/>`;
    
    // Module toggles
    const modulesHtml = ACL.MODULES.map(m => {
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
      const db = await ACL.getDb();
      const u = db.users.find(x => (x.email || '').toLowerCase() === email.toLowerCase());
      if (!u) return;
      
      u.modules = u.modules || {};
      u.modules[mod] = !!e.target.checked;
      await ACL.upsert(u);
      
      console.log(`Updated ${email} - ${mod}: ${u.modules[mod]}`);
    });
  });

  tbody.querySelectorAll('input.admin-toggle').forEach(cb => {
    cb.addEventListener('change', async (e) => {
      const email = e.target.dataset.email;
      const db = await ACL.getDb();
      const u = db.users.find(x => (x.email || '').toLowerCase() === email.toLowerCase());
      if (!u) return;
      
      u.admin = !!e.target.checked;
      
      // If admin → enable all modules
      if (u.admin) {
        u.modules = Object.fromEntries(ACL.MODULES.map(m => [m, true]));
      }
      
      await ACL.upsert(u);
      console.log(`Updated ${email} - admin: ${u.admin}`);
      
      // Re-render to lock module toggles when admin
      await renderTable();
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

