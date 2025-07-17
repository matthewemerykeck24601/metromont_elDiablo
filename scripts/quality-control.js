// ACC CONNECT CONFIGURATION
const ACC_CLIENT_ID = window.ACC_CLIENT_ID;
const ACC_CALLBACK_URL = 'https://metrocastpro.com/';

// Metromont specific configuration
const METROMONT_ACCOUNT_ID = '956c9a49-bc6e-4459-b873-d9ecea0600cb';
const METROMONT_HUB_ID = `b.${METROMONT_ACCOUNT_ID}`;

// Enhanced scope configuration matching index.js
const ACC_SCOPES = [
    'data:read',        // View data within ACC
    'data:write',       // Manage data within ACC  
    'data:create',      // Create new data within ACC
    'data:search',      // Search across ACC data
    'account:read',     // View product and service accounts
    'user:read',        // View user profile info
    'viewables:read'    // View viewable data (for future file previews)
].join(' ');

// ACC Data Management API Configuration
const ACC_DATA_API_BASE = 'https://developer.api.autodesk.com/data/v1';
const ACC_PROJECT_API_BASE = 'https://developer.api.autodesk.com/project/v1';

// ACC/Forge Integration Variables
let forgeAccessToken = null;
let projectId = null;
let hubId = null;
let userProfile = null;
let isACCConnected = false;
let currentCalculation = null;
let userProjects = [];
let currentProjectBucketKey = null;
let bedQCFolderId = null;
let projectTopFolderId = null;
let projectMembers = []; // Store project team members

// Form Instance Management
let currentReportId = null;
let currentBedId = null;
let currentBedName = null;
let reportInstances = new Map(); // Store multiple form instances
let existingReports = []; // Store loaded reports for search/filter

// Global debug state
let debugMode = true;

// Pre-defined data
const MOE_VALUES = [
    28500000,
    28600000,
    28700000,
    28800000,
    28900000,
    29350000
];

const STRAND_SIZES = {
    '3/8" LL': 0.085,
    '1/2" SP-LL': 0.153,
    '9/16" LL': 0.192
};

// UI Elements
const authProcessing = document.getElementById('authProcessing');
const authTitle = document.getElementById('authTitle');
const authMessage = document.getElementById('authMessage');

// Debug logging function
function debugLog(message, data = null) {
    if (debugMode) {
        console.log(`[QC DEBUG] ${message}`, data || '');
    }
}

// Helper to escape HTML special characters
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// FIXED: JWT Token Decoder for proper scope extraction
function decodeJWTScopes(accessToken) {
    try {
        debugLog('=== DECODING JWT FOR SCOPES ===');

        if (!accessToken || typeof accessToken !== 'string') {
            debugLog('Invalid access token provided');
            return null;
        }

        // JWT has three parts separated by dots
        const parts = accessToken.split('.');
        if (parts.length !== 3) {
            debugLog('Invalid JWT format - expected 3 parts, got:', parts.length);
            return null;
        }

        // Decode the payload (middle part)
        const payload = parts[1];

        // Add padding if needed for base64 decoding
        const paddedPayload = payload + '='.repeat((4 - payload.length % 4) % 4);

        // Decode base64
        const decodedPayload = atob(paddedPayload);
        const parsedPayload = JSON.parse(decodedPayload);

        debugLog('Decoded JWT payload:', parsedPayload);

        // Extract scopes - Autodesk JWT stores scopes as an array
        let scopes = [];
        if (parsedPayload.scope && Array.isArray(parsedPayload.scope)) {
            scopes = parsedPayload.scope;
        } else if (parsedPayload.scope && typeof parsedPayload.scope === 'string') {
            scopes = parsedPayload.scope.split(' ');
        }

        const scopeString = scopes.join(' ');
        debugLog('Extracted scopes from JWT:', scopeString);
        debugLog('Individual scopes:', scopes);

        return {
            scopes: scopes,
            scopeString: scopeString,
            fullPayload: parsedPayload,
            userId: parsedPayload.userid || null,
            clientId: parsedPayload.client_id || null,
            expiresAt: parsedPayload.exp || null
        };

    } catch (error) {
        debugLog('Error decoding JWT:', error);
        console.error('JWT decode error:', error);
        return null;
    }
}

// Authentication Flow
async function initializeApp() {
    try {
        debugLog('Starting app initialization...');

        // Check if we're coming from the main app with authentication
        if (window.opener && window.opener.CastLinkAuth) {
            const parentAuth = window.opener.CastLinkAuth;
            const isParentAuth = await parentAuth.waitForAuth();

            if (isParentAuth) {
                forgeAccessToken = parentAuth.getToken();
                await completeAuthentication();
                return;
            }
        }

        // Check for stored authentication
        const storedToken = getStoredToken();
        if (storedToken && !isTokenExpired(storedToken)) {
            forgeAccessToken = storedToken.access_token;

            // Verify token is still valid
            const isValid = await verifyToken(forgeAccessToken);
            if (isValid) {
                await completeAuthentication();
            } else {
                // Token is invalid, redirect to main app for re-authentication
                clearStoredToken();
                redirectToMainApp();
            }
        } else {
            // No valid token, redirect to main app
            redirectToMainApp();
        }
    } catch (error) {
        console.error('App initialization failed:', error);
        showAuthError(error.message);
    }
}

function redirectToMainApp() {
    updateAuthStatus('Redirecting to Login...', 'Taking you to the main app for authentication...');
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 2000);
}

async function completeAuthentication() {
    try {
        updateAuthStatus('Loading Projects...', 'Connecting to your Autodesk Construction Cloud account...');

        // FIXED: Check token scopes using JWT decoder first
        const scopeValidation = await validateTokenScopesWithJWT();

        // Load project data
        await loadRealProjectData();

        // Test enhanced permissions for file operations
        updateAuthStatus('Verifying Permissions...', 'Testing ACC file operation permissions...');

        // Test data write permissions by attempting to get a project's folders
        if (projectId) {
            debugLog('Testing folder access for project:', projectId);

            try {
                const testResponse = await fetch(`${ACC_DATA_API_BASE}/projects/${projectId}/folders`, {
                    headers: {
                        'Authorization': `Bearer ${forgeAccessToken}`
                    }
                });

                debugLog('Folder access test response:', {
                    status: testResponse.status,
                    statusText: testResponse.statusText,
                    url: testResponse.url
                });

                if (testResponse.ok) {
                    const folderData = await testResponse.json();
                    debugLog('✓ ACC folder access confirmed, folders found:', folderData.data?.length || 0);
                    scopeValidation.folderAccess = true;
                } else {
                    const errorText = await testResponse.text();
                    debugLog('⚠ Limited ACC folder access - some features may be restricted');
                    debugLog('Status:', testResponse.status, 'Response:', errorText);
                    scopeValidation.folderAccess = false;
                    scopeValidation.folderError = {
                        status: testResponse.status,
                        response: errorText
                    };

                    // Check if this is a 404 vs 403
                    if (testResponse.status === 404) {
                        debugLog('404 Error suggests wrong endpoint or project structure');
                        debugLog('Trying alternative folder structure...');

                        // Try alternative approach - get project details first
                        const altResult = await tryAlternativeFolderAccess(projectId);
                        scopeValidation.alternativeAccess = altResult;
                    }
                }
            } catch (error) {
                debugLog('⚠ Could not test folder access:', error);
                scopeValidation.folderAccess = false;
                scopeValidation.folderError = { error: error.message };
            }
        }

        // Authentication complete
        isACCConnected = true;

        // Show appropriate status based on scope validation
        if (scopeValidation.hasEnhancedScopes) {
            updateAuthStatus('Success!', 'Successfully connected to ACC with enhanced permissions');
        } else {
            updateAuthStatus('Connected with Limited Permissions', 'Connected to ACC but missing enhanced scopes for file operations');
        }

        // Small delay to show success message
        await new Promise(resolve => setTimeout(resolve, 800));

        // Hide auth overlay and show main content
        if (authProcessing) {
            authProcessing.classList.remove('active');
        }
        document.body.classList.remove('auth-loading');

        // Show auth status badge with appropriate styling
        const authStatusBadge = document.getElementById('authStatusBadge');
        if (authStatusBadge) {
            authStatusBadge.style.display = 'inline-flex';
            if (!scopeValidation.hasEnhancedScopes) {
                authStatusBadge.className = 'status-badge status-development';
                authStatusBadge.innerHTML = `
                    <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                    </svg>
                    Limited Permissions
                `;
            }
        }

        // Enable ACC features (with limitations if scopes are missing)
        enableACCFeatures(scopeValidation);

        // Initialize dropdowns
        initializeDropdowns();

        // Initialize report history
        await initializeReportHistory();

        debugLog('Authentication completed with scope validation:', scopeValidation);

        // Show scope warning if needed
        if (!scopeValidation.hasEnhancedScopes) {
            showScopeWarning(scopeValidation);
        }

    } catch (error) {
        console.error('Authentication completion failed:', error);
        showAuthError('Failed to load project data: ' + error.message);
    }
}

// Try alternative folder access method
async function tryAlternativeFolderAccess(projectId) {
    try {
        debugLog('Trying alternative folder access methods...');

        // Method 1: Try to get project hub and traverse from there
        const projectDetailResponse = await fetch(`${ACC_PROJECT_API_BASE}/hubs/${hubId}/projects/${projectId}`, {
            headers: {
                'Authorization': `Bearer ${forgeAccessToken}`
            }
        });

        if (projectDetailResponse.ok) {
            const projectDetail = await projectDetailResponse.json();
            debugLog('Project detail response:', projectDetail);

            // Check if project has rootFolder link
            if (projectDetail.data?.relationships?.rootFolder?.data?.id) {
                const rootFolderId = projectDetail.data.relationships.rootFolder.data.id;
                debugLog('Found root folder ID:', rootFolderId);

                // Try to access the root folder
                const rootFolderResponse = await fetch(`${ACC_DATA_API_BASE}/projects/${projectId}/folders/${rootFolderId}`, {
                    headers: {
                        'Authorization': `Bearer ${forgeAccessToken}`
                    }
                });

                if (rootFolderResponse.ok) {
                    const rootFolderData = await rootFolderResponse.json();
                    debugLog('✓ Root folder accessible:', rootFolderData);
                    projectTopFolderId = rootFolderId;
                    return true;
                }
            }
        }

        // Method 2: Try to get top folders using alternative endpoint
        const topFoldersResponse = await fetch(`${ACC_DATA_API_BASE}/projects/${projectId}/topFolders`, {
            headers: {
                'Authorization': `Bearer ${forgeAccessToken}`
            }
        });

        if (topFoldersResponse.ok) {
            const topFoldersData = await topFoldersResponse.json();
            debugLog('✓ Top folders accessible:', topFoldersData);

            if (topFoldersData.data && topFoldersData.data.length > 0) {
                projectTopFolderId = topFoldersData.data[0].id;
                debugLog('Set project top folder ID:', projectTopFolderId);
                return true;
            }
        }

        debugLog('Alternative folder access methods failed');
        return false;

    } catch (error) {
        debugLog('Error in alternative folder access:', error);
        return false;
    }
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
    if (authTitle) authTitle.textContent = title;
    if (authMessage) authMessage.textContent = message;
}

function showAuthError(message) {
    const safeMessage = escapeHtml(message);
    updateAuthStatus('Authentication Error', safeMessage);
    if (authProcessing) {
        authProcessing.innerHTML = `
            <div class="auth-processing-content">
                <div style="color: #dc2626; font-size: 2rem; margin-bottom: 1rem;">⚠️</div>
                <h3 style="color: #dc2626;">Authentication Error</h3>
                <p style="color: #6b7280; margin-bottom: 1.5rem;">${safeMessage}</p>
                <button onclick="window.location.href='index.html'" style="background: #059669; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; cursor: pointer; font-size: 0.875rem; margin-right: 0.5rem;">
                    Go to Main App
                </button>
                <button onclick="location.reload()" style="background: #6b7280; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; cursor: pointer; font-size: 0.875rem;">
                    Try Again
                </button>
            </div>
        `;
    }
}

// Token Management
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

// =================================================================
// DROPDOWN INITIALIZATION
// =================================================================

function initializeDropdowns() {
    // Initialize MOE dropdown
    initializeMOEDropdown();

    // Initialize Strand Size dropdown
    initializeStrandSizeDropdown();

    // Initialize project member dropdowns
    initializeProjectMemberDropdowns();
}

function initializeMOEDropdown() {
    // Self-stressing MOE
    const ssMOE = document.getElementById('ss_MOE');
    if (ssMOE && ssMOE.tagName === 'INPUT') {
        const select = document.createElement('select');
        select.id = 'ss_MOE';
        select.className = 'input-field';
        select.onchange = calculateAll;

        // Add default option
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Select MOE (psi)';
        select.appendChild(defaultOption);

        // Add MOE values
        MOE_VALUES.forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value.toLocaleString();
            select.appendChild(option);
        });

        ssMOE.parentNode.replaceChild(select, ssMOE);
    }

    // Non-self-stressing MOE
    const nssMOE = document.getElementById('nss_MOE');
    if (nssMOE && nssMOE.tagName === 'INPUT') {
        const select = document.createElement('select');
        select.id = 'nss_MOE';
        select.className = 'input-field';
        select.onchange = calculateAll;

        // Add default option
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Select MOE (psi)';
        select.appendChild(defaultOption);

        // Add MOE values
        MOE_VALUES.forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value.toLocaleString();
            select.appendChild(option);
        });

        nssMOE.parentNode.replaceChild(select, nssMOE);
    }
}

