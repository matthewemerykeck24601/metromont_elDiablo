// ACC CONNECT CONFIGURATION
const ACC_CLIENT_ID = 'phUPKRBuqECpJUoBmRuKdKhSP3ZTRALH4LMWKAzAnymnYkQU';
const ACC_CALLBACK_URL = 'https://metrocastpro.com/';

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

// Authentication Flow
async function initializeApp() {
    try {
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

        // Load project data
        await loadRealProjectData();

        // Test enhanced permissions for file operations
        updateAuthStatus('Verifying Permissions...', 'Testing ACC file operation permissions...');

        // Test data write permissions by attempting to get a project's folders
        if (projectId) {
            try {
                const testResponse = await fetch(`${ACC_DATA_API_BASE}/projects/${projectId}/folders`, {
                    headers: {
                        'Authorization': `Bearer ${forgeAccessToken}`
                    }
                });

                if (testResponse.ok) {
                    console.log('✓ ACC folder access confirmed');
                } else {
                    console.warn('⚠ Limited ACC folder access - some features may be restricted');
                }
            } catch (error) {
                console.warn('⚠ Could not test folder access:', error);
            }
        }

        // Authentication complete
        isACCConnected = true;

        // Show success and hide auth overlay
        updateAuthStatus('Success!', 'Successfully connected to ACC with enhanced permissions');

        // Small delay to show success message
        await new Promise(resolve => setTimeout(resolve, 800));

        // Hide auth overlay and show main content
        if (authProcessing) {
            authProcessing.classList.remove('active');
        }
        document.body.classList.remove('auth-loading');

        // Show auth status badge
        const authStatusBadge = document.getElementById('authStatusBadge');
        if (authStatusBadge) {
            authStatusBadge.style.display = 'inline-flex';
        }

        // Enable ACC features
        enableACCFeatures();

        // Initialize dropdowns
        initializeDropdowns();

        // Initialize report history
        await initializeReportHistory();

        console.log('Authentication completed successfully');
        console.log('Available scopes:', ACC_SCOPES);

    } catch (error) {
        console.error('Authentication completion failed:', error);
        showAuthError('Failed to load project data: ' + error.message);
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
    updateAuthStatus('Authentication Error', message);
    if (authProcessing) {
        authProcessing.innerHTML = `
            <div class="auth-processing-content">
                <div style="color: #dc2626; font-size: 2rem; margin-bottom: 1rem;">⚠️</div>
                <h3 style="color: #dc2626;">Authentication Error</h3>
                <p style="color: #6b7280; margin-bottom: 1.5rem;">${message}</p>
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
// ENHANCED ACC DATA MANAGEMENT API FUNCTIONS
// =================================================================

// Get project's top folder with improved error handling and permission checking
async function getProjectTopFolder(projectId) {
    try {
        console.log('Attempting to get project folders for:', projectId);

        const response = await fetch(`${ACC_DATA_API_BASE}/projects/${projectId}/folders`, {
            headers: {
                'Authorization': `Bearer ${forgeAccessToken}`
            }
        });

        if (!response.ok) {
            if (response.status === 403) {
                console.warn('Insufficient permissions for folder access. Need data:read and data:write scopes.');
                return null;
            }
            console.warn(`Project folders not accessible (${response.status}). Using fallback storage method.`);
            return null;
        }

        const data = await response.json();
        const topFolders = data.data.filter(folder =>
            folder.attributes.name === 'Project Files' ||
            folder.attributes.extension?.type === 'folders:autodesk.bim360:Folder'
        );

        if (topFolders.length > 0) {
            projectTopFolderId = topFolders[0].id;
            console.log('✓ Found project top folder:', projectTopFolderId);
            return topFolders[0].id;
        } else {
            console.warn('No accessible folders found in project, using fallback');
            return null;
        }
    } catch (error) {
        console.warn('Error getting project folders, using fallback storage:', error);
        return null;
    }
}

// Create or find BedQC folder with enhanced permission handling
async function ensureBedQCFolder(projectId, parentFolderId) {
    try {
        if (!parentFolderId) {
            console.log('No parent folder available, using local storage');
            return null;
        }

        console.log('Ensuring BedQC folder exists...');

        // First, try to find existing BedQC folder
        const foldersResponse = await fetch(`${ACC_DATA_API_BASE}/projects/${projectId}/folders/${parentFolderId}/contents`, {
            headers: {
                'Authorization': `Bearer ${forgeAccessToken}`
            }
        });

        if (foldersResponse.ok) {
            const foldersData = await foldersResponse.json();
            const existingFolder = foldersData.data.find(item =>
                item.type === 'folders' &&
                item.attributes.name === 'BedQC Reports'
            );

            if (existingFolder) {
                bedQCFolderId = existingFolder.id;
                console.log('✓ Found existing BedQC folder:', bedQCFolderId);
                return existingFolder.id;
            }
        }

        // Create new BedQC folder
        console.log('Creating new BedQC Reports folder...');
        const createFolderResponse = await fetch(`${ACC_DATA_API_BASE}/projects/${projectId}/folders`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${forgeAccessToken}`,
                'Content-Type': 'application/vnd.api+json'
            },
            body: JSON.stringify({
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
            })
        });

        if (createFolderResponse.ok) {
            const folderData = await createFolderResponse.json();
            bedQCFolderId = folderData.data.id;
            console.log('✓ Created BedQC folder:', bedQCFolderId);
            return folderData.data.id;
        } else {
            const errorResponse = await createFolderResponse.text();
            console.warn('Failed to create folder:', errorResponse);
            return null;
        }
    } catch (error) {
        console.warn('Error ensuring BedQC folder, using fallback storage:', error);
        return null;
    }
}

