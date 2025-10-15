// ACC Authentication Configuration
const ACC_CLIENT_ID = window.ACC_CLIENT_ID;
const ACC_CALLBACK_URL = 'https://metrocastpro.com/';

// Metromont Hub Configuration
const METROMONT_ACCOUNT_ID = 'f61b9f7b-5481-4d25-a552-365ba99077b8'; // Change this for testing
const METROMONT_HUB_ID = `b.${METROMONT_ACCOUNT_ID}`;

// Enhanced scope configuration for full ACC integration including OSS bucket management
// AEC Data Model Beta uses standard data:read and viewables:read scopes
const ACC_SCOPES = [
    'data:read',        // View data within ACC + AEC Data Model Beta
    'data:write',       // Manage data within ACC  
    'data:create',      // Create new data within ACC
    'data:search',      // Search across ACC data
    'account:read',     // View product and service accounts
    'user:read',        // View user profile info
    'viewables:read',   // View viewable data + Forge Viewer
    'bucket:create',    // Create new buckets
    'bucket:read',      // View your buckets
    'bucket:update',    // Update your buckets
    'bucket:delete'     // Delete your buckets
].join(' ');

// Global authentication state
let forgeAccessToken = null;
let isAuthenticated = false;
let authCheckComplete = false;
let hubId = null;
let projectId = null;

// Global Hub/Project Data (shared across all modules)
let globalHubData = {
    hubId: null,
    hubInfo: null,
    projects: [],
    projectMembers: {},
    loadedAt: null,
    accountInfo: {
        id: METROMONT_ACCOUNT_ID,
        hubId: METROMONT_HUB_ID,
        name: 'Metromont ACC Account'
    }
};

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

    // Enhanced scope configuration with explicit formatting including bucket permissions
    // AEC Data Model Beta uses standard data:read and viewables:read scopes
    const REQUESTED_SCOPES = [
        'data:read',
        'data:write',
        'data:create',
        'data:search',
        'account:read',
        'user:read',
        'viewables:read',
        'bucket:create',
        'bucket:read',
        'bucket:update',
        'bucket:delete'
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
            'viewables:read',
            'bucket:create',
            'bucket:read',
            'bucket:update',
            'bucket:delete'
        ];

        console.log('=== SCOPE VALIDATION ===');
        console.log('Granted scopes:', grantedScopes);
        console.log('Requested scopes:', requestedScopes);

        const scopeValidation = requestedScopes.map(scope => ({
            scope: scope,
            granted: grantedScopes.includes(scope)
        }));

        console.log('Scope validation results:', scopeValidation);

        const criticalScopes = ['data:write', 'data:create', 'bucket:create', 'bucket:read'];
        const criticalScopesMissing = criticalScopes.filter(scope => !grantedScopes.includes(scope));

        // IMPORTANT: Only show scope warning if we actually have empty scopes
        // The token might have scopes but the 'scope' field might be empty in the response
        if (grantedScopes === '' || grantedScopes.trim() === '') {
            console.warn('⚠️ NO SCOPES IN TOKEN RESPONSE');
            console.warn('This may indicate Custom Integration is required');
            console.warn('However, the token may still work - testing API access...');
        } else if (criticalScopesMissing.length > 0) {
            console.warn('⚠️ CRITICAL SCOPES MISSING:', criticalScopesMissing);
            console.warn('This will cause folder/file/bucket operations to fail');
        } else {
            console.log('✅ All critical scopes granted including bucket permissions');
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
        updateAuthStatus('Connecting to Hub...', 'Loading your Metromont ACC account...');

        // Connect to hub and load project data during main authentication
        await connectToHubAndLoadProjects();

        updateAuthStatus('Testing Permissions...', 'Validating API access capabilities including OSS bucket access...');
        await testScopePermissions();

        isAuthenticated = true;
        authCheckComplete = true;

        updateAuthStatus('Success!', `Successfully connected to Metromont ACC with ${globalHubData.projects.length} projects loaded`);

        // Initialize user profile widget
        if (window.UserProfile) {
            await window.UserProfile.initialize(forgeAccessToken, globalHubData);
        }

        // Small delay to show success message
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Hide auth overlay and show main content
        authProcessing.classList.remove('active');
        document.body.classList.remove('auth-loading');

        // Initialize page interactions
        initializePageInteractions();

        // Log successful authentication with scope info
        console.log('=== AUTHENTICATION COMPLETE ===');
        console.log('Access token scope includes:', ACC_SCOPES);
        console.log('Hub connected:', globalHubData.hubId);
        console.log('Projects loaded:', globalHubData.projects.length);
        console.log('Global hub data available for all modules');
        console.log('===============================');

    } catch (error) {
        console.error('Authentication completion failed:', error);
        throw error;
    }
}