function initializeStrandSizeDropdown() {
    // Add strand size dropdown for self-stressing
    const ssStrandAreaRow = document.querySelector('#ss_strandArea');
    if (ssStrandAreaRow) {
        const ssStrandAreaContainer = ssStrandAreaRow.closest('.input-row');
        if (ssStrandAreaContainer) {
            const strandSizeRow = document.createElement('div');
            strandSizeRow.className = 'input-row';
            strandSizeRow.innerHTML = `
                <label class="input-label">Strand Size:</label>
                <select class="input-field" id="ss_strandSize" onchange="onStrandSizeChange('ss')">
                    <option value="">Select Size</option>
                    ${Object.keys(STRAND_SIZES).map(size =>
                `<option value="${size}">${size}</option>`
            ).join('')}
                </select>
                <span class="input-unit"></span>
            `;
            ssStrandAreaContainer.parentNode.insertBefore(strandSizeRow, ssStrandAreaContainer);
        }
    }

    // Add strand size dropdown for non-self-stressing
    const nssStrandAreaRow = document.querySelector('#nss_strandArea');
    if (nssStrandAreaRow) {
        const nssStrandAreaContainer = nssStrandAreaRow.closest('.input-row');
        if (nssStrandAreaContainer) {
            const strandSizeRow = document.createElement('div');
            strandSizeRow.className = 'input-row';
            strandSizeRow.innerHTML = `
                <label class="input-label">Strand Size:</label>
                <select class="input-field" id="nss_strandSize" onchange="onStrandSizeChange('nss')">
                    <option value="">Select Size</option>
                    ${Object.keys(STRAND_SIZES).map(size =>
                `<option value="${size}">${size}</option>`
            ).join('')}
                </select>
                <span class="input-unit"></span>
            `;
            nssStrandAreaContainer.parentNode.insertBefore(strandSizeRow, nssStrandAreaContainer);
        }
    }
}

function initializeProjectMemberDropdowns() {
    // Convert Bed Supervisor (calculatedBy) to dropdown
    const calculatedByInput = document.getElementById('calculatedBy');
    if (calculatedByInput && calculatedByInput.tagName === 'INPUT') {
        const select = document.createElement('select');
        select.id = 'calculatedBy';
        select.className = calculatedByInput.className;

        // Add default option
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Select Bed Supervisor';
        select.appendChild(defaultOption);

        // Add project members (will be populated when project is selected)
        populateProjectMemberDropdown(select);

        calculatedByInput.parentNode.replaceChild(select, calculatedByInput);
    }

    // Convert Inspector (reviewedBy) to dropdown
    const reviewedByInput = document.getElementById('reviewedBy');
    if (reviewedByInput && reviewedByInput.tagName === 'INPUT') {
        const select = document.createElement('select');
        select.id = 'reviewedBy';
        select.className = reviewedByInput.className;

        // Add default option
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Select Inspector';
        select.appendChild(defaultOption);

        // Add project members (will be populated when project is selected)
        populateProjectMemberDropdown(select);

        reviewedByInput.parentNode.replaceChild(select, reviewedByInput);
    }

    // Update labels
    const calculatedByLabel = document.querySelector('label[for="calculatedBy"]');
    if (calculatedByLabel) {
        calculatedByLabel.textContent = 'Bed Supervisor';
    }

    const reviewedByLabel = document.querySelector('label[for="reviewedBy"]');
    if (reviewedByLabel) {
        reviewedByLabel.textContent = 'Inspector';
    }
}

function populateProjectMemberDropdown(selectElement) {
    // Default project members (will be enhanced with ACC data later)
    const defaultMembers = [
        'John Smith - Bed Supervisor',
        'Mike Johnson - Senior Supervisor',
        'Sarah Davis - Lead Supervisor',
        'Tom Wilson - Inspector',
        'Lisa Brown - Quality Inspector',
        'Dave Martinez - Senior Inspector',
        'Amy Taylor - QC Manager',
        'Chris Anderson - Production Manager'
    ];

    // Clear existing options except default
    const defaultOption = selectElement.querySelector('option[value=""]');
    selectElement.innerHTML = '';
    if (defaultOption) {
        selectElement.appendChild(defaultOption);
    }

    // Add default members
    defaultMembers.forEach(member => {
        const option = document.createElement('option');
        option.value = member;
        option.textContent = member;
        selectElement.appendChild(option);
    });
}

function onStrandSizeChange(type) {
    const strandSizeSelect = document.getElementById(`${type}_strandSize`);
    const strandAreaInput = document.getElementById(`${type}_strandArea`);

    if (strandSizeSelect && strandAreaInput && strandSizeSelect.value && STRAND_SIZES[strandSizeSelect.value]) {
        const area = STRAND_SIZES[strandSizeSelect.value];
        strandAreaInput.value = area.toFixed(3);
        calculateAll();
    } else if (strandAreaInput) {
        strandAreaInput.value = '';
    }
}

// =================================================================
// ENHANCED ACC DATA MANAGEMENT API FUNCTIONS WITH IMPROVED ERROR HANDLING
// =================================================================

// Enhanced Bed QC Report saving with comprehensive debugging and scope awareness
async function saveBedQCReportToACC(reportData) {
    try {
        debugLog('=== STARTING SAVE TO ACC ===');
        debugLog('Save attempt with current permissions for project:', projectId);

        // First, validate current scopes using JWT decoder
        const scopeValidation = await validateTokenScopesWithJWT();
        debugLog('Current scope validation:', scopeValidation);

        debugLog('Current project context:', {
            projectId: projectId,
            hubId: hubId,
            projectTopFolderId: projectTopFolderId,
            bedQCFolderId: bedQCFolderId,
            hasEnhancedScopes: scopeValidation.hasEnhancedScopes
        });

        debugLog('Report Data Summary:', {
            reportId: reportData.reportId,
            bedName: reportData.bedName,
            projectName: reportData.projectMetadata?.projectName,
            timestamp: reportData.timestamp
        });

        // Create the report content
        const reportContent = {
            type: 'bedqc-report',
            version: '1.2',
            timestamp: new Date().toISOString(),
            application: 'MetromontCastLink',
            module: 'QualityControl',
            schema: 'BedQCReport-v1.2',
            metadata: {
                saveAttempt: new Date().toISOString(),
                projectContext: {
                    projectId: projectId,
                    hubId: hubId,
                    projectTopFolderId: projectTopFolderId,
                    bedQCFolderId: bedQCFolderId
                },
                scopeValidation: scopeValidation,
                debugInfo: {
                    tokenScopes: scopeValidation.grantedScopes,
                    requestedScopes: ACC_SCOPES,
                    apiEndpoints: {
                        dataAPI: ACC_DATA_API_BASE,
                        projectAPI: ACC_PROJECT_API_BASE
                    }
                }
            },
            reportData: {
                ...reportData,
                savedToACC: scopeValidation.hasEnhancedScopes,
                accProjectId: projectId,
                accHubId: hubId,
                permissions: {
                    scopesUsed: scopeValidation.grantedScopes,
                    dataWriteEnabled: scopeValidation.hasDataWrite,
                    dataCreateEnabled: scopeValidation.hasDataCreate,
                    enhancedPermissions: scopeValidation.hasEnhancedScopes
                }
            }
        };

        debugLog('Prepared report content for save');

        // Check if we have enhanced scopes before attempting ACC upload
        if (!scopeValidation.hasEnhancedScopes) {
            debugLog('=== INSUFFICIENT SCOPES - SAVING LOCALLY ===');
            debugLog('Missing scopes:', scopeValidation.missingScopes);
            debugLog('Scope issue:', scopeValidation.scopeIssue);

            const localSaveResult = await saveToLocalStorageWithScopeInfo(reportContent, scopeValidation);
            return localSaveResult;
        }

        // Try Method 1: Upload as JSON file to ACC (only if we have enhanced scopes)
        try {
            debugLog('=== METHOD 1: ACC FILE UPLOAD ===');
            debugLog('Enhanced scopes confirmed, attempting ACC upload...');

            // Step 1: Ensure we have folder access
            debugLog('Step 1: Checking folder access...');

            if (!projectTopFolderId) {
                debugLog('No project top folder ID, attempting to get it...');
                await getProjectTopFolder(projectId);
            }

            if (!projectTopFolderId) {
                throw new Error('Cannot access project folders - check Data Management API permissions and Custom Integration setup');
            }

            debugLog('Project top folder confirmed:', projectTopFolderId);

            // Step 2: Get or create BedQC folder
            debugLog('Step 2: Ensuring BedQC folder exists...');

            if (!bedQCFolderId) {
                debugLog('No BedQC folder ID, attempting to create/find it...');
                await ensureBedQCFolder(projectId, projectTopFolderId);
            }

            if (!bedQCFolderId) {
                throw new Error('Cannot create/access BedQC folder - check data:create permissions and Custom Integration setup');
            }

            debugLog('BedQC folder confirmed:', bedQCFolderId);

            // Step 3: Generate filename and upload
            debugLog('Step 3: Uploading file to ACC...');

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = `BedQC-${reportData.bedName}-${reportData.reportId}-${timestamp}.json`;

            debugLog('Generated filename:', fileName);

            // Upload the file
            const uploadResult = await uploadJSONToACC(projectId, bedQCFolderId, fileName, reportContent);

            debugLog('✓ Successfully uploaded report to ACC:', uploadResult);

            return {
                success: true,
                versionId: uploadResult.versionId,
                itemId: uploadResult.itemId,
                fileName: fileName,
                reportId: reportData.reportId,
                method: 'acc-file-upload',
                permissions: 'enhanced',
                scopeValidation: scopeValidation,
                debugInfo: {
                    projectId: projectId,
                    hubId: hubId,
                    projectTopFolderId: projectTopFolderId,
                    bedQCFolderId: bedQCFolderId
                }
            };

        } catch (method1Error) {
            debugLog('=== METHOD 1 FAILED ===');
            debugLog('File upload error:', method1Error.message);
            debugLog('Error details:', method1Error);

            // Enhanced error analysis
            let errorAnalysis = 'File upload to ACC failed despite having enhanced scopes. ';
            let troubleshootingSteps = [];

            if (method1Error.message.includes('404')) {
                errorAnalysis += 'Project folders not accessible (404 error). This may indicate project configuration issues.';
                troubleshootingSteps = [
                    'Verify project has BIM 360 or ACC document management enabled',
                    'Check if project supports Data Management API v1',
                    'Confirm project ID is correct: ' + projectId,
                    'Try accessing project through ACC web interface first',
                    'Verify Custom Integration has "Document Management" access enabled'
                ];
            } else if (method1Error.message.includes('403')) {
                errorAnalysis += 'Access forbidden (403 error). Custom Integration may need additional configuration.';
                troubleshootingSteps = [
                    'Verify Custom Integration is set to "Active" status in ACC Account Admin',
                    'Check if Custom Integration has proper access levels configured',
                    'Confirm user has admin/contributor access to project',
                    'Try refreshing OAuth token by logging out and back in'
                ];
            } else if (method1Error.message.includes('429')) {
                errorAnalysis += 'Rate limit exceeded (429 error). Too many API requests made too quickly.';
                troubleshootingSteps = [
                    'Wait before retrying (rate limits usually reset after 60 seconds)',
                    'Implement request throttling in production',
                    'Consider using batch operations for multiple saves'
                ];
            } else {
                errorAnalysis += `Technical error: ${method1Error.message}`;
                troubleshootingSteps = [
                    'Check network connectivity',
                    'Verify API endpoints are accessible',
                    'Check if Autodesk services are operational',
                    'Review browser console for additional errors'
                ];
            }

            debugLog('Error analysis:', errorAnalysis);
            debugLog('Troubleshooting steps:', troubleshootingSteps);

            // Fallback to local storage even with enhanced scopes
            debugLog('=== FALLBACK: ENHANCED LOCAL STORAGE ===');
            const localSaveResult = await saveToLocalStorageWithScopeInfo(reportContent, scopeValidation, {
                uploadError: method1Error.message,
                errorAnalysis: errorAnalysis,
                troubleshootingSteps: troubleshootingSteps
            });

            return localSaveResult;
        }

    } catch (error) {
        debugLog('=== ALL SAVE METHODS FAILED ===');
        debugLog('Complete failure:', error);
        console.error('All save methods failed:', error);
        throw new Error(`Failed to save report: ${error.message}`);
    }
}

