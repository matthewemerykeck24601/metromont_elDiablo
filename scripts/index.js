// ACC Authentication Configuration
const ACC_CLIENT_ID = 'phUPKRBuqECpJUoBmRuKdKhSP3ZTRALH4LMWKAzAnymnYkQU';
const ACC_CALLBACK_URL = 'https://metrocastpro.com/';

// Enhanced scope configuration for full ACC integration
const ACC_SCOPES = [
    'data:read',        // View data within ACC
    'data:write',       // Manage data within ACC  
    'data:create',      // Create new data within ACC
    'data:search',      // Search across ACC data
    'account:read',     // View product and service accounts
    'user:read',        // View user profile info
    'viewables:read'    // View viewable data (for future file previews)
].join(' ');

// Global authentication state
let forgeAccessToken = null;
let isAuthenticated = false;
let authCheckComplete = false;
let hubId = null;
let projectId = null;

// UI Elements
const authProcessing = document.getElementById('authProcessing');
const authTitle = document.getElementById('authTitle');
const authMessage = document.getElementById('authMessage');

// Authentication Flow
async function initializeApp() {
    try {
        updateAuthStatus('Checking authentication...', 'Verifying your login status...');

        // Check for OAuth callback first
        const urlParams = new URLSearchParams(window.location.search);
        const authCode = urlParams.get('code');
        const error = urlParams.get('error');

        if (error) {
            throw new Error(`Authentication error: ${error}`);
        }

        if (authCode) {
            // Handle OAuth callback
            await handleOAuthCallback(authCode);
        } else {
            // Check for existing valid token
            const storedToken = getStoredToken();
            if (storedToken && !isTokenExpired(storedToken)) {
                forgeAccessToken = storedToken.access_token;
                updateAuthStatus('Verifying token...', 'Checking your authentication...');

                // Verify token is still valid by making a test API call
                const isValid = await verifyToken(forgeAccessToken);
                if (isValid) {
                    await completeAuthentication();
                } else {
                    // Token is invalid, clear it and start fresh
                    clearStoredToken();
                    await startAuthFlow();
                }
            } else {
                // No valid token, start authentication flow
                await startAuthFlow();
            }
        }
    } catch (error) {
        console.error('App initialization failed:', error);
        showAuthError(error.message);
    }
}

async function startAuthFlow() {
    updateAuthStatus('Redirecting to Login...', 'You will be redirected to Autodesk to sign in...');

    // Enhanced scope configuration with explicit formatting
    const REQUESTED_SCOPES = [
        'data:read',
        'data:write',
        'data:create',
        'data:search',
        'account:read',
        'user:read',
        'viewables:read'
    ];

    const scopeString = REQUESTED_SCOPES.join(' ');

    // Small delay to show the message
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Build auth URL with explicit debugging
    const authParams = new URLSearchParams({
        response_type: 'code',
        client_id: ACC_CLIENT_ID,
        redirect_uri: ACC_CALLBACK_URL,
        scope: scopeString,
        state: 'castlink-auth-debug'
    });

    const authUrl = `https://developer.api.autodesk.com/authentication/v2/authorize?${authParams.toString()}`;

    // Enhanced logging for debugging
    console.log('=== OAUTH SCOPE DEBUG ===');
    console.log('Client ID:', ACC_CLIENT_ID);
    console.log('Requested scopes array:', REQUESTED_SCOPES);
    console.log('Scope string:', scopeString);
    console.log('URL-encoded scope:', encodeURIComponent(scopeString));
    console.log('Full auth URL:', authUrl);
    console.log('========================');

    window.location.href = authUrl;
}

async function handleOAuthCallback(authCode) {
    try {
        updateAuthStatus('Processing Login...', 'Exchanging authorization code for access token...');

        console.log('=== TOKEN EXCHANGE DEBUG ===');
        console.log('Auth code received:', authCode);

        const tokenResponse = await fetch('/.netlify/functions/auth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                code: authCode,
                redirect_uri: ACC_CALLBACK_URL
            })
        });

        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            console.error('Token response error:', errorText);
            throw new Error(`Token exchange failed: ${errorText}`);
        }

        const tokenData = await tokenResponse.json();
        console.log('Token response received:', tokenData);

        if (tokenData.error) {
            console.error('Token error:', tokenData.error);
            throw new Error(`Auth error: ${tokenData.error}`);
        }

        if (!tokenData.access_token) {
            console.error('No access token in response');
            throw new Error('No access token received');
        }

        // FIXED: Enhanced scope validation with better detection
        const grantedScopes = tokenData.scope || '';
        const requestedScopes = [
            'data:read',
            'data:write',
            'data:create',
            'data:search',
            'account:read',
            'user:read',
            'viewables:read'
        ];

        console.log('=== SCOPE VALIDATION ===');
        console.log('Granted scopes:', grantedScopes);
        console.log('Requested scopes:', requestedScopes);

        const scopeValidation = requestedScopes.map(scope => ({
            scope: scope,
            granted: grantedScopes.includes(scope)
        }));

        console.log('Scope validation results:', scopeValidation);

        const criticalScopes = ['data:write', 'data:create'];
        const criticalScopesMissing = criticalScopes.filter(scope => !grantedScopes.includes(scope));

        // IMPORTANT: Only show scope warning if we actually have empty scopes
        // The token might have scopes but the 'scope' field might be empty in the response
        if (grantedScopes === '' || grantedScopes.trim() === '') {
            console.warn('⚠️ NO SCOPES IN TOKEN RESPONSE');
            console.warn('This may indicate Custom Integration is required');
            console.warn('However, the token may still work - testing API access...');
        } else if (criticalScopesMissing.length > 0) {
            console.warn('⚠️ CRITICAL SCOPES MISSING:', criticalScopesMissing);
            console.warn('This will cause folder/file operations to fail');
        } else {
            console.log('✅ All critical scopes granted');
        }

        console.log('========================');

        forgeAccessToken = tokenData.access_token;
        storeToken(tokenData);

        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);

        await completeAuthentication();

    } catch (error) {
        console.error('OAuth callback failed:', error);
        throw error;
    }
}

