// scripts/module-guard.js
// Module access guard - enforces permissions on module pages

console.log('Module guard loaded');

// Permission helper function
function canAccess(moduleId) {
    const p = window.currentUserPermissions;
    return p?.admin || (p?.modules?.has?.(moduleId) ?? false);
}

// Get current module from page
function getCurrentModule() {
    const path = window.location.pathname;
    const filename = path.split('/').pop().replace('.html', '');
    
    // Map filenames to module IDs
    const moduleMap = {
        'quality-control': 'quality',
        'engineering': 'design',
        'scheduling-hub': 'production',
        'production-scheduling': 'production',
        'db-manager': 'db-manager',
        'erection-sequencing': 'erection',
        'admin': 'admin'
    };
    
    return moduleMap[filename] || filename;
}

// Check if user has access to current module
async function checkModuleAccess() {
    const currentModule = getCurrentModule();
    console.log('Checking access for module:', currentModule);
    
    // Check for hardcoded admin bypass first
    const profileStore = localStorage.getItem('user_profile_data');
    if (profileStore) {
        const profile = JSON.parse(profileStore);
        const email = profile.userInfo?.email;
        if (email && email.toLowerCase() === 'mkeck@metromont.com') {
            console.log('🔓 Hardcoded admin bypass - granting access to:', currentModule);
            return true;
        }
    }
    
    // Wait for permissions to be loaded
    let attempts = 0;
    while (!window.currentUserPermissions && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }
    
    if (!window.currentUserPermissions) {
        console.error('❌ User permissions not loaded');
        showAccessDenied('Unable to verify permissions. Please refresh and try again.');
        return false;
    }
    
    if (!canAccess(currentModule)) {
        console.error('❌ Access denied for module:', currentModule);
        showAccessDenied(`You do not have access to the ${currentModule} module. Please contact an administrator.`);
        return false;
    }
    
    console.log('✅ Access granted for module:', currentModule);
    return true;
}

// Show access denied page
function showAccessDenied(message) {
    document.body.innerHTML = `
        <div style="
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            text-align: center;
            padding: 2rem;
        ">
            <div style="
                background: rgba(255, 255, 255, 0.1);
                backdrop-filter: blur(10px);
                border-radius: 16px;
                padding: 3rem;
                max-width: 500px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            ">
                <div style="font-size: 4rem; margin-bottom: 1rem;">🚫</div>
                <h1 style="font-size: 2rem; margin-bottom: 1rem; font-weight: 600;">Access Denied</h1>
                <p style="font-size: 1.1rem; margin-bottom: 2rem; opacity: 0.9;">${message}</p>
                <button onclick="window.location.href='index.html'" style="
                    background: rgba(255, 255, 255, 0.2);
                    border: 1px solid rgba(255, 255, 255, 0.3);
                    color: white;
                    padding: 0.75rem 1.5rem;
                    border-radius: 8px;
                    font-size: 1rem;
                    cursor: pointer;
                    transition: all 0.2s;
                " onmouseover="this.style.background='rgba(255, 255, 255, 0.3)'" onmouseout="this.style.background='rgba(255, 255, 255, 0.2)'">
                    Return to Dashboard
                </button>
            </div>
        </div>
    `;
}

// Initialize module guard
async function initModuleGuard() {
    console.log('🔒 Initializing module guard...');
    
    // Wait for ACL system to be available
    let attempts = 0;
    while (!window.ACL && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }
    
    if (!window.ACL) {
        console.error('❌ ACL system not loaded');
        showAccessDenied('Access control system not available. Please refresh and try again.');
        return;
    }
    
    // Check module access
    const hasAccess = await checkModuleAccess();
    if (!hasAccess) {
        return;
    }
    
    // Hide auth overlay if it exists
    const authOverlay = document.getElementById('authProcessing');
    if (authOverlay) {
        authOverlay.classList.remove('active');
    }
    document.body.classList.remove('auth-loading');
    
    console.log('✅ Module guard passed - access granted');
}

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initModuleGuard);