// NEW: Fetch all available hubs for the user
async function fetchAllAvailableHubs() {
    try {
        console.log('=== FETCHING ALL AVAILABLE HUBS ===');
        
        const hubsResponse = await fetch('https://developer.api.autodesk.com/project/v1/hubs', {
            headers: {
                'Authorization': `Bearer ${forgeAccessToken}`
            }
        });

        if (!hubsResponse.ok) {
            console.warn('Failed to fetch hubs:', hubsResponse.status);
            return [];
        }

        const hubsData = await hubsResponse.json();
        const hubs = hubsData.data || [];
        
        console.log(`✅ Found ${hubs.length} available hubs`);
        
        return hubs.map(hub => ({
            id: hub.id,
            name: hub.attributes?.name || 'Unknown Hub',
            region: hub.attributes?.region || 'US',
            type: hub.type
        }));
        
    } catch (error) {
        console.error('Error fetching hubs:', error);
        return [];
    }
}

// NEW: Hub Connection and Project Loading during main auth
async function connectToHubAndLoadProjects() {
    try {
        // First, fetch all available hubs
        const availableHubs = await fetchAllAvailableHubs();
        
        // Check if user has a preferred hub stored
        let selectedHubId = sessionStorage.getItem('selected_hub_id') || localStorage.getItem('selected_hub_id');
        
        // If no stored hub or stored hub not in available hubs, use default
        if (!selectedHubId || !availableHubs.find(h => h.id === selectedHubId)) {
            selectedHubId = METROMONT_HUB_ID;
        }
        
        hubId = selectedHubId;
        globalHubData.hubId = hubId;
        globalHubData.availableHubs = availableHubs;

        console.log('=== HUB CONNECTION ===');
        console.log('Available hubs:', availableHubs.length);
        console.log('Selected hub:', hubId);
        console.log('Account ID:', METROMONT_ACCOUNT_ID);

        const hubResponse = await fetch(`https://developer.api.autodesk.com/project/v1/hubs/${hubId}`, {
            headers: {
                'Authorization': `Bearer ${forgeAccessToken}`
            }
        });

        if (!hubResponse.ok) {
            const errorText = await hubResponse.text();
            throw new Error(`Failed to access hub: ${hubResponse.status} ${errorText}`);
        }

        const hubData = await hubResponse.json();
        globalHubData.hubInfo = hubData.data;

        console.log('✅ Hub connection successful');
        console.log('Hub name:', hubData.data?.attributes?.name || 'Unknown');

        // Load all projects from the hub
        updateAuthStatus('Loading Projects...', 'Loading all projects from your ACC account...');
        await loadAllProjectsFromHub(hubId);

        // Store the loaded data with timestamp
        globalHubData.loadedAt = new Date().toISOString();

        // Store in session storage so it persists across page navigation
        sessionStorage.setItem('castlink_hub_data', JSON.stringify(globalHubData));

        console.log('✅ Projects loaded successfully');
        console.log('Total projects:', globalHubData.projects.length);
        console.log('======================');

    } catch (error) {
        console.error('Hub connection failed:', error);

        // Set minimal hub data so modules can still work with manual entry
        globalHubData = {
            hubId: METROMONT_HUB_ID,
            hubInfo: null,
            projects: [],
            projectMembers: {},
            loadedAt: new Date().toISOString(),
            error: error.message,
            accountInfo: {
                id: METROMONT_ACCOUNT_ID,
                hubId: METROMONT_HUB_ID,
                name: 'Metromont ACC Account (Error Loading)'
            }
        };

        sessionStorage.setItem('castlink_hub_data', JSON.stringify(globalHubData));

        console.warn('⚠️ Hub connection failed, modules will fall back to manual entry');
        throw error;
    }
}