// Save to local storage with comprehensive scope information
async function saveToLocalStorageWithScopeInfo(reportContent, scopeValidation, uploadErrorInfo = null) {
    debugLog('=== SAVING TO LOCAL STORAGE WITH SCOPE INFO ===');

    const storageKey = `bedqc_${projectId}_${reportContent.reportData.reportId}`;

    let saveReason = '';
    let userMessage = '';

    if (!scopeValidation.hasEnhancedScopes) {
        saveReason = 'INSUFFICIENT_OAUTH_SCOPES';
        userMessage = 'Report saved locally because OAuth token lacks required scopes for ACC file operations.';
    } else if (uploadErrorInfo) {
        saveReason = 'ACC_UPLOAD_FAILED';
        userMessage = 'Report saved locally because ACC upload failed despite having enhanced scopes.';
    } else {
        saveReason = 'FALLBACK_STORAGE';
        userMessage = 'Report saved locally as fallback storage method.';
    }

    const storageData = {
        ...reportContent,
        storedLocally: true,
        needsACCSync: scopeValidation.hasEnhancedScopes, // Only sync if we have scopes
        storageMethod: 'local-with-scope-info',
        saveReason: saveReason,
        userMessage: userMessage,
        scopeValidation: scopeValidation,
        uploadErrorInfo: uploadErrorInfo,
        retryCount: 0,
        lastRetryAttempt: null,
        projectContext: {
            projectId: projectId,
            hubId: hubId,
            projectHasFileAccess: !!projectTopFolderId,
            bedQCFolderExists: !!bedQCFolderId
        },
        customIntegrationRequired: !scopeValidation.hasEnhancedScopes,
        saveAttemptDetails: {
            timestamp: new Date().toISOString(),
            projectTopFolderId: projectTopFolderId,
            bedQCFolderId: bedQCFolderId,
            methodAttempted: scopeValidation.hasEnhancedScopes ? 'acc-file-upload' : 'local-only'
        }
    };

    localStorage.setItem(storageKey, JSON.stringify(storageData));

    // Store list of all reports for this project
    const projectReportsKey = `bedqc_reports_${projectId}`;
    const existingReports = JSON.parse(localStorage.getItem(projectReportsKey) || '[]');

    if (!existingReports.includes(reportContent.reportData.reportId)) {
        existingReports.push(reportContent.reportData.reportId);
        localStorage.setItem(projectReportsKey, JSON.stringify(existingReports));
    }

    debugLog('Saved to local storage with key:', storageKey);
    debugLog('Save reason:', saveReason);
    debugLog('Updated project reports list:', existingReports);

    return {
        success: true,
        projectId: projectId,
        reportId: reportContent.reportData.reportId,
        storageKey: storageKey,
        method: 'local-storage',
        saveReason: saveReason,
        userMessage: userMessage,
        scopeValidation: scopeValidation,
        warning: userMessage,
        error: uploadErrorInfo?.uploadError,
        errorAnalysis: uploadErrorInfo?.errorAnalysis,
        troubleshootingSteps: uploadErrorInfo?.troubleshootingSteps,
        canRetry: scopeValidation.hasEnhancedScopes && !!projectTopFolderId,
        customIntegrationRequired: !scopeValidation.hasEnhancedScopes,
        permissionsNote: `Token scopes: ${scopeValidation.grantedScopes || '(none)'}`,
        debugInfo: {
            projectContext: storageData.projectContext,
            saveAttemptDetails: storageData.saveAttemptDetails,
            scopeValidation: scopeValidation
        }
    };
}

// Get project's top folder with improved error handling and rate limiting
async function getProjectTopFolder(projectId) {
    try {
        debugLog('=== GETTING PROJECT TOP FOLDER ===');
        debugLog('Attempting to get project folders for:', projectId);

        // Add delay to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

        // Try the standard folders endpoint first
        debugLog('Trying standard folders endpoint...');
        const response = await fetch(`${ACC_DATA_API_BASE}/projects/${projectId}/folders`, {
            headers: {
                'Authorization': `Bearer ${forgeAccessToken}`
            }
        });

        debugLog('Folders endpoint response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            debugLog('Folders endpoint failed:', errorText);

            if (response.status === 403) {
                debugLog('❌ Insufficient permissions for folder access');
                debugLog('Current scopes:', ACC_SCOPES);
                debugLog('This may be due to:');
                debugLog('- Missing BIM 360 or ACC document management permissions');
                debugLog('- Project not configured for Data Management API access');
                debugLog('- Account-level permissions restrictions');
            } else if (response.status === 404) {
                debugLog('❌ Project folders not found (404)');
                debugLog('This may be due to:');
                debugLog('- Project is not a BIM 360 or ACC project');
                debugLog('- Project does not have document management enabled');
                debugLog('- Wrong API endpoint or project structure');
                debugLog('- Project ID may be incorrect:', projectId);

                // Try alternative methods
                return await tryAlternativeFolderAccess(projectId);
            } else if (response.status === 429) {
                debugLog('❌ Rate limit exceeded');
                throw new Error('Rate limit exceeded - please wait and try again');
            }

            return null;
        }

        const data = await response.json();
        debugLog('✓ Successfully retrieved project folders:', data.data?.length || 0, 'folders found');

        if (data.data && data.data.length > 0) {
            debugLog('Available folders:', data.data.map(f => ({
                id: f.id,
                name: f.attributes?.name,
                type: f.attributes?.extension?.type
            })));

            // Look for the main project folder
            const topFolders = data.data.filter(folder =>
                folder.attributes.name === 'Project Files' ||
                folder.attributes.name === 'Files' ||
                folder.attributes.extension?.type === 'folders:autodesk.bim360:Folder' ||
                folder.type === 'folders'
            );

            if (topFolders.length > 0) {
                projectTopFolderId = topFolders[0].id;
                debugLog('✓ Found project top folder:', projectTopFolderId, 'Name:', topFolders[0].attributes?.name);
                return topFolders[0].id;
            } else {
                debugLog('No suitable top-level folders found');
                debugLog('Using first available folder as fallback');
                projectTopFolderId = data.data[0].id;
                return data.data[0].id;
            }
        } else {
            debugLog('No folders found in response');
            return null;
        }
    } catch (error) {
        debugLog('Error getting project folders:', error);
        console.warn('Error getting project folders, using fallback storage:', error);
        return null;
    }
}