// Enhanced JSON file upload to ACC with better error handling
async function uploadJSONToACC(projectId, folderId, fileName, jsonData) {
    try {
        if (!folderId) {
            throw new Error('No folder available for upload');
        }

        console.log('Uploading JSON file to ACC:', fileName);

        // Step 1: Create storage location
        const storageResponse = await fetch(`${ACC_DATA_API_BASE}/projects/${projectId}/storage`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${forgeAccessToken}`,
                'Content-Type': 'application/vnd.api+json'
            },
            body: JSON.stringify({
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
            })
        });

        if (!storageResponse.ok) {
            const errorText = await storageResponse.text();
            console.error('Storage creation failed:', errorText);
            throw new Error(`Failed to create storage location: ${storageResponse.status} - ${errorText}`);
        }

        const storageData = await storageResponse.json();
        const bucketKey = storageData.data.id;
        const uploadURL = storageData.data.attributes.location;

        console.log('✓ Storage location created:', bucketKey);

        // Step 2: Upload file content
        const fileContent = JSON.stringify(jsonData, null, 2);
        const uploadResponse = await fetch(uploadURL, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${forgeAccessToken}`
            },
            body: fileContent
        });

        if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            console.error('File upload failed:', errorText);
            throw new Error(`Failed to upload file: ${uploadResponse.status} - ${errorText}`);
        }

        console.log('✓ File uploaded successfully');

        // Step 3: Create first version
        const versionResponse = await fetch(`${ACC_DATA_API_BASE}/projects/${projectId}/versions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${forgeAccessToken}`,
                'Content-Type': 'application/vnd.api+json'
            },
            body: JSON.stringify({
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
            })
        });

        if (!versionResponse.ok) {
            const errorText = await versionResponse.text();
            console.error('Version creation failed:', errorText);
            throw new Error(`Failed to create version: ${versionResponse.status} - ${errorText}`);
        }

        const versionData = await versionResponse.json();
        console.log('✓ Version created successfully:', versionData.data.id);

        return {
            success: true,
            versionId: versionData.data.id,
            itemId: versionData.data.relationships?.item?.data?.id,
            storageId: bucketKey,
            method: 'acc-file-upload'
        };

    } catch (error) {
        console.error('Error uploading to ACC:', error);
        throw error;
    }
}