async function completeAuthentication() {
    try {
        updateAuthStatus('Loading Projects...', 'Connecting to your Autodesk Construction Cloud account...');

        // Test the connection and load basic account info
        const hubsResponse = await fetch('https://developer.api.autodesk.com/project/v1/hubs', {
            headers: {
                'Authorization': `Bearer ${forgeAccessToken}`
            }
        });

        if (!hubsResponse.ok) {
            throw new Error('Failed to connect to ACC');
        }

        const hubsData = await hubsResponse.json();
        const accHubs = hubsData.data.filter(hub =>
            hub.attributes.extension?.type === 'hubs:autodesk.bim360:Account'
        );

        if (accHubs.length === 0) {
            throw new Error('No ACC hubs found in your account');
        }

        // Set hubId for testing
        hubId = accHubs[0].id;

        // Test enhanced permissions
        updateAuthStatus('Verifying Permissions...', 'Checking your ACC permissions for file operations...');

        const firstHub = accHubs[0];
        const projectsResponse = await fetch(`https://developer.api.autodesk.com/project/v1/hubs/${firstHub.id}/projects`, {
            headers: {
                'Authorization': `Bearer ${forgeAccessToken}`
            }
        });

        if (!projectsResponse.ok) {
            console.warn('Limited project access - some features may be restricted');
        } else {
            const projectsData = await projectsResponse.json();
            if (projectsData.data && projectsData.data.length > 0) {
                projectId = projectsData.data[0].id; // Set projectId for testing
            }
        }

        // Test scope permissions with better error handling
        updateAuthStatus('Testing Permissions...', 'Validating API access capabilities...');
        await testScopePermissions();

        isAuthenticated = true;
        authCheckComplete = true;

        updateAuthStatus('Success!', 'Successfully connected to Autodesk Construction Cloud');

        // Small delay to show success message
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Hide auth overlay and show main content
        authProcessing.classList.remove('active');
        document.body.classList.remove('auth-loading');

        // Initialize page interactions
        initializePageInteractions();

        // Log successful authentication with scope info
        console.log('Authentication completed successfully');
        console.log('Access token scope includes:', ACC_SCOPES);
        console.log('Available ACC hubs:', accHubs.length);

    } catch (error) {
        console.error('Authentication completion failed:', error);
        throw error;
    }
}

// IMPROVED: Scope testing function with better 404 handling
async function testScopePermissions() {
    if (!forgeAccessToken) {
        console.error('No access token available');
        return;
    }

    console.log('=== TESTING SCOPE PERMISSIONS ===');

    // Test 1: Basic hub access (should work with data:read)
    try {
        const hubsResponse = await fetch('https://developer.api.autodesk.com/project/v1/hubs', {
            headers: { 'Authorization': `Bearer ${forgeAccessToken}` }
        });
        console.log('✅ Hub access test:', hubsResponse.ok ? 'PASS' : 'FAIL');
    } catch (error) {
        console.log('❌ Hub access test: FAIL -', error.message);
    }

    // Test 2: Project access (should work with data:read)
    if (hubId) {
        try {
            const projectsResponse = await fetch(`https://developer.api.autodesk.com/project/v1/hubs/${hubId}/projects`, {
                headers: { 'Authorization': `Bearer ${forgeAccessToken}` }
            });
            console.log('✅ Project access test:', projectsResponse.ok ? 'PASS' : 'FAIL');
        } catch (error) {
            console.log('❌ Project access test: FAIL -', error.message);
        }
    }

    // Test 3: Folder access (requires data:read, enhanced permissions)
    // IMPROVED: Better 404 error handling and explanation
    if (projectId) {
        try {
            const foldersResponse = await fetch(`https://developer.api.autodesk.com/data/v1/projects/${projectId}/folders`, {
                headers: { 'Authorization': `Bearer ${forgeAccessToken}` }
            });

            if (foldersResponse.ok) {
                console.log('✅ Folder access test: PASS');
                const folderData = await foldersResponse.json();
                console.log('   Folders found:', folderData.data?.length || 0);
            } else {
                console.log('✅ Folder access test: FAIL');
                const errorText = await foldersResponse.text();
                console.log('   Folder access error:', errorText);

                if (foldersResponse.status === 404) {
                    console.log('   📝 404 Analysis: This project may not have Data Management API enabled');
                    console.log('   📝 Common causes:');
                    console.log('      • Project lacks Document Management module');
                    console.log('      • Project is legacy BIM 360 without ACC features');
                    console.log('      • Project admin needs to enable Data Management API');
                    console.log('   📝 Solution: Reports will save locally with sync capability');
                } else if (foldersResponse.status === 403) {
                    console.log('   📝 403 Analysis: Permission issue despite scopes');
                    console.log('   📝 Likely cause: Custom Integration not registered');
                }
            }
        } catch (error) {
            console.log('❌ Folder access test: FAIL -', error.message);
        }
    }

    console.log('=========================');
}