// Create or find BedQC folder with enhanced permission handling
async function ensureBedQCFolder(projectId, parentFolderId) {
    try {
        debugLog('=== ENSURING BEDQC FOLDER ===');
        debugLog('Parent folder ID:', parentFolderId);

        if (!parentFolderId) {
            debugLog('No parent folder available');
            return null;
        }

        // Add delay to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

        // First, try to find existing BedQC folder
        debugLog('Step 1: Looking for existing BedQC folder...');
        const foldersResponse = await fetch(`${ACC_DATA_API_BASE}/projects/${projectId}/folders/${parentFolderId}/contents`, {
            headers: {
                'Authorization': `Bearer ${forgeAccessToken}`
            }
        });

        if (foldersResponse.ok) {
            const foldersData = await foldersResponse.json();
            debugLog('Found items in parent folder:', foldersData.data?.length || 0);

            const existingFolder = foldersData.data?.find(item =>
                item.type === 'folders' &&
                item.attributes.name === 'BedQC Reports'
            );

            if (existingFolder) {
                bedQCFolderId = existingFolder.id;
                debugLog('✓ Found existing BedQC folder:', bedQCFolderId);
                return existingFolder.id;
            }
        } else {
            const errorText = await foldersResponse.text();
            debugLog('Could not list folder contents:', errorText);
        }

        // Create new BedQC folder
        debugLog('Step 2: Creating new BedQC Reports folder...');

        // Add delay to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

        const createFolderPayload = {
            data: {
                type: 'folders',
                attributes: {
                    name: 'BedQC Reports',
                    extension: {
                        type: 'folders:autodesk.bim360:Folder',
                        version: '1.0'
                    }
                },
                relationships: {
                    parent: {
                        data: {
                            type: 'folders',
                            id: parentFolderId
                        }
                    }
                }
            }
        };

        debugLog('Create folder payload:', createFolderPayload);

        const createFolderResponse = await fetch(`${ACC_DATA_API_BASE}/projects/${projectId}/folders`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${forgeAccessToken}`,
                'Content-Type': 'application/vnd.api+json'
            },
            body: JSON.stringify(createFolderPayload)
        });

        debugLog('Create folder response status:', createFolderResponse.status);

        if (createFolderResponse.ok) {
            const folderData = await createFolderResponse.json();
            bedQCFolderId = folderData.data.id;
            debugLog('✓ Created BedQC folder:', bedQCFolderId);
            return folderData.data.id;
        } else {
            const errorResponse = await createFolderResponse.text();
            debugLog('Failed to create folder:', errorResponse);

            // Try to parse error details
            try {
                const errorData = JSON.parse(errorResponse);
                debugLog('Parsed error details:', errorData);
            } catch (e) {
                debugLog('Could not parse error response');
            }

            return null;
        }
    } catch (error) {
        debugLog('Error ensuring BedQC folder:', error);
        console.warn('Error ensuring BedQC folder, using fallback storage:', error);
        return null;
    }
}

// Enhanced JSON file upload to ACC with better error handling
async function uploadJSONToACC(projectId, folderId, fileName, jsonData) {
    try {
        debugLog('=== UPLOADING JSON TO ACC ===');
        debugLog('Project ID:', projectId);
        debugLog('Folder ID:', folderId);
        debugLog('File name:', fileName);

        if (!folderId) {
            throw new Error('No folder available for upload');
        }

        // Add delay to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

        // Step 1: Create storage location
        debugLog('Step 1: Creating storage location...');

        const storagePayload = {
            data: {
                type: 'objects',
                attributes: {
                    name: fileName
                },
                relationships: {
                    target: {
                        data: {
                            type: 'folders',
                            id: folderId
                        }
                    }
                }
            }
        };

        debugLog('Storage payload:', storagePayload);

        const storageResponse = await fetch(`${ACC_DATA_API_BASE}/projects/${projectId}/storage`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${forgeAccessToken}`,
                'Content-Type': 'application/vnd.api+json'
            },
            body: JSON.stringify(storagePayload)
        });

        debugLog('Storage response status:', storageResponse.status);

        if (!storageResponse.ok) {
            const errorText = await storageResponse.text();
            debugLog('Storage creation failed:', errorText);
            throw new Error(`Failed to create storage location: ${storageResponse.status} - ${errorText}`);
        }

        const storageData = await storageResponse.json();
        const bucketKey = storageData.data.id;
        const uploadURL = storageData.data.attributes.location;

        debugLog('✓ Storage location created:', bucketKey);
        debugLog('Upload URL:', uploadURL);

        // Step 2: Upload file content
        debugLog('Step 2: Uploading file content...');
        const fileContent = JSON.stringify(jsonData, null, 2);
        debugLog('File content size:', fileContent.length, 'characters');

        // Add delay to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

        const uploadResponse = await fetch(uploadURL, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${forgeAccessToken}`
            },
            body: fileContent
        });

        debugLog('Upload response status:', uploadResponse.status);

        if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            debugLog('File upload failed:', errorText);
            throw new Error(`Failed to upload file: ${uploadResponse.status} - ${errorText}`);
        }

        debugLog('✓ File uploaded successfully');

        // Step 3: Create first version
        debugLog('Step 3: Creating file version...');

        // Add delay to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

        const versionPayload = {
            data: {
                type: 'versions',
                attributes: {
                    name: fileName,
                    extension: {
                        type: 'versions:autodesk.bim360:File',
                        version: '1.0'
                    }
                },
                relationships: {
                    item: {
                        data: {
                            type: 'items'
                        }
                    },
                    storage: {
                        data: {
                            type: 'objects',
                            id: bucketKey
                        }
                    }
                }
            }
        };

        debugLog('Version payload:', versionPayload);

        const versionResponse = await fetch(`${ACC_DATA_API_BASE}/projects/${projectId}/versions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${forgeAccessToken}`,
                'Content-Type': 'application/vnd.api+json'
            },
            body: JSON.stringify(versionPayload)
        });

        debugLog('Version response status:', versionResponse.status);

        if (!versionResponse.ok) {
            const errorText = await versionResponse.text();
            debugLog('Version creation failed:', errorText);
            throw new Error(`Failed to create version: ${versionResponse.status} - ${errorText}`);
        }

        const versionData = await versionResponse.json();
        debugLog('✓ Version created successfully:', versionData.data.id);

        return {
            success: true,
            versionId: versionData.data.id,
            itemId: versionData.data.relationships?.item?.data?.id,
            storageId: bucketKey,
            method: 'acc-file-upload'
        };

    } catch (error) {
        debugLog('Error uploading to ACC:', error);
        console.error('Error uploading to ACC:', error);
        throw error;
    }
}

// Load reports using enhanced approach with better error handling
async function loadBedQCReportsFromACC(projectId) {
    try {
        debugLog('=== LOADING REPORTS FROM ACC ===');
        debugLog('Project ID:', projectId);

        const reports = [];

        // Method 1: Try to load from ACC BedQC folder if accessible
        try {
            if (!projectTopFolderId) {
                await getProjectTopFolder(projectId);
            }

            if (projectTopFolderId && !bedQCFolderId) {
                await ensureBedQCFolder(projectId, projectTopFolderId);
            }

            if (bedQCFolderId) {
                debugLog('Loading from ACC BedQC folder:', bedQCFolderId);

                // Add delay to prevent rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));

                const folderContentsResponse = await fetch(`${ACC_DATA_API_BASE}/projects/${projectId}/folders/${bedQCFolderId}/contents`, {
                    headers: {
                        'Authorization': `Bearer ${forgeAccessToken}`
                    }
                });

                if (folderContentsResponse.ok) {
                    const contentsData = await folderContentsResponse.json();
                    debugLog('✓ Found items in BedQC folder:', contentsData.data?.length || 0);

                    for (const item of contentsData.data || []) {
                        if (item.type === 'items' && item.attributes.name.endsWith('.json')) {
                            try {
                                // Add delay to prevent rate limiting
                                await new Promise(resolve => setTimeout(resolve, 50));

                                // Get the latest version of the item
                                const versionsResponse = await fetch(`${ACC_DATA_API_BASE}/projects/${projectId}/items/${item.id}/versions`, {
                                    headers: {
                                        'Authorization': `Bearer ${forgeAccessToken}`
                                    }
                                });

                                if (versionsResponse.ok) {
                                    const versionsData = await versionsResponse.json();
                                    if (versionsData.data && versionsData.data.length > 0) {
                                        const latestVersion = versionsData.data[0];

                                        reports.push({
                                            itemId: item.id,
                                            versionId: latestVersion.id,
                                            fileName: item.attributes.name,
                                            lastModified: item.attributes.lastModifiedTime,
                                            displayName: item.attributes.displayName || item.attributes.name,
                                            source: 'acc-file',
                                            needsDownload: true,
                                            permissions: 'enhanced'
                                        });

                                        debugLog('Added ACC report:', item.attributes.name);
                                    }
                                }
                            } catch (itemError) {
                                debugLog('Could not process ACC item:', item.attributes.name, itemError);
                            }
                        }
                    }
                } else {
                    const errorText = await folderContentsResponse.text();
                    debugLog('Could not load folder contents:', errorText);
                }
            } else {
                debugLog('No ACC folder access available, using local storage only');
            }
        } catch (accError) {
            debugLog('Could not load from ACC folder:', accError);
        }

        // Method 2: Load from local storage
        debugLog('Loading from local storage...');
        const projectReportsKey = `bedqc_reports_${projectId}`;
        const localReportIds = JSON.parse(localStorage.getItem(projectReportsKey) || '[]');

        debugLog('Found local report IDs:', localReportIds);

        for (const reportId of localReportIds) {
            const storageKey = `bedqc_${projectId}_${reportId}`;
            const reportDataStr = localStorage.getItem(storageKey);

            if (reportDataStr) {
                try {
                    const reportData = JSON.parse(reportDataStr);

                    // Skip if we already have this report from ACC
                    const existingReport = reports.find(r =>
                        r.fileName && r.fileName.includes(reportId)
                    );

                    if (!existingReport) {
                        reports.push({
                            itemId: storageKey,
                            storageKey: storageKey,
                            lastModified: reportData.timestamp,
                            displayName: `${reportData.reportData?.bedName || 'Unknown'} - ${reportData.reportData?.reportId || reportId}`,
                            data: reportData,
                            source: reportData.storedLocally ? 'local' : 'local-synced',
                            permissions: reportData.permissionsRequested || 'basic',
                            errorInfo: reportData.uploadError ? {
                                error: reportData.uploadError,
                                analysis: reportData.errorAnalysis,
                                troubleshooting: reportData.troubleshootingSteps
                            } : null
                        });

                        debugLog('Added local report:', reportId);
                    }
                } catch (parseError) {
                    debugLog('Could not parse local report:', reportId, parseError);
                }
            }
        }

        // Sort by date (newest first)
        reports.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

        debugLog(`✓ Loaded ${reports.length} reports total`);
        debugLog('Report sources:', reports.map(r => ({ name: r.displayName, source: r.source })));

        return reports;

    } catch (error) {
        debugLog('Error loading reports:', error);
        console.error('Error loading reports:', error);
        return [];
    }
}

// Download report content from ACC with better error handling
async function downloadReportFromACC(versionId) {
    try {
        debugLog('=== DOWNLOADING REPORT FROM ACC ===');
        debugLog('Version ID:', versionId);

        // Add delay to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

        // Get download URL
        const downloadResponse = await fetch(`${ACC_DATA_API_BASE}/projects/${projectId}/versions/${versionId}/downloads`, {
            headers: {
                'Authorization': `Bearer ${forgeAccessToken}`
            }
        });

        debugLog('Download URL response status:', downloadResponse.status);

        if (!downloadResponse.ok) {
            const errorText = await downloadResponse.text();
            debugLog('Failed to get download URL:', errorText);
            throw new Error(`Failed to get download URL: ${downloadResponse.status} - ${errorText}`);
        }

        const downloadData = await downloadResponse.json();
        const downloadUrl = downloadData.data.attributes.location;

        debugLog('Download URL obtained:', downloadUrl ? 'Yes' : 'No');

        // Download the file content
        const contentResponse = await fetch(downloadUrl, {
            headers: {
                'Authorization': `Bearer ${forgeAccessToken}`
            }
        });

        debugLog('Content download response status:', contentResponse.status);

        if (!contentResponse.ok) {
            const errorText = await contentResponse.text();
            debugLog('Failed to download file content:', errorText);
            throw new Error(`Failed to download file: ${contentResponse.status} - ${errorText}`);
        }

        const reportContent = await contentResponse.json();
        debugLog('✓ Successfully downloaded report from ACC');

        return reportContent;

    } catch (error) {
        debugLog('Error downloading report from ACC:', error);
        console.error('Error downloading report from ACC:', error);
        throw error;
    }
}

// Delete report (works with enhanced permissions)
async function deleteBedQCReportFromACC(itemId, isACCFile = false) {
    try {
        debugLog('=== DELETING REPORT ===');
        debugLog('Item ID:', itemId);
        debugLog('Is ACC File:', isACCFile);

        if (isACCFile && itemId.startsWith('urn:')) {
            // Try to delete from ACC with enhanced permissions
            try {
                // Add delay to prevent rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));

                const deleteResponse = await fetch(`${ACC_DATA_API_BASE}/projects/${projectId}/items/${itemId}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${forgeAccessToken}`
                    }
                });

                debugLog('ACC delete response status:', deleteResponse.status);

                if (deleteResponse.ok) {
                    debugLog('✓ Report deleted from ACC');
                    return true;
                } else {
                    const errorText = await deleteResponse.text();
                    debugLog('Could not delete from ACC:', errorText);
                    debugLog('Removing from local list only');
                }
            } catch (accDeleteError) {
                debugLog('ACC delete failed:', accDeleteError);
            }
        }

        // Remove from local storage
        localStorage.removeItem(itemId);
        debugLog('Removed from local storage:', itemId);

        // Remove from project reports list if it's a storage key
        if (itemId.startsWith('bedqc_')) {
            const projectReportsKey = `bedqc_reports_${projectId}`;
            const existingReports = JSON.parse(localStorage.getItem(projectReportsKey) || '[]');
            const reportIdToRemove = itemId.split('_').pop(); // Extract report ID from storage key

            const updatedReports = existingReports.filter(id => id !== reportIdToRemove);
            localStorage.setItem(projectReportsKey, JSON.stringify(updatedReports));

            debugLog('Updated project reports list:', updatedReports);
        }

        debugLog('✓ Report deleted from storage');
        return true;

    } catch (error) {
        debugLog('Error deleting report:', error);
        console.error('Error deleting report:', error);
        throw error;
    }
}

// =================================================================
// BED SELECTION AND FORM MANAGEMENT
// =================================================================

// Bed Selection Functions
function showBedSelection() {
    const bedSelectionModal = document.getElementById('bedSelectionModal');
    if (bedSelectionModal) {
        bedSelectionModal.classList.add('active');
    }
}

function closeBedSelection() {
    const bedSelectionModal = document.getElementById('bedSelectionModal');
    if (bedSelectionModal) {
        bedSelectionModal.classList.remove('active');
    }

    const bedSelect = document.getElementById('bedSelect');
    const reportDescription = document.getElementById('reportDescription');

    if (bedSelect) bedSelect.value = '';
    if (reportDescription) reportDescription.value = '';
}

function startBedReport() {
    const bedSelect = document.getElementById('bedSelect');
    const reportDescription = document.getElementById('reportDescription');

    if (!bedSelect || !bedSelect.value) {
        alert('Please select a bed before continuing.');
        return;
    }

    const bedId = bedSelect.value;
    const bedName = bedSelect.options[bedSelect.selectedIndex].text;
    const description = reportDescription ? reportDescription.value : '';

    // Generate unique report ID
    const reportId = generateReportId(bedId);

    // Store report instance
    currentReportId = reportId;
    currentBedId = bedId;
    currentBedName = bedName;

    debugLog('Starting new bed report:', {
        reportId: reportId,
        bedId: bedId,
        bedName: bedName,
        description: description,
        projectId: projectId
    });

    // Initialize new form instance
    initializeFormInstance(reportId, bedId, bedName, description);

    // Close bed selection and show calculator
    closeBedSelection();
    showCalculator();
}

function generateReportId(bedId) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 4);
    return `${bedId.toUpperCase()}-${timestamp}-${random}`;
}

function initializeFormInstance(reportId, bedId, bedName, description) {
    // Create new form instance data
    const formInstance = {
        id: reportId,
        bedId: bedId,
        bedName: bedName,
        description: description,
        timestamp: new Date().toISOString(),
        projectMetadata: {
            projectName: '',
            projectNumber: '',
            date: new Date().toISOString().split('T')[0],
            calculatedBy: '',
            reviewedBy: '',
            location: '',
            notes: ''
        },
        calculations: {
            selfStressing: {
                inputs: {},
                outputs: {}
            },
            nonSelfStressing: {
                inputs: {},
                outputs: {}
            }
        },
        permissions: {
            scopesUsed: ACC_SCOPES,
            enhancedPermissions: true
        }
    };

    // Store instance
    reportInstances.set(reportId, formInstance);

    // Update UI
    const reportIdElement = document.getElementById('reportId');
    const selectedBedDisplayElement = document.getElementById('selectedBedDisplay');

    if (reportIdElement) reportIdElement.textContent = reportId;
    if (selectedBedDisplayElement) selectedBedDisplayElement.textContent = bedName;

    debugLog('Form instance initialized:', formInstance);
}

function showCalculator() {
    const calculatorModal = document.getElementById('calculatorModal');
    if (calculatorModal) {
        calculatorModal.classList.add('active');
    }

    // Clear form data for new instance
    if (!currentCalculation) {
        clearFormData();
    }

    // Initialize calculations
    calculateAll();
}

function closeCalculator() {
    const calculatorModal = document.getElementById('calculatorModal');
    if (calculatorModal) {
        calculatorModal.classList.remove('active');
    }

    // Save current state to instance before closing
    if (currentReportId) {
        saveFormInstance();
    }

    // Reset current calculation
    currentCalculation = null;
}

function clearFormData() {
    // Clear all input fields
    const inputs = document.querySelectorAll('#calculatorModal input[type="number"], #calculatorModal input[type="text"], #calculatorModal input[type="date"], #calculatorModal textarea');
    inputs.forEach(input => {
        if (input.type === 'date') {
            input.value = new Date().toISOString().split('T')[0];
        } else {
            input.value = '';
        }
    });

    // Reset select elements
    const selects = document.querySelectorAll('#calculatorModal select');
    selects.forEach(select => {
        select.selectedIndex = 0;
    });
}

function saveFormInstance() {
    if (!currentReportId) return;

    const instance = reportInstances.get(currentReportId);
    if (!instance) return;

    // Update project metadata
    instance.projectMetadata = {
        projectName: getElementValue('projectName'),
        projectNumber: getElementValue('projectNumber'),
        date: getElementValue('date'),
        calculatedBy: getElementValue('calculatedBy'),
        reviewedBy: getElementValue('reviewedBy'),
        location: getElementValue('location'),
        notes: getElementValue('notes')
    };

    // Update calculations
    instance.calculations = currentCalculation;

    // Save back to storage
    reportInstances.set(currentReportId, instance);
}

function getElementValue(id) {
    const element = document.getElementById(id);
    return element ? element.value : '';
}

// =================================================================
// CALCULATION FUNCTIONS
// =================================================================

// Utility functions
function formatNumber(num) {
    if (isNaN(num) || !isFinite(num)) return '0.000';
    return num.toFixed(3);
}

function formatInteger(num) {
    if (isNaN(num) || !isFinite(num)) return '0';
    return Math.round(num).toString();
}

function getValue(id) {
    const element = document.getElementById(id);
    if (!element) return 0;

    if (element.tagName === 'SELECT') {
        return parseFloat(element.value) || 0;
    }
    return parseFloat(element.value) || 0;
}

// Calculation functions
function calculateSelfStressing() {
    const ip = getValue('ss_initialPull');
    const rf = getValue('ss_requiredForce');
    const moe = getValue('ss_MOE') || 1;
    const ns = getValue('ss_numberOfStrands') || 1;
    const abs = getValue('ss_adjBedShortening');
    const btbl = getValue('ss_blockToBlockLength');
    const sa = getValue('ss_strandArea') || 1;
    const des = getValue('ss_deadEndSeating');
    const les = getValue('ss_liveEndSeating');

    const basicElongation = ((rf - ip) * btbl * 12) / (sa * moe);
    const bedShortening = (abs / 2) + (abs / ns);
    const desiredElongation = basicElongation + des + bedShortening;
    const desiredElongationRounded = Math.ceil(Math.round(desiredElongation * 1000) / 1000 * 8) / 8;
    const LESeatingAdd = basicElongation !== 0 ? (les / basicElongation) * (rf - ip) : 0;
    const bedShorteningAdd = basicElongation !== 0 ? (bedShortening / basicElongation) * (rf - ip) : 0;
    const desiredPull = rf + LESeatingAdd + bedShorteningAdd;
    const calculatedPullRounded = Math.ceil(Math.round(desiredPull) / 100) * 100;

    // Update display elements
    const basicElongationEl = document.getElementById('ss_basicElongation');
    const bedShorteningEl = document.getElementById('ss_bedShortening');
    const desiredElongationRoundedEl = document.getElementById('ss_desiredElongationRounded');
    const calculatedPullRoundedEl = document.getElementById('ss_calculatedPullRounded');

    if (basicElongationEl) basicElongationEl.textContent = formatNumber(basicElongation) + ' in';
    if (bedShorteningEl) bedShorteningEl.textContent = formatNumber(bedShortening) + ' in';
    if (desiredElongationRoundedEl) desiredElongationRoundedEl.textContent = formatNumber(desiredElongationRounded) + ' in';
    if (calculatedPullRoundedEl) calculatedPullRoundedEl.textContent = formatInteger(calculatedPullRounded) + ' lbs';

    return {
        basicElongation, bedShortening, desiredElongation, desiredElongationRounded,
        LESeatingAdd, bedShorteningAdd, desiredPull, calculatedPullRounded
    };
}

function calculateNonSelfStressing() {
    const ip = getValue('nss_initialPull');
    const rf = getValue('nss_requiredForce');
    const moe = getValue('nss_MOE') || 1;
    const btbl = getValue('nss_blockToBlockLength');
    const sa = getValue('nss_strandArea') || 1;
    const at = getValue('nss_airTemp');
    const ct = getValue('nss_concreteTemp');
    const des = getValue('nss_deadEndSeating');
    const les = getValue('nss_liveEndSeating');
    const tar = getValue('nss_totalAbutmentRotation');

    const basicElongation = ((rf - ip) * btbl * 12) / (sa * moe);
    const tempDifference = (ct - at) / 1000;
    const tca2 = ((rf - ip) * btbl * 12) / (sa - moe) * tempDifference;
    const tcPart1 = tempDifference > 0.024 ? tca2 : 0;
    const tcPart2 = tempDifference < -0.024 ? basicElongation * tempDifference : 0;
    const tempCorrection = tcPart1 + tcPart2;
    const desiredElongation = basicElongation + des + tempCorrection;
    const desiredElongationRounded = Math.ceil(Math.round(desiredElongation * 1000) / 1000 * 8) / 8;
    const LESeatingAdd = basicElongation !== 0 ? (les / basicElongation) * (rf - ip) : 0;
    const tca1 = (rf + les + tar) * tempDifference;
    const tcPart1Pull = tempDifference > 0.024 ? tca1 : 0;
    const tcPart2Pull = tempDifference < -0.024 ? tca1 : 0;
    const tempCorrectionPull = tcPart1Pull + tcPart2Pull;
    const desiredPull = rf + LESeatingAdd + tempCorrectionPull;
    const calculatedPullRounded = Math.ceil(Math.round(desiredPull) / 100) * 100;

    // Update display elements
    const basicElongationEl = document.getElementById('nss_basicElongation');
    const tempDifferenceEl = document.getElementById('nss_tempDifference');
    const tempCorrectionEl = document.getElementById('nss_tempCorrection');
    const desiredElongationRoundedEl = document.getElementById('nss_desiredElongationRounded');
    const calculatedPullRoundedEl = document.getElementById('nss_calculatedPullRounded');

    if (basicElongationEl) basicElongationEl.textContent = formatNumber(basicElongation) + ' in';
    if (tempDifferenceEl) tempDifferenceEl.textContent = formatNumber(tempDifference);
    if (tempCorrectionEl) tempCorrectionEl.textContent = formatNumber(tempCorrection);
    if (desiredElongationRoundedEl) desiredElongationRoundedEl.textContent = formatNumber(desiredElongationRounded) + ' in';
    if (calculatedPullRoundedEl) calculatedPullRoundedEl.textContent = formatInteger(calculatedPullRounded) + ' lbs';

    return {
        basicElongation, tempDifference, tca2, tcPart1, tcPart2, tempCorrection,
        desiredElongation, desiredElongationRounded, LESeatingAdd, tca1,
        tcPart1Pull, tcPart2Pull, tempCorrectionPull, desiredPull, calculatedPullRounded
    };
}

function calculateAll() {
    const selfStressingResults = calculateSelfStressing();
    const nonSelfStressingResults = calculateNonSelfStressing();

    // Get strand sizes for saving
    const ssStrandSize = getElementValue('ss_strandSize');
    const nssStrandSize = getElementValue('nss_strandSize');

    currentCalculation = {
        timestamp: new Date().toISOString(),
        reportId: currentReportId,
        bedId: currentBedId,
        bedName: currentBedName,
        projectId: projectId,
        hubId: hubId,
        status: 'Draft',
        permissions: {
            scopesUsed: ACC_SCOPES,
            enhancedPermissions: true
        },
        projectMetadata: {
            projectName: getElementValue('projectName'),
            projectNumber: getElementValue('projectNumber'),
            date: getElementValue('date'),
            calculatedBy: getElementValue('calculatedBy'),
            reviewedBy: getElementValue('reviewedBy'),
            location: getElementValue('location'),
            notes: getElementValue('notes')
        },
        selfStressing: {
            inputs: {
                initialPull: getValue('ss_initialPull'),
                requiredForce: getValue('ss_requiredForce'),
                MOE: getValue('ss_MOE'),
                numberOfStrands: getValue('ss_numberOfStrands'),
                adjBedShortening: getValue('ss_adjBedShortening'),
                blockToBlockLength: getValue('ss_blockToBlockLength'),
                strandSize: ssStrandSize,
                strandArea: getValue('ss_strandArea'),
                deadEndSeating: getValue('ss_deadEndSeating'),
                liveEndSeating: getValue('ss_liveEndSeating')
            },
            outputs: selfStressingResults
        },
        nonSelfStressing: {
            inputs: {
                initialPull: getValue('nss_initialPull'),
                requiredForce: getValue('nss_requiredForce'),
                MOE: getValue('nss_MOE'),
                blockToBlockLength: getValue('nss_blockToBlockLength'),
                strandSize: nssStrandSize,
                strandArea: getValue('nss_strandArea'),
                airTemp: getValue('nss_airTemp'),
                concreteTemp: getValue('nss_concreteTemp'),
                deadEndSeating: getValue('nss_deadEndSeating'),
                liveEndSeating: getValue('nss_liveEndSeating'),
                totalAbutmentRotation: getValue('nss_totalAbutmentRotation')
            },
            outputs: nonSelfStressingResults
        }
    };

    debugLog('Calculations updated:', {
        reportId: currentReportId,
        selfStressPull: selfStressingResults.calculatedPullRounded,
        nonSelfStressPull: nonSelfStressingResults.calculatedPullRounded
    });
}

// =================================================================
// PROJECT DATA LOADING AND MANAGEMENT WITH IMPROVED RATE LIMITING
// =================================================================

async function loadRealProjectData() {
    try {
        debugLog('Starting to load real project data with scope validation...');
        debugLog('Using Metromont Account ID:', METROMONT_ACCOUNT_ID);

        // Skip the hub enumeration - go directly to Metromont hub
        hubId = METROMONT_HUB_ID;
        debugLog('Using Metromont ACC hub directly:', hubId);

        // Verify hub access
        const hubResponse = await fetch(`https://developer.api.autodesk.com/project/v1/hubs/${hubId}`, {
            headers: {
                'Authorization': `Bearer ${forgeAccessToken}`
            }
        });

        if (!hubResponse.ok) {
            const errorText = await hubResponse.text();
            console.error('Metromont hub access error:', hubResponse.status, errorText);
            throw new Error(`Failed to access Metromont hub: ${hubResponse.status} ${errorText}`);
        }

        const hubData = await hubResponse.json();
        debugLog('✓ Metromont hub verified:', hubData.data.attributes.name);

        // Load projects from Metromont hub
        await loadProjectsFromHub(hubId);

        debugLog('✓ Project data loading completed successfully');

    } catch (error) {
        console.error('Failed to load project data:', error);

        // Get scope validation for error display
        const scopeValidation = await validateTokenScopesWithJWT();

        // Still enable manual entry mode
        const projectSelect = document.getElementById('projectName');
        if (projectSelect) {
            projectSelect.innerHTML = '<option value="">Enter project details manually below...</option>';
            projectSelect.disabled = false;
        }

        ['projectNumber', 'location'].forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.disabled = false;
                element.placeholder = element.placeholder.replace('Loading from ACC...', 'Enter manually');
            }
        });

        const accDetails = document.getElementById('accDetails');
        if (accDetails) {
            let scopeWarningHtml = '';

            if (!scopeValidation.hasEnhancedScopes) {
                if (scopeValidation.scopeIssue === 'NO_SCOPES_GRANTED') {
                    scopeWarningHtml = `
                        <div style="background: #fee2e2; border: 1px solid #fca5a5; border-radius: 6px; padding: 0.75rem; margin-top: 0.5rem;">
                            <strong style="color: #dc2626;">OAuth Scope Issue:</strong><br>
                            <span style="color: #7f1d1d; font-size: 0.875rem;">
                                No scopes granted - Custom Integration registration required in ACC Account Admin.
                            </span>
                        </div>
                    `;
                } else {
                    scopeWarningHtml = `
                        <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; padding: 0.75rem; margin-top: 0.5rem;">
                            <strong style="color: #92400e;">Limited OAuth Scopes:</strong><br>
                            <span style="color: #78350f; font-size: 0.875rem;">
                                Missing: ${scopeValidation.missingScopes.join(', ')} - Check Custom Integration setup.
                            </span>
                        </div>
                    `;
                }
            }

            accDetails.innerHTML = `
                <div style="color: #dc2626;">
                    <strong>Project Loading Issue:</strong> ${error.message}<br>
                    <small>You can still use the calculator by entering project details manually</small><br>
                    <small><em>Note: Projects must follow format "12345 - Project Name" to appear in dropdown</em></small><br>
                    <small><em>Reports will be saved locally ${scopeValidation.hasEnhancedScopes ? 'with enhanced sync capability' : '(limited permissions)'}</em></small><br>
                    <small><em>Granted scopes: ${scopeValidation.grantedScopes || '(none)'}</em></small><br>
                    <small><em>Metromont Account ID: ${METROMONT_ACCOUNT_ID}</em></small><br>
                    <small><em>Client ID: ${ACC_CLIENT_ID}</em></small>
                </div>
                ${scopeWarningHtml}
            `;
        }
    }
}