// Enhanced Bed QC Report saving with better error handling and fallback
async function saveBedQCReportToACC(reportData) {
    try {
        console.log('Saving Bed QC Report to ACC with enhanced permissions...');

        // Create the report content
        const reportContent = {
            type: 'bedqc-report',
            version: '1.0',
            timestamp: new Date().toISOString(),
            application: 'MetromontCastLink',
            module: 'QualityControl',
            schema: 'BedQCReport-v1',
            reportData: {
                ...reportData,
                savedToACC: true,
                accProjectId: projectId,
                accHubId: hubId,
                permissions: {
                    scopesUsed: ACC_SCOPES,
                    dataWriteEnabled: true,
                    dataCreateEnabled: true
                }
            }
        };

        // Try Method 1: Upload as JSON file to ACC
        try {
            console.log('Attempting Method 1: Upload JSON file to ACC...');

            // Get project folder access
            if (!projectTopFolderId) {
                await getProjectTopFolder(projectId);
            }

            // Get or create BedQC folder
            if (!bedQCFolderId && projectTopFolderId) {
                await ensureBedQCFolder(projectId, projectTopFolderId);
            }

            if (bedQCFolderId) {
                // Generate filename
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const fileName = `BedQC-${reportData.bedName}-${reportData.reportId}-${timestamp}.json`;

                // Upload the file
                const uploadResult = await uploadJSONToACC(projectId, bedQCFolderId, fileName, reportContent);

                console.log('✓ Successfully uploaded report to ACC:', uploadResult);

                return {
                    success: true,
                    versionId: uploadResult.versionId,
                    itemId: uploadResult.itemId,
                    fileName: fileName,
                    reportId: reportData.reportId,
                    method: 'acc-file-upload',
                    permissions: 'enhanced'
                };
            } else {
                throw new Error('No ACC folder access available - check data:write permissions');
            }

        } catch (method1Error) {
            console.warn('Method 1 (file upload) failed:', method1Error);

            // Method 2: Enhanced local storage with project sync
            console.log('Using Method 2: Enhanced local storage with sync capability...');

            const storageKey = `bedqc_${projectId}_${reportData.reportId}`;
            const storageData = {
                ...reportContent,
                storedLocally: true,
                needsACCSync: true,
                storageMethod: 'local-fallback',
                uploadError: method1Error.message,
                retryCount: 0,
                lastRetryAttempt: null,
                projectHasFileAccess: !!projectTopFolderId,
                permissionsRequested: ACC_SCOPES
            };

            localStorage.setItem(storageKey, JSON.stringify(storageData));

            // Store list of all reports for this project
            const projectReportsKey = `bedqc_reports_${projectId}`;
            const existingReports = JSON.parse(localStorage.getItem(projectReportsKey) || '[]');

            if (!existingReports.includes(reportData.reportId)) {
                existingReports.push(reportData.reportId);
                localStorage.setItem(projectReportsKey, JSON.stringify(existingReports));
            }

            let warningMessage = 'Report saved locally with enhanced project sync capability.';
            if (!projectTopFolderId) {
                warningMessage = 'Report saved locally. ACC folder access requires data:write permissions.';
            } else {
                warningMessage = 'Report saved locally. File upload failed - enhanced permissions may be needed.';
            }

            return {
                success: true,
                projectId: projectId,
                reportId: reportData.reportId,
                storageKey: storageKey,
                method: 'local-storage',
                warning: warningMessage,
                error: method1Error.message,
                canRetry: !!projectTopFolderId,
                permissionsNote: 'Enhanced scopes requested: ' + ACC_SCOPES
            };
        }

    } catch (error) {
        console.error('All save methods failed:', error);
        throw new Error(`Failed to save report: ${error.message}`);
    }
}

// Load reports using enhanced approach
async function loadBedQCReportsFromACC(projectId) {
    try {
        console.log('Loading reports using enhanced permissions...');
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
                const folderContentsResponse = await fetch(`${ACC_DATA_API_BASE}/projects/${projectId}/folders/${bedQCFolderId}/contents`, {
                    headers: {
                        'Authorization': `Bearer ${forgeAccessToken}`
                    }
                });

                if (folderContentsResponse.ok) {
                    const contentsData = await folderContentsResponse.json();
                    console.log('✓ Found items in BedQC folder:', contentsData.data.length);

                    for (const item of contentsData.data) {
                        if (item.type === 'items' && item.attributes.name.endsWith('.json')) {
                            try {
                                // Get the latest version of the item
                                const versionsResponse = await fetch(`${ACC_DATA_API_BASE}/projects/${projectId}/items/${item.id}/versions`, {
                                    headers: {
                                        'Authorization': `Bearer ${forgeAccessToken}`
                                    }
                                });

                                if (versionsResponse.ok) {
                                    const versionsData = await versionsResponse.json();
                                    if (versionsData.data.length > 0) {
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
                                    }
                                }
                            } catch (itemError) {
                                console.warn('Could not process item:', item.attributes.name, itemError);
                            }
                        }
                    }
                }
            }
        } catch (accError) {
            console.warn('Could not load from ACC folder:', accError);
        }

        // Method 2: Load from local storage
        const projectReportsKey = `bedqc_reports_${projectId}`;
        const localReportIds = JSON.parse(localStorage.getItem(projectReportsKey) || '[]');

        console.log('Found local report IDs:', localReportIds);

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
                            displayName: `${reportData.reportData.bedName} - ${reportData.reportData.reportId}`,
                            data: reportData,
                            source: reportData.storedLocally ? 'local' : 'local-synced',
                            permissions: reportData.permissionsRequested || 'basic'
                        });
                    }
                } catch (parseError) {
                    console.warn('Could not parse report:', reportId, parseError);
                }
            }
        }

        // Sort by date (newest first)
        reports.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

        console.log(`✓ Loaded ${reports.length} reports from various sources`);
        return reports;

    } catch (error) {
        console.error('Error loading reports:', error);
        return [];
    }
}