async function verifyToken(token) {
    try {
        const response = await fetch('https://developer.api.autodesk.com/project/v1/hubs', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return response.ok;
    } catch (error) {
        console.error('Token verification failed:', error);
        return false;
    }
}

function updateAuthStatus(title, message) {
    authTitle.textContent = title;
    authMessage.textContent = message;
}

function showAuthError(message) {
    updateAuthStatus('Authentication Failed', message);
    authProcessing.innerHTML = `
        <div class="auth-processing-content">
            <div style="color: #dc2626; font-size: 2rem; margin-bottom: 1rem;">⚠️</div>
            <h3 style="color: #dc2626;">Authentication Failed</h3>
            <p style="color: #6b7280; margin-bottom: 1.5rem;">${message}</p>
            <button onclick="location.reload()" style="background: #059669; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; cursor: pointer; font-size: 0.875rem;">
                Try Again
            </button>
        </div>
    `;
}

// Token Management
function storeToken(tokenData) {
    const expirationTime = Date.now() + (tokenData.expires_in * 1000);

    // FIXED: Use the full requested scopes if token response doesn't include scope
    const actualScopes = tokenData.scope && tokenData.scope.trim() !== ''
        ? tokenData.scope
        : ACC_SCOPES; // Fallback to requested scopes

    const tokenInfo = {
        access_token: tokenData.access_token,
        token_type: tokenData.token_type || 'Bearer',
        expires_in: tokenData.expires_in,
        expires_at: expirationTime,
        scope: actualScopes,
        stored_at: Date.now()
    };

    sessionStorage.setItem('forge_token', JSON.stringify(tokenInfo));
    localStorage.setItem('forge_token_backup', JSON.stringify(tokenInfo)); // Backup in localStorage
    console.log('Token stored successfully with scopes:', actualScopes);
}

function getStoredToken() {
    // Try sessionStorage first, then localStorage
    let stored = sessionStorage.getItem('forge_token');
    if (!stored) {
        stored = localStorage.getItem('forge_token_backup');
        if (stored) {
            // Restore to sessionStorage
            sessionStorage.setItem('forge_token', stored);
        }
    }
    return stored ? JSON.parse(stored) : null;
}

function isTokenExpired(tokenInfo) {
    const now = Date.now();
    const expiresAt = tokenInfo.expires_at;
    const timeUntilExpiry = expiresAt - now;

    // Consider token expired if it expires in less than 5 minutes
    return timeUntilExpiry < (5 * 60 * 1000);
}

function clearStoredToken() {
    sessionStorage.removeItem('forge_token');
    localStorage.removeItem('forge_token_backup');
    console.log('Token cleared');
}

// Navigation functions
function navigateToModule(module) {
    if (!isAuthenticated) {
        showNotification('Please wait for authentication to complete');
        return;
    }

    switch (module) {
        case 'quality':
            window.location.href = 'quality-control.html';
            break;
        case 'design':
            showNotification('Design Development coming Q3 2025');
            break;
        case 'production':
            showNotification('Production Scheduling coming Q2 2025');
            break;
        case 'inventory':
            showNotification('Inventory Tracking coming Q1 2025');
            break;
        case 'haul':
            showNotification('Haul Management coming Q3 2025');
            break;
        case 'fab':
            showNotification('Fab Shop coming Q2 2025');
            break;
        default:
            showNotification('Module not yet available');
    }
}

function showNotification(message) {
    const notification = document.getElementById('notification');
    const notificationText = document.getElementById('notificationText');

    notificationText.textContent = message;
    notification.classList.add('show');

    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

function initializePageInteractions() {
    // Add interactive effects to module cards
    const cards = document.querySelectorAll('.module-card');
    cards.forEach(card => {
        card.addEventListener('mouseenter', function () {
            this.style.transform = 'translateY(-8px)';
        });

        card.addEventListener('mouseleave', function () {
            this.style.transform = 'translateY(0)';
        });
    });
}

// Global auth state checker for other pages
window.CastLinkAuth = {
    isAuthenticated: () => isAuthenticated,
    getToken: () => forgeAccessToken,
    getScopes: () => ACC_SCOPES,
    waitForAuth: async () => {
        while (!authCheckComplete) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        return isAuthenticated;
    }
};

// Initialize the app on page load
document.addEventListener('DOMContentLoaded', initializeApp);