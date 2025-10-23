// scripts/emergency-admin.js
// Emergency script to add admin user when locked out
// Run this in browser console to restore admin access

console.log('🚨 Emergency Admin Script Loaded');

async function addEmergencyAdmin() {
    try {
        console.log('🔧 Adding emergency admin user...');
        
        // Your email
        const adminEmail = 'mkeck@metromont.com';
        
        // Create identity header manually
        const identityHeader = JSON.stringify({
            email: adminEmail,
            user_metadata: {
                hubId: null,
                full_name: 'Matt Keck'
            }
        });
        
        // Create admin user data
        const adminUser = {
            email: adminEmail,
            full_name: 'Matt Keck',
            admin: true,
            modules: ['admin', 'db-manager', 'erection', 'qc', 'quality', 'design', 'production', 'inventory', 'haul', 'fab'],
            status: 'active',
            hub_id: null,
            createdAt: new Date().toISOString(),
            createdBy: 'emergency-script'
        };
        
        // Normalize ID
        function normalizeId(s) {
            return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        }
        
        const rowId = normalizeId(adminEmail);
        
        // Try to create the user
        const response = await fetch('/api/db/rows/users', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'x-netlify-identity': identityHeader 
            },
            body: JSON.stringify({ data: { ...adminUser, id: rowId } })
        });
        
        if (response.ok) {
            console.log('✅ Emergency admin user created successfully!');
            console.log('You can now access the admin module.');
            return true;
        } else {
            const errorText = await response.text();
            console.error('❌ Failed to create admin user:', response.status, errorText);
            return false;
        }
        
    } catch (error) {
        console.error('❌ Emergency admin creation failed:', error);
        return false;
    }
}

// Alternative: Temporarily disable permission checks
function temporarilyDisablePermissions() {
    console.log('🔓 Temporarily disabling permission checks...');
    
    // Override the ACL methods to always return true
    if (window.ACL) {
        window.ACL.isAllowed = () => Promise.resolve(true);
        window.ACL.isAdmin = () => Promise.resolve(true);
        window.ACL.canAccess = () => Promise.resolve(true);
        console.log('✅ Permission checks disabled temporarily');
        console.log('⚠️ Remember to re-enable after adding yourself to the database!');
    } else {
        console.error('❌ ACL system not found');
    }
}

// Make functions available globally
window.addEmergencyAdmin = addEmergencyAdmin;
window.temporarilyDisablePermissions = temporarilyDisablePermissions;

console.log('🚨 Emergency functions available:');
console.log('  - addEmergencyAdmin() - Try to add admin user to database');
console.log('  - temporarilyDisablePermissions() - Disable permission checks temporarily');
console.log('');
console.log('Run one of these commands in the console:');
console.log('  addEmergencyAdmin()');
console.log('  temporarilyDisablePermissions()');
