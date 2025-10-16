// Erection Sequence Scheduling Module
console.log('Erection Sequencing module loaded');

// Global State
let isAuthenticated = false;
let globalHubData = null;
let selectedProjectId = null;
let selectedElementGroup = null;
let viewer = null;
let viewerModel = null;
let scheduleData = null;
let isPlaying = false;
let playInterval = null;
let currentDayIndex = 0;
let timelineDays = [];
let activityElementMap = new Map(); // Map<activityName, Set<propertyValue>>
let dayActivitiesMap = new Map(); // Map<dayISO, Set<activityName>>
let modelCategories = new Map(); // Map<category, Set<propertyNames>>
let filterRowCount = 1;

// Make token available globally for GraphQL helper
window.forgeAccessToken = null;

// UI Elements
const authProcessing = document.getElementById('authProcessing');
const authTitle = document.getElementById('authTitle');
const authMessage = document.getElementById('authMessage');

// Initialize the module
async function initializeErectionSequencing() {
    try {
        console.log('=== ERECTION SEQUENCING INITIALIZATION ===');

        updateAuthStatus('Checking Authentication...', 'Verifying access to ACC and AEC Data Model...');

        // Auth bootstrap - same pattern as production-scheduling.js
        if (window.opener && window.opener.CastLinkAuth) {
            const parentAuth = window.opener.CastLinkAuth;
            try {
                const isParentAuth = await parentAuth.waitForAuth();
                if (isParentAuth) {
                    window.forgeAccessToken = parentAuth.getToken();
                    globalHubData = parentAuth.getHubData();
                    await completeAuthentication();
                    return;
                }
            } catch (error) {
                console.warn('Parent auth not available:', error);
            }
        }

        // Fallback to stored token
        const storedToken = getStoredToken();
        if (storedToken && !isTokenExpired(storedToken)) {
            window.forgeAccessToken = storedToken.access_token;
            
            // Try to get hub data from session storage
            const sessionHubData = sessionStorage.getItem('castlink_hub_data');
            if (sessionHubData) {
                try {
                    globalHubData = JSON.parse(sessionHubData);
                } catch (e) {
                    console.error('Failed to parse session hub data:', e);
                }
            }
            
            await completeAuthentication();
        } else {
            redirectToMainApp();
        }

    } catch (error) {
        console.error('Erection Sequencing initialization failed:', error);
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
        updateAuthStatus('Loading Project Data...', 'Connecting to ACC and AEC Data Model...');

        isAuthenticated = true;

        const projectCount = globalHubData && globalHubData.projects ? globalHubData.projects.length : 0;
        const accountName = globalHubData && globalHubData.accountInfo ? globalHubData.accountInfo.name : 'ACC Account';

        updateAuthStatus('Success!', `Connected to ${accountName} with ${projectCount} projects`);

        await new Promise(resolve => setTimeout(resolve, 800));

        // Hide auth overlay
        if (authProcessing) {
            authProcessing.classList.remove('active');
        }
        document.body.classList.remove('auth-loading');

        // Show auth status badge
        const authStatusBadge = document.getElementById('authStatusBadge');
        if (authStatusBadge) {
            authStatusBadge.style.display = 'inline-flex';
            authStatusBadge.innerHTML = `
                <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
                Connected to ${accountName}
            `;
        }

        // Populate project dropdown
        populateProjectDropdown();

        // Initialize Viewer
        initializeViewer();

        // Set up event listeners
        setupEventListeners();

        console.log('✅ Erection Sequencing ready');

    } catch (error) {
        console.error('Authentication completion failed:', error);
        showAuthError('Failed to initialize: ' + error.message);
    }
}

function populateProjectDropdown() {
    const projectSelect = document.getElementById('esProjectSelect');
    if (!projectSelect) return;

    if (!globalHubData || !globalHubData.projects || globalHubData.projects.length === 0) {
        projectSelect.innerHTML = '<option value="">No projects available</option>';
        return;
    }

    projectSelect.innerHTML = '<option value="">Select a project...</option>';
    
    globalHubData.projects.forEach(project => {
        const option = document.createElement('option');
        option.value = project.id;
        option.textContent = project.name; // exact ACC name only
        option.title = project.number && project.number !== 'N/A' ? `Project #${project.number}` : ''; // Show number in tooltip
        option.dataset.projectData = JSON.stringify(project);
        projectSelect.appendChild(option);
    });

    projectSelect.disabled = false;

    // Don't auto-select - let user choose
    console.log('✅ Project dropdown populated with', globalHubData.projects.length, 'projects');
}

