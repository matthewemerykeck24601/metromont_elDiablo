// DB Manager Module
console.log('DB Manager module loaded');

// Global State
let folders = [];
let tables = [];
let currentTable = null;
let currentRows = [];

// API Helper
async function api(path, opts = {}) {
  try {
    const url = `/api/db${path}`;
    const options = {
      headers: { 'Content-Type': 'application/json' },
      ...opts
    };

    const res = await fetch(url, options);
    
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`API Error ${res.status}: ${errorText}`);
    }

    if (res.status === 204) {
      return null;
    }

    return await res.json();
  } catch (error) {
    console.error('API call failed:', error);
    showNotification(`API Error: ${error.message}`, 'error');
    throw error;
  }
}

// Initialize
async function init() {
  console.log('Initializing DB Manager...');
  
  try {
    // Check health
    const health = await api('/health');
    console.log('✅ DB Health:', health);
    
    document.getElementById('dbStatusText').textContent = 
      `Connected to ${health.bucket} (${health.region})`;
    
    const badge = document.getElementById('dbStatusBadge');
    if (badge) {
      badge.style.display = 'inline-flex';
      badge.innerHTML = `
        <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
        </svg>
        Connected
      `;
    }

    // Load initial data
    await loadAll();
    
  } catch (error) {
    console.error('❌ Initialization failed:', error);
    document.getElementById('dbStatusText').textContent = 'Connection failed';
    showNotification('Failed to connect to DB', 'error');
  }
}

// Load all folders and tables
async function loadAll() {
  try {
    const [foldersData, tablesData] = await Promise.all([
      api('/folders'),
      api('/tables')
    ]);

    folders = foldersData || [];
    tables = tablesData || [];

    console.log(`Loaded ${folders.length} folders and ${tables.length} tables`);

    renderTree();
    renderTablesView();

  } catch (error) {
    console.error('Failed to load data:', error);
  }
}

// Render sidebar tree
function renderTree() {
  const tree = document.getElementById('dbTree');
  
  if (folders.length === 0 && tables.length === 0) {
    tree.innerHTML = `
      <div class="empty-state">
        <svg fill="currentColor" viewBox="0 0 24 24">
          <path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z"/>
        </svg>
        <p>No folders or tables yet</p>
        <small>Click "Add Folder" to get started</small>
      </div>
    `;
    return;
  }

  // Group tables by folder
  const byFolder = {};
  const noFolder = [];

  tables.forEach(t => {
    if (t.folderId) {
      byFolder[t.folderId] = byFolder[t.folderId] || [];
      byFolder[t.folderId].push(t);
    } else {
      noFolder.push(t);
    }
  });

  let html = '';

  // Render folders with their tables
  folders.forEach(f => {
    const folderTables = byFolder[f.id] || [];
    html += `
      <div class="folder">
        <div class="folder-name">
          <svg fill="currentColor" viewBox="0 0 24 24">
            <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
          </svg>
          ${f.name}
        </div>
        <ul>
          ${folderTables.map(t => `
            <li data-table="${t.id}" onclick="openTable('${t.id}')">
              <svg fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
              </svg>
              ${t.name}
            </li>
          `).join('')}
        </ul>
      </div>
    `;
  });

  // Render tables without folders
  if (noFolder.length > 0) {
    html += `
      <div class="folder">
        <div class="folder-name">
          <svg fill="currentColor" viewBox="0 0 24 24">
            <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
          </svg>
          Uncategorized
        </div>
        <ul>
          ${noFolder.map(t => `
            <li data-table="${t.id}" onclick="openTable('${t.id}')">
              <svg fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
              </svg>
              ${t.name}
            </li>
          `).join('')}
        </ul>
      </div>
    `;
  }

  tree.innerHTML = html;
}

// Render Tables View (default tab)
function renderTablesView() {
  const pane = document.getElementById('dbPane');
  
  if (tables.length === 0) {
    pane.innerHTML = `
      <div class="empty-state">
        <svg fill="currentColor" viewBox="0 0 24 24">
          <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
        </svg>
        <h3>No Tables</h3>
        <p>Create your first table to store app data</p>
        <button class="btn btn-primary" onclick="showAddTableModal()">Create Table</button>
      </div>
    `;
    return;
  }

  const html = `
    <h2 style="margin-bottom: 1rem; font-size: 1.25rem; color: var(--mm-text);">Tables Overview</h2>
    <table class="data-grid">
      <thead>
        <tr>
          <th>Name</th>
          <th>Folder</th>
          <th>Fields</th>
          <th>Created</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${tables.map(t => {
          const folder = folders.find(f => f.id === t.folderId);
          const fieldCount = Object.keys(t.schema?.properties || {}).length;
          return `
            <tr>
              <td><strong>${t.name}</strong></td>
              <td>${folder ? folder.name : '-'}</td>
              <td>${fieldCount} fields</td>
              <td>${formatDate(t.createdAt)}</td>
              <td>
                <button class="btn btn-sm btn-secondary" onclick="openTable('${t.id}')">View Rows</button>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;

  pane.innerHTML = html;
}