// Download report content from ACC
async function downloadReportFromACC(versionId) {
    try {
        console.log('Downloading report from ACC:', versionId);

        // Get download URL
        const downloadResponse = await fetch(`${ACC_DATA_API_BASE}/projects/${projectId}/versions/${versionId}/downloads`, {
            headers: {
                'Authorization': `Bearer ${forgeAccessToken}`
            }
        });

        if (!downloadResponse.ok) {
            throw new Error(`Failed to get download URL: ${downloadResponse.status}`);
        }

        const downloadData = await downloadResponse.json();
        const downloadUrl = downloadData.data.attributes.location;

        // Download the file content
        const contentResponse = await fetch(downloadUrl, {
            headers: {
                'Authorization': `Bearer ${forgeAccessToken}`
            }
        });

        if (!contentResponse.ok) {
            throw new Error(`Failed to download file: ${contentResponse.status}`);
        }

        const reportContent = await contentResponse.json();
        console.log('✓ Successfully downloaded report from ACC');

        return reportContent;

    } catch (error) {
        console.error('Error downloading report from ACC:', error);
        throw error;
    }
}

// Delete report (works with enhanced permissions)
async function deleteBedQCReportFromACC(itemId, isACCFile = false) {
    try {
        console.log('Deleting report:', itemId);

        if (isACCFile && itemId.startsWith('urn:')) {
            // Try to delete from ACC with enhanced permissions
            try {
                const deleteResponse = await fetch(`${ACC_DATA_API_BASE}/projects/${projectId}/items/${itemId}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${forgeAccessToken}`
                    }
                });

                if (deleteResponse.ok) {
                    console.log('✓ Report deleted from ACC');
                    return true;
                } else {
                    console.warn('Could not delete from ACC, removing from local list only');
                }
            } catch (accDeleteError) {
                console.warn('ACC delete failed:', accDeleteError);
            }
        }

        // Remove from local storage
        localStorage.removeItem(itemId);

        // Remove from project reports list if it's a storage key
        if (itemId.startsWith('bedqc_')) {
            const projectReportsKey = `bedqc_reports_${projectId}`;
            const existingReports = JSON.parse(localStorage.getItem(projectReportsKey) || '[]');
            const reportIdToRemove = itemId.split('_').pop(); // Extract report ID from storage key

            const updatedReports = existingReports.filter(id => id !== reportIdToRemove);
            localStorage.setItem(projectReportsKey, JSON.stringify(updatedReports));
        }

        console.log('✓ Report deleted from storage');
        return true;

    } catch (error) {
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
}

// =================================================================
// PROJECT DATA LOADING AND MANAGEMENT
// =================================================================