async function onProjectChange() {
    const projectSelect = document.getElementById('esProjectSelect');
    const modelSelect = document.getElementById('esModelSelect');
    
    if (!projectSelect || !projectSelect.value || projectSelect.value === '') {
        console.log('No project selected, resetting model dropdown');
        modelSelect.innerHTML = '<option value="">Select a project first...</option>';
        modelSelect.disabled = true;
        
        // Clear viewer
        if (viewer && viewerModel) {
            viewer.unloadModel(viewerModel);
            viewerModel = null;
        }
        
        return;
    }

    const selectedOption = projectSelect.options[projectSelect.selectedIndex];
    const projectObj = JSON.parse(selectedOption.dataset.projectData || '{}');
    const projectName = projectObj.name;           // exact ACC name
    const accProjectId = projectObj.id;            // ACC project ID (b.****)
    
    selectedProjectId = accProjectId;
    
    console.log('✅ Project selected:', accProjectId);
    console.log('📂 Project name:', projectName);
    console.log('🔢 Project number:', projectObj.number || 'N/A');

    // Reset model selection
    modelSelect.innerHTML = '<option value="">Loading designs from AEC Data Model...</option>';
    modelSelect.disabled = true;

    // Clear viewer
    if (viewer && viewerModel) {
        viewer.unloadModel(viewerModel);
        viewerModel = null;
    }

    try {
        // Load designs (element groups) for the selected project BY NAME
        await loadDesignsForProject({ projectName, accProjectId });
    } catch (error) {
        console.error('❌ Error loading designs:', error);
        modelSelect.innerHTML = `<option value="">Error: ${error.message}</option>`;
        showNotification('Failed to load designs: ' + error.message, 'error');
    }
}

async function loadDesignsForProject({ projectName, accProjectId }) {
    const modelSelect = document.getElementById('esModelSelect');
    
    try {
        console.log('📂 Loading designs for project:', projectName);

        // Get token and region
        const token = window.forgeAccessToken;
        if (!token) {
            throw new Error('Not authenticated. Please log in first.');
        }

        const region = 'US'; // Could be made configurable later
        
        // Get the preferred hub name from globalHubData (if available)
        // This ensures we query the same hub that was used during authentication
        const preferredHubName = globalHubData?.hubInfo?.attributes?.name || 'Metromont Development Hub';
        
        console.log('🏢 Using hub for AEC DM lookup:', preferredHubName);
        
        // Call new AEC DM API with project NAME (not ACC ID)
        // This resolves: hub → project (by name) → element groups
        const elementGroups = await window.AECDataModel.getElementGroups({
            token,
            region,
            projectName,
            preferredHubName // Use the actual hub name to match the correct hub
        });
        
        if (!elementGroups || elementGroups.length === 0) {
            modelSelect.innerHTML = '<option value="">No AEC Data Model designs found</option>';
            showNotification('No designs found. Ensure AEC Data Model is activated and models are Revit 2024+', 'warning');
            return;
        }

        console.log(`✅ Found ${elementGroups.length} element groups`);

        // Populate dropdown with results
        modelSelect.innerHTML = '<option value="">Select a design...</option>';

        elementGroups.forEach(eg => {
            const option = document.createElement('option');
            option.value = eg.id;
            option.textContent = eg.name;
            option.dataset.urn = eg.fileVersionUrn || '';
            option.dataset.egid = eg.id;
            modelSelect.appendChild(option);
        });

        modelSelect.disabled = false;
        showNotification(`Found ${elementGroups.length} designs`, 'success');

    } catch (error) {
        console.error('❌ Error loading designs:', error);
        
        modelSelect.innerHTML = '<option value="">Error: AEC DM not available</option>';
        
        // Provide helpful error message
        if (error.message.includes('not found')) {
            showNotification('Project not found in AEC Data Model. Models may need re-publishing.', 'error');
        } else if (error.message.includes('No AEC-DM hubs')) {
            showNotification('No AEC DM hubs found. Check if AEC DM is activated.', 'error');
        } else {
            showNotification('AEC Data Model error - see console for details', 'error');
        }
        
        console.error('\n💡 Troubleshooting Tips:');
        console.error('1. Verify AEC Data Model is activated on your ACC account');
        console.error('2. Check if models are Revit 2024 or newer');
        console.error('3. Re-sync/re-publish models in Revit after AEC DM activation');
        console.error('4. Try the "Test AEC Data Model Status" button for detailed diagnostics');
    }
}

async function onModelChange() {
    const modelSelect = document.getElementById('esModelSelect');
    
    if (!modelSelect || !modelSelect.value) {
        return;
    }

    const selectedOption = modelSelect.options[modelSelect.selectedIndex];
    const fileVersionUrn = selectedOption.dataset.urn;
    const elementGroupId = selectedOption.dataset.egid;

    if (!fileVersionUrn) {
        showNotification('No file version URN found for this design', 'error');
        return;
    }

    selectedElementGroup = {
        id: elementGroupId,
        name: selectedOption.textContent,
        urn: fileVersionUrn
    };

    console.log('Design selected:', selectedElementGroup);

    // Load the model in the viewer
    await loadModelInViewer(fileVersionUrn);
}