// Open table and show rows
async function openTable(tableId) {
  currentTable = tables.find(t => t.id === tableId);
  if (!currentTable) {
    showNotification('Table not found', 'error');
    return;
  }

  console.log('Opening table:', tableId);

  // Switch to Rows tab
  switchTab('rows');

  try {
    const rows = await api(`/rows/${tableId}`);
    currentRows = rows || [];

    renderRowsView();
  } catch (error) {
    console.error('Failed to load rows:', error);
    showNotification('Failed to load rows', 'error');
  }
}

// Render Rows View
function renderRowsView() {
  const pane = document.getElementById('dbPane');

  if (!currentTable) {
    pane.innerHTML = '<div class="loading-message"><p>Select a table to view rows</p></div>';
    return;
  }

  const fields = Object.keys(currentTable.schema?.properties || {});

  if (currentRows.length === 0) {
    pane.innerHTML = `
      <div class="empty-state">
        <svg fill="currentColor" viewBox="0 0 24 24">
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
        </svg>
        <h3>No Rows in ${currentTable.name}</h3>
        <p>Add your first row to start storing data</p>
        <button class="btn btn-primary" onclick="showAddRowModal()">Add Row</button>
      </div>
    `;
    return;
  }

  const html = `
    <div class="content-actions">
      <h2 style="margin: 0; font-size: 1.25rem; color: var(--mm-text); flex: 1;">${currentTable.name} - Rows (${currentRows.length})</h2>
      <button class="btn btn-primary" onclick="showAddRowModal()">Add Row</button>
      <button class="btn btn-secondary" onclick="exportTableCsv()">Export CSV</button>
    </div>

    <div style="overflow: auto;">
      <table class="data-grid">
        <thead>
          <tr>
            <th>ID</th>
            ${fields.map(f => `<th>${f}</th>`).join('')}
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${currentRows.map(row => `
            <tr>
              <td><code style="font-size: 0.75rem;">${row.id.substring(0, 8)}...</code></td>
              ${fields.map(f => `<td>${escapeHtml(String(row[f] ?? ''))}</td>`).join('')}
              <td>
                <button class="btn btn-sm btn-secondary" onclick='editRow("${row.id}")'>Edit</button>
                <button class="btn btn-sm btn-secondary" onclick='deleteRow("${row.id}")'>Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  pane.innerHTML = html;
}

// Render OSS Objects View
async function renderOssView() {
  const pane = document.getElementById('dbPane');
  pane.innerHTML = '<div class="loading">Loading OSS objects...</div>';

  try {
    const data = await api('/objects?prefix=');
    
    if (data.objects.length === 0) {
      pane.innerHTML = `
        <div class="empty-state">
          <h3>No Objects</h3>
          <p>The bucket "${data.bucket}" is empty</p>
        </div>
      `;
      return;
    }

    const html = `
      <h2 style="margin-bottom: 1rem; font-size: 1.25rem;">OSS Objects (${data.count})</h2>
      <p style="color: var(--mm-text-muted); margin-bottom: 1rem; font-size: 0.875rem;">
        Bucket: <code>${data.bucket}</code>
      </p>
      <ul class="object-list">
        ${data.objects.map(obj => `
          <li class="object-item">
            <span class="object-key">${obj.key}</span>
            <span class="object-meta">
              <span>${formatBytes(obj.size)}</span>
              <span>${formatDate(obj.lastModified)}</span>
            </span>
          </li>
        `).join('')}
      </ul>
    `;

    pane.innerHTML = html;
  } catch (error) {
    pane.innerHTML = `<div class="empty-state"><p>Failed to load OSS objects</p></div>`;
  }
}

// Tab switching
function switchTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.tab').forEach(btn => {
    btn.classList.toggle('tab--active', btn.dataset.tab === tabName);
  });

  // Update content
  if (tabName === 'tables') {
    renderTablesView();
  } else if (tabName === 'rows') {
    renderRowsView();
  } else if (tabName === 'oss') {
    renderOssView();
  }
}

// Folder Modal
function showAddFolderModal() {
  document.getElementById('folderModal').style.display = 'flex';
  document.getElementById('folderName').value = '';
  document.getElementById('folderDescription').value = '';
}

function closeFolderModal() {
  document.getElementById('folderModal').style.display = 'none';
}

async function createFolder() {
  const name = document.getElementById('folderName').value.trim();
  const description = document.getElementById('folderDescription').value.trim();

  if (!name) {
    showNotification('Folder name is required', 'warning');
    return;
  }

  try {
    await api('/folders', {
      method: 'POST',
      body: JSON.stringify({ name, description })
    });

    showNotification('Folder created successfully', 'success');
    closeFolderModal();
    await loadAll();
  } catch (error) {
    console.error('Failed to create folder:', error);
  }
}

// Table Modal
function showAddTableModal() {
  document.getElementById('tableModal').style.display = 'flex';
  document.getElementById('tableName').value = '';
  document.getElementById('tableSchema').value = '';
  
  // Populate folder dropdown
  const select = document.getElementById('tableFolderId');
  select.innerHTML = '<option value="">No folder</option>';
  folders.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.name;
    select.appendChild(opt);
  });
}

function closeTableModal() {
  document.getElementById('tableModal').style.display = 'none';
}

async function createTable() {
  const name = document.getElementById('tableName').value.trim();
  const folderId = document.getElementById('tableFolderId').value;
  const schemaText = document.getElementById('tableSchema').value.trim();

  if (!name) {
    showNotification('Table name is required', 'warning');
    return;
  }

  let schema;
  try {
    schema = JSON.parse(schemaText || '{"type":"object","properties":{}}');
  } catch (e) {
    showNotification('Invalid JSON schema', 'error');
    return;
  }

  try {
    await api('/tables', {
      method: 'POST',
      body: JSON.stringify({ name, folderId, schema })
    });

    showNotification('Table created successfully', 'success');
    closeTableModal();
    await loadAll();
  } catch (error) {
    console.error('Failed to create table:', error);
  }
}

// Row operations
function showAddRowModal() {
  if (!currentTable) return;

  const data = prompt('Enter row data as JSON:');
  if (!data) return;

  try {
    const parsed = JSON.parse(data);
    addRow(parsed);
  } catch (e) {
    showNotification('Invalid JSON', 'error');
  }
}

async function addRow(data) {
  if (!currentTable) return;

  try {
    await api(`/rows/${currentTable.id}`, {
      method: 'POST',
      body: JSON.stringify({ data })
    });

    showNotification('Row added successfully', 'success');
    await openTable(currentTable.id);
  } catch (error) {
    console.error('Failed to add row:', error);
  }
}

async function editRow(rowId) {
  const row = currentRows.find(r => r.id === rowId);
  if (!row) return;

  const data = prompt('Edit row data (JSON):', JSON.stringify(row, null, 2));
  if (!data) return;

  try {
    const parsed = JSON.parse(data);
    
    await api(`/rows/${currentTable.id}/${rowId}`, {
      method: 'PUT',
      body: JSON.stringify({ data: parsed })
    });

    showNotification('Row updated successfully', 'success');
    await openTable(currentTable.id);
  } catch (e) {
    showNotification('Invalid JSON or update failed', 'error');
  }
}

async function deleteRow(rowId) {
  if (!confirm('Delete this row?')) return;

  try {
    await api(`/rows/${currentTable.id}/${rowId}`, {
      method: 'DELETE'
    });

    showNotification('Row deleted successfully', 'success');
    await openTable(currentTable.id);
  } catch (error) {
    console.error('Failed to delete row:', error);
  }
}

// Export current table as CSV
function exportTableCsv() {
  if (!currentTable || currentRows.length === 0) {
    showNotification('No data to export', 'warning');
    return;
  }

  const fields = Object.keys(currentTable.schema?.properties || {});
  const header = ['id', ...fields].join(',');
  const rows = currentRows.map(row => {
    const values = [row.id, ...fields.map(f => csvEscape(row[f]))];
    return values.join(',');
  });

  const csv = [header, ...rows].join('\n');
  downloadFile(`${currentTable.name}.csv`, csv, 'text/csv');
  showNotification('CSV exported', 'success');
}

// Utilities
function formatDate(dateStr) {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return dateStr;
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function csvEscape(value) {
  const str = String(value ?? '');
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  console.log('DB Manager page loaded');

  // Buttons
  document.getElementById('btnRefresh').addEventListener('click', loadAll);
  document.getElementById('btnAddFolder').addEventListener('click', showAddFolderModal);
  document.getElementById('btnAddTable').addEventListener('click', showAddTableModal);

  // Tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Initialize
  init();
});

// Make functions globally available for onclick handlers
window.openTable = openTable;
window.showAddTableModal = showAddTableModal;
window.closeTableModal = closeTableModal;
window.createTable = createTable;
window.closeFolderModal = closeFolderModal;
window.createFolder = createFolder;
window.showAddRowModal = showAddRowModal;
window.editRow = editRow;
window.deleteRow = deleteRow;
window.exportTableCsv = exportTableCsv;

