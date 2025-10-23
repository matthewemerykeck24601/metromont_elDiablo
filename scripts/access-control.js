// scripts/access-control.js
// Client-side Access Control List (ACL) Manager
// v2: Database-based, replaces localStorage with DB calls

(() => {
  const MODULES = ['quality', 'design', 'production', 'db-manager', 'inventory', 'haul', 'fab'];

  function normalizeId(s) {
    return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  function getIdentityHeader() {
    // Get user profile data from localStorage
    const profileStore = localStorage.getItem('user_profile_data');
    if (!profileStore) return null;
    
    const profile = JSON.parse(profileStore);
    const userInfo = profile.userInfo;
    const selectedHub = profile.selectedHub;
    
    if (!userInfo?.email) return null;
    
    // Create identity header similar to what Netlify Identity would provide
    return JSON.stringify({
      email: userInfo.email,
      user_metadata: {
        hubId: selectedHub?.id || null,
        full_name: userInfo.name || userInfo.email
      }
    });
  }

  async function dbGetUserById(rowId, identityHeader) {
    const r = await fetch(`/api/db/rows/users/${rowId}`, {
      headers: { 'x-netlify-identity': identityHeader }
    });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('Failed to get user');
    return r.json();
  }

  const ACL = {
    MODULES,

    async getDb() { 
      // Legacy method - return empty object for compatibility
      return { users: [] }; 
    },

    async list() {
      // Legacy method - not used in DB version
      return [];
    },

    async upsert(user) {
      // Legacy method - not used in DB version
      console.warn('ACL.upsert is deprecated, use DB client directly');
    },

    async removeMany(emails) {
      // Legacy method - not used in DB version
      console.warn('ACL.removeMany is deprecated, use DB client directly');
    },

    // --- Checks (use Autodesk profile email) ---
    async isAllowed(email) {
      try {
        const identityHeader = getIdentityHeader();
        if (!identityHeader) return false;
        
        const rowId = normalizeId(email);
        const user = await dbGetUserById(rowId, identityHeader);
        return !!user && user.status !== 'blocked';
      } catch (error) {
        console.error('Failed to check if user is allowed:', error);
        return false;
      }
    },

    async isAdmin(email) {
      try {
        const identityHeader = getIdentityHeader();
        if (!identityHeader) return false;
        
        const rowId = normalizeId(email);
        const user = await dbGetUserById(rowId, identityHeader);
        return !!user?.admin;
      } catch (error) {
        console.error('Failed to check admin status:', error);
        return false;
      }
    },

    async canAccess(email, moduleId) {
      try {
        const identityHeader = getIdentityHeader();
        if (!identityHeader) return false;
        
        const rowId = normalizeId(email);
        const user = await dbGetUserById(rowId, identityHeader);
        if (!user) return false;
        if (user.admin) return true; // admins have access to all modules
        return !!user.modules?.[moduleId];
      } catch (error) {
        console.error('Failed to check module access:', error);
        return false;
      }
    }
  };

  window.ACL = ACL;
  console.log('✅ ACL system loaded (DB-backed)');
})();