// Initialize Autodesk Viewer
function initializeViewer() {
    console.log('Initializing Forge Viewer...');

    const viewerDiv = document.getElementById('esViewer');
    if (!viewerDiv) {
        console.error('Viewer container not found');
        return;
    }

    const options = {
        env: 'AutodeskProduction2',
        api: 'streamingV2',
        getAccessToken: (callback) => {
            callback(window.forgeAccessToken, 3600);
        }
    };

    Autodesk.Viewing.Initializer(options, function() {
        console.log('Viewer initialized, creating viewer instance...');

        viewer = new Autodesk.Viewing.GuiViewer3D(viewerDiv);
        
        const startResult = viewer.start();
        if (startResult > 0) {
            console.error('Failed to create viewer:', startResult);
            showNotification('Failed to initialize 3D viewer', 'error');
            return;
        }

        console.log('✅ Viewer started successfully');
        
        // Load Document Browser extension for view selector
        viewer.loadExtension('Autodesk.DocumentBrowser');
        
        updateViewerStatus('Viewer ready');
    });
}

/**
 * Encode URN for Autodesk Viewer/Model Derivative API
 * AEC-DM returns plain URNs; the Viewer expects base64-encoded URNs
 * IMPORTANT: Keeps query parameters (e.g., ?version=2) as they're required for ACC models
 * @param {string} rawUrn - Raw URN from AEC Data Model
 * @returns {string} Base64-encoded URN (URL-safe, no padding)
 */
function encodeUrn(rawUrn) {
    // Keep the full URN including ?version for ACC (Viewer/Derivative requires it)
    const raw = String(rawUrn);
    
    // Ensure single 'urn:' prefix
    const withPrefix = raw.startsWith('urn:') ? raw : `urn:${raw}`;
    
    // Base64-encode (URL-safe: + → -, / → _, remove padding =)
    const encoded = btoa(withPrefix)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
    
    // Guard against common issues
    console.assert(!rawUrn.startsWith('urn:urn:'), '❌ Double urn: prefix detected in input');
    console.assert(/^[A-Za-z0-9_-]+$/.test(encoded), '❌ Encoded URN is not URL-safe');
    
    return encoded;
}

/**
 * Debug utility: Test if a URN's manifest is accessible
 * Useful for verifying URN encoding before loading in viewer
 * @param {string} rawUrn - Raw URN from AEC Data Model
 */
async function testManifestAccess(rawUrn) {
    console.log('\n🔍 === TESTING MANIFEST ACCESS ===');
    console.log('Raw URN:', rawUrn);
    
    const encoded = encodeUrn(rawUrn);
    console.log('Encoded URN:', encoded);
    
    const manifestUrl = `https://developer.api.autodesk.com/modelderivative/v2/designdata/${encoded}/manifest`;
    console.log('Manifest URL:', manifestUrl);
    
    try {
        const response = await fetch(manifestUrl, {
            headers: {
                'Authorization': `Bearer ${window.forgeAccessToken}`
            }
        });
        
        console.log('Response status:', response.status);
        
        if (response.ok) {
            const manifest = await response.json();
            console.log('✅ Manifest accessible:', manifest.status);
            console.log('Progress:', manifest.progress);
            return true;
        } else {
            const errorText = await response.text();
            console.error('❌ Manifest fetch failed:', errorText);
            return false;
        }
    } catch (error) {
        console.error('❌ Manifest test error:', error);
        return false;
    } finally {
        console.log('=================================\n');
    }
}

// Expose for debugging in console
window.testManifestAccess = testManifestAccess;

async function loadModelInViewer(urn) {
    if (!viewer) {
        showNotification('Viewer not initialized', 'error');
        return;
    }

    // Unload any existing model
    if (viewerModel) {
        viewer.unloadModel(viewerModel);
        viewerModel = null;
    }

    updateViewerStatus('Loading model...');
    showNotification('Loading model in viewer...', 'info');

    // IMPORTANT: AEC-DM returns plain URNs; the Viewer expects base64-encoded URNs
    console.log('Raw URN from AEC-DM:', urn);
    const encoded = encodeUrn(urn);
    const documentId = `urn:${encoded}`;
    
    console.log('Encoded URN:', encoded);
    console.log('Document ID for Viewer:', documentId);

    Autodesk.Viewing.Document.load(
        documentId,
        onDocumentLoadSuccess,
        onDocumentLoadFailure
    );
}

function onDocumentLoadSuccess(doc) {
    console.log('✅ Document loaded successfully');

    const viewables = doc.getRoot().getDefaultGeometry();
    
    if (!viewables) {
        console.error('No viewables found');
        const allViewables = doc.getRoot().search({ 'type': 'geometry' });
        if (allViewables.length > 0) {
            viewer.loadDocumentNode(doc, allViewables[0]).then(onModelLoaded).catch(onModelLoadError);
        } else {
            showNotification('No 3D geometry found in model', 'error');
        }
        return;
    }

    viewer.loadDocumentNode(doc, viewables).then(onModelLoaded).catch(onModelLoadError);
}

function onModelLoaded(model) {
    console.log('✅ Model loaded successfully');
    viewerModel = model;

    // Make absolutely sure everything is visible, then fit, then save home view.
    viewer.showAll();
    viewer.fitToView();
    _saveHomeState();

    updateViewerStatus('Model loaded');
    showNotification('Model loaded successfully', 'success');

    // Update viewer info
    const viewerInfo = document.getElementById('viewerInfo');
    if (viewerInfo && selectedElementGroup) {
        viewerInfo.textContent = `Model: ${selectedElementGroup.name}`;
    }

    // Extract categories and properties from model
    extractModelProperties();
}