async function loadAllProjectsFromHub(hubId) {
    try {
        const projectsResponse = await fetch(`https://developer.api.autodesk.com/project/v1/hubs/${hubId}/projects`, {
            headers: {
                'Authorization': `Bearer ${forgeAccessToken}`
            }
        });

        if (!projectsResponse.ok) {
            throw new Error(`Failed to load projects: ${projectsResponse.status} ${await projectsResponse.text()}`);
        }

        const projectsData = await projectsResponse.json();
        const validProjects = [];

        const strictPattern = /^(\d{5})\s*-\s*(.+)$/;
        const flexiblePattern = /^(\d{3,6})\s*[-_\s]+(.+)$/;
        const numberFirstPattern = /^(\d{3,6})\s+(.+)$/;

        for (const project of projectsData.data) {
            const projectName = project.attributes.name || '';

            const projectStatus = project.attributes.status || '';
            if (projectStatus === 'archived' || projectStatus === 'inactive') {
                continue;
            }

            if (projectName.toLowerCase().includes('test') ||
                projectName.toLowerCase().includes('template') ||
                projectName.toLowerCase().includes('training') ||
                projectName.toLowerCase().includes('mockup') ||
                projectName.toLowerCase().includes('legacy') ||
                projectName.startsWith('zz') ||
                projectName.startsWith('ZZ')) {
                continue;
            }

            let nameMatch = null;
            let projectNumber = '';
            let projectDisplayName = projectName;

            nameMatch = projectName.match(strictPattern);
            if (nameMatch) {
                projectNumber = nameMatch[1];
                projectDisplayName = nameMatch[2].trim();
            } else {
                nameMatch = projectName.match(flexiblePattern);
                if (nameMatch) {
                    projectNumber = nameMatch[1];
                    projectDisplayName = nameMatch[2].trim();
                } else {
                    nameMatch = projectName.match(numberFirstPattern);
                    if (nameMatch) {
                        projectNumber = nameMatch[1];
                        projectDisplayName = nameMatch[2].trim();
                    } else {
                        const numberExtract = projectName.match(/(\d{3,6})/);
                        if (numberExtract) {
                            projectNumber = numberExtract[1];
                            projectDisplayName = projectName;
                        } else {
                            projectNumber = 'N/A';
                            projectDisplayName = projectName;
                        }
                    }
                }
            }

            validProjects.push({
                project: project,
                projectNumber: projectNumber,
                projectDisplayName: projectDisplayName,
                fullProjectName: projectName
            });
        }

        // Process each project to get additional details
        const projects = [];
        for (const validProject of validProjects) {
            const { project, projectNumber, projectDisplayName, fullProjectName } = validProject;

            let location = '';
            let actualProjectNumber = projectNumber;

            try {
                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 50));

                const projectDetailResponse = await fetch(`https://developer.api.autodesk.com/project/v1/hubs/${hubId}/projects/${project.id}`, {
                    headers: {
                        'Authorization': `Bearer ${forgeAccessToken}`
                    }
                });

                if (projectDetailResponse.ok) {
                    const projectDetail = await projectDetailResponse.json();

                    if (projectDetail.data?.attributes?.extension?.data) {
                        const extData = projectDetail.data.attributes.extension.data;

                        const accProjectNumber = extData.projectNumber ||
                            extData.project_number ||
                            extData.number ||
                            extData.jobNumber ||
                            extData.job_number ||
                            extData.projectCode ||
                            extData.code || '';

                        if (accProjectNumber && accProjectNumber.trim() !== '') {
                            actualProjectNumber = accProjectNumber.trim();
                        }

                        location = extData.location ||
                            extData.project_location ||
                            extData.address ||
                            extData.city ||
                            extData.state ||
                            extData.jobLocation ||
                            extData.site ||
                            extData.client_location ||
                            extData.job_site || '';

                        if (location) {
                            location = location.trim();
                        }
                    }
                }
            } catch (detailError) {
                console.log('Could not get detailed project info for', fullProjectName, ':', detailError.message);
            }

            projects.push({
                id: project.id,
                name: fullProjectName,
                displayName: projectDisplayName,
                number: actualProjectNumber,
                numericSort: parseInt(actualProjectNumber, 10) || 999999,
                location: location || 'Location not specified',
                fullData: project,
                permissions: 'enhanced',
                projectType: 'ACC',
                status: project.attributes.status || 'active'
            });
        }

        // Sort projects by number
        const sortedProjects = projects.sort((a, b) => {
            if (a.numericSort !== b.numericSort) {
                return a.numericSort - b.numericSort;
            }
            return a.name.localeCompare(b.name);
        });

        globalHubData.projects = sortedProjects;

        // Set the first project as default
        if (sortedProjects.length > 0) {
            projectId = sortedProjects[0].id;
        }

        console.log(`✅ Processed ${sortedProjects.length} projects from hub`);

    } catch (error) {
        console.error('Error in loadAllProjectsFromHub:', error);
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
                    console.log('   📝 Solution: Reports will save via OSS with local fallback');
                } else if (foldersResponse.status === 403) {
                    console.log('   📝 403 Analysis: Permission issue despite scopes');
                    console.log('   📝 Likely cause: Custom Integration not registered');
                }
            }
        } catch (error) {
            console.log('❌ Folder access test: FAIL -', error.message);
        }
    }

    // Test 4: OSS Bucket access (requires bucket:read)
    try {
        const bucketsResponse = await fetch('https://developer.api.autodesk.com/oss/v2/buckets', {
            headers: { 'Authorization': `Bearer ${forgeAccessToken}` }
        });
        console.log('✅ OSS Bucket access test:', bucketsResponse.ok ? 'PASS' : 'FAIL');
        if (bucketsResponse.ok) {
            const bucketData = await bucketsResponse.json();
            console.log('   Accessible buckets:', bucketData.items?.length || 0);
        }
    } catch (error) {
        console.log('❌ OSS Bucket access test: FAIL -', error.message);
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
    sessionStorage.removeItem('castlink_hub_data'); // Also clear hub data
    console.log('Token and hub data cleared');
}

// Navigation functions
function navigateToModule(module) {
    console.log('Navigation attempt:', module, 'isAuthenticated:', isAuthenticated);

    if (!isAuthenticated) {
        showNotification('Please wait for authentication to complete');
        return;
    }

    switch (module) {
        case 'quality':
            window.location.href = 'quality-control.html';
            break;
        case 'design':
            window.location.href = 'engineering.html';
            break;
        case 'production':
            window.location.href = 'scheduling-hub.html';
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
    getHubData: () => globalHubData,
    waitForAuth: async () => {
        while (!authCheckComplete) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        return isAuthenticated;
    }
};

// Initialize the app on page load
document.addEventListener('DOMContentLoaded', initializeApp);