// scripts/access-control.js
// Client-side Access Control List (ACL) Manager
// v1: localStorage-based, simple allowlist + per-module toggles

(() => {
  const STORAGE_KEY = 'castlink_users_v1';
  const SEED_URL = 'data/users.seed.json'; // optional, first-run

  const MODULES = ['quality', 'design', 'production', 'db-manager', 'inventory', 'haul', 'fab'];

  function _loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  }

  async function _seedIfEmpty() {
    const existing = _loadFromStorage();
    if (existing) return existing;
    
    try {
      const res = await fetch(SEED_URL);
      if (res.ok) {
        const seeded = await res.json();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
        console.log('✅ ACL seeded from', SEED_URL);
        return seeded;
      }
    } catch (e) {
      console.warn('⚠️ Could not load seed file:', e);
    }
    
    // fallback: seed Matt as admin
    const seeded = {
      users: [{
        name: 'Matt K',
        email: 'mkeck@metromont.com',
        admin: true,
        modules: Object.fromEntries(MODULES.map(m => [m, true]))
      }]
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    console.log('✅ ACL seeded with default admin');
    return seeded;
  }

  async function loadUsers() {
    return _loadFromStorage() || (await _seedIfEmpty());
  }

  function saveUsers(db) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  }

  function findUser(db, email) {
    if (!db?.users) return null;
    return db.users.find(u => (u.email || '').toLowerCase() === (email || '').toLowerCase());
  }

  function ensureUserShape(u) {
    u.modules = u.modules || {};
    return u;
  }

  const ACL = {
    MODULES,

    async getDb() { 
      return await loadUsers(); 
    },

    async list() {
      const db = await loadUsers();
      return db.users.map(ensureUserShape);
    },

    async upsert(user) {
      const db = await loadUsers();
      const existing = findUser(db, user.email);
      if (existing) {
        Object.assign(existing, ensureUserShape(user));
      } else {
        db.users.push(ensureUserShape(user));
      }
      saveUsers(db);
    },

    async removeMany(emails) {
      const db = await loadUsers();
      const lowercaseEmails = emails.map(e => (e || '').toLowerCase());
      db.users = db.users.filter(u => !lowercaseEmails.includes((u.email || '').toLowerCase()));
      saveUsers(db);
    },

    // --- Checks (use Autodesk profile email) ---
    async isAllowed(email) {
      const db = await loadUsers();
      return !!findUser(db, email);
    },

    async isAdmin(email) {
      const db = await loadUsers();
      const u = findUser(db, email);
      return !!u?.admin;
    },

    async canAccess(email, moduleId) {
      const db = await loadUsers();
      const u = findUser(db, email);
      if (!u) return false;
      if (u.admin) return true; // admins have access to all modules
      return !!u.modules?.[moduleId];
    }
  };

  window.ACL = ACL;
  console.log('✅ ACL system loaded');
})();

