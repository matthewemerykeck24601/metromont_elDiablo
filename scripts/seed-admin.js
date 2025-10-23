// scripts/seed-admin.js
// Script to seed admin user in the database to prevent lockout

console.log('Admin seeding script loaded');

// Function to seed admin user
async function seedAdminUser() {
    try {
        console.log('🌱 Seeding admin user...');
        
        // Get identity header
        const identityHeader = getIdentityHeader();
        if (!identityHeader) {
            console.error('❌ No identity header available');
            return false;
        }
        
        // Import DB client functions
        const { dbUpsertUser, dbGetUserById } = await import('./db-client.js');
        
        const adminEmail = 'mkeck@metromont.com';
        const rowId = normalizeId(adminEmail);
        
        // Check if admin already exists
        const existingAdmin = await dbGetUserById(rowId, identityHeader);
        
        if (existingAdmin) {
            console.log('✅ Admin user already exists');
            return true;
        }
        
        // Create admin user
        const adminUser = {
            email: adminEmail,
            full_name: 'Matt Keck',
            admin: true,
            modules: ['admin', 'db-manager', 'erection', 'qc', 'quality', 'design', 'production', 'inventory', 'haul', 'fab'],
            status: 'active',
            hub_id: identityHeader?.user_metadata?.hubId || null,
            createdAt: new Date().toISOString(),
            createdBy: 'system'
        };
        
        await dbUpsertUser(adminUser, identityHeader);
        console.log('✅ Admin user seeded successfully');
        return true;
        
    } catch (error) {
        console.error('❌ Failed to seed admin user:', error);
        return false;
    }
}

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

// Auto-seed when script loads (if user is authenticated)
document.addEventListener('DOMContentLoaded', async () => {
    // Only run if we're on the main page and user is authenticated
    if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
        const profileStore = localStorage.getItem('user_profile_data');
        if (profileStore) {
            console.log('🔐 User authenticated, checking admin seed...');
            await seedAdminUser();
        }
    }
});

// Export for manual use
window.seedAdminUser = seedAdminUser;