async function loadProjectsFromHub(hubId) {
    try {
        debugLog('Loading projects from Metromont ACC hub:', hubId);

        const projectsResponse = await fetch(`https://developer.api.autodesk.com/project/v1/hubs/${hubId}/projects`, {
            headers: {
                'Authorization': `Bearer ${forgeAccessToken}`
            }
        });

        if (!projectsResponse.ok) {
            throw new Error(`Failed to load projects: ${projectsResponse.status} ${await projectsResponse.text()}`);
        }

        const projectsData = await projectsResponse.json();
        debugLog('ACC projects data received:', projectsData);

        // ADVANCED FILTERING: Only active ACC projects with proper naming format
        const validProjects = [];
        const projectNamePattern = /^(\d{5})\s*-\s*(.+)$/;

        for (const project of projectsData.data) {
            // Filter 1: Check project name format
            const nameMatch = project.attributes.name.match(projectNamePattern);
            if (!nameMatch) {
                debugLog('Skipping project (invalid format):', project.attributes.name);
                continue;
            }

            // Filter 2: Only active ACC projects (filter out archived and BIM360)
            const projectType = project.attributes.extension?.type || '';
            const projectStatus = project.attributes.status || '';

            // Skip archived projects
            if (projectStatus === 'archived' || projectStatus === 'inactive') {
                debugLog('Skipping archived project:', project.attributes.name);
                continue;
            }

            // Skip BIM360 projects - only keep ACC projects
            if (projectType.includes('bim360') && !projectType.includes('acc')) {
                debugLog('Skipping BIM360 project:', project.attributes.name);
                continue;
            }

            // Filter 3: Additional quality checks
            const projectName = project.attributes.name;

            // Skip test/template projects
            if (projectName.toLowerCase().includes('test') ||
                projectName.toLowerCase().includes('template') ||
                projectName.toLowerCase().includes('training') ||
                projectName.toLowerCase().includes('mockup') ||
                projectName.toLowerCase().includes('legacy') ||
                projectName.startsWith('zz') ||
                projectName.startsWith('ZZ') ||
                projectName.startsWith('TBD') ||
                projectName.includes('R&D') ||
                projectName.includes('R & D')) {
                debugLog('Skipping test/template project:', project.attributes.name);
                continue;
            }

            // This project passed all filters
            validProjects.push({
                project: project,
                projectNumberFromName: nameMatch[1],
                projectDisplayName: nameMatch[2].trim()
            });
        }

        debugLog(`✓ Filtered ${validProjects.length} valid ACC projects from ${projectsData.data.length} total projects`);

        if (validProjects.length === 0) {
            console.warn('No active ACC projects matched the required format "12345 - Project Name"');
            throw new Error('No active ACC projects found matching required format "12345 - Project Name"');
        }

        // OPTIMIZED PROCESSING: Process valid projects with strict rate limiting
        const projects = [];
        const maxConcurrentRequests = 1; // Only 1 request at a time
        const delayBetweenRequests = 300; // 300ms delay between each request
        const maxRetries = 3;

        debugLog('Processing', validProjects.length, 'valid ACC projects');

        for (let i = 0; i < validProjects.length; i += maxConcurrentRequests) {
            const batch = validProjects.slice(i, i + maxConcurrentRequests);

            const batchPromises = batch.map(async (validProject) => {
                const { project, projectNumberFromName, projectDisplayName } = validProject;

                debugLog(`Processing ACC project [${i + 1}/${validProjects.length}]:`, project.attributes.name);

                let projectNumber = projectNumberFromName;
                let location = '';

                // Try to get detailed project info with retry logic
                let retryCount = 0;
                let success = false;

                while (!success && retryCount < maxRetries) {
                    try {
                        // Add exponential backoff delay
                        const delay = delayBetweenRequests * Math.pow(1.5, retryCount);
                        await new Promise(resolve => setTimeout(resolve, delay));

                        const projectDetailResponse = await fetch(`https://developer.api.autodesk.com/project/v1/hubs/${hubId}/projects/${project.id}`, {
                            headers: {
                                'Authorization': `Bearer ${forgeAccessToken}`
                            }
                        });

                        if (projectDetailResponse.ok) {
                            const projectDetail = await projectDetailResponse.json();

                            if (projectDetail.data?.attributes?.extension?.data) {
                                const extData = projectDetail.data.attributes.extension.data;

                                // Extract project number from various possible fields
                                const accProjectNumber = extData.projectNumber ||
                                    extData.project_number ||
                                    extData.number ||
                                    extData.jobNumber ||
                                    extData.job_number ||
                                    extData.projectCode ||
                                    extData.code || '';

                                if (accProjectNumber && accProjectNumber.trim() !== '') {
                                    projectNumber = accProjectNumber.trim();
                                }

                                // Extract location from various possible fields
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
                            success = true;
                        } else if (projectDetailResponse.status === 429) {
                            debugLog(`Rate limit hit for project ${project.attributes.name}, retrying... (${retryCount + 1}/${maxRetries})`);
                            retryCount++;

                            // If we've hit rate limit, wait much longer before retrying
                            if (retryCount < maxRetries) {
                                const waitTime = 3000 * retryCount; // Wait 3, 6, 9 seconds
                                debugLog(`Waiting ${waitTime}ms before retry...`);
                                await new Promise(resolve => setTimeout(resolve, waitTime));
                            }
                        } else {
                            debugLog(`Failed to get project details for ${project.attributes.name}: ${projectDetailResponse.status}`);
                            success = true; // Don't retry for non-rate-limit errors
                        }
                    } catch (detailError) {
                        debugLog('Could not get detailed project info for', project.attributes.name, ':', detailError);
                        retryCount++;

                        if (retryCount < maxRetries) {
                            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
                        }
                    }
                }

                return {
                    id: project.id,
                    name: project.attributes.name || 'Unnamed Project',
                    displayName: projectDisplayName,
                    number: projectNumber,
                    numericSort: parseInt(projectNumberFromName, 10),
                    location: location || 'Location not specified',
                    fullData: project,
                    permissions: 'enhanced',
                    projectType: 'ACC',
                    status: project.attributes.status || 'active'
                };
            });

            const batchResults = await Promise.all(batchPromises);
            projects.push(...batchResults.filter(project => project !== null));

            // Add longer delay between batches to prevent rate limiting
            if (i + maxConcurrentRequests < validProjects.length) {
                const remaining = validProjects.length - (i + maxConcurrentRequests);
                debugLog(`✓ Processed ${i + maxConcurrentRequests} of ${validProjects.length} projects, ${remaining} remaining...`);
                await new Promise(resolve => setTimeout(resolve, 800)); // 800ms between batches
            }
        }

        debugLog(`✓ Successfully processed ${projects.length} Metromont ACC projects`);

        // Sort projects by project number
        const sortedProjects = projects.sort((a, b) => a.numericSort - b.numericSort);

        populateProjectDropdown(sortedProjects);

        // Auto-select first project if available
        if (sortedProjects.length > 0) {
            setTimeout(() => {
                const projectSelect = document.getElementById('projectName');
                if (projectSelect) {
                    projectSelect.value = sortedProjects[0].id;
                    projectId = sortedProjects[0].id;
                    debugLog('Auto-selected project:', projectId);
                    onProjectSelected();
                }
            }, 100);
        }

    } catch (error) {
        debugLog('Error in loadProjectsFromHub:', error);
        console.error('Error in loadProjectsFromHub:', error);
        throw error;
    }
}

function populateProjectDropdown(projects) {
    try {
        userProjects = projects;
        const projectSelect = document.getElementById('projectName');

        if (!projectSelect) {
            console.error('Project select element not found');
            return;
        }

        projectSelect.innerHTML = '<option value="">Select an ACC project...</option>';

        projects.forEach((project) => {
            const option = document.createElement('option');
            option.value = project.id;
            option.textContent = `${project.name} (${project.number})`;
            option.dataset.projectNumber = project.number || '';
            option.dataset.location = project.location || '';
            option.dataset.permissions = project.permissions || 'basic';
            projectSelect.appendChild(option);
        });

        projectSelect.disabled = false;

        // Update ACC details with scope validation information
        updateACCDetailsDisplay(projects.length);

    } catch (error) {
        console.error('Error in populateProjectDropdown:', error);
        throw error;
    }
}

// Update ACC details display with scope validation information
async function updateACCDetailsDisplay(projectCount) {
    const accDetails = document.getElementById('accDetails');
    if (!accDetails) return;

    // Get current scope validation using JWT decoder
    const scopeValidation = await validateTokenScopesWithJWT();

    let scopeStatusHtml = '';
    let scopeWarningHtml = '';

    if (scopeValidation.hasEnhancedScopes) {
        scopeStatusHtml = '<span style="color: #059669;">✅ Enhanced scopes granted</span>';
    } else {
        scopeStatusHtml = '<span style="color: #dc2626;">⚠️ Limited scopes granted</span>';

        if (scopeValidation.scopeIssue === 'NO_SCOPES_GRANTED') {
            scopeWarningHtml = `
                <div style="background: #fee2e2; border: 1px solid #fca5a5; border-radius: 6px; padding: 0.75rem; margin-top: 0.5rem;">
                    <strong style="color: #dc2626;">Custom Integration Required:</strong><br>
                    <span style="color: #7f1d1d; font-size: 0.875rem;">
                        No OAuth scopes were granted. Register Client ID as Custom Integration in ACC Account Admin to enable file operations.
                    </span>
                </div>
            `;
        } else if (scopeValidation.missingScopes.length > 0) {
            scopeWarningHtml = `
                <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; padding: 0.75rem; margin-top: 0.5rem;">
                    <strong style="color: #92400e;">Limited Permissions:</strong><br>
                    <span style="color: #78350f; font-size: 0.875rem;">
                        Missing scopes: ${scopeValidation.missingScopes.join(', ')}. Verify Custom Integration setup.
                    </span>
                </div>
            `;
        }
    }

    accDetails.innerHTML = `
        <strong>Status:</strong> Connected to Metromont ACC<br>
        <strong>Account:</strong> ${METROMONT_ACCOUNT_ID}<br>
        <strong>Projects Found:</strong> ${projectCount} active ACC projects (filtered by format)<br>
        <strong>Hub:</strong> Metromont ACC Account<br>
        <strong>OAuth Scopes:</strong> ${scopeStatusHtml}<br>
        <strong>Granted Scopes:</strong> <code style="font-size: 0.75rem;">${scopeValidation.grantedScopes || '(none)'}</code><br>
        <strong>Storage Method:</strong> ${scopeValidation.hasEnhancedScopes ? 'ACC JSON file upload with local fallback' : 'Local storage only'}<br>
        <strong>Project Types:</strong> Active ACC projects only (archived and BIM360 filtered out)<br>
        <strong>Client ID:</strong> <code style="font-size: 0.75rem;">${ACC_CLIENT_ID}</code>
        ${scopeWarningHtml}
    `;
}

function onProjectSelected() {
    const projectSelect = document.getElementById('projectName');
    if (!projectSelect) return;

    const selectedOption = projectSelect.selectedOptions[0];

    if (selectedOption && selectedOption.value) {
        const projectNumber = selectedOption.dataset.projectNumber || '';
        const location = selectedOption.dataset.location || '';
        const permissions = selectedOption.dataset.permissions || 'basic';

        projectId = selectedOption.value;

        debugLog('Project selected:', {
            projectId: projectId,
            projectNumber: projectNumber,
            location: location,
            permissions: permissions
        });

        const projectNumberEl = document.getElementById('projectNumber');
        const locationEl = document.getElementById('location');
        const projectSource = document.getElementById('projectSource');

        if (projectNumberEl) {
            projectNumberEl.value = projectNumber;
            projectNumberEl.disabled = false;
        }

        if (locationEl) {
            locationEl.value = location;
            locationEl.disabled = false;
        }

        if (projectSource) {
            projectSource.style.display = 'inline-flex';
            projectSource.textContent = `Project Data from ACC (${permissions} permissions)`;
        }

        debugLog('✓ Project selection completed successfully');
    }
}

// FIXED: Enhanced token scope validation with JWT decoding
async function validateTokenScopesWithJWT() {
    debugLog('=== VALIDATING TOKEN SCOPES WITH JWT DECODING ===');

    const storedToken = getStoredToken();
    if (!storedToken?.access_token) {
        debugLog('No stored token available');
        return {
            grantedScopes: '',
            requestedScopes: ACC_SCOPES.split(' '),
            hasDataRead: false,
            hasDataWrite: false,
            hasDataCreate: false,
            hasEnhancedScopes: false,
            missingScopes: ACC_SCOPES.split(' '),
            scopeIssue: 'NO_TOKEN',
            recommendation: 'REAUTHENTICATE',
            scopeDetectionMethod: 'no_token'
        };
    }

    let grantedScopes = '';
    let scopeDetectionMethod = '';

    // FIXED: Use JWT decoder to get actual scopes
    const jwtData = decodeJWTScopes(storedToken.access_token);

    if (jwtData && jwtData.scopeString) {
        grantedScopes = jwtData.scopeString;
        scopeDetectionMethod = 'jwt_decoded';
        debugLog('✓ Scopes extracted from JWT successfully');
    } else if (storedToken.scope && storedToken.scope.trim() !== '') {
        grantedScopes = storedToken.scope;
        scopeDetectionMethod = 'token_response_field';
        debugLog('✓ Scopes from token response field');
    } else {
        // Last fallback - assume requested scopes were granted
        grantedScopes = ACC_SCOPES;
        scopeDetectionMethod = 'fallback_assumption';
        debugLog('⚠️ Using fallback scope assumption');
    }

    const requestedScopes = ACC_SCOPES.split(' ');

    debugLog('JWT data:', jwtData);
    debugLog('Stored token scope field:', storedToken.scope || '(empty)');
    debugLog('Final granted scopes:', grantedScopes);
    debugLog('Detection method:', scopeDetectionMethod);

    const scopeValidation = {
        grantedScopes: grantedScopes,
        requestedScopes: requestedScopes,
        hasDataRead: grantedScopes.includes('data:read'),
        hasDataWrite: grantedScopes.includes('data:write'),
        hasDataCreate: grantedScopes.includes('data:create'),
        hasEnhancedScopes: false,
        missingScopes: [],
        scopeIssue: null,
        recommendation: null,
        scopeDetectionMethod: scopeDetectionMethod,
        jwtData: jwtData
    };

    // Check for missing critical scopes
    const criticalScopes = ['data:write', 'data:create'];
    scopeValidation.missingScopes = criticalScopes.filter(scope => !grantedScopes.includes(scope));
    scopeValidation.hasEnhancedScopes = scopeValidation.missingScopes.length === 0 && scopeValidation.hasDataRead;

    // Determine the scope issue and recommendation
    if (grantedScopes === '' || grantedScopes.trim() === '') {
        scopeValidation.scopeIssue = 'NO_SCOPES_GRANTED';
        scopeValidation.recommendation = 'CUSTOM_INTEGRATION_REQUIRED';
    } else if (scopeValidation.missingScopes.length > 0) {
        scopeValidation.scopeIssue = 'MISSING_ENHANCED_SCOPES';
        scopeValidation.recommendation = 'CUSTOM_INTEGRATION_REQUIRED';
    } else {
        scopeValidation.scopeIssue = null;
        scopeValidation.recommendation = 'SCOPES_OK';
    }

    debugLog('✓ Scope validation result with JWT:', scopeValidation);

    return scopeValidation;
}

// Show scope warning modal
function showScopeWarning(scopeValidation) {
    debugLog('Showing scope warning for validation:', scopeValidation);

    let warningTitle = '';
    let warningMessage = '';
    let actionSteps = [];

    if (scopeValidation.scopeIssue === 'NO_SCOPES_GRANTED') {
        warningTitle = 'OAuth Scopes Not Granted';
        warningMessage = 'Your access token did not receive any OAuth scopes, which means enhanced file operations will not work.';
        actionSteps = [
            '1. Register your Client ID as a Custom Integration in ACC Account Admin',
            '2. Navigate to ACC Account Admin → Settings → Custom Integrations',
            '3. Add Client ID: ' + ACC_CLIENT_ID,
            '4. Enable "Document Management" access level',
            '5. Set integration status to "Active"',
            '6. Log out and log back in to CastLink'
        ];
    } else if (scopeValidation.scopeIssue === 'MISSING_ENHANCED_SCOPES') {
        warningTitle = 'Limited OAuth Permissions';
        warningMessage = `Missing required scopes: ${scopeValidation.missingScopes.join(', ')}. File save operations may fail.`;
        actionSteps = [
            '1. Verify Custom Integration registration in ACC Account Admin',
            '2. Check that "Document Management" access is enabled',
            '3. Confirm integration status is "Active"',
            '4. Log out and log back in to refresh token scopes'
        ];
    }

    // Create and show warning modal
    const warningModal = document.createElement('div');
    warningModal.className = 'modal-overlay';
    warningModal.style.zIndex = '3000';
    warningModal.innerHTML = `
        <div class="modal" style="max-width: 600px;">
            <div class="modal-header">
                <h3 class="modal-title" style="color: #dc2626;">
                    <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24" style="margin-right: 0.5rem;">
                        <path d="M12 2L1 21h22L12 2zm0 3.5L19.5 19h-15L12 5.5zM11 14v2h2v-2h-2zm0-6v4h2V8h-2z"/>
                    </svg>
                    ${warningTitle}
                </h3>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
            </div>
            <div class="modal-content">
                <p style="margin-bottom: 1rem; color: #374151;">${warningMessage}</p>
                
                <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 1rem; margin-bottom: 1rem;">
                    <h4 style="margin: 0 0 0.5rem 0; color: #92400e;">Required Action:</h4>
                    <p style="margin: 0; color: #92400e; font-size: 0.875rem;">
                        This issue is caused by Autodesk's Custom Integration requirement. 
                        Even with correct OAuth scopes, enhanced permissions require additional setup.
                    </p>
                </div>
                
                <h4 style="margin: 1rem 0 0.5rem 0; color: #1e293b;">Steps to Fix:</h4>
                <ol style="color: #374151; line-height: 1.6;">
                    ${actionSteps.map(step => `<li style="margin-bottom: 0.5rem;">${step}</li>`).join('')}
                </ol>
                
                <div style="background: #e0f2fe; border: 1px solid #0284c7; border-radius: 8px; padding: 1rem; margin-top: 1rem;">
                    <h4 style="margin: 0 0 0.5rem 0; color: #0c4a6e;">What You Can Do Now:</h4>
                    <p style="margin: 0; color: #0c4a6e; font-size: 0.875rem;">
                        • Use the Quality Control calculator normally<br>
                        • Reports will be saved locally with sync capability<br>
                        • Once Custom Integration is configured, reports can be uploaded to ACC
                    </p>
                </div>
                
                <div style="margin-top: 1rem; font-size: 0.875rem; color: #6b7280;">
                    <strong>Technical Details:</strong><br>
                    Client ID: ${ACC_CLIENT_ID}<br>
                    Granted Scopes: ${scopeValidation.grantedScopes || '(none)'}<br>
                    Missing Scopes: ${scopeValidation.missingScopes.join(', ') || '(none)'}<br>
                    Detection Method: ${scopeValidation.scopeDetectionMethod}
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">
                    Continue with Limited Access
                </button>
                <button class="btn btn-primary" onclick="window.open('https://docs.autodesk.com/en/docs/acc/v1/tutorials/getting-started/manage-access-to-docs/', '_blank')">
                    View ACC Setup Guide
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(warningModal);
    warningModal.classList.add('active');

    // Auto-remove after 30 seconds if user doesn't interact
    setTimeout(() => {
        if (document.body.contains(warningModal)) {
            warningModal.remove();
        }
    }, 30000);
}

function enableACCFeatures(scopeValidation = null) {
    const saveBtn = document.getElementById('saveBtn');
    const exportBtn = document.getElementById('exportBtn');

    if (saveBtn) {
        saveBtn.disabled = false;

        // Update save button based on scope validation
        if (scopeValidation && !scopeValidation.hasEnhancedScopes) {
            saveBtn.innerHTML = `
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
                </svg>
                Save Locally
            `;
            saveBtn.title = 'Will save to local storage due to limited ACC permissions';
        }
    }

    if (exportBtn) {
        exportBtn.disabled = false;

        if (scopeValidation && !scopeValidation.hasEnhancedScopes) {
            exportBtn.disabled = true;
            exportBtn.title = 'Export requires enhanced ACC permissions';
        }
    }

    debugLog('ACC features enabled with scope limitations:', scopeValidation?.hasEnhancedScopes);
}

function setupUI() {
    const dateInput = document.getElementById('date');
    if (dateInput) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }
}

// =================================================================
// ENHANCED SAVE FUNCTIONALITY WITH FULL ACC INTEGRATION
// =================================================================

// Updated saveToACC function with enhanced scope awareness
async function saveToACC() {
    if (!isACCConnected) {
        alert('Not connected to ACC. Please check your connection.');
        return;
    }

    if (!projectId) {
        alert('Please select a project before saving.');
        return;
    }

    try {
        debugLog('=== STARTING SAVE TO ACC PROCESS ===');

        // Validate current scopes using JWT decoder before attempting save
        const scopeValidation = await validateTokenScopesWithJWT();
        debugLog('Current scope validation for save:', scopeValidation);

        debugLog('Current project context:', {
            projectId: projectId,
            hubId: hubId,
            projectTopFolderId: projectTopFolderId,
            bedQCFolderId: bedQCFolderId,
            reportId: currentCalculation?.reportId,
            bedName: currentCalculation?.bedName,
            hasEnhancedScopes: scopeValidation.hasEnhancedScopes
        });

        const saveBtn = document.getElementById('saveBtn');
        if (saveBtn) {
            saveBtn.disabled = true;

            if (scopeValidation.hasEnhancedScopes) {
                saveBtn.innerHTML = '<div class="loading"></div> Saving to ACC with enhanced permissions...';
            } else {
                saveBtn.innerHTML = '<div class="loading"></div> Saving locally (limited permissions)...';
            }
        }

        // Add quality compliance data
        const enhancedCalculation = {
            ...currentCalculation,
            status: 'Completed',
            createdDate: currentCalculation.timestamp,
            savedToACC: scopeValidation.hasEnhancedScopes,
            permissions: {
                scopesUsed: scopeValidation.grantedScopes,
                enhancedPermissions: scopeValidation.hasEnhancedScopes,
                dataWriteEnabled: scopeValidation.hasDataWrite,
                dataCreateEnabled: scopeValidation.hasDataCreate
            },
            qualityMetrics: {
                complianceStatus: 'Pass', // Could be calculated based on results
                deviations: [],
                approvalRequired: false,
                criticalResults: [
                    currentCalculation.selfStressing.outputs.calculatedPullRounded,
                    currentCalculation.nonSelfStressing.outputs.calculatedPullRounded
                ]
            }
        };

        debugLog('Enhanced calculation prepared for save');

        // Save to ACC Data Management API or local storage based on scope validation
        const result = await saveBedQCReportToACC(enhancedCalculation);

        debugLog('✓ Save process completed:', result);

        if (saveBtn) {
            saveBtn.disabled = false;

            if (result.method === 'acc-file-upload') {
                saveBtn.innerHTML = `
                    <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
                    </svg>
                    Saved to ACC
                `;
            } else {
                saveBtn.innerHTML = `
                    <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
                    </svg>
                    Saved Locally
                `;
            }
        }

        // Show appropriate success message based on storage method and scope validation
        let successMessage = `Report saved successfully!\nReport ID: ${result.reportId}`;

        if (result.method === 'acc-file-upload') {
            successMessage += `\n\n✅ Storage: ACC JSON File Upload\nFile Name: ${result.fileName}\nVersion ID: ${result.versionId}\nPermissions: Enhanced scopes confirmed`;
            if (result.debugInfo) {
                successMessage += `\n\nProject Context:\nProject ID: ${result.debugInfo.projectId}\nBedQC Folder: ${result.debugInfo.bedQCFolderId}`;
            }
        } else if (result.method === 'local-storage') {
            successMessage += `\n\n💾 Storage: Local browser storage`;

            if (result.customIntegrationRequired) {
                successMessage += `\n\n⚠️ Scope Issue: ${result.saveReason}`;
                successMessage += `\nReason: ${result.userMessage}`;
                successMessage += `\n\nTo enable ACC file uploads:`;
                successMessage += `\n• Register Client ID as Custom Integration in ACC Account Admin`;
                successMessage += `\n• Enable "Document Management" access level`;
                successMessage += `\n• Set integration status to "Active"`;
                successMessage += `\n• Log out and back in to refresh scopes`;
                successMessage += `\n\nClient ID: ${ACC_CLIENT_ID}`;
            } else if (result.error) {
                successMessage += `\n\nNote: ACC upload failed, saved locally instead`;
                successMessage += `\nError: ${result.error}`;
                if (result.troubleshootingSteps && result.troubleshootingSteps.length > 0) {
                    successMessage += `\n\nTroubleshooting:\n• ${result.troubleshootingSteps.slice(0, 3).join('\n• ')}`;
                }
            }

            if (result.permissionsNote) {
                successMessage += `\n\n${result.permissionsNote}`;
            }
        }

        // Show success dialog with action buttons
        showSaveSuccessDialog(result, successMessage);

        // Refresh report history to show the new report
        await refreshReportHistory();

    } catch (error) {
        debugLog('Save process failed completely:', error);
        console.error('Save failed:', error);

        const saveBtn = document.getElementById('saveBtn');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = `
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
                </svg>
                Save Report
            `;
        }

        // Provide detailed error information
        let errorMessage = 'Failed to save report.\n\n';
        errorMessage += `Error: ${error.message}\n\n`;
        errorMessage += 'This might be due to:\n';
        errorMessage += '• Network connectivity issues\n';
        errorMessage += '• OAuth scope configuration problems\n';
        errorMessage += '• Missing Custom Integration setup in ACC\n';
        errorMessage += '• Project configuration issues\n\n';
        errorMessage += `Current scopes: Check browser console for detailed scope information\n\n`;
        errorMessage += `Project ID: ${projectId}\n`;
        errorMessage += `Hub ID: ${hubId}\n\n`;
        errorMessage += 'The calculation is still available in your browser session.\n';
        errorMessage += 'Check the browser console for detailed debugging information.';

        alert(errorMessage);
    }
}

// Show save success dialog with actionable information
function showSaveSuccessDialog(result, message) {
    const successModal = document.createElement('div');
    successModal.className = 'modal-overlay';
    successModal.style.zIndex = '3000';

    let actionButtons = '';
    let statusIcon = '';
    let statusColor = '';

    if (result.method === 'acc-file-upload') {
        statusIcon = '☁️';
        statusColor = '#059669';
        actionButtons = `
            <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove()">
                Continue Working
            </button>
            <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove(); refreshReportHistory()">
                View All Reports
            </button>
        `;
    } else {
        statusIcon = '💾';
        statusColor = '#f59e0b';

        if (result.customIntegrationRequired) {
            actionButtons = `
                <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">
                    Continue Working
                </button>
                <button class="btn btn-primary" onclick="window.open('https://docs.autodesk.com/en/docs/acc/v1/tutorials/getting-started/manage-access-to-docs/', '_blank'); this.closest('.modal-overlay').remove()">
                    Setup ACC Integration
                </button>
            `;
        } else {
            actionButtons = `
                <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove()">
                    Continue Working
                </button>
                <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove(); refreshReportHistory()">
                    View All Reports
                </button>
            `;
        }
    }

    successModal.innerHTML = `
        <div class="modal" style="max-width: 500px;">
            <div class="modal-header">
                <h3 class="modal-title" style="color: ${statusColor};">
                    ${statusIcon} Report Saved Successfully
                </h3>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
            </div>
            <div class="modal-content">
                <div style="background: #f8f9fa; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; font-family: monospace; font-size: 0.875rem; white-space: pre-line; line-height: 1.4;">
${message}
                </div>
            </div>
            <div class="modal-actions">
                ${actionButtons}
            </div>
        </div>
    `;

    document.body.appendChild(successModal);
    successModal.classList.add('active');

    // Auto-remove after 15 seconds if user doesn't interact
    setTimeout(() => {
        if (document.body.contains(successModal)) {
            successModal.remove();
        }
    }, 15000);
}

async function exportToACCDocs() {
    alert('Export functionality with enhanced permissions - full implementation available in production version.');
}

function generatePDF() {
    alert('PDF generation functionality with enhanced permissions - full implementation available in production version.');
}

// =================================================================
// ENHANCED REPORT HISTORY FUNCTIONALITY
// =================================================================

async function initializeReportHistory() {
    try {
        debugLog('Initializing report history with enhanced permissions...');

        // Add Report History section to the page
        addReportHistorySection();

        // Load existing reports
        await refreshReportHistory();

        debugLog('Report history initialization completed');

    } catch (error) {
        debugLog('Error initializing report history:', error);
        console.error('Error initializing report history:', error);
    }
}

function addReportHistorySection() {
    const container = document.querySelector('.container');
    if (!container) return;

    const historySection = document.createElement('div');
    historySection.innerHTML = `
        <!-- Report History Section -->
        <div class="card" id="reportHistorySection" style="margin-top: 2rem;">
            <h3 class="card-title">
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M13,3A9,9 0 0,0 4,12H1L4.89,15.89L4.96,16.03L9,12H6A7,7 0 0,1 13,5A7,7 0 0,1 20,12A7,7 0 0,1 13,19C11.07,19 9.32,18.21 8.06,16.94L6.64,18.36C8.27,20 10.5,21 13,21A9,9 0 0,0 22,12A9,9 0 0,0 13,3Z"/>
                </svg>
                Report History (Enhanced Permissions)
                <button class="btn btn-secondary" onclick="refreshReportHistory()" style="margin-left: auto;">
                    <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z"/>
                    </svg>
                    Refresh
                </button>
            </h3>
            
            <!-- Reports List -->
            <div id="reportsList">
                <div style="text-align: center; color: #6b7280; padding: 2rem;">
                    <div class="loading"></div>
                    <p>Loading reports with enhanced permissions...</p>
                </div>
            </div>
        </div>
    `;

    container.appendChild(historySection);
}

async function refreshReportHistory() {
    try {
        debugLog('=== REFRESHING REPORT HISTORY ===');

        const reportsList = document.getElementById('reportsList');
        if (!reportsList) return;

        reportsList.innerHTML = `
            <div style="text-align: center; color: #6b7280; padding: 2rem;">
                <div class="loading"></div>
                <p>Loading reports from ACC with enhanced permissions...</p>
            </div>
        `;

        // Load reports from ACC
        existingReports = await loadBedQCReportsFromACC(projectId);

        // Display reports
        displayReports(existingReports);

        debugLog(`✓ Report history refreshed - loaded ${existingReports.length} reports for display`);

    } catch (error) {
        debugLog('Error refreshing report history:', error);
        console.error('Error refreshing report history:', error);
        const reportsList = document.getElementById('reportsList');
        if (reportsList) {
            reportsList.innerHTML = `
                <div style="text-align: center; color: #dc2626; padding: 2rem;">
                    <p>Error loading reports: ${error.message}</p>
                    <small>Required permissions: ${ACC_SCOPES}</small><br>
                    <small>Project ID: ${projectId}</small><br>
                    <small>Hub ID: ${hubId}</small><br>
                    <button class="btn btn-secondary" onclick="refreshReportHistory()">Try Again</button>
                </div>
            `;
        }
    }
}

function displayReports(reports) {
    const reportsList = document.getElementById('reportsList');
    if (!reportsList) return;

    if (reports.length === 0) {
        reportsList.innerHTML = `
            <div style="text-align: center; color: #6b7280; padding: 2rem;">
                <svg width="48" height="48" fill="currentColor" viewBox="0 0 24 24" style="margin-bottom: 1rem; opacity: 0.5;">
                    <path d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 002 2z"/>
                </svg>
                <p>No reports found. Create your first Bed QC report!</p>
                <button class="btn btn-primary" onclick="showBedSelection()">Create New Report</button>
            </div>
        `;
        return;
    }

    const reportsHTML = reports.map(report => {
        let data = null;
        let bedName = '';
        let reportId = '';
        let projectName = '';
        let createdBy = '';
        let status = 'Draft';
        let formattedDate = '';
        let selfStressPull = 0;
        let nonSelfStressPull = 0;
        let notes = '';
        let permissions = 'basic';
        let errorInfo = null;

        if (report.data && report.data.reportData) {
            data = report.data.reportData;
            bedName = data.bedName || '';
            reportId = data.reportId || '';
            projectName = data.projectName || '';
            createdBy = data.calculatedBy || '';
            status = data.status || 'Draft';
            notes = data.notes || '';
            selfStressPull = data.selfStressing?.outputs?.calculatedPullRounded || 0;
            nonSelfStressPull = data.nonSelfStressing?.outputs?.calculatedPullRounded || 0;
            permissions = data.permissions?.enhancedPermissions ? 'enhanced' : 'basic';
            errorInfo = report.errorInfo;

            const date = new Date(data.createdDate || data.timestamp || report.lastModified);
            formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
        } else {
            // ACC file without local data
            const parts = report.displayName?.split(' - ') || ['', ''];
            bedName = parts[0] || 'Unknown Bed';
            reportId = parts[1] || 'Unknown ID';
            status = 'Completed';
            permissions = report.permissions || 'basic';

            const date = new Date(report.lastModified);
            formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
        }

        // Determine status badge style
        let statusClass = 'status-development';
        if (status === 'Completed') statusClass = 'status-active';
        if (status === 'Approved') statusClass = 'status-active';

        // Determine storage source indicator
        let sourceIndicator = '';
        let sourceClass = '';
        if (report.source === 'local') {
            sourceIndicator = '💾 Local';
            sourceClass = 'background: #fef3c7; color: #92400e;';
        } else if (report.source === 'acc-file') {
            sourceIndicator = '☁️ ACC File';
            sourceClass = 'background: #dcfce7; color: #166534;';
        } else {
            sourceIndicator = '💾 Stored';
            sourceClass = 'background: #e0e7ff; color: #3730a3;';
        }

        // Permission indicator
        const permissionIndicator = permissions === 'enhanced' ? '🔓 Enhanced' : '🔒 Basic';
        const permissionClass = permissions === 'enhanced' ? 'background: #dcfce7; color: #166534;' : 'background: #fef3c7; color: #92400e;';

        // Error indicator
        let errorIndicator = '';
        if (errorInfo) {
            errorIndicator = `
                <span style="padding: 0.25rem 0.5rem; border-radius: 12px; font-size: 0.75rem; font-weight: 500; background: #fee2e2; color: #991b1b;" title="${errorInfo.analysis}">
                    ⚠️ Sync Issue
                </span>
            `;
        }

        return `
            <div class="tool-card" style="margin-bottom: 1rem; cursor: pointer;" 
                 onclick="loadExistingReport('${report.itemId}', ${report.needsDownload || false})">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
                    <div>
                        <h4 style="font-size: 1.125rem; font-weight: 600; color: #1e293b; margin-bottom: 0.5rem;">
                            ${bedName} - ${reportId}
                        </h4>
                        <div style="display: flex; gap: 1rem; font-size: 0.875rem; color: #6b7280;">
                            <span><strong>Project:</strong> ${projectName || 'N/A'}</span>
                            <span><strong>Date:</strong> ${formattedDate}</span>
                            <span><strong>By:</strong> ${createdBy || 'Unknown'}</span>
                        </div>
                    </div>
                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                        <span class="status-badge ${statusClass}">${status}</span>
                        <span style="padding: 0.25rem 0.5rem; border-radius: 12px; font-size: 0.75rem; font-weight: 500; ${sourceClass}">${sourceIndicator}</span>
                        <span style="padding: 0.25rem 0.5rem; border-radius: 12px; font-size: 0.75rem; font-weight: 500; ${permissionClass}">${permissionIndicator}</span>
                        ${errorIndicator}
                        <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;" 
                                onclick="event.stopPropagation(); deleteReport('${report.itemId}', '${reportId}', ${report.source === 'acc-file'})">
                            <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/>
                            </svg>
                        </button>
                    </div>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                    <div style="background: #eff6ff; padding: 0.75rem; border-radius: 6px;">
                        <div style="font-size: 0.75rem; color: #2563eb; font-weight: 500; margin-bottom: 0.25rem;">Self-Stressing Pull</div>
                        <div style="font-size: 1.125rem; font-weight: 600; color: #1e293b;">${selfStressPull.toLocaleString()} lbs</div>
                    </div>
                    <div style="background: #f0fdf4; padding: 0.75rem; border-radius: 6px;">
                        <div style="font-size: 0.75rem; color: #059669; font-weight: 500; margin-bottom: 0.25rem;">Non-Self-Stressing Pull</div>
                        <div style="font-size: 1.125rem; font-weight: 600; color: #1e293b;">${nonSelfStressPull.toLocaleString()} lbs</div>
                    </div>
                </div>
                
                ${notes ? `<div style="font-size: 0.875rem; color: #6b7280; font-style: italic;">"${notes}"</div>` : ''}
                
                <div style="margin-top: 1rem; font-size: 0.75rem; color: #9ca3af;">
                    ${report.needsDownload ? 'Will download from ACC when opened' : 'Ready to load'} | ${permissions} permissions | Click to open and edit
                    ${errorInfo ? `<br><span style="color: #dc2626;">Issue: ${errorInfo.analysis}</span>` : ''}
                </div>
            </div>
        `;
    }).join('');

    reportsList.innerHTML = reportsHTML;
}

// Load Existing Report
async function loadExistingReport(itemId, needsDownload = false) {
    try {
        debugLog('=== LOADING EXISTING REPORT ===');
        debugLog('Item ID:', itemId);
        debugLog('Needs Download:', needsDownload);

        let reportData = null;

        if (needsDownload) {
            // Download from ACC
            const reportContent = await downloadReportFromACC(itemId);
            reportData = reportContent.reportData;
        } else {
            // Find the report in our loaded data
            const reportObj = existingReports.find(r => r.itemId === itemId);
            if (!reportObj) {
                throw new Error('Report not found in loaded data');
            }
            reportData = reportObj.data.reportData;
        }

        // Set up form instance
        currentReportId = reportData.reportId;
        currentBedId = reportData.bedId;
        currentBedName = reportData.bedName;
        currentCalculation = reportData;

        debugLog('Report data loaded:', {
            reportId: currentReportId,
            bedId: currentBedId,
            bedName: currentBedName
        });

        // Show calculator modal
        showCalculator();

        // Populate form with existing data
        populateFormWithReportData(reportData);

        // Update UI to show this is an existing report
        const reportIdElement = document.getElementById('reportId');
        const selectedBedDisplayElement = document.getElementById('selectedBedDisplay');
        const saveBtn = document.getElementById('saveBtn');
        const exportBtn = document.getElementById('exportBtn');

        const permissionText = reportData.permissions?.enhancedPermissions ? ' (Enhanced Permissions)' : ' (Basic Permissions)';

        if (reportIdElement) reportIdElement.textContent = reportData.reportId + ' (Loaded from Storage)' + permissionText;
        if (selectedBedDisplayElement) selectedBedDisplayElement.textContent = reportData.bedName;
        if (saveBtn) saveBtn.disabled = false;
        if (exportBtn) exportBtn.disabled = false;

        debugLog('✓ Successfully loaded existing report');

    } catch (error) {
        debugLog('Error loading existing report:', error);
        console.error('Error loading existing report:', error);
        alert('Failed to load report: ' + error.message);
    }
}

// Populate Form with Report Data
function populateFormWithReportData(data) {
    debugLog('Populating form with report data...');

    // Project metadata
    if (data.projectName) {
        const projectSelect = document.getElementById('projectName');
        if (projectSelect) {
            // Find and select the matching project
            for (let option of projectSelect.options) {
                if (option.textContent.includes(data.projectName)) {
                    option.selected = true;
                    break;
                }
            }
        }
    }

    // Set form values safely
    setElementValue('projectNumber', data.projectNumber || '');
    setElementValue('date', data.date || '');
    setElementValue('calculatedBy', data.calculatedBy || '');
    setElementValue('reviewedBy', data.reviewedBy || '');
    setElementValue('location', data.location || '');
    setElementValue('notes', data.notes || '');

    // Self-stressing inputs
    if (data.selfStressing?.inputs) {
        const inputs = data.selfStressing.inputs;
        setElementValue('ss_initialPull', inputs.initialPull || '');
        setElementValue('ss_requiredForce', inputs.requiredForce || '');
        setElementValue('ss_MOE', inputs.MOE || '');
        setElementValue('ss_numberOfStrands', inputs.numberOfStrands || '');
        setElementValue('ss_adjBedShortening', inputs.adjBedShortening || '');
        setElementValue('ss_blockToBlockLength', inputs.blockToBlockLength || '');
        setElementValue('ss_strandSize', inputs.strandSize || '');
        setElementValue('ss_strandArea', inputs.strandArea || '');
        setElementValue('ss_deadEndSeating', inputs.deadEndSeating || '');
        setElementValue('ss_liveEndSeating', inputs.liveEndSeating || '');
    }

    // Non-self-stressing inputs
    if (data.nonSelfStressing?.inputs) {
        const inputs = data.nonSelfStressing.inputs;
        setElementValue('nss_initialPull', inputs.initialPull || '');
        setElementValue('nss_requiredForce', inputs.requiredForce || '');
        setElementValue('nss_MOE', inputs.MOE || '');
        setElementValue('nss_blockToBlockLength', inputs.blockToBlockLength || '');
        setElementValue('nss_strandSize', inputs.strandSize || '');
        setElementValue('nss_strandArea', inputs.strandArea || '');
        setElementValue('nss_airTemp', inputs.airTemp || '');
        setElementValue('nss_concreteTemp', inputs.concreteTemp || '');
        setElementValue('nss_deadEndSeating', inputs.deadEndSeating || '');
        setElementValue('nss_liveEndSeating', inputs.liveEndSeating || '');
        setElementValue('nss_totalAbutmentRotation', inputs.totalAbutmentRotation || '');
    }

    // Recalculate to update results
    calculateAll();

    debugLog('Form populated and calculations updated');
}

function setElementValue(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.value = value;
    }
}

// Delete Report
async function deleteReport(itemId, reportId, isACCFile = false) {
    if (!confirm(`Are you sure you want to delete report "${reportId}"? This action cannot be undone.`)) {
        return;
    }

    try {
        debugLog('Deleting report:', itemId, reportId, isACCFile);

        await deleteBedQCReportFromACC(itemId, isACCFile);

        // Remove from local array
        existingReports = existingReports.filter(r => r.itemId !== itemId);

        // Refresh display
        displayReports(existingReports);

        alert('Report deleted successfully');

        debugLog('Report deleted and display refreshed');

    } catch (error) {
        debugLog('Error deleting report:', error);
        console.error('Error deleting report:', error);
        alert('Failed to delete report: ' + error.message);
    }
}

// Modal click outside to close
function setupModalHandlers() {
    const bedSelectionModal = document.getElementById('bedSelectionModal');
    if (bedSelectionModal) {
        bedSelectionModal.addEventListener('click', function (e) {
            if (e.target === this) {
                closeBedSelection();
            }
        });
    }

    const calculatorModal = document.getElementById('calculatorModal');
    if (calculatorModal) {
        calculatorModal.addEventListener('click', function (e) {
            if (e.target === this) {
                closeCalculator();
            }
        });
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function () {
    console.log('Quality Control page loaded with enhanced ACC permissions');
    console.log('Requesting scopes:', ACC_SCOPES);
    console.log('Debug mode enabled:', debugMode);
    setupUI();
    setupModalHandlers();
    initializeApp();
});