async function loadRealProjectData() {
    try {
        console.log('Starting to load real project data with enhanced permissions...');

        const hubsResponse = await fetch('https://developer.api.autodesk.com/project/v1/hubs', {
            headers: {
                'Authorization': `Bearer ${forgeAccessToken}`
            }
        });

        if (!hubsResponse.ok) {
            const errorText = await hubsResponse.text();
            console.error('Hubs response error:', hubsResponse.status, errorText);
            throw new Error(`Failed to load hubs: ${hubsResponse.status} ${errorText}`);
        }

        const hubsData = await hubsResponse.json();
        console.log('Hubs data received:', hubsData);

        const accHubs = hubsData.data.filter(hub =>
            hub.attributes.extension?.type === 'hubs:autodesk.bim360:Account'
        );

        console.log('ACC hubs found:', accHubs.length);

        if (accHubs.length > 0) {
            const firstAccHub = accHubs[0];
            hubId = firstAccHub.id;
            console.log('Using ACC hub:', firstAccHub.attributes.name, hubId);

            await loadProjectsFromHub(hubId);
        } else {
            console.warn('No ACC hubs found in response');
            throw new Error('No ACC hubs found - only Fusion 360 hubs available');
        }

        console.log('✓ Project data loading completed successfully');

    } catch (error) {
        console.error('Failed to load project data:', error);

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
            accDetails.innerHTML = `
                <div style="color: #dc2626;">
                    <strong>Project Loading Issue:</strong> ${error.message}<br>
                    <small>You can still use the calculator by entering project details manually</small><br>
                    <small><em>Note: Projects must follow format "12345 - Project Name" to appear in dropdown</em></small><br>
                    <small><em>Reports will be saved locally with enhanced sync capability</em></small><br>
                    <small><em>Enhanced permissions requested: ${ACC_SCOPES}</em></small>
                </div>
            `;
        }
    }
}

async function loadProjectsFromHub(hubId) {
    try {
        console.log('Loading projects from ACC hub:', hubId);

        const projectsResponse = await fetch(`https://developer.api.autodesk.com/project/v1/hubs/${hubId}/projects`, {
            headers: {
                'Authorization': `Bearer ${forgeAccessToken}`
            }
        });

        if (!projectsResponse.ok) {
            throw new Error('Failed to load projects');
        }

        const projectsData = await projectsResponse.json();
        console.log('ACC projects data received:', projectsData);

        const projects = await Promise.all(projectsData.data.map(async (project) => {
            console.log('Processing ACC project:', project.attributes.name);

            // First, check if project name matches the required format: "12345 - Project name"
            const projectNamePattern = /^(\d{5})\s*-\s*(.+)$/;
            const nameMatch = project.attributes.name.match(projectNamePattern);

            if (!nameMatch) {
                console.log('Skipping project (does not match format):', project.attributes.name);
                return null;
            }

            const projectNumberFromName = nameMatch[1];
            const projectDisplayName = nameMatch[2];

            let projectNumber = projectNumberFromName;
            let location = '';

            try {
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
                            projectNumber = accProjectNumber;
                        }

                        location = extData.location ||
                            extData.project_location ||
                            extData.address ||
                            extData.city ||
                            extData.state ||
                            extData.jobLocation ||
                            extData.site || '';
                    }
                }
            } catch (detailError) {
                console.warn('Could not get detailed project info for', project.attributes.name, ':', detailError);
            }

            return {
                id: project.id,
                name: project.attributes.name || 'Unnamed Project',
                displayName: projectDisplayName,
                number: projectNumber,
                numericSort: parseInt(projectNumberFromName, 10),
                location: location || 'Location not specified',
                fullData: project,
                permissions: 'enhanced'
            };
        }));

        const filteredProjects = projects.filter(project => project !== null);

        if (filteredProjects.length === 0) {
            console.warn('No projects matched the required format "12345 - Project Name"');
            throw new Error('No projects found matching required format "12345 - Project Name"');
        }

        const sortedProjects = filteredProjects.sort((a, b) => a.numericSort - b.numericSort);

        populateProjectDropdown(sortedProjects);

        if (sortedProjects.length > 0) {
            setTimeout(() => {
                const projectSelect = document.getElementById('projectName');
                if (projectSelect) {
                    projectSelect.value = sortedProjects[0].id;
                    projectId = sortedProjects[0].id;
                    onProjectSelected();
                }
            }, 100);
        }

    } catch (error) {
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

        const accDetails = document.getElementById('accDetails');
        if (accDetails) {
            accDetails.innerHTML = `
                <strong>Status:</strong> Connected to ACC with enhanced permissions<br>
                <strong>Projects Found:</strong> ${projects.length} ACC projects (filtered by format)<br>
                <strong>Hub:</strong> Metromont ACC Account<br>
                <strong>Storage:</strong> JSON file upload to ACC with enhanced local fallback<br>
                <strong>Permissions:</strong> ${ACC_SCOPES}
            `;
        }

    } catch (error) {
        console.error('Error in populateProjectDropdown:', error);
        throw error;
    }
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

        console.log('✓ Project selected:', projectId, 'with', permissions, 'permissions');
    }
}