function onModelLoadError(error) {
    console.error('❌ Error loading model:', error);
    updateViewerStatus('Model load failed');
    showNotification('Failed to load model: ' + (error.message || error), 'error');
}

function onDocumentLoadFailure(errorCode, errorMsg) {
    console.error('❌ Document load failed:', errorCode, errorMsg);
    updateViewerStatus('Document load failed');
    
    let userMessage = 'Failed to load model';
    
    switch (errorCode) {
        case 4:
            userMessage = 'Model translation in progress. Please try again in a few moments.';
            break;
        case 6:
            userMessage = 'Authentication expired. Please refresh the page.';
            break;
        case 7:
            userMessage = 'Network error loading model.';
            break;
        default:
            userMessage = `Failed to load model: ${errorMsg} (Code: ${errorCode})`;
    }
    
    showNotification(userMessage, 'error');
}

// Extract categories and properties from loaded model
function extractModelProperties() {
    if (!viewerModel) {
        console.warn('No model loaded');
        return;
    }

    console.log('📊 Extracting model categories and properties...');

    // IMPORTANT: the function passed to executeUserFunction runs in a Web Worker.
    // It must be self-contained and must NOT reference outer-scope variables or functions.
    viewerModel.getPropertyDb().executeUserFunction(function(pdb) {
        // Build a serializable result: { [category: string]: string[] }
        var result = Object.create(null);

        try {
            pdb.enumObjects(function(dbId) {
                // enumObjectProperties callback signature is (dbId, attrId, valId)
                pdb.enumObjectProperties(dbId, function(attrId /*, valId */) {
                    // Get the attribute definition from the id. This MAY be null/undefined.
                    var def = pdb.getAttributeDef(attrId);

                    // Category
                    var category = (def && def.category) ? def.category : 'General';

                    // Property display name. Fallbacks ensure we always get some string.
                    var propName =
                        (def && (def.displayName || def.name)) ||
                        (typeof attrId === 'number' ? ('attr:' + attrId) : String(attrId));

                    if (!result[category]) result[category] = [];
                    // Cheap de-dupe without Set (better cross-worker serialization)
                    if (result[category].indexOf(propName) === -1) {
                        result[category].push(propName);
                    }
                });
            });
        } catch (e) {
            // Return a recognizable error payload; main thread will handle it.
            return { __error__: true, message: (e && e.message) ? e.message : String(e) };
        }

        return result;
    }).then(function(workerResult) {
        // Back on the main thread.
        if (workerResult && workerResult.__error__) {
            throw new Error('Worker error: ' + workerResult.message);
        }

        // Update in-memory structures/UI on the main thread only.
        modelCategories.clear();
        Object.keys(workerResult).forEach(function(cat) {
            // Store as Set locally (UI likes Sets), but we send/receive arrays over postMessage.
            modelCategories.set(cat, new Set(workerResult[cat]));
        });

        console.log('✅ Found ' + modelCategories.size + ' categories');
        modelCategories.forEach(function(props, cat) {
            console.log('   ' + cat + ': ' + props.size + ' properties');
        });

        // Rebuild the dropdowns now that categories/props are available.
        populateCategoryDropdowns();
    }).catch(function(err) {
        console.error('❌ Property extraction failed:', err);
    });
}

// Populate all category dropdowns with extracted categories
function populateCategoryDropdowns() {
    const categories = Array.from(modelCategories.keys()).sort();
    
    // Update all existing filter category dropdowns
    document.querySelectorAll('.filter-category').forEach(select => {
        const currentValue = select.value;
        select.innerHTML = '<option value="">-- Select Category --</option>';
        
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            if (category === currentValue) {
                option.selected = true;
            }
            select.appendChild(option);
        });
        
        select.disabled = false;
    });
    
    // Enable the add filter button
    const btnAddFilter = document.getElementById('btnAddFilter');
    if (btnAddFilter) {
        btnAddFilter.disabled = false;
    }
    
    showNotification('Model properties extracted. You can now configure filters.', 'success');
}

// Handle category selection change
function onCategoryChange(filterId) {
    const categorySelect = document.getElementById(`filterCategory${filterId}`);
    const propertySelect = document.getElementById(`filterProperty${filterId}`);
    
    if (!categorySelect || !propertySelect) return;
    
    const selectedCategory = categorySelect.value;
    
    if (!selectedCategory) {
        propertySelect.innerHTML = '<option value="">Select category first...</option>';
        propertySelect.disabled = true;
        return;
    }
    
    const properties = Array.from(modelCategories.get(selectedCategory) || []).sort();
    
    propertySelect.innerHTML = '<option value="">-- Select Property --</option>';
    properties.forEach(prop => {
        const option = document.createElement('option');
        option.value = prop;
        option.textContent = prop;
        propertySelect.appendChild(option);
    });
    
    propertySelect.disabled = false;
}

