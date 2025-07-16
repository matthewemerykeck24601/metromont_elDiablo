// ACC CONNECT CONFIGURATION
const ACC_CLIENT_ID = 'phUPKRBuqECpJUoBmRuKdKhSP3ZTRALH4LMWKAzAnymnYkQU';
const ACC_CALLBACK_URL = 'https://metrocastpro.com/';

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

// Form Instance Management
let currentReportId = null;
let currentBedId = null;
let currentBedName = null;
let reportInstances = new Map(); // Store multiple form instances
let existingReports = []; // Store loaded reports for search/filter

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

        // Authentication complete
        isACCConnected = true;

        // Show success and hide auth overlay
        updateAuthStatus('Success!', 'Successfully connected to ACC');

        // Small delay to show success message
        await new Promise(resolve => setTimeout(resolve, 800));

        // Hide auth overlay and show main content
        authProcessing.classList.remove('active');
        document.body.classList.remove('auth-loading');

        // Show auth status badge
        document.getElementById('authStatusBadge').style.display = 'inline-flex';

        // Enable ACC features
        enableACCFeatures();

        // Initialize report history
        await initializeReportHistory();

        console.log('Authentication completed successfully');

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
    authTitle.textContent = title;
    authMessage.textContent = message;
}

function showAuthError(message) {
    updateAuthStatus('Authentication Error', message);
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
// ACC DATA MANAGEMENT API FUNCTIONS (FIXED APPROACH)
// =================================================================

// Get project's top folder
async function getProjectTopFolder(projectId) {
    try {
        const response = await fetch(`${ACC_DATA_API_BASE}/projects/${projectId}/folders`, {
            headers: {
                'Authorization': `Bearer ${forgeAccessToken}`
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to get project folders: ${response.status}`);
        }

        const data = await response.json();
        const topFolders = data.data.filter(folder =>
            folder.attributes.name === 'Project Files' ||
            folder.attributes.extension?.type === 'folders:autodesk.bim360:Folder'
        );

        if (topFolders.length > 0) {
            projectTopFolderId = topFolders[0].id;
            console.log('Found project top folder:', projectTopFolderId);
            return topFolders[0].id;
        } else {
            throw new Error('No accessible folders found in project');
        }
    } catch (error) {
        console.error('Error getting project top folder:', error);
        throw error;
    }
}

// Create or find BedQC folder
async function ensureBedQCFolder(projectId, parentFolderId) {
    try {
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
                console.log('Found existing BedQC folder:', bedQCFolderId);
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
            console.log('Created BedQC folder:', bedQCFolderId);
            return folderData.data.id;
        } else {
            const errorText = await createFolderResponse.text();
            console.error('Failed to create folder:', createFolderResponse.status, errorText);
            throw new Error(`Failed to create BedQC folder: ${createFolderResponse.status}`);
        }
    } catch (error) {
        console.error('Error ensuring BedQC folder:', error);
        throw error;
    }
}

// Upload JSON file to ACC
async function uploadJSONToACC(projectId, folderId, fileName, jsonData) {
    try {
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
            throw new Error(`Failed to create storage location: ${storageResponse.status} - ${errorText}`);
        }

        const storageData = await storageResponse.json();
        const bucketKey = storageData.data.id;
        const uploadURL = storageData.data.attributes.location;

        console.log('Storage location created:', bucketKey);

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
            throw new Error(`Failed to upload file: ${uploadResponse.status} - ${errorText}`);
        }

        console.log('File uploaded successfully');

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
            throw new Error(`Failed to create version: ${versionResponse.status} - ${errorText}`);
        }

        const versionData = await versionResponse.json();
        console.log('Version created successfully:', versionData.data.id);

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

// Save Bed QC Report to ACC (Fixed Implementation)
async function saveBedQCReportToACC(reportData) {
    try {
        console.log('Saving Bed QC Report to ACC using proper file upload...');

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
                accHubId: hubId
            }
        };

        // Try Method 1: Upload as JSON file to ACC
        try {
            console.log('Attempting Method 1: Upload JSON file to ACC...');

            // Ensure we have project folder access
            if (!projectTopFolderId) {
                await getProjectTopFolder(projectId);
            }

            // Ensure BedQC folder exists
            if (!bedQCFolderId) {
                await ensureBedQCFolder(projectId, projectTopFolderId);
            }

            // Generate filename
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = `BedQC-${reportData.bedName}-${reportData.reportId}-${timestamp}.json`;

            // Upload the file
            const uploadResult = await uploadJSONToACC(projectId, bedQCFolderId, fileName, reportContent);

            console.log('Successfully uploaded report to ACC:', uploadResult);

            return {
                success: true,
                versionId: uploadResult.versionId,
                itemId: uploadResult.itemId,
                fileName: fileName,
                reportId: reportData.reportId,
                method: 'acc-file-upload'
            };

        } catch (method1Error) {
            console.warn('Method 1 (file upload) failed:', method1Error);

            // Try Method 2: Store in local storage with enhanced metadata
            console.log('Attempting Method 2: Enhanced local storage...');

            const storageKey = `bedqc_${projectId}_${reportData.reportId}`;
            const storageData = {
                ...reportContent,
                storedLocally: true,
                needsACCSync: true,
                storageMethod: 'local-fallback',
                uploadError: method1Error.message,
                retryCount: 0,
                lastRetryAttempt: null
            };

            localStorage.setItem(storageKey, JSON.stringify(storageData));

            // Store list of all reports for this project
            const projectReportsKey = `bedqc_reports_${projectId}`;
            const existingReports = JSON.parse(localStorage.getItem(projectReportsKey) || '[]');

            if (!existingReports.includes(reportData.reportId)) {
                existingReports.push(reportData.reportId);
                localStorage.setItem(projectReportsKey, JSON.stringify(existingReports));
            }

            return {
                success: true,
                projectId: projectId,
                reportId: reportData.reportId,
                storageKey: storageKey,
                method: 'local-storage',
                warning: 'Report saved locally. File upload to ACC failed - check permissions.',
                error: method1Error.message
            };
        }

    } catch (error) {
        console.error('All save methods failed:', error);
        throw new Error(`Failed to save report: ${error.message}`);
    }
}

// Load reports using improved approach
async function loadBedQCReportsFromACC(projectId) {
    try {
        console.log('Loading reports using multiple methods...');
        const reports = [];

        // Method 1: Try to load from ACC BedQC folder
        try {
            if (!projectTopFolderId) {
                await getProjectTopFolder(projectId);
            }

            if (!bedQCFolderId) {
                await ensureBedQCFolder(projectId, projectTopFolderId);
            }

            const folderContentsResponse = await fetch(`${ACC_DATA_API_BASE}/projects/${projectId}/folders/${bedQCFolderId}/contents`, {
                headers: {
                    'Authorization': `Bearer ${forgeAccessToken}`
                }
            });

            if (folderContentsResponse.ok) {
                const contentsData = await folderContentsResponse.json();
                console.log('Found items in BedQC folder:', contentsData.data.length);

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
                                        // We'll need to download the file content when loading specific reports
                                        needsDownload: true
                                    });
                                }
                            }
                        } catch (itemError) {
                            console.warn('Could not process item:', item.attributes.name, itemError);
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
                            source: reportData.storedLocally ? 'local' : 'local-synced'
                        });
                    }
                } catch (parseError) {
                    console.warn('Could not parse report:', reportId, parseError);
                }
            }
        }

        // Sort by date (newest first)
        reports.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

        console.log(`Loaded ${reports.length} reports from various sources`);
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
        console.log('Successfully downloaded report from ACC');

        return reportContent;

    } catch (error) {
        console.error('Error downloading report from ACC:', error);
        throw error;
    }
}

// Delete report (works with our storage methods)
async function deleteBedQCReportFromACC(itemId, isACCFile = false) {
    try {
        console.log('Deleting report:', itemId);

        if (isACCFile && itemId.startsWith('urn:')) {
            // Try to delete from ACC
            try {
                const deleteResponse = await fetch(`${ACC_DATA_API_BASE}/projects/${projectId}/items/${itemId}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${forgeAccessToken}`
                    }
                });

                if (deleteResponse.ok) {
                    console.log('Report deleted from ACC');
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

        console.log('Report deleted from storage');
        return true;

    } catch (error) {
        console.error('Error deleting report:', error);
        throw error;
    }
}

// =================================================================
// REPORT HISTORY AND SEARCH FUNCTIONALITY
// =================================================================

// Initialize Report History
async function initializeReportHistory() {
    try {
        console.log('Initializing report history...');

        // Add Report History section to the page
        addReportHistorySection();

        // Load existing reports
        await refreshReportHistory();

    } catch (error) {
        console.error('Error initializing report history:', error);
    }
}

// Add Report History UI Section
function addReportHistorySection() {
    const container = document.querySelector('.container');

    const historySection = document.createElement('div');
    historySection.innerHTML = `
        <!-- Report History Section -->
        <div class="card" id="reportHistorySection" style="margin-top: 2rem;">
            <h3 class="card-title">
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M13,3A9,9 0 0,0 4,12H1L4.89,15.89L4.96,16.03L9,12H6A7,7 0 0,1 13,5A7,7 0 0,1 20,12A7,7 0 0,1 13,19C11.07,19 9.32,18.21 8.06,16.94L6.64,18.36C8.27,20 10.5,21 13,21A9,9 0 0,0 22,12A9,9 0 0,0 13,3Z"/>
                </svg>
                Report History
                <button class="btn btn-secondary" onclick="refreshReportHistory()" style="margin-left: auto;">
                    <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z"/>
                    </svg>
                    Refresh
                </button>
            </h3>
            
            <!-- Search and Filter Controls -->
            <div style="background: #f8fafc; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                <div class="grid grid-cols-3" style="gap: 1rem; margin-bottom: 1rem;">
                    <div class="form-group" style="margin-bottom: 0;">
                        <label style="font-size: 0.75rem;">Search Reports</label>
                        <input type="text" id="reportSearch" placeholder="Search by bed, notes, or report ID..." 
                               oninput="filterReports()" style="padding: 0.5rem;">
                    </div>
                    <div class="form-group" style="margin-bottom: 0;">
                        <label style="font-size: 0.75rem;">Filter by Bed</label>
                        <select id="bedFilter" onchange="filterReports()" style="padding: 0.5rem;">
                            <option value="">All Beds</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin-bottom: 0;">
                        <label style="font-size: 0.75rem;">Filter by Status</label>
                        <select id="statusFilter" onchange="filterReports()" style="padding: 0.5rem;">
                            <option value="">All Status</option>
                            <option value="Draft">Draft</option>
                            <option value="Completed">Completed</option>
                            <option value="Approved">Approved</option>
                            <option value="Review Required">Review Required</option>
                        </select>
                    </div>
                </div>
                <div class="grid grid-cols-3" style="gap: 1rem;">
                    <div class="form-group" style="margin-bottom: 0;">
                        <label style="font-size: 0.75rem;">Date From</label>
                        <input type="date" id="dateFromFilter" onchange="filterReports()" style="padding: 0.5rem;">
                    </div>
                    <div class="form-group" style="margin-bottom: 0;">
                        <label style="font-size: 0.75rem;">Date To</label>
                        <input type="date" id="dateToFilter" onchange="filterReports()" style="padding: 0.5rem;">
                    </div>
                    <div class="form-group" style="margin-bottom: 0;">
                        <label style="font-size: 0.75rem;">Sort By</label>
                        <select id="sortFilter" onchange="filterReports()" style="padding: 0.5rem;">
                            <option value="date-desc">Date (Newest First)</option>
                            <option value="date-asc">Date (Oldest First)</option>
                            <option value="bed">Bed Name</option>
                            <option value="status">Status</option>
                            <option value="reporter">Created By</option>
                        </select>
                    </div>
                </div>
                <div style="margin-top: 1rem; display: flex; gap: 0.5rem;">
                    <button class="btn btn-secondary" onclick="clearFilters()">Clear Filters</button>
                    <button class="btn btn-export" onclick="exportFilteredReports()">Export Results</button>
                    <span id="reportCount" style="margin-left: auto; color: #6b7280; font-size: 0.875rem; line-height: 2;"></span>
                </div>
            </div>
            
            <!-- Reports List -->
            <div id="reportsList">
                <div style="text-align: center; color: #6b7280; padding: 2rem;">
                    <div class="loading"></div>
                    <p>Loading reports...</p>
                </div>
            </div>
        </div>
    `;

    container.appendChild(historySection);
}

// Refresh Report History
async function refreshReportHistory() {
    try {
        const reportsList = document.getElementById('reportsList');
        reportsList.innerHTML = `
            <div style="text-align: center; color: #6b7280; padding: 2rem;">
                <div class="loading"></div>
                <p>Loading reports from ACC...</p>
            </div>
        `;

        // Load reports from ACC
        existingReports = await loadBedQCReportsFromACC(projectId);

        // Populate bed filter options
        populateBedFilter();

        // Display reports
        filterReports();

        console.log(`Loaded ${existingReports.length} reports for display`);

    } catch (error) {
        console.error('Error refreshing report history:', error);
        document.getElementById('reportsList').innerHTML = `
            <div style="text-align: center; color: #dc2626; padding: 2rem;">
                <p>Error loading reports: ${error.message}</p>
                <button class="btn btn-secondary" onclick="refreshReportHistory()">Try Again</button>
            </div>
        `;
    }
}

// Populate Bed Filter Dropdown
function populateBedFilter() {
    const bedFilter = document.getElementById('bedFilter');

    // Get bed names from loaded reports
    const bedNames = [];
    existingReports.forEach(report => {
        let bedName = '';
        if (report.data && report.data.reportData) {
            bedName = report.data.reportData.bedName;
        } else if (report.displayName) {
            // Extract bed name from display name (format: "BedName - ReportID")
            const parts = report.displayName.split(' - ');
            if (parts.length > 0) bedName = parts[0];
        }
        if (bedName && !bedNames.includes(bedName)) {
            bedNames.push(bedName);
        }
    });

    // Clear existing options except "All Beds"
    bedFilter.innerHTML = '<option value="">All Beds</option>';

    // Add bed options
    bedNames.sort().forEach(bed => {
        const option = document.createElement('option');
        option.value = bed;
        option.textContent = bed;
        bedFilter.appendChild(option);
    });
}

// Filter and Display Reports
function filterReports() {
    const searchTerm = document.getElementById('reportSearch').value.toLowerCase();
    const bedFilter = document.getElementById('bedFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;
    const dateFrom = document.getElementById('dateFromFilter').value;
    const dateTo = document.getElementById('dateToFilter').value;
    const sortBy = document.getElementById('sortFilter').value;

    // Apply filters
    let filteredReports = existingReports.filter(report => {
        let data = null;
        let bedName = '';
        let reportId = '';
        let notes = '';
        let status = '';
        let createdBy = '';

        if (report.data && report.data.reportData) {
            data = report.data.reportData;
            bedName = data.bedName || '';
            reportId = data.reportId || '';
            notes = data.notes || '';
            status = data.status || 'Draft';
            createdBy = data.createdBy || '';
        } else if (report.displayName) {
            // Extract info from display name for ACC files
            const parts = report.displayName.split(' - ');
            bedName = parts[0] || '';
            reportId = parts[1] || '';
            status = 'Completed'; // Assume completed if in ACC
        }

        // Search filter
        if (searchTerm) {
            const searchableText = [bedName, reportId, notes, createdBy].join(' ').toLowerCase();
            if (!searchableText.includes(searchTerm)) return false;
        }

        // Bed filter
        if (bedFilter && bedName !== bedFilter) return false;

        // Status filter
        if (statusFilter && status !== statusFilter) return false;

        // Date filters
        const reportDate = new Date(data?.createdDate || data?.timestamp || report.lastModified);
        if (dateFrom && reportDate < new Date(dateFrom)) return false;
        if (dateTo && reportDate > new Date(dateTo + 'T23:59:59')) return false;

        return true;
    });

    // Apply sorting
    filteredReports.sort((a, b) => {
        const dataA = a.data?.reportData;
        const dataB = b.data?.reportData;

        switch (sortBy) {
            case 'date-asc':
                return new Date(dataA?.createdDate || a.lastModified) - new Date(dataB?.createdDate || b.lastModified);
            case 'date-desc':
                return new Date(dataB?.createdDate || b.lastModified) - new Date(dataA?.createdDate || a.lastModified);
            case 'bed':
                const bedA = dataA?.bedName || a.displayName?.split(' - ')[0] || '';
                const bedB = dataB?.bedName || b.displayName?.split(' - ')[0] || '';
                return bedA.localeCompare(bedB);
            case 'status':
                const statusA = dataA?.status || (a.source === 'acc-file' ? 'Completed' : 'Draft');
                const statusB = dataB?.status || (b.source === 'acc-file' ? 'Completed' : 'Draft');
                return statusA.localeCompare(statusB);
            case 'reporter':
                return (dataA?.createdBy || '').localeCompare(dataB?.createdBy || '');
            default:
                return new Date(dataB?.createdDate || b.lastModified) - new Date(dataA?.createdDate || a.lastModified);
        }
    });

    // Update count
    document.getElementById('reportCount').textContent =
        `${filteredReports.length} of ${existingReports.length} reports`;

    // Display reports
    displayReports(filteredReports);
}

// Display Reports List
function displayReports(reports) {
    const reportsList = document.getElementById('reportsList');

    if (reports.length === 0) {
        reportsList.innerHTML = `
            <div style="text-align: center; color: #6b7280; padding: 2rem;">
                <svg width="48" height="48" fill="currentColor" viewBox="0 0 24 24" style="margin-bottom: 1rem; opacity: 0.5;">
                    <path d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 002 2z"/>
                </svg>
                <p>No reports found matching the current filters.</p>
                <button class="btn btn-primary" onclick="clearFilters()">Clear Filters</button>
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

        if (report.data && report.data.reportData) {
            data = report.data.reportData;
            bedName = data.bedName || '';
            reportId = data.reportId || '';
            projectName = data.projectName || '';
            createdBy = data.createdBy || '';
            status = data.status || 'Draft';
            notes = data.notes || '';
            selfStressPull = data.selfStressing?.outputs?.calculatedPullRounded || 0;
            nonSelfStressPull = data.nonSelfStressing?.outputs?.calculatedPullRounded || 0;

            const date = new Date(data.createdDate || data.timestamp || report.lastModified);
            formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
        } else {
            // ACC file without local data
            const parts = report.displayName?.split(' - ') || ['', ''];
            bedName = parts[0] || 'Unknown Bed';
            reportId = parts[1] || 'Unknown ID';
            status = 'Completed';

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
                    ${report.needsDownload ? 'Will download from ACC when opened' : 'Ready to load'} | Source: ${report.source || 'unknown'}
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
        document.getElementById('reportId').textContent = reportData.reportId + ' (Loaded from ACC)';
        document.getElementById('selectedBedDisplay').textContent = reportData.bedName;

        // Enable save button
        document.getElementById('saveBtn').disabled = false;
        document.getElementById('exportBtn').disabled = false;

        console.log('Successfully loaded existing report');

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
        // Find and select the matching project
        for (let option of projectSelect.options) {
            if (option.textContent.includes(data.projectName)) {
                option.selected = true;
                break;
            }
        }
    }

    document.getElementById('projectNumber').value = data.projectNumber || '';
    document.getElementById('date').value = data.date || '';
    document.getElementById('calculatedBy').value = data.calculatedBy || '';
    document.getElementById('reviewedBy').value = data.reviewedBy || '';
    document.getElementById('location').value = data.location || '';
    document.getElementById('notes').value = data.notes || '';

    // Self-stressing inputs
    if (data.selfStressing?.inputs) {
        const inputs = data.selfStressing.inputs;
        document.getElementById('ss_initialPull').value = inputs.initialPull || '';
        document.getElementById('ss_requiredForce').value = inputs.requiredForce || '';
        document.getElementById('ss_MOE').value = inputs.MOE || '';
        document.getElementById('ss_numberOfStrands').value = inputs.numberOfStrands || '';
        document.getElementById('ss_adjBedShortening').value = inputs.adjBedShortening || '';
        document.getElementById('ss_blockToBlockLength').value = inputs.blockToBlockLength || '';
        document.getElementById('ss_strandArea').value = inputs.strandArea || '';
        document.getElementById('ss_deadEndSeating').value = inputs.deadEndSeating || '';
        document.getElementById('ss_liveEndSeating').value = inputs.liveEndSeating || '';
    }

    // Non-self-stressing inputs
    if (data.nonSelfStressing?.inputs) {
        const inputs = data.nonSelfStressing.inputs;
        document.getElementById('nss_initialPull').value = inputs.initialPull || '';
        document.getElementById('nss_requiredForce').value = inputs.requiredForce || '';
        document.getElementById('nss_MOE').value = inputs.MOE || '';
        document.getElementById('nss_blockToBlockLength').value = inputs.blockToBlockLength || '';
        document.getElementById('nss_strandArea').value = inputs.strandArea || '';
        document.getElementById('nss_airTemp').value = inputs.airTemp || '';
        document.getElementById('nss_concreteTemp').value = inputs.concreteTemp || '';
        document.getElementById('nss_deadEndSeating').value = inputs.deadEndSeating || '';
        document.getElementById('nss_liveEndSeating').value = inputs.liveEndSeating || '';
        document.getElementById('nss_totalAbutmentRotation').value = inputs.totalAbutmentRotation || '';
    }

    // Recalculate to update results
    calculateAll();
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
        filterReports();

        alert('Report deleted successfully');

    } catch (error) {
        console.error('Error deleting report:', error);
        alert('Failed to delete report: ' + error.message);
    }
}

// Clear Filters
function clearFilters() {
    document.getElementById('reportSearch').value = '';
    document.getElementById('bedFilter').value = '';
    document.getElementById('statusFilter').value = '';
    document.getElementById('dateFromFilter').value = '';
    document.getElementById('dateToFilter').value = '';
    document.getElementById('sortFilter').value = 'date-desc';
    filterReports();
}

// Export Filtered Reports
function exportFilteredReports() {
    const searchTerm = document.getElementById('reportSearch').value.toLowerCase();
    const bedFilter = document.getElementById('bedFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;
    const dateFrom = document.getElementById('dateFromFilter').value;
    const dateTo = document.getElementById('dateToFilter').value;

    // Get filtered reports (reuse the same filtering logic)
    let filteredReports = existingReports.filter(report => {
        let data = null;
        let bedName = '';
        let status = '';

        if (report.data && report.data.reportData) {
            data = report.data.reportData;
            bedName = data.bedName || '';
            status = data.status || 'Draft';
        } else if (report.displayName) {
            const parts = report.displayName.split(' - ');
            bedName = parts[0] || '';
            status = 'Completed';
        }

        if (searchTerm) {
            const searchableText = [bedName, data?.reportId, data?.notes, data?.projectName, data?.createdBy].join(' ').toLowerCase();
            if (!searchableText.includes(searchTerm)) return false;
        }
        if (bedFilter && bedName !== bedFilter) return false;
        if (statusFilter && status !== statusFilter) return false;

        const reportDate = new Date(data?.createdDate || report.lastModified);
        if (dateFrom && reportDate < new Date(dateFrom)) return false;
        if (dateTo && reportDate > new Date(dateTo + 'T23:59:59')) return false;

        return true;
    });

    // Create CSV content
    const csvHeaders = [
        'Report ID', 'Bed Name', 'Project Name', 'Project Number', 'Date', 'Created By', 'Reviewed By',
        'Status', 'Self-Stress Pull (lbs)', 'Non-Self-Stress Pull (lbs)', 'Notes', 'Storage ID', 'Storage Source'
    ];

    const csvData = filteredReports.map(report => {
        const data = report.data?.reportData;
        let bedName = '';
        let reportId = '';

        if (data) {
            bedName = data.bedName || '';
            reportId = data.reportId || '';
        } else if (report.displayName) {
            const parts = report.displayName.split(' - ');
            bedName = parts[0] || '';
            reportId = parts[1] || '';
        }

        return [
            reportId,
            bedName,
            data?.projectName || '',
            data?.projectNumber || '',
            data?.date || '',
            data?.createdBy || '',
            data?.reviewedBy || '',
            data?.status || (report.source === 'acc-file' ? 'Completed' : 'Draft'),
            data?.selfStressing?.outputs?.calculatedPullRounded || 0,
            data?.nonSelfStressing?.outputs?.calculatedPullRounded || 0,
            (data?.notes || '').replace(/"/g, '""'), // Escape quotes
            report.storageKey || report.itemId,
            report.source || 'unknown'
        ];
    });

    // Generate CSV
    const csvContent = [csvHeaders, ...csvData]
        .map(row => row.map(field => `"${field}"`).join(','))
        .join('\n');

    // Download file
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BedQC-Reports-Export-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    console.log(`Exported ${filteredReports.length} reports to CSV`);
}

// =================================================================
// BED SELECTION AND FORM MANAGEMENT
// =================================================================

// Bed Selection Functions
function showBedSelection() {
    document.getElementById('bedSelectionModal').classList.add('active');
}

function closeBedSelection() {
    document.getElementById('bedSelectionModal').classList.remove('active');
    document.getElementById('bedSelect').value = '';
    document.getElementById('reportDescription').value = '';
}

function startBedReport() {
    const bedSelect = document.getElementById('bedSelect');
    const bedId = bedSelect.value;
    const bedName = bedSelect.options[bedSelect.selectedIndex].text;
    const description = document.getElementById('reportDescription').value;

    if (!bedId) {
        alert('Please select a bed before continuing.');
        return;
    }

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
        }
    };

    // Store instance
    reportInstances.set(reportId, formInstance);

    // Update UI
    document.getElementById('reportId').textContent = reportId;
    document.getElementById('selectedBedDisplay').textContent = bedName;
}

function showCalculator() {
    document.getElementById('calculatorModal').classList.add('active');

    // Clear form data for new instance
    if (!currentCalculation) {
        clearFormData();
    }

    // Initialize calculations
    calculateAll();
}

function closeCalculator() {
    document.getElementById('calculatorModal').classList.remove('active');

    // Save current state to instance before closing
    if (currentReportId) {
        saveFormInstance();
    }

    // Reset current calculation
    currentCalculation = null;
}

function clearFormData() {
    // Clear all input fields
    const inputs = document.querySelectorAll('#calculatorModal input[type="number"], #calculatorModal input[type="text"], #calculatorModal input[type="date"], #calculatorModal textarea, #calculatorModal select');
    inputs.forEach(input => {
        if (input.type === 'date') {
            input.value = new Date().toISOString().split('T')[0];
        } else if (input.type === 'number') {
            input.value = '';
        } else if (input.tagName === 'SELECT') {
            input.selectedIndex = 0;
        } else {
            input.value = '';
        }
    });
}

function saveFormInstance() {
    if (!currentReportId) return;

    const instance = reportInstances.get(currentReportId);
    if (!instance) return;

    // Update project metadata
    instance.projectMetadata = {
        projectName: document.getElementById('projectName').value,
        projectNumber: document.getElementById('projectNumber').value,
        date: document.getElementById('date').value,
        calculatedBy: document.getElementById('calculatedBy').value,
        reviewedBy: document.getElementById('reviewedBy').value,
        location: document.getElementById('location').value,
        notes: document.getElementById('notes').value
    };

    // Update calculations
    instance.calculations = currentCalculation;

    // Save back to storage
    reportInstances.set(currentReportId, instance);
}

// Modal click outside to close
document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('bedSelectionModal').addEventListener('click', function (e) {
        if (e.target === this) {
            closeBedSelection();
        }
    });

    document.getElementById('calculatorModal').addEventListener('click', function (e) {
        if (e.target === this) {
            closeCalculator();
        }
    });
});

// =================================================================
// PROJECT DATA LOADING AND MANAGEMENT
// =================================================================

// Project Data Loading
async function loadRealProjectData() {
    try {
        console.log('Starting to load real project data...');

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
            hubId = firstAccHub.id; // Store hub ID globally
            console.log('Using ACC hub:', firstAccHub.attributes.name, hubId);

            await loadProjectsFromHub(hubId);
        } else {
            console.warn('No ACC hubs found in response');
            throw new Error('No ACC hubs found - only Fusion 360 hubs available');
        }

        console.log('Project data loading completed successfully');

    } catch (error) {
        console.error('Failed to load project data:', error);

        // Still enable manual entry mode
        const projectSelect = document.getElementById('projectName');
        projectSelect.innerHTML = '<option value="">Enter project details manually below...</option>';
        projectSelect.disabled = false;

        ['projectNumber', 'calculatedBy', 'location'].forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.disabled = false;
                element.placeholder = element.placeholder.replace('Loading from ACC...', 'Enter manually');
            }
        });

        document.getElementById('accDetails').innerHTML = `
            <div style="color: #dc2626;">
                <strong>Project Loading Issue:</strong> ${error.message}<br>
                <small>You can still use the calculator by entering project details manually</small><br>
                <small><em>Note: Projects must follow format "12345 - Project Name" to appear in dropdown</em></small><br>
                <small><em>Reports will be saved locally with project sync capability</em></small>
            </div>
        `;
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
                return null; // Filter out projects that don't match the format
            }

            const projectNumberFromName = nameMatch[1]; // Extract the 5-digit code
            const projectDisplayName = nameMatch[2]; // Extract the project name part

            let projectNumber = projectNumberFromName; // Default to the 5-digit code from name
            let location = '';
            let additionalData = {};

            // Try to get project number from ACC fields first, but fall back to name extraction
            if (project.attributes.extension?.data?.projectNumber) {
                projectNumber = project.attributes.extension.data.projectNumber;
                console.log('Found project number in extension data:', projectNumber);
            }

            try {
                const projectDetailResponse = await fetch(`https://developer.api.autodesk.com/project/v1/hubs/${hubId}/projects/${project.id}`, {
                    headers: {
                        'Authorization': `Bearer ${forgeAccessToken}`
                    }
                });

                if (projectDetailResponse.ok) {
                    const projectDetail = await projectDetailResponse.json();
                    console.log('Project detail for', project.attributes.name, ':', projectDetail);

                    if (projectDetail.data?.attributes?.extension?.data) {
                        const extData = projectDetail.data.attributes.extension.data;

                        // Look for project number in extension data - only override if we find a valid one
                        const accProjectNumber = extData.projectNumber ||
                            extData.project_number ||
                            extData.number ||
                            extData.jobNumber ||
                            extData.job_number ||
                            extData.projectCode ||
                            extData.code || '';

                        if (accProjectNumber && accProjectNumber.trim() !== '') {
                            projectNumber = accProjectNumber;
                            console.log('Updated project number from detail data:', projectNumber);
                        }

                        location = extData.location ||
                            extData.project_location ||
                            extData.address ||
                            extData.city ||
                            extData.state ||
                            extData.jobLocation ||
                            extData.site || '';
                    }

                    // Also check the main project attributes for project number
                    if (projectDetail.data?.attributes) {
                        const attrs = projectDetail.data.attributes;
                        const mainProjectNumber = attrs.projectNumber || attrs.number || '';
                        if (mainProjectNumber && mainProjectNumber.trim() !== '') {
                            projectNumber = mainProjectNumber;
                            console.log('Updated project number from main attributes:', projectNumber);
                        }
                    }
                }
            } catch (detailError) {
                console.warn('Could not get detailed project info for', project.attributes.name, ':', detailError);
            }

            // Final fallback - ensure we have the 5-digit code from the project name
            if (!projectNumber || projectNumber.trim() === '') {
                projectNumber = projectNumberFromName;
                console.log('Using project number from name as final fallback:', projectNumber);
            }

            console.log('Final project number for', project.attributes.name, ':', projectNumber);

            return {
                id: project.id,
                name: project.attributes.name || 'Unnamed Project',
                displayName: projectDisplayName,
                number: projectNumber,
                numericSort: parseInt(projectNumberFromName, 10), // For sorting
                location: location || 'Location not specified',
                additionalData,
                fullData: project
            };
        }));

        // Filter out null entries (projects that didn't match the format)
        const filteredProjects = projects.filter(project => project !== null);

        if (filteredProjects.length === 0) {
            console.warn('No projects matched the required format "12345 - Project Name"');
            throw new Error('No projects found matching required format "12345 - Project Name"');
        }

        // Sort projects numerically by the 5-digit code (lowest to highest)
        const sortedProjects = filteredProjects.sort((a, b) => a.numericSort - b.numericSort);

        console.log('Filtered and sorted ACC projects:', sortedProjects);
        console.log(`${filteredProjects.length} projects matched the format out of ${projectsData.data.length} total projects`);

        populateProjectDropdown(sortedProjects);

        if (sortedProjects.length > 0) {
            setTimeout(() => {
                const projectSelect = document.getElementById('projectName');
                if (projectSelect) {
                    projectSelect.value = sortedProjects[0].id;
                    projectId = sortedProjects[0].id; // Store project ID globally
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
        console.log('Populating dropdown with filtered and sorted ACC projects:', projects);

        userProjects = projects;
        const projectSelect = document.getElementById('projectName');

        if (!projectSelect) {
            console.error('Project select element not found');
            return;
        }

        projectSelect.innerHTML = '<option value="">Select an ACC project...</option>';

        projects.forEach((project, index) => {
            console.log(`Adding ACC project ${index + 1}:`, project.name, 'Project Number:', project.number);

            const option = document.createElement('option');
            option.value = project.id;
            // Display the full project name, but show the project number in parentheses
            option.textContent = `${project.name} (${project.number})`;
            option.dataset.projectNumber = project.number || '';
            option.dataset.location = project.location || '';
            projectSelect.appendChild(option);
        });

        projectSelect.disabled = false;
        projectSelect.style.backgroundColor = '';

        console.log('ACC project dropdown populated successfully with', projects.length, 'filtered projects');

        document.getElementById('accDetails').innerHTML = `
            <strong>Status:</strong> Connected to ACC<br>
            <strong>Projects Found:</strong> ${projects.length} ACC projects (filtered by format)<br>
            <strong>Hub:</strong> Metromont ACC Account<br>
            <strong>Storage:</strong> JSON file upload to ACC with local fallback
        `;

    } catch (error) {
        console.error('Error in populateProjectDropdown:', error);
        throw error;
    }
}

function onProjectSelected() {
    const projectSelect = document.getElementById('projectName');
    const selectedOption = projectSelect.selectedOptions[0];

    if (selectedOption && selectedOption.value) {
        const projectNumber = selectedOption.dataset.projectNumber || '';
        const location = selectedOption.dataset.location || '';

        // Store selected project ID globally
        projectId = selectedOption.value;

        console.log('Selected ACC project:', selectedOption.textContent);
        console.log('Project ID:', projectId);
        console.log('Project number from dataset:', projectNumber);
        console.log('Location from dataset:', location);

        // Find the project object to get more details
        const selectedProject = userProjects.find(p => p.id === selectedOption.value);
        if (selectedProject) {
            console.log('Selected project object:', selectedProject);
            console.log('Project number from object:', selectedProject.number);
            console.log('Project display name:', selectedProject.displayName);
        }

        // Set the project number field with the actual ACC project number
        document.getElementById('projectNumber').value = projectNumber;
        document.getElementById('location').value = location;

        // Enable editing of these fields in case user wants to modify
        document.getElementById('projectNumber').disabled = false;
        document.getElementById('location').disabled = false;
        document.getElementById('calculatedBy').disabled = false;

        document.getElementById('projectSource').style.display = 'inline-flex';
        document.getElementById('projectSource').textContent = 'Project Number from ACC';

        if (!document.getElementById('calculatedBy').value) {
            document.getElementById('calculatedBy').value = 'ACC User';
        }

        // Log for debugging
        console.log('Project number field set to:', document.getElementById('projectNumber').value);
        console.log('Location field set to:', document.getElementById('location').value);
    }
}

function enableACCFeatures() {
    document.getElementById('saveBtn').disabled = false;
    document.getElementById('exportBtn').disabled = false;
}

function setupUI() {
    const dateInput = document.getElementById('date');
    if (dateInput) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }
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
    return parseFloat(document.getElementById(id).value) || 0;
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

    document.getElementById('ss_basicElongation').textContent = formatNumber(basicElongation) + ' in';
    document.getElementById('ss_bedShortening').textContent = formatNumber(bedShortening) + ' in';
    document.getElementById('ss_desiredElongationRounded').textContent = formatNumber(desiredElongationRounded) + ' in';
    document.getElementById('ss_calculatedPullRounded').textContent = formatInteger(calculatedPullRounded) + ' lbs';

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

    document.getElementById('nss_basicElongation').textContent = formatNumber(basicElongation) + ' in';
    document.getElementById('nss_tempDifference').textContent = formatNumber(tempDifference);
    document.getElementById('nss_tempCorrection').textContent = formatNumber(tempCorrection);
    document.getElementById('nss_desiredElongationRounded').textContent = formatNumber(desiredElongationRounded) + ' in';
    document.getElementById('nss_calculatedPullRounded').textContent = formatInteger(calculatedPullRounded) + ' lbs';

    return {
        basicElongation, tempDifference, tca2, tcPart1, tcPart2, tempCorrection,
        desiredElongation, desiredElongationRounded, LESeatingAdd, tca1,
        tcPart1Pull, tcPart2Pull, tempCorrectionPull, desiredPull, calculatedPullRounded
    };
}

function calculateAll() {
    const selfStressingResults = calculateSelfStressing();
    const nonSelfStressingResults = calculateNonSelfStressing();

    currentCalculation = {
        timestamp: new Date().toISOString(),
        reportId: currentReportId,
        bedId: currentBedId,
        bedName: currentBedName,
        projectId: projectId,
        hubId: hubId,
        status: 'Draft',
        projectMetadata: {
            projectName: document.getElementById('projectName').value,
            projectNumber: document.getElementById('projectNumber').value,
            date: document.getElementById('date').value,
            calculatedBy: document.getElementById('calculatedBy').value,
            reviewedBy: document.getElementById('reviewedBy').value,
            location: document.getElementById('location').value,
            notes: document.getElementById('notes').value
        },
        selfStressing: {
            inputs: {
                initialPull: getValue('ss_initialPull'),
                requiredForce: getValue('ss_requiredForce'),
                MOE: getValue('ss_MOE'),
                numberOfStrands: getValue('ss_numberOfStrands'),
                adjBedShortening: getValue('ss_adjBedShortening'),
                blockToBlockLength: getValue('ss_blockToBlockLength'),
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
// ACC INTEGRATION FUNCTIONS (SAVE/EXPORT)
// =================================================================

// Updated saveToACC function that uses proper file upload
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
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<div class="loading"></div> Saving to ACC...';

        // Add quality compliance data
        const enhancedCalculation = {
            ...currentCalculation,
            status: 'Completed',
            createdDate: currentCalculation.timestamp,
            savedToACC: true,
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

        // Save to ACC Data Management API using proper file upload
        const result = await saveBedQCReportToACC(enhancedCalculation);

        console.log('Successfully saved report:', result);

        saveBtn.disabled = false;
        saveBtn.innerHTML = `
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
            </svg>
            Saved Successfully
        `;

        // Show appropriate success message based on storage method
        let successMessage = `Report saved successfully!\nReport ID: ${result.reportId}`;

        if (result.method === 'acc-file-upload') {
            successMessage += `\n\nStorage: ACC JSON File Upload\nFile Name: ${result.fileName}\nVersion ID: ${result.versionId}`;
        } else if (result.method === 'local-storage') {
            successMessage += `\n\nStorage: Local browser storage with project sync\nNote: ${result.warning || 'File upload failed - check permissions'}`;
            if (result.error) {
                successMessage += `\nError Details: ${result.error}`;
            }
        }

        alert(successMessage);

        // Refresh report history to show the new report
        await refreshReportHistory();

    } catch (error) {
        console.error('Save failed:', error);

        const saveBtn = document.getElementById('saveBtn');
        saveBtn.disabled = false;
        saveBtn.innerHTML = `
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
            </svg>
            Save to ACC
        `;

        // Provide detailed error information
        let errorMessage = 'Failed to save report to ACC.\n\n';
        errorMessage += `Error: ${error.message}\n\n`;
        errorMessage += 'This might be due to:\n';
        errorMessage += '• ACC API permissions need additional configuration\n';
        errorMessage += '• Project folder access restrictions\n';
        errorMessage += '• Network connectivity issues\n\n';
        errorMessage += 'The calculation is still available in your browser session.';

        alert(errorMessage);
    }
}

async function exportToACCDocs() {
    if (!isACCConnected) {
        alert('Not connected to ACC. Please check your connection.');
        return;
    }

    try {
        const exportBtn = document.getElementById('exportBtn');
        exportBtn.disabled = true;
        exportBtn.innerHTML = '<div class="loading"></div> Preparing Export...';

        // Generate PDF content first
        generatePDFData();

        // For now, we'll export as a downloadable PDF since direct ACC document upload 
        // requires additional file storage setup that we're working on

        await new Promise(resolve => setTimeout(resolve, 1000));

        // Create a PDF-style HTML document for download
        const reportHTML = document.getElementById('pdf-content').innerHTML;
        const fullHTML = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Bed QC Report - ${currentReportId}</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
                    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
                    .section { margin-bottom: 20px; }
                    h3 { color: #2563eb; margin-bottom: 10px; }
                    .results { background: #f8f9fa; padding: 10px; border-radius: 5px; }
                </style>
            </head>
            <body>
                ${reportHTML}
                <div style="margin-top: 30px; font-size: 12px; color: #666; text-align: center;">
                    Generated by Metromont CastLink Quality Control System<br>
                    Report ID: ${currentReportId} | Generated: ${new Date().toLocaleString()}
                </div>
            </body>
            </html>
        `;

        // Create blob and download
        const blob = new Blob([fullHTML], { type: 'text/html' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `BedQC-Report-${currentReportId}-${new Date().toISOString().split('T')[0]}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        exportBtn.disabled = false;
        exportBtn.innerHTML = `
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
            </svg>
            Export Report
        `;

        alert(`Report exported as HTML file!\n\nFile: BedQC-Report-${currentReportId}-${new Date().toISOString().split('T')[0]}.html\n\nNote: JSON reports are uploaded to ACC automatically. HTML exports are for sharing/printing purposes.`);

    } catch (error) {
        console.error('Export failed:', error);

        const exportBtn = document.getElementById('exportBtn');
        exportBtn.disabled = false;
        exportBtn.innerHTML = `
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
            </svg>
            Export Report
        `;

        alert('Export failed: ' + error.message);
    }
}

function generatePDF() {
    generatePDFData();
    window.print();
}

function generatePDFData() {
    const metadata = currentCalculation.projectMetadata;
    const selfStressingResults = currentCalculation.selfStressing.outputs;
    const nonSelfStressingResults = currentCalculation.nonSelfStressing.outputs;

    document.getElementById('printMetadata').innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 10px;">
            <div><strong>Report ID:</strong> ${currentReportId}</div>
            <div><strong>Bed:</strong> ${currentBedName}</div>
            <div><strong>Date:</strong> ${metadata.date}</div>
            <div><strong>Project:</strong> ${metadata.projectName}</div>
            <div><strong>Project #:</strong> ${metadata.projectNumber}</div>
            <div><strong>Location:</strong> ${metadata.location}</div>
            <div><strong>Calculated By:</strong> ${metadata.calculatedBy}</div>
            <div><strong>Reviewed By:</strong> ${metadata.reviewedBy}</div>
            <div></div>
        </div>
        ${metadata.notes ? `<div><strong>Notes:</strong> ${metadata.notes}</div>` : ''}
    `;

    document.getElementById('printSelfStressInputs').innerHTML = `
        <h4>Input Values:</h4>
        <div><strong>Initial Pull:</strong> ${currentCalculation.selfStressing.inputs.initialPull} lbs</div>
        <div><strong>Required Force:</strong> ${currentCalculation.selfStressing.inputs.requiredForce} lbs</div>
        <div><strong>MOE:</strong> ${currentCalculation.selfStressing.inputs.MOE}</div>
        <div><strong># of Strands:</strong> ${currentCalculation.selfStressing.inputs.numberOfStrands}</div>
        <div><strong>Adjusted Bed Shortening:</strong> ${currentCalculation.selfStressing.inputs.adjBedShortening} inches</div>
        <div><strong>Block-to-Block Length:</strong> ${currentCalculation.selfStressing.inputs.blockToBlockLength} feet</div>
        <div><strong>Strand Area:</strong> ${currentCalculation.selfStressing.inputs.strandArea} sq inches</div>
        <div><strong>Dead-End Seating:</strong> ${currentCalculation.selfStressing.inputs.deadEndSeating} inches</div>
        <div><strong>Live End Seating:</strong> ${currentCalculation.selfStressing.inputs.liveEndSeating} inches</div>
    `;

    document.getElementById('printSelfStressResults').innerHTML = `
        <h4>Calculated Results:</h4>
        <div style="display: flex; justify-content: space-between;"><span>Basic Elongation:</span><span>${formatNumber(selfStressingResults.basicElongation)} inches</span></div>
        <div style="display: flex; justify-content: space-between;"><span>Bed Shortening:</span><span>${formatNumber(selfStressingResults.bedShortening)} inches</span></div>
        <div style="display: flex; justify-content: space-between; font-weight: bold; color: #dc2626;"><span>Desired Elongation (Rounded):</span><span>${formatNumber(selfStressingResults.desiredElongationRounded)} inches</span></div>
        <div style="display: flex; justify-content: space-between; font-weight: bold; color: #dc2626;"><span>Calculated Pull (Rounded):</span><span>${formatInteger(selfStressingResults.calculatedPullRounded)} lbs</span></div>
    `;

    document.getElementById('printNonSelfStressInputs').innerHTML = `
        <h4>Input Values:</h4>
        <div><strong>Initial Pull:</strong> ${currentCalculation.nonSelfStressing.inputs.initialPull} lbs</div>
        <div><strong>Required Force:</strong> ${currentCalculation.nonSelfStressing.inputs.requiredForce} lbs</div>
        <div><strong>MOE:</strong> ${currentCalculation.nonSelfStressing.inputs.MOE}</div>
        <div><strong>Block-to-Block Length:</strong> ${currentCalculation.nonSelfStressing.inputs.blockToBlockLength} feet</div>
        <div><strong>Strand Area:</strong> ${currentCalculation.nonSelfStressing.inputs.strandArea} sq inches</div>
        <div><strong>Air Temperature:</strong> ${currentCalculation.nonSelfStressing.inputs.airTemp} °F</div>
        <div><strong>Concrete Temperature:</strong> ${currentCalculation.nonSelfStressing.inputs.concreteTemp} °F</div>
        <div><strong>Dead-End Seating:</strong> ${currentCalculation.nonSelfStressing.inputs.deadEndSeating} inches</div>
        <div><strong>Live End Seating:</strong> ${currentCalculation.nonSelfStressing.inputs.liveEndSeating} inches</div>
        <div><strong>Total Abutment Rotation:</strong> ${currentCalculation.nonSelfStressing.inputs.totalAbutmentRotation} inches</div>
    `;

    document.getElementById('printNonSelfStressResults').innerHTML = `
        <h4>Calculated Results:</h4>
        <div style="display: flex; justify-content: space-between;"><span>Basic Elongation:</span><span>${formatNumber(nonSelfStressingResults.basicElongation)} inches</span></div>
        <div style="display: flex; justify-content: space-between;"><span>Temperature Difference:</span><span>${formatNumber(nonSelfStressingResults.tempDifference)}</span></div>
        <div style="display: flex; justify-content: space-between;"><span>Temperature Correction:</span><span>${formatNumber(nonSelfStressingResults.tempCorrection)}</span></div>
        <div style="display: flex; justify-content: space-between; font-weight: bold; color: #dc2626;"><span>Desired Elongation (Rounded):</span><span>${formatNumber(nonSelfStressingResults.desiredElongationRounded)} inches</span></div>
        <div style="display: flex; justify-content: space-between; font-weight: bold; color: #dc2626;"><span>Calculated Pull (Rounded):</span><span>${formatInteger(nonSelfStressingResults.calculatedPullRounded)} lbs</span></div>
    `;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function () {
    setupUI();
    initializeApp();
});