function enableACCFeatures() {
    const saveBtn = document.getElementById('saveBtn');
    const exportBtn = document.getElementById('exportBtn');

    if (saveBtn) saveBtn.disabled = false;
    if (exportBtn) exportBtn.disabled = false;
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

// Updated saveToACC function with enhanced permissions
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
        const saveBtn = document.getElementById('saveBtn');
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<div class="loading"></div> Saving to ACC with enhanced permissions...';
        }

        // Add quality compliance data
        const enhancedCalculation = {
            ...currentCalculation,
            status: 'Completed',
            createdDate: currentCalculation.timestamp,
            savedToACC: true,
            permissions: {
                scopesUsed: ACC_SCOPES,
                enhancedPermissions: true,
                dataWriteEnabled: true,
                dataCreateEnabled: true
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

        // Save to ACC Data Management API using enhanced permissions
        const result = await saveBedQCReportToACC(enhancedCalculation);

        console.log('✓ Successfully saved report with enhanced permissions:', result);

        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = `
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
                </svg>
                Saved Successfully
            `;
        }

        // Show appropriate success message based on storage method
        let successMessage = `Report saved successfully with enhanced permissions!\nReport ID: ${result.reportId}`;

        if (result.method === 'acc-file-upload') {
            successMessage += `\n\nStorage: ACC JSON File Upload (Enhanced)\nFile Name: ${result.fileName}\nVersion ID: ${result.versionId}\nPermissions: ${result.permissions}`;
        } else if (result.method === 'local-storage') {
            successMessage += `\n\nStorage: Local browser storage with enhanced project sync\nNote: ${result.warning || 'File upload failed - check permissions'}`;
            if (result.error) {
                successMessage += `\nError Details: ${result.error}`;
            }
            if (result.permissionsNote) {
                successMessage += `\n${result.permissionsNote}`;
            }
        }

        alert(successMessage);

        // Refresh report history to show the new report
        await refreshReportHistory();

    } catch (error) {
        console.error('Save failed:', error);

        const saveBtn = document.getElementById('saveBtn');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = `
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
                </svg>
                Save to ACC
            `;
        }

        // Provide detailed error information
        let errorMessage = 'Failed to save report to ACC.\n\n';
        errorMessage += `Error: ${error.message}\n\n`;
        errorMessage += 'This might be due to:\n';
        errorMessage += '• ACC API permissions need additional configuration\n';
        errorMessage += '• Project folder access restrictions\n';
        errorMessage += '• Network connectivity issues\n';
        errorMessage += '• Missing required scopes: data:write, data:create\n\n';
        errorMessage += `Current scopes requested: ${ACC_SCOPES}\n\n`;
        errorMessage += 'The calculation is still available in your browser session.';

        alert(errorMessage);
    }
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
        console.log('Initializing report history with enhanced permissions...');

        // Add Report History section to the page
        addReportHistorySection();

        // Load existing reports
        await refreshReportHistory();

    } catch (error) {
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

        console.log(`✓ Loaded ${existingReports.length} reports for display`);

    } catch (error) {
        console.error('Error refreshing report history:', error);
        const reportsList = document.getElementById('reportsList');
        if (reportsList) {
            reportsList.innerHTML = `
                <div style="text-align: center; color: #dc2626; padding: 2rem;">
                    <p>Error loading reports: ${error.message}</p>
                    <small>Required permissions: ${ACC_SCOPES}</small><br>
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
                </div>
            </div>
        `;
    }).join('');

    reportsList.innerHTML = reportsHTML;
}

// Load Existing Report
async function loadExistingReport(itemId, needsDownload = false) {
    try {
        console.log('Loading existing report:', itemId, 'needsDownload:', needsDownload);

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

        console.log('✓ Successfully loaded existing report');

    } catch (error) {
        console.error('Error loading existing report:', error);
        alert('Failed to load report: ' + error.message);
    }
}

// Populate Form with Report Data
function populateFormWithReportData(data) {
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
        await deleteBedQCReportFromACC(itemId, isACCFile);

        // Remove from local array
        existingReports = existingReports.filter(r => r.itemId !== itemId);

        // Refresh display
        displayReports(existingReports);

        alert('Report deleted successfully');

    } catch (error) {
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
    setupUI();
    setupModalHandlers();
    initializeApp();
});