// Add a new filter row
function addFilterRow() {
    const container = document.getElementById('elementFiltersContainer');
    if (!container) return;
    
    const newFilterId = filterRowCount++;
    const newRow = document.createElement('div');
    newRow.className = 'filter-row';
    newRow.setAttribute('data-filter-id', newFilterId);
    
    // Get available categories
    const categories = Array.from(modelCategories.keys()).sort();
    const categoriesHTML = categories.map(cat => 
        `<option value="${cat}">${cat}</option>`
    ).join('');
    
    newRow.innerHTML = `
        <select class="filter-category" id="filterCategory${newFilterId}" aria-label="Element category" onchange="onCategoryChange(${newFilterId})">
            <option value="">-- Select Category --</option>
            ${categoriesHTML}
        </select>
        <select class="filter-property" id="filterProperty${newFilterId}" aria-label="Element property" disabled>
            <option value="">Select category first...</option>
        </select>
        <button class="btn-icon btn-remove-filter" onclick="removeFilter(${newFilterId})" title="Remove filter" aria-label="Remove filter">
            ✕
        </button>
    `;
    
    container.appendChild(newRow);
    
    // Show remove buttons on all rows except the first
    updateRemoveButtons();
}

// Remove a filter row
function removeFilter(filterId) {
    const row = document.querySelector(`[data-filter-id="${filterId}"]`);
    if (row && filterId !== 0) { // Don't remove the first row
        row.remove();
        updateRemoveButtons();
    }
}

// Update visibility of remove buttons
function updateRemoveButtons() {
    const rows = document.querySelectorAll('.filter-row');
    rows.forEach((row, index) => {
        const removeBtn = row.querySelector('.btn-remove-filter');
        if (removeBtn) {
            removeBtn.style.display = rows.length > 1 && index > 0 ? 'inline-block' : 'none';
        }
    });
}

// Get all configured filters
function getConfiguredFilters() {
    const filters = [];
    document.querySelectorAll('.filter-row').forEach(row => {
        const categorySelect = row.querySelector('.filter-category');
        const propertySelect = row.querySelector('.filter-property');
        
        if (categorySelect && propertySelect && categorySelect.value && propertySelect.value) {
            filters.push({
                category: categorySelect.value,
                property: propertySelect.value
            });
        }
    });
    return filters;
}

// Token Management
function getStoredToken() {
    let stored = sessionStorage.getItem('forge_token');
    if (!stored) {
        stored = localStorage.getItem('forge_token_backup');
        if (stored) {
            sessionStorage.setItem('forge_token', stored);
        }
    }
    return stored ? JSON.parse(stored) : null;
}

function isTokenExpired(tokenInfo) {
    const now = Date.now();
    const expiresAt = tokenInfo.expires_at;
    const timeUntilExpiry = expiresAt - now;
    return timeUntilExpiry < (5 * 60 * 1000);
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
                <button onclick="window.location.href='scheduling-hub.html'" style="background: #059669; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; cursor: pointer; font-size: 0.875rem; margin-right: 0.5rem;">
                    Back to Hub
                </button>
                <button onclick="location.reload()" style="background: #6b7280; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; cursor: pointer; font-size: 0.875rem;">
                    Try Again
                </button>
            </div>
        `;
    }
}

// CSV Functions
function setupEventListeners() {
    const csvInput = document.getElementById('esCsvInput');
    if (csvInput) {
        csvInput.addEventListener('change', handleCSVUpload);
    }

    const modelSelect = document.getElementById('esModelSelect');
    if (modelSelect) {
        modelSelect.addEventListener('change', onModelChange);
    }

    const projectSelect = document.getElementById('esProjectSelect');
    if (projectSelect) {
        projectSelect.addEventListener('change', onProjectChange);
    }

    const scrubber = document.getElementById('timelineScrubber');
    if (scrubber) {
        scrubber.addEventListener('input', onTimelineScrub);
    }
}

async function handleCSVUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        const text = await file.text();
        parseAndLoadSchedule(text);
    } catch (error) {
        console.error('Error reading CSV:', error);
        showNotification('Failed to read CSV file', 'error');
    }
}

function parseAndLoadSchedule(csvText) {
    console.log('📋 Parsing CSV schedule...');

    try {
        const lines = csvText.trim().split('\n');
        if (lines.length < 2) {
            throw new Error('CSV file is empty or invalid');
        }

        // Expected columns: ActivityName, StartDate, DurationDays, EndDate, Type, Description, ElementValues
        const header = lines[0].split(',').map(h => h.trim());
        console.log('CSV Header:', header);

        const activities = [];
        const allDays = new Set();
        activityElementMap.clear();
        dayActivitiesMap.clear();

        for (let i = 1; i < lines.length; i++) {
            const row = lines[i].split(',').map(c => c.trim());
            if (row.length < 6) continue; // Skip invalid rows

            const activity = {
                name: row[0],
                startDate: row[1],
                durationDays: parseInt(row[2]) || 1,
                endDate: row[3],
                type: row[4] || 'Construct',
                description: row[5] || '',
                elementValues: row[6] ? row[6].split('|').map(v => v.trim()) : []
            };

            activities.push(activity);

            // Build activity -> element values map
            if (activity.elementValues.length > 0) {
                activityElementMap.set(activity.name, new Set(activity.elementValues));
            }

            // Build day -> activities map
            const start = new Date(activity.startDate);
            const end = new Date(activity.endDate);

            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                const dayISO = d.toISOString().split('T')[0];
                allDays.add(dayISO);

                if (!dayActivitiesMap.has(dayISO)) {
                    dayActivitiesMap.set(dayISO, new Set());
                }
                dayActivitiesMap.get(dayISO).add(activity.name);
            }
        }

        // Sort days
        timelineDays = Array.from(allDays).sort();

        scheduleData = {
            activities,
            totalActivities: activities.length,
            dateRange: `${timelineDays[0]} to ${timelineDays[timelineDays.length - 1]}`,
            days: timelineDays.length
        };

        console.log(`✅ Parsed ${activities.length} activities across ${timelineDays.length} days`);

        updateScheduleInfo();
        enablePlaybackControls();
        showNotification(`Schedule loaded: ${activities.length} activities`, 'success');

    } catch (error) {
        console.error('Error parsing CSV:', error);
        showNotification('Failed to parse CSV: ' + error.message, 'error');
    }
}

function updateScheduleInfo() {
    const totalActivitiesEl = document.getElementById('totalActivities');
    const dateRangeEl = document.getElementById('dateRange');
    const currentDayEl = document.getElementById('currentDay');

    if (totalActivitiesEl && scheduleData) {
        totalActivitiesEl.textContent = scheduleData.totalActivities;
    }

    if (dateRangeEl && scheduleData) {
        dateRangeEl.textContent = scheduleData.dateRange;
    }

    if (currentDayEl && timelineDays.length > 0) {
        currentDayEl.textContent = timelineDays[currentDayIndex] || '-';
    }

    // Update timeline scrubber
    const scrubber = document.getElementById('timelineScrubber');
    if (scrubber && timelineDays.length > 0) {
        scrubber.max = timelineDays.length - 1;
        scrubber.value = currentDayIndex;
        scrubber.disabled = false;
    }

    // Update timeline labels
    const timelineStart = document.getElementById('timelineStart');
    const timelineEnd = document.getElementById('timelineEnd');
    if (timelineStart && timelineDays.length > 0) {
        timelineStart.textContent = timelineDays[0];
    }
    if (timelineEnd && timelineDays.length > 0) {
        timelineEnd.textContent = timelineDays[timelineDays.length - 1];
    }
}

function enablePlaybackControls() {
    document.getElementById('esBtnPlay').disabled = false;
    document.getElementById('esBtnPause').disabled = false;
    document.getElementById('esBtnStep').disabled = false;
    document.getElementById('esBtnReset').disabled = false;
}

// Sample CSV data
function useSampleCSV() {
    console.log('Loading sample CSV...');

    const sampleCSV = `ActivityName,StartDate,DurationDays,EndDate,Type,Description,ElementValues
Foundation Work,2025-01-01,3,2025-01-03,Construct,Pour foundation,MK-001|MK-002|MK-003
Column Erection Phase 1,2025-01-04,2,2025-01-05,Construct,Install columns A-D,MK-004|MK-005|MK-006|MK-007
Beam Installation,2025-01-06,2,2025-01-07,Construct,Install beams level 1,MK-008|MK-009|MK-010
Wall Panel Phase 1,2025-01-08,3,2025-01-10,Construct,Install wall panels north,MK-011|MK-012|MK-013
Column Erection Phase 2,2025-01-11,2,2025-01-12,Construct,Install columns E-H,MK-014|MK-015|MK-016|MK-017
Deck Installation,2025-01-13,2,2025-01-14,Construct,Install deck level 1,MK-018|MK-019|MK-020
Wall Panel Phase 2,2025-01-15,2,2025-01-16,Construct,Install wall panels south,MK-021|MK-022|MK-023
Roof Structure,2025-01-17,3,2025-01-19,Construct,Install roof beams,MK-024|MK-025|MK-026`;

    parseAndLoadSchedule(sampleCSV);
}

// Playback Controls
function playSequence() {
    if (isPlaying) return;

    console.log('▶️ Playing sequence');
    isPlaying = true;

    document.getElementById('esBtnPlay').disabled = true;
    document.getElementById('esBtnPause').disabled = false;

    playInterval = setInterval(() => {
        stepForward();
        
        if (currentDayIndex >= timelineDays.length - 1) {
            pauseSequence();
        }
    }, 2000); // 2 seconds per day
}

function pauseSequence() {
    console.log('⏸️ Pausing sequence');
    isPlaying = false;

    if (playInterval) {
        clearInterval(playInterval);
        playInterval = null;
    }

    document.getElementById('esBtnPlay').disabled = false;
    document.getElementById('esBtnPause').disabled = true;
}

function stepForward() {
    if (currentDayIndex < timelineDays.length - 1) {
        currentDayIndex++;
    }

    updateTimelinePosition();
    updateCurrentActivities();
    isolateElementsForCurrentDay();
}

function resetSequence() {
    console.log('🔄 Resetting sequence');

    pauseSequence();
    currentDayIndex = 0;

    updateTimelinePosition();
    updateCurrentActivities();
    isolateElementsForCurrentDay();
}

function onTimelineScrub(event) {
    currentDayIndex = parseInt(event.target.value);
    pauseSequence();
    updateTimelinePosition();
    updateCurrentActivities();
    isolateElementsForCurrentDay();
}

function updateTimelinePosition() {
    const scrubber = document.getElementById('timelineScrubber');
    if (scrubber) {
        scrubber.value = currentDayIndex;
    }

    const currentDayEl = document.getElementById('currentDay');
    if (currentDayEl && timelineDays[currentDayIndex]) {
        currentDayEl.textContent = timelineDays[currentDayIndex];
    }
}

function updateCurrentActivities() {
    const activitiesList = document.getElementById('currentActivitiesList');
    if (!activitiesList) return;

    const currentDay = timelineDays[currentDayIndex];
    if (!currentDay) {
        activitiesList.innerHTML = '<p class="empty-message">No day selected</p>';
        return;
    }

    const activities = dayActivitiesMap.get(currentDay);
    if (!activities || activities.size === 0) {
        activitiesList.innerHTML = '<p class="empty-message">No activities for this day</p>';
        return;
    }

    const activitiesArray = Array.from(activities);
    const html = activitiesArray.map(name => {
        const activity = scheduleData.activities.find(a => a.name === name);
        const typeClass = activity ? activity.type.toLowerCase() : 'construct';
        
        return `
            <div class="activity-item activity-${typeClass}">
                <div class="activity-name">${name}</div>
                ${activity ? `<div class="activity-desc">${activity.description}</div>` : ''}
            </div>
        `;
    }).join('');

    activitiesList.innerHTML = html;
}

async function isolateElementsForCurrentDay() {
    if (!viewer || !viewerModel || !selectedElementGroup) {
        console.log('Viewer or model not ready');
        return;
    }

    const currentDay = timelineDays[currentDayIndex];
    if (!currentDay) return;

    const activities = dayActivitiesMap.get(currentDay);
    if (!activities || activities.size === 0) {
        viewer.showAll();
        return;
    }

    updateViewerStatus(`Loading elements for ${currentDay}...`);

    try {
        // Collect all element values for today's activities
        const elementValues = new Set();
        activities.forEach(activityName => {
            const values = activityElementMap.get(activityName);
            if (values) {
                values.forEach(v => elementValues.add(v));
            }
        });

        if (elementValues.size === 0) {
            console.log('No element values for current activities');
            viewer.showAll();
            return;
        }

        console.log(`🔍 Isolating ${elementValues.size} elements for ${activities.size} activities`);

        // Get configured filters
        const filters = getConfiguredFilters();
        if (filters.length === 0) {
            showNotification('Please configure at least one element filter', 'warning');
            viewer.showAll();
            return;
        }

        console.log('Using filters:', filters);

        // Use first configured filter for now (can be enhanced to use multiple)
        const primaryFilter = filters[0];
        const linkProperty = primaryFilter.property;

        // Build GraphQL filter for multiple values using IN clause
        const filter = window.AECDataModel.buildFilterForValues(Array.from(elementValues), linkProperty);
        console.log('GraphQL Filter:', filter);

        // Query elements from AEC DM
        const elements = await window.AECDataModel.getElements({
            token: window.forgeAccessToken,
            region: 'US',
            elementGroupId: selectedElementGroup.id,
            filter: filter
        });

        console.log(`✅ Got ${elements.length} elements from AEC DM`);

        if (elements.length === 0) {
            showNotification(`No elements found matching ${linkProperty} values`, 'warning');
            viewer.showAll();
            return;
        }

        // Extract external IDs
        const externalIds = elements.map(e => e.externalId).filter(id => id);
        console.log(`External IDs: ${externalIds.length}`);

        if (externalIds.length === 0) {
            showNotification('No external IDs found for elements', 'warning');
            viewer.showAll();
            return;
        }

        // Map external IDs to dbIds using Viewer API
        viewerModel.getExternalIdMapping((mapping) => {
            const dbIds = [];
            externalIds.forEach(extId => {
                const dbId = mapping[extId];
                if (dbId) {
                    dbIds.push(dbId);
                }
            });

            console.log(`✅ Mapped to ${dbIds.length} dbIds`);

            if (dbIds.length > 0) {
                viewer.isolate(dbIds);
                viewer.fitToView(dbIds);
                updateViewerStatus(`Showing ${dbIds.length} elements`);
            } else {
                showNotification('No matching elements found in model', 'warning');
                viewer.showAll();
            }
        });

    } catch (error) {
        console.error('Error isolating elements:', error);
        showNotification('Failed to isolate elements: ' + error.message, 'error');
        updateViewerStatus('Error loading elements');
    }
}

// ---- Viewer Controls (exact implementations) ----
let _homeState = null;

function _saveHomeState() {
    if (viewer) {
        _homeState = viewer.getState({ viewport: true, objectSet: true, renderOptions: true });
    }
}

function viewerReset() {
    if (!viewer) return;
    // Restore "home" camera + visibility
    if (_homeState) {
        viewer.restoreState(_homeState);
    } else {
        viewer.showAll();
        viewer.fitToView();
    }
}

function viewerFitToView() {
    if (!viewer) return;
    viewer.showAll();
    viewer.fitToView();
}

function viewerIsolate() {
    if (!viewer) return;
    const sel = viewer.getSelection();
    if (sel && sel.length > 0) {
        viewer.isolate(sel);
        viewer.fitToView(sel);
    }
}

function viewerShowAll() {
    if (!viewer) return;
    viewer.showAll();
    viewer.fitToView();
}

// AEC Data Model Diagnostic Test
async function testAECDataModel() {
    console.log('\n🧪 === AEC DATA MODEL DIAGNOSTIC TEST ===');
    
    if (!selectedProjectId) {
        showNotification('Please select a project first', 'warning');
        console.error('❌ No project selected');
        return;
    }
    
    const projectSelect = document.getElementById('esProjectSelect');
    const selectedOption = projectSelect.options[projectSelect.selectedIndex];
    const projectObj = JSON.parse(selectedOption.dataset.projectData || '{}');
    const projectName = projectObj.name;           // exact ACC name
    
    showNotification('Testing AEC Data Model...', 'info');
    console.log('📋 Test Configuration:');
    console.log('  Selected Project Name:', projectName);
    console.log('  Selected Project ID:', selectedProjectId);
    console.log('  Project Number:', projectObj.number || 'N/A');
    console.log('  Forge Token Available:', !!window.forgeAccessToken);
    console.log('  GraphQL Endpoint:', 'https://developer.api.autodesk.com/aec/graphql');
    
    const token = window.forgeAccessToken;
    
    // First, test if GraphQL endpoint is accessible at all
    console.log('\n🔬 Testing GraphQL Introspection...');
    try {
        const introspectionData = await window.AECDataModel.introspect({ token, region: 'US' });
        console.log('✅ GraphQL Introspection SUCCESS');
        console.log('Schema type:', introspectionData.__schema?.queryType?.name);
        
    } catch (introspectionError) {
        console.error('❌ GraphQL Introspection FAILED:', introspectionError);
        console.error('This suggests AEC Data Model API is not accessible with your token');
        console.error('Required scope: data:read (you should have this)');
    }
    
    const results = {
        regions: []
    };
    
    // Get the preferred hub name to match runtime behavior
    const preferredHubName = globalHubData?.hubInfo?.attributes?.name || null;
    console.log('🏢 Using preferred hub for diagnostic:', preferredHubName || 'none (will use first hub)');
    
    // Test different regions using PROJECT NAME (not ACC ID)
    const regions = ['US', 'EMEA', 'AUS'];
    console.log('\n🌍 Testing Regions with Project Name Lookup:');
    
    for (const region of regions) {
        try {
            console.log(`\n  Testing region: ${region}`);
            const data = await window.AECDataModel.getElementGroups({
                token,
                region,
                projectName,
                preferredHubName
            });
            
            results.regions.push({
                region,
                success: true,
                count: data.length
            });
            
            console.log(`  ✅ SUCCESS - Found ${data.length} element groups`);
            
        } catch (error) {
            results.regions.push({
                region,
                success: false,
                error: error.message
            });
            
            console.log(`  ❌ FAILED - ${error.message}`);
        }
    }
    
    // Summary
    console.log('\n📊 === TEST SUMMARY ===');
    
    const successfulRegions = results.regions.filter(r => r.success);
    
    if (successfulRegions.length > 0) {
        console.log('\n✅ Working Regions:');
        successfulRegions.forEach(r => {
            console.log(`  • ${r.region}: ${r.count} element groups`);
        });
    } else {
        console.log('\n❌ No regions worked');
    }
    
    if (successfulRegions.length === 0) {
        console.log('\n⚠️  CONCLUSION: AEC Data Model is NOT available');
        console.log('Possible reasons:');
        console.log('  1. AEC DM not activated on ACC account');
        console.log('  2. Models are Revit 2023 or earlier');
        console.log('  3. Models uploaded before AEC DM activation');
        console.log('  4. Project has no published Revit models');
        console.log('  5. Project name mismatch between ACC and AEC DM');
        
        showNotification('AEC Data Model NOT available - Check console for details', 'error');
    } else {
        console.log('\n✅ CONCLUSION: AEC Data Model IS available!');
        showNotification(`AEC DM available! Found ${successfulRegions[0]?.count} designs`, 'success');
    }
    
    console.log('\n=== END DIAGNOSTIC TEST ===\n');
}

// Utilities
function updateViewerStatus(text) {
    const statusEl = document.getElementById('viewerStatusText');
    if (statusEl) {
        statusEl.textContent = text;
    }
}

function showNotification(message, type = 'info') {
    console.log(`Notification (${type}): ${message}`);

    const notification = document.getElementById('notification');
    const content = document.getElementById('notificationContent');

    if (notification && content) {
        content.textContent = message;
        notification.className = `notification ${type} show`;

        setTimeout(() => {
            notification.classList.remove('show');
        }, 4000);
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function () {
    console.log('Erection Sequencing page loaded');
    initializeErectionSequencing();
});

