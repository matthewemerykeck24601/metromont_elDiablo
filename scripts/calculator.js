// Engineering Calculator - Complete JavaScript File
console.log('Engineering Calculator script loaded');

// ACC Configuration
const ACC_CLIENT_ID = window.ACC_CLIENT_ID || '';
console.log('ACC Client ID available:', !!ACC_CLIENT_ID);

// Global Variables
let forgeAccessToken = null;
let selectedProject = null;
let selectedProjectData = null;
let selectedModel = null;
let forgeViewer = null;
let calculationHistory = [];
let currentCalculation = null;
let globalHubData = null;
let isAuthenticated = false;
let authCheckComplete = false;

// Model Discovery Variables
let discoveredModels = [];
let selectedModels = [];

// Token Management Functions
function getStoredToken() {
    const sessionToken = sessionStorage.getItem('forge_token');
    if (sessionToken) {
        try {
            return JSON.parse(sessionToken);
        } catch (e) {
            console.error('Failed to parse session token:', e);
        }
    }

    const tokenData = localStorage.getItem('forgeToken');
    return tokenData ? JSON.parse(tokenData) : null;
}

function clearStoredToken() {
    sessionStorage.removeItem('forge_token');
    sessionStorage.removeItem('castlink_hub_data');
    localStorage.removeItem('forgeToken');
    localStorage.removeItem('hubData');
}

function isTokenExpired(tokenData) {
    if (!tokenData || !tokenData.expires_at) return true;
    return Date.now() >= tokenData.expires_at;
}

// Authentication Functions
async function verifyToken(token) {
    try {
        const response = await fetch('https://developer.api.autodesk.com/userprofile/v1/users/@me', {
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

// Initialize Calculator
async function initializeCalculator() {
    try {
        console.log('=== ENGINEERING CALCULATOR INITIALIZATION ===');

        // Initialize UI
        initializeUI();

        // Update status
        updateAuthStatus('Checking Authentication...', 'Verifying access...');

        // Check for project data from engineering page
        const calculatorData = getCalculatorProjectData();

        if (calculatorData) {
            console.log('📦 Received project data from engineering page');

            // Restore authentication and project context
            forgeAccessToken = calculatorData.forgeAccessToken;
            selectedProject = calculatorData.projectId;
            selectedProjectData = calculatorData.selectedProjectData || {
                id: calculatorData.projectId,
                name: calculatorData.projectName
            };
            globalHubData = calculatorData.globalHubData;

            console.log('Restored project context:');
            console.log('- Project ID:', selectedProject);
            console.log('- Project Name:', calculatorData.projectName);
            console.log('- Hub ID:', globalHubData?.hubId);
            console.log('- Token exists:', !!forgeAccessToken);

            // Complete authentication with project
            await completeAuthenticationWithProject();

        } else {
            console.log('🔄 No project data found, checking authentication...');

            // Try session storage
            const sessionHubData = sessionStorage.getItem('castlink_hub_data');
            const sessionToken = sessionStorage.getItem('forge_token');

            if (sessionToken && sessionHubData) {
                try {
                    const tokenData = JSON.parse(sessionToken);
                    globalHubData = JSON.parse(sessionHubData);

                    if (!isTokenExpired(tokenData)) {
                        forgeAccessToken = tokenData.access_token;
                        await completeAuthentication();
                        return;
                    }
                } catch (e) {
                    console.error('Failed to parse session data:', e);
                }
            }

            // Check parent window
            if (window.opener && window.opener.CastLinkAuth) {
                const parentAuth = window.opener.CastLinkAuth;
                const isParentAuth = await parentAuth.waitForAuth();

                if (isParentAuth) {
                    forgeAccessToken = parentAuth.getToken();
                    globalHubData = parentAuth.getHubData();
                    await completeAuthentication();
                    return;
                }
            }

            // Fallback to stored token
            const storedToken = getStoredToken();
            if (storedToken && !isTokenExpired(storedToken)) {
                forgeAccessToken = storedToken.access_token;

                const isValid = await verifyToken(forgeAccessToken);
                if (isValid) {
                    await completeAuthentication();
                } else {
                    clearStoredToken();
                    redirectToMainApp();
                }
            } else {
                redirectToMainApp();
            }
        }
    } catch (error) {
        console.error('Calculator initialization failed:', error);
        showNotification('Failed to initialize: ' + error.message, 'error');
    } finally {
        authCheckComplete = true;
    }
}

// Get project data from engineering page
function getCalculatorProjectData() {
    try {
        const data = sessionStorage.getItem('calculator_project_data');
        if (data) {
            const parsed = JSON.parse(data);
            // Check if data is recent (within 5 minutes)
            const age = Date.now() - parsed.timestamp;
            if (age < 5 * 60 * 1000) {
                return parsed;
            }
        }
        return null;
    } catch (error) {
        console.error('Error reading calculator project data:', error);
        return null;
    }
}

// Redirect to main app
function redirectToMainApp() {
    updateAuthStatus('Not Authenticated', 'Please authenticate from the main dashboard');
    showNotification('Redirecting to main dashboard...', 'info');
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 2000);
}

// Complete authentication
async function completeAuthentication() {
    try {
        updateAuthStatus('Loading Projects...', 'Fetching project data...');

        // Load hub data
        await loadPreLoadedHubData();

        isAuthenticated = true;

        const projectCount = globalHubData && globalHubData.projects ? globalHubData.projects.length : 0;
        const accountName = globalHubData && globalHubData.accountInfo ? globalHubData.accountInfo.name : 'ACC Account';

        updateAuthStatus('✅ Connected', `Connected to ${accountName} (${projectCount} projects)`);

        // Populate project dropdown
        populateProjectDropdown();

        // Load calculation history
        loadCalculationHistory();

        console.log('✅ Calculator ready');

    } catch (error) {
        console.error('Authentication completion failed:', error);
        showNotification('Failed to load project data: ' + error.message, 'error');
    }
}

// Complete authentication with project
async function completeAuthenticationWithProject() {
    try {
        const calculatorData = JSON.parse(sessionStorage.getItem('calculator_project_data'));

        if (calculatorData) {
            // Make sure we have the project ID
            if (!calculatorData.projectId) {
                console.error('No project ID in calculator data');
                await completeAuthentication();
                return;
            }

            // Set the project data properly
            selectedProject = calculatorData.projectId;
            selectedProjectData = calculatorData.selectedProjectData || {
                id: calculatorData.projectId,
                name: calculatorData.projectName
            };

            updateAuthStatus('✅ Project Selected', `${calculatorData.projectName || 'Unknown Project'}`);

            // Hide project selection interface
            const projectSelection = document.getElementById('projectSelection');
            if (projectSelection) {
                projectSelection.style.display = 'none';
            }

            // Initialize with project data
            await initializeWithProjectData();
        } else {
            await completeAuthentication();
        }

    } catch (error) {
        console.error('Enhanced authentication failed:', error);
        updateAuthStatus('❌ Error', 'Failed to load project: ' + error.message);

        const projectSelection = document.getElementById('projectSelection');
        if (projectSelection) {
            projectSelection.style.display = 'block';
        }
        await completeAuthentication();
    }
}

// Load hub data
async function loadPreLoadedHubData() {
    console.log('Loading hub data...');

    if (globalHubData && globalHubData.projects) {
        console.log('Using existing hub data:', globalHubData.projects.length, 'projects');
        return;
    }

    // Try session storage
    const sessionHubData = sessionStorage.getItem('castlink_hub_data');
    if (sessionHubData) {
        try {
            globalHubData = JSON.parse(sessionHubData);
            console.log('Loaded hub data from session storage');
            return;
        } catch (e) {
            console.error('Failed to parse session hub data:', e);
        }
    }

    // Try localStorage
    const storedData = localStorage.getItem('hubData');
    if (storedData) {
        try {
            globalHubData = JSON.parse(storedData);
            console.log('Loaded hub data from localStorage');
            return;
        } catch (error) {
            console.error('Failed to parse stored hub data:', error);
        }
    }

    console.log('No hub data available');
}

// Populate project dropdown
function populateProjectDropdown() {
    const projectSelect = document.getElementById('projectSelect');
    if (!projectSelect || !globalHubData) return;

    projectSelect.innerHTML = '<option value="">Select a project...</option>';

    if (globalHubData.projects && globalHubData.projects.length > 0) {
        globalHubData.projects.forEach((project, index) => {
            const option = document.createElement('option');
            option.value = project.id;
            option.textContent = project.name || project.displayName || 'Unnamed Project';
            option.dataset.projectIndex = index;
            projectSelect.appendChild(option);
        });

        projectSelect.disabled = false;
    } else {
        projectSelect.innerHTML = '<option value="">No projects available</option>';
        projectSelect.disabled = true;
    }

    // If project was pre-selected, set it
    if (selectedProject) {
        projectSelect.value = selectedProject;
        onProjectChange();
    }
}

// Project change handler
async function onProjectChange() {
    const projectSelect = document.getElementById('projectSelect');
    selectedProject = projectSelect.value;

    if (!selectedProject) {
        document.getElementById('projectName').textContent = 'No project selected';
        document.getElementById('projectDetails').textContent = 'Select a project to begin calculations';
        document.getElementById('modelSelectBtn').disabled = true;
        discoveredModels = [];
        selectedModels = [];
        return;
    }

    // Find project data
    if (globalHubData && globalHubData.projects) {
        const projectIndex = projectSelect.selectedOptions[0].dataset.projectIndex;
        selectedProjectData = globalHubData.projects[parseInt(projectIndex)];
    }

    if (selectedProjectData) {
        document.getElementById('projectName').textContent = selectedProjectData.name || 'Unknown Project';
        document.getElementById('projectDetails').textContent = `Project ${selectedProjectData.number || 'N/A'} - ${selectedProjectData.location || 'Location not specified'}`;
        document.getElementById('modelSelectBtn').disabled = false;

        // Clear previous models
        discoveredModels = [];
        selectedModels = [];
    }
}

// Initialize with project data
async function initializeWithProjectData() {
    try {
        updateAuthStatus('🔍 Discovering Models', `Scanning project for Revit models...`);

        console.log('Selected Project:', selectedProject);
        console.log('Selected Project Data:', selectedProjectData);

        // Discover models
        const models = await discoverRevitModels();

        // Show model selection dialog
        showAlignedModelSelection();

        console.log('✅ Model discovery complete');

    } catch (error) {
        console.error('Model discovery failed:', error);
        updateAuthStatus('⚠️ Warning', 'Model discovery failed, but you can continue');
        showAlignedModelSelection();
    }
}

// Discover Revit models
async function discoverRevitModels() {
    try {
        console.log('🔍 Discovering Revit models...');
        console.log('Selected Project:', selectedProject);
        console.log('Selected Project Data:', selectedProjectData);

        if (!forgeAccessToken || !selectedProject) {
            throw new Error('Missing authentication or project selection');
        }

        const models = [];

        // Get hub ID
        const hubId = globalHubData?.hubId || getHubId();
        if (!hubId) {
            console.error('Unable to determine hub ID');
            return [];
        }

        console.log('Hub ID:', hubId);
        console.log('Project ID:', selectedProject);

        try {
            // Get top folders
            const topFoldersUrl = `https://developer.api.autodesk.com/project/v1/hubs/${hubId}/projects/${selectedProject}/topFolders`;
            console.log('Getting top folders:', topFoldersUrl);

            const topFoldersResponse = await fetch(topFoldersUrl, {
                headers: {
                    'Authorization': `Bearer ${forgeAccessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            console.log('Top folders response status:', topFoldersResponse.status);

            if (topFoldersResponse.ok) {
                const topFoldersData = await topFoldersResponse.json();
                console.log('✅ Top folders found:', topFoldersData.data?.length || 0);

                // Process each folder
                for (const folder of topFoldersData.data || []) {
                    console.log(`Scanning folder: ${folder.attributes?.displayName || folder.attributes?.name}`);
                    const folderModels = await scanFolderForModels(hubId, selectedProject, folder);
                    models.push(...folderModels);
                }
            } else if (topFoldersResponse.status === 404) {
                console.log('Top folders endpoint not found, trying alternative approach...');
                // Try alternative approach
                const altModels = await tryAlternativeFolderDiscovery();
                models.push(...altModels);
            } else {
                const errorText = await topFoldersResponse.text();
                console.error('Failed to get top folders:', topFoldersResponse.status, errorText);
            }
        } catch (error) {
            console.error('Error getting top folders:', error);
            // Try alternative approach
            const altModels = await tryAlternativeFolderDiscovery();
            models.push(...altModels);
        }

        discoveredModels = models;
        console.log(`🏗️ Found ${models.length} Revit models`);
        return models;

    } catch (error) {
        console.error('Error discovering models:', error);
        discoveredModels = [];
        return [];
    }
}

// Try alternative folder discovery approaches
async function tryAlternativeFolderDiscovery() {
    const models = [];

    try {
        // Try the data API endpoint for project root
        const rootUrl = `https://developer.api.autodesk.com/data/v1/projects/${selectedProject}`;
        console.log('Trying project root:', rootUrl);

        const rootResponse = await fetch(rootUrl, {
            headers: {
                'Authorization': `Bearer ${forgeAccessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (rootResponse.ok) {
            const rootData = await rootResponse.json();
            console.log('Project root data:', rootData);

            // Look for root folder reference
            if (rootData.data?.relationships?.rootFolder?.data?.id) {
                const rootFolderId = rootData.data.relationships.rootFolder.data.id;
                console.log('Found root folder:', rootFolderId);

                // Create a fake folder object to scan
                const rootFolder = {
                    id: rootFolderId,
                    attributes: { displayName: 'Project Root' }
                };

                const folderModels = await scanFolderForModels(null, selectedProject, rootFolder);
                models.push(...folderModels);
            }
        }
    } catch (error) {
        console.error('Alternative discovery failed:', error);
    }

    return models;
}

// Scan folder for models
async function scanFolderForModels(hubId, projectId, folder, models = []) {
    try {
        const contentsUrl = `https://developer.api.autodesk.com/data/v1/projects/${projectId}/folders/${folder.id}/contents`;
        console.log('Getting folder contents:', contentsUrl);
        console.log('Folder:', folder.attributes?.displayName || 'Unknown');

        const contentsResponse = await fetch(contentsUrl, {
            headers: {
                'Authorization': `Bearer ${forgeAccessToken}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('Contents response status:', contentsResponse.status);

        if (!contentsResponse.ok) {
            if (contentsResponse.status === 403) {
                console.warn(`No permission to access folder ${folder.attributes?.displayName}`);
            } else {
                console.error(`Failed to get contents for folder ${folder.attributes?.displayName}:`, contentsResponse.status);
            }
            return models;
        }

        const contentsData = await contentsResponse.json();
        console.log(`Found ${contentsData.data?.length || 0} items in folder ${folder.attributes?.displayName}`);

        // Process each item
        for (const item of contentsData.data || []) {
            console.log(`Item: ${item.attributes?.displayName} (${item.type})`);

            if (item.type === 'folders') {
                // Recursively scan subfolder
                console.log(`Scanning subfolder: ${item.attributes?.displayName}`);
                await scanFolderForModels(hubId, projectId, item, models);
            } else if (item.type === 'items') {
                // Check if it's a Revit file
                const fileName = item.attributes?.displayName || '';
                const extension = fileName.toLowerCase().split('.').pop();

                if (extension === 'rvt') {
                    console.log(`Found Revit model: ${fileName}`);

                    try {
                        // Get version information
                        const versionsUrl = `https://developer.api.autodesk.com/data/v1/projects/${projectId}/items/${item.id}/versions`;
                        const versionsResponse = await fetch(versionsUrl, {
                            headers: { 'Authorization': `Bearer ${forgeAccessToken}` }
                        });

                        if (versionsResponse.ok) {
                            const versionsData = await versionsResponse.json();
                            const latestVersion = versionsData.data?.[0];

                            if (latestVersion) {
                                // Get the derivative URN properly
                                let derivativeUrn = null;
                                if (latestVersion.relationships?.derivatives?.data?.id) {
                                    derivativeUrn = latestVersion.relationships.derivatives.data.id;
                                } else if (latestVersion.id) {
                                    // Encode the version ID as URN
                                    derivativeUrn = btoa(latestVersion.id).replace(/=/g, '');
                                }

                                const modelData = {
                                    id: item.id,
                                    name: item.attributes.displayName,
                                    folderName: folder.attributes?.displayName || 'Root',
                                    folderId: folder.id,
                                    versionId: latestVersion.id,
                                    versionUrn: derivativeUrn,
                                    storageUrn: latestVersion.relationships?.storage?.data?.id,
                                    size: item.attributes.storageSize || 0,
                                    lastModified: latestVersion.attributes.lastModifiedTime || latestVersion.attributes.createTime,
                                    translationStatus: 'pending',
                                    modelPropertiesReady: false
                                };

                                models.push(modelData);
                                console.log(`✅ Added model: ${modelData.name} (URN: ${modelData.versionUrn})`);
                            }
                        }
                    } catch (versionError) {
                        console.error(`Error getting version for ${item.attributes.displayName}:`, versionError);
                    }
                } else {
                    console.log(`Skipping non-Revit file: ${fileName} (.${extension})`);
                }
            }
        }

        return models;

    } catch (error) {
        console.error(`Error scanning folder:`, error);
        return models;
    }
}

// Get hub ID helper
function getHubId() {
    if (globalHubData && globalHubData.hubId) {
        return globalHubData.hubId;
    }

    if (selectedProject && selectedProject.startsWith('b.')) {
        const parts = selectedProject.split('.');
        if (parts.length >= 2) {
            return `b.${parts[1]}`;
        }
    }

    return null;
}

// Show model selection dialog
function showAlignedModelSelection() {
    const modalOverlay = document.getElementById('modelSelectionModal');
    const folderTree = document.getElementById('folderTree');
    const modelsList = document.getElementById('availableModels');

    if (modalOverlay) {
        modalOverlay.style.display = 'flex';
    }

    if (!discoveredModels || discoveredModels.length === 0) {
        // No models found
        if (folderTree) {
            folderTree.innerHTML = `
                <div class="no-models-message">
                    <p>⚠️ Unable to automatically discover models in this project.</p>
                    <p>This can happen if:</p>
                    <ul style="text-align: left; margin: 1rem 0;">
                        <li>The project doesn't have folders enabled</li>
                        <li>The project uses a different structure</li>
                        <li>Additional permissions are needed</li>
                    </ul>
                    <p>You can still proceed with the calculator:</p>
                    <button class="btn btn-primary" onclick="proceedWithoutModel()">
                        Continue Without Model
                    </button>
                </div>
            `;
        }

        if (modelsList) {
            modelsList.innerHTML = `
                <div class="manual-model-entry">
                    <h4>Manual Model Entry</h4>
                    <p>Enter the Model URN if you have it:</p>
                    <input type="text" id="manualModelUrn" placeholder="Model URN" style="width: 100%; padding: 0.5rem; margin: 0.5rem 0;">
                    <button class="btn btn-secondary" onclick="useManualModelUrn()">Use This URN</button>
                </div>
            `;
        }
    } else {
        // Show discovered models
        if (folderTree) {
            folderTree.innerHTML = `
                <h4>Discovered Revit Models (${discoveredModels.length})</h4>
                <div class="models-list">
                    ${discoveredModels.map((model, index) => `
                        <div class="model-item" onclick="selectDiscoveredModel(${index})">
                            <input type="radio" name="modelSelection" id="model_${index}" value="${index}">
                            <label for="model_${index}">
                                <div class="model-name">${model.name}</div>
                                <div class="model-details">
                                    <small>📁 ${model.folderName} • 📅 ${new Date(model.lastModified).toLocaleDateString()}</small>
                                </div>
                            </label>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        if (modelsList) {
            modelsList.innerHTML = `
                <p>Select a model from the list, or proceed without a model.</p>
                <button class="btn btn-secondary" onclick="proceedWithoutModel()">
                    Proceed Without Model
                </button>
            `;
        }
    }
}

// Select discovered model
function selectDiscoveredModel(index) {
    const model = discoveredModels[index];
    if (model) {
        selectedModels = [model];
        console.log('Selected model:', model.name);

        // Update UI
        document.querySelectorAll('.model-item').forEach((item, i) => {
            item.classList.toggle('selected', i === index);
        });

        // Enable select button
        const selectBtn = document.querySelector('#modelSelectionModal .btn-primary');
        if (selectBtn) {
            selectBtn.disabled = false;
        }
    }
}

// Proceed without model
function proceedWithoutModel() {
    console.log('Proceeding without model selection');
    selectedModels = [];
    closeModelSelection();
    openFullCalculator();
}

// Use manual URN
function useManualModelUrn() {
    const urnInput = document.getElementById('manualModelUrn');
    const urn = urnInput?.value?.trim();

    if (urn) {
        selectedModels = [{
            id: 'manual',
            name: 'Manually Entered Model',
            versionUrn: urn,
            translationStatus: 'unknown',
            modelPropertiesReady: false
        }];

        console.log('Using manual URN:', urn);
        closeModelSelection();
        openFullCalculator();
    } else {
        alert('Please enter a valid Model URN');
    }
}

// Handle model selection
function handleModelSelection() {
    if (selectedModels.length > 0) {
        console.log('Models selected:', selectedModels.map(m => m.name));
        closeModelSelection();
        openFullCalculator();
    } else {
        alert('Please select at least one model or proceed without a model');
    }
}

// Close model selection
function closeModelSelection() {
    const modalOverlay = document.getElementById('modelSelectionModal');
    if (modalOverlay) {
        modalOverlay.style.display = 'none';
    }
}

// Open model selector
function openModelSelector() {
    if (!selectedProject) {
        showNotification('Please select a project first', 'warning');
        return;
    }

    if (discoveredModels.length === 0) {
        initializeWithProjectData();
    } else {
        showAlignedModelSelection();
    }
}

// Open full calculator
function openFullCalculator() {
    const projectSelection = document.getElementById('projectSelection');
    const calculatorInterface = document.getElementById('calculatorInterface');

    if (projectSelection) projectSelection.style.display = 'none';
    if (calculatorInterface) {
        calculatorInterface.style.display = 'grid';
        initializeCalculatorInterface();
    }
}

// Initialize calculator interface
function initializeCalculatorInterface() {
    const calculatorInterface = document.getElementById('calculatorInterface');
    if (!calculatorInterface) return;

    // Build the full calculator interface
    calculatorInterface.innerHTML = `
        <!-- 3D Viewer Panel -->
        <div class="viewer-panel">
            <div class="viewer-header">
                <h3>3D Model Viewer</h3>
                <div class="viewer-controls">
                    <button class="viewer-btn" onclick="resetView()">Reset View</button>
                    <button class="viewer-btn" onclick="toggleIsolate()">Isolate</button>
                </div>
            </div>
            <div class="viewer-container" id="forgeViewer">
                ${selectedModels.length > 0 ?
            '<p class="loading-message">Loading 3D model...</p>' :
            '<div class="no-model-message"><p>No model selected</p><p>Calculations can still be performed manually</p></div>'
        }
            </div>
        </div>

        <!-- Calculation Panel -->
        <div class="calculation-panel">
            <div class="calc-header">
                <h3>Engineering Calculations</h3>
                <button class="btn btn-sm" onclick="clearResults()">Clear</button>
            </div>
            
            <!-- Calculation Tabs -->
            <div class="calc-tabs">
                <button class="tab-btn active" onclick="switchTab('point-loads')">Point Loads</button>
                <button class="tab-btn" onclick="switchTab('columns')">Columns</button>
                <button class="tab-btn" onclick="switchTab('walls')">Walls/Panels</button>
                <button class="tab-btn" onclick="switchTab('beams')">Beams/Spandrels</button>
                <button class="tab-btn" onclick="switchTab('double-tees')">Double Tees</button>
            </div>
            
            <div class="calc-content">
                <!-- Point Loads Tab -->
                <div id="point-loads" class="tab-content active">
                    <h3>Point Load Transfer Analysis</h3>
                    <form class="calculation-form">
                        <div class="form-group">
                            <label>Load (kips):</label>
                            <input type="number" id="pointLoad" step="0.1" value="100">
                        </div>
                        <div class="form-group">
                            <label>Eccentricity (in):</label>
                            <input type="number" id="eccentricity" step="0.1" value="0">
                        </div>
                        <div class="form-group">
                            <label>Load Factor:</label>
                            <select id="loadFactor">
                                <option value="1.4">Dead Load (1.4)</option>
                                <option value="1.7">Live Load (1.7)</option>
                                <option value="1.2">Combined (1.2)</option>
                            </select>
                        </div>
                        <button type="button" class="btn btn-primary" onclick="calculatePointLoad()">
                            Calculate Transfer
                        </button>
                    </form>
                </div>

                <!-- Columns Tab -->
                <div id="columns" class="tab-content">
                    <h3>Prestressed Column Design</h3>
                    <form class="calculation-form">
                        <div class="form-row">
                            <div class="form-group">
                                <label>Width (in):</label>
                                <input type="number" id="columnWidth" value="24">
                            </div>
                            <div class="form-group">
                                <label>Depth (in):</label>
                                <input type="number" id="columnDepth" value="24">
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Height (ft):</label>
                                <input type="number" id="columnHeight" value="20">
                            </div>
                            <div class="form-group">
                                <label>Axial Load (kips):</label>
                                <input type="number" id="columnLoad" value="500">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Strand Pattern:</label>
                            <select id="strandPattern">
                                <option value="4-corner">4 Corner Strands</option>
                                <option value="8-perimeter">8 Perimeter Strands</option>
                                <option value="12-grid">12 Grid Pattern</option>
                            </select>
                        </div>
                        <button type="button" class="btn btn-primary" onclick="calculateColumn()">
                            Design Column
                        </button>
                    </form>
                </div>

                <!-- Additional tabs would go here -->
            </div>
        </div>

        <!-- Results Panel -->
        <div class="results-panel">
            <div class="results-header">
                <h3>Calculation Results</h3>
                <button class="btn btn-sm" onclick="saveCalculation()">Save to OSS</button>
            </div>
            <div id="calculationResults" class="results-content">
                <p class="placeholder">Run a calculation to see results here</p>
            </div>
            <div class="calculation-history">
                <h4>Recent Calculations</h4>
                <div id="calculationHistory" class="history-list">
                    <!-- History items will be added here -->
                </div>
            </div>
        </div>
    `;

    // Initialize Forge Viewer if model selected
    if (selectedModels.length > 0) {
        initializeForgeViewer();
    }
}

// Tab switching
function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    const targetTab = document.getElementById(tabName);
    if (targetTab) {
        targetTab.classList.add('active');
    }
}

// Calculation Functions
function calculatePointLoad() {
    const load = parseFloat(document.getElementById('pointLoad').value);
    const eccentricity = parseFloat(document.getElementById('eccentricity').value);
    const loadFactor = parseFloat(document.getElementById('loadFactor').value);

    const factoredLoad = load * loadFactor;
    const moment = factoredLoad * eccentricity;

    const results = {
        type: 'Point Load Transfer',
        inputs: { load, eccentricity, loadFactor },
        outputs: {
            factoredLoad: factoredLoad.toFixed(2),
            moment: moment.toFixed(2),
            status: 'Calculated'
        }
    };

    displayResults(results);
    addToHistory(results);
}

function calculateColumn() {
    const width = parseFloat(document.getElementById('columnWidth').value);
    const depth = parseFloat(document.getElementById('columnDepth').value);
    const height = parseFloat(document.getElementById('columnHeight').value);
    const axialLoad = parseFloat(document.getElementById('columnLoad').value);
    const strandPattern = document.getElementById('strandPattern').value;

    // PCI column design calculations
    const area = width * depth;
    const momentInertia = (width * Math.pow(depth, 3)) / 12;
    const radiusGyration = Math.sqrt(momentInertia / area);
    const slenderness = (height * 12) / radiusGyration;

    // Simplified P-M interaction
    const phi = 0.75; // Column reduction factor
    const fc = 5000; // Concrete strength (psi)
    const nominalCapacity = 0.85 * fc * area / 1000; // kips
    const designCapacity = phi * nominalCapacity;

    const results = {
        type: 'Prestressed Column Design',
        inputs: { width, depth, height, axialLoad, strandPattern },
        outputs: {
            area: area.toFixed(0),
            slenderness: slenderness.toFixed(1),
            nominalCapacity: nominalCapacity.toFixed(0),
            designCapacity: designCapacity.toFixed(0),
            utilization: (axialLoad / designCapacity * 100).toFixed(1),
            status: axialLoad < designCapacity ? 'PASS' : 'FAIL'
        }
    };

    displayResults(results);
    addToHistory(results);
}

// Display results
function displayResults(results) {
    const resultsDiv = document.getElementById('calculationResults');
    if (!resultsDiv) return;

    let html = `
        <div class="calculation-result">
            <h4>${results.type}</h4>
            <div class="result-section">
                <h5>Inputs:</h5>
                ${Object.entries(results.inputs).map(([key, value]) =>
        `<p><strong>${formatLabel(key)}:</strong> ${value}</p>`
    ).join('')}
            </div>
            <div class="result-section">
                <h5>Results:</h5>
                ${Object.entries(results.outputs).map(([key, value]) =>
        `<p><strong>${formatLabel(key)}:</strong> ${value}</p>`
    ).join('')}
            </div>
            <div class="result-status ${results.outputs.status === 'PASS' ? 'pass' : 'fail'}">
                ${results.outputs.status}
            </div>
        </div>
    `;

    resultsDiv.innerHTML = html;
    currentCalculation = results;
}

// Add to history
function addToHistory(results) {
    results.timestamp = new Date().toISOString();
    results.projectId = selectedProject;
    results.projectName = selectedProjectData?.name || 'Unknown Project';

    calculationHistory.unshift(results);
    if (calculationHistory.length > 10) {
        calculationHistory.pop();
    }

    saveCalculationHistory();
    updateHistoryDisplay();
}

// Update history display
function updateHistoryDisplay() {
    const historyDiv = document.getElementById('calculationHistory');
    if (!historyDiv) return;

    if (calculationHistory.length === 0) {
        historyDiv.innerHTML = '<p class="no-history">No calculations yet</p>';
        return;
    }

    const html = calculationHistory.map((calc, index) => `
        <div class="history-item" onclick="loadHistoryItem(${index})">
            <div class="history-type">${calc.type}</div>
            <div class="history-time">${new Date(calc.timestamp).toLocaleTimeString()}</div>
            <div class="history-status ${calc.outputs.status === 'PASS' ? 'pass' : 'fail'}">
                ${calc.outputs.status}
            </div>
        </div>
    `).join('');

    historyDiv.innerHTML = html;
}

// Load history item
function loadHistoryItem(index) {
    const calculation = calculationHistory[index];
    if (calculation) {
        displayResults(calculation);
    }
}

// Save calculation history
function saveCalculationHistory() {
    localStorage.setItem('calculationHistory', JSON.stringify(calculationHistory));
}

// Load calculation history
function loadCalculationHistory() {
    try {
        const saved = localStorage.getItem('calculationHistory');
        if (saved) {
            calculationHistory = JSON.parse(saved);
            updateHistoryDisplay();
        }
    } catch (error) {
        console.error('Error loading calculation history:', error);
    }
}

// Clear results
function clearResults() {
    const resultsDiv = document.getElementById('calculationResults');
    if (resultsDiv) {
        resultsDiv.innerHTML = '<p class="placeholder">Run a calculation to see results here</p>';
    }
    currentCalculation = null;
}

// Save calculation to OSS
async function saveCalculation() {
    if (!currentCalculation) {
        showNotification('No calculation to save', 'warning');
        return;
    }

    try {
        showNotification('Saving calculation...', 'info');

        // Prepare calculation data
        const calculationData = {
            ...currentCalculation,
            savedAt: new Date().toISOString(),
            projectId: selectedProject,
            projectName: selectedProjectData?.name || 'Unknown Project',
            modelInfo: selectedModels.length > 0 ? selectedModels[0] : null
        };

        // Save to OSS (implementation would go here)
        console.log('Saving calculation to OSS:', calculationData);

        showNotification('Calculation saved successfully!', 'success');

    } catch (error) {
        console.error('Error saving calculation:', error);
        showNotification('Failed to save calculation', 'error');
    }
}

// Format label helper
function formatLabel(key) {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
}

// Initialize Forge Viewer
function initializeForgeViewer() {
    console.log('Initializing Forge Viewer with model:', selectedModels[0]);

    // Check if Autodesk Viewer is loaded
    if (typeof Autodesk === 'undefined') {
        console.error('Autodesk Viewer library not loaded');
        showViewerError('Forge Viewer library not loaded. Please refresh the page.');
        return;
    }

    if (!selectedModels || selectedModels.length === 0) {
        console.error('No model selected');
        return;
    }

    const model = selectedModels[0];
    console.log('Model URN:', model.versionUrn);

    // Initialize viewer
    const viewerDiv = document.getElementById('forgeViewer');
    if (!viewerDiv) {
        console.error('Viewer div not found');
        return;
    }

    // Clear the loading message
    viewerDiv.innerHTML = '';

    // Viewer options
    const options = {
        env: 'AutodeskProduction',
        api: 'derivativeV2',
        getAccessToken: getForgeToken
    };

    // Initialize the viewer
    Autodesk.Viewing.Initializer(options, function onInitialized() {
        console.log('Forge Viewer initialized');

        // Create viewer instance
        const config = {
            extensions: ['Autodesk.DocumentBrowser']
        };

        forgeViewer = new Autodesk.Viewing.GuiViewer3D(viewerDiv, config);
        const startedCode = forgeViewer.start();

        if (startedCode > 0) {
            console.error('Failed to create viewer: WebGL not supported.');
            showViewerError('WebGL not supported in your browser.');
            return;
        }

        console.log('Viewer started successfully');

        // Load the model
        loadModel(model.versionUrn);
    });
}

// Get access token for Forge
function getForgeToken(callback) {
    console.log('Getting Forge access token...');
    callback(forgeAccessToken, 3600);
}

// Load model into viewer
function loadModel(urn) {
    console.log('Loading model with URN:', urn);

    if (!forgeViewer) {
        console.error('Viewer not initialized');
        return;
    }

    // Document URN - needs to be prefixed
    const documentId = 'urn:' + urn;
    console.log('Document ID:', documentId);

    // Load document
    Autodesk.Viewing.Document.load(
        documentId,
        onDocumentLoadSuccess,
        onDocumentLoadFailure
    );
}

// Document load success callback
function onDocumentLoadSuccess(doc) {
    console.log('Document loaded successfully');

    // Get the default viewable
    const viewables = doc.getRoot().getDefaultGeometry();

    if (!viewables) {
        console.error('No viewables found in document');
        return;
    }

    // Load the viewable
    forgeViewer.loadDocumentNode(doc, viewables).then(function (model) {
        console.log('Model loaded successfully');

        // Fit to view
        forgeViewer.fitToView();

        // Enable selection
        forgeViewer.addEventListener(Autodesk.Viewing.SELECTION_CHANGED_EVENT, onSelectionChanged);

        // Update UI
        const viewerContainer = document.getElementById('forgeViewer');
        if (viewerContainer) {
            viewerContainer.classList.add('loaded');
        }
    }).catch(function (error) {
        console.error('Error loading model:', error);
        showViewerError('Failed to load model: ' + error.message);
    });
}

// Document load failure callback
function onDocumentLoadFailure(errorCode, errorMsg) {
    console.error('Failed to load document:', errorCode, errorMsg);

    // Check if it's a translation error
    if (errorCode === 4) {
        showViewerError('Model translation in progress. Please try again in a few moments.');
        // Optionally trigger translation
        triggerModelTranslation(selectedModels[0]);
    } else {
        showViewerError(`Failed to load model: ${errorMsg} (Code: ${errorCode})`);
    }
}

// Handle selection changes in viewer
function onSelectionChanged(event) {
    const selection = event.dbIdArray;
    console.log('Selection changed:', selection);

    if (selection.length > 0) {
        // Get properties of selected element
        forgeViewer.getProperties(selection[0], function (props) {
            console.log('Selected element properties:', props);
            // You can display these properties in the UI
        });
    }
}

// Show error in viewer area
function showViewerError(message) {
    const viewerDiv = document.getElementById('forgeViewer');
    if (viewerDiv) {
        viewerDiv.innerHTML = `
            <div class="viewer-error">
                <p>⚠️ ${message}</p>
                <button class="btn btn-sm" onclick="retryModelLoad()">Retry</button>
            </div>
        `;
    }
}

// Retry model load
function retryModelLoad() {
    if (selectedModels && selectedModels.length > 0) {
        initializeForgeViewer();
    }
}

// Trigger model translation
async function triggerModelTranslation(model) {
    console.log('Triggering model translation for:', model.name);

    try {
        const translationJob = {
            input: {
                urn: model.versionUrn
            },
            output: {
                formats: [
                    {
                        type: "svf2",
                        views: ["2d", "3d"]
                    }
                ]
            }
        };

        const response = await fetch(
            'https://developer.api.autodesk.com/modelderivative/v2/designdata/job',
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${forgeAccessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(translationJob)
            }
        );

        if (response.ok) {
            const result = await response.json();
            console.log('Translation job started:', result);

            showViewerError('Model translation started. Please wait a few moments and retry.');

            // Check translation status after delay
            setTimeout(() => checkTranslationStatus(model.versionUrn), 5000);
        } else {
            const error = await response.text();
            console.error('Translation request failed:', error);
        }
    } catch (error) {
        console.error('Error triggering translation:', error);
    }
}

// Check translation status
async function checkTranslationStatus(urn) {
    try {
        const response = await fetch(
            `https://developer.api.autodesk.com/modelderivative/v2/designdata/${urn}/manifest`,
            {
                headers: {
                    'Authorization': `Bearer ${forgeAccessToken}`
                }
            }
        );

        if (response.ok) {
            const manifest = await response.json();
            console.log('Translation status:', manifest.status, manifest.progress);

            if (manifest.status === 'success') {
                console.log('Translation complete, retrying load...');
                retryModelLoad();
            } else if (manifest.status === 'inprogress') {
                // Check again in a few seconds
                setTimeout(() => checkTranslationStatus(urn), 5000);
            }
        }
    } catch (error) {
        console.error('Error checking translation status:', error);
    }
}

// Viewer control functions
function resetView() {
    if (forgeViewer) {
        forgeViewer.fitToView();
    }
}

function toggleIsolate() {
    if (forgeViewer) {
        const selected = forgeViewer.getSelection();
        if (selected.length > 0) {
            forgeViewer.isolate(selected);
        } else {
            forgeViewer.isolate([]);
        }
    }
}

// Clean up viewer on page unload
window.addEventListener('beforeunload', function () {
    if (forgeViewer) {
        forgeViewer.finish();
        forgeViewer = null;
    }
});

// Test API endpoints (for debugging)
async function testAPIEndpoints() {
    console.log('=== TESTING API ENDPOINTS ===');

    if (!forgeAccessToken) {
        console.error('No access token available');
        return;
    }

    if (!selectedProject) {
        console.error('No project selected');
        return;
    }

    const hubId = globalHubData?.hubId || getHubId();
    console.log('Token:', forgeAccessToken.substring(0, 20) + '...');
    console.log('Hub ID:', hubId);
    console.log('Project ID:', selectedProject);

    // Test 1: Project Info
    try {
        console.log('\n1. Testing Project Info...');
        const projectUrl = `https://developer.api.autodesk.com/project/v1/hubs/${hubId}/projects/${selectedProject}`;
        const response = await fetch(projectUrl, {
            headers: { 'Authorization': `Bearer ${forgeAccessToken}` }
        });
        console.log(`Project endpoint: ${response.status} ${response.statusText}`);
        if (response.ok) {
            const data = await response.json();
            console.log('Project name:', data.data?.attributes?.name);
        }
    } catch (error) {
        console.error('Project test failed:', error);
    }

    // Test 2: Top Folders
    try {
        console.log('\n2. Testing Top Folders...');
        const topFoldersUrl = `https://developer.api.autodesk.com/project/v1/hubs/${hubId}/projects/${selectedProject}/topFolders`;
        const response = await fetch(topFoldersUrl, {
            headers: { 'Authorization': `Bearer ${forgeAccessToken}` }
        });
        console.log(`Top folders endpoint: ${response.status} ${response.statusText}`);
        if (response.ok) {
            const data = await response.json();
            console.log('Top folders count:', data.data?.length || 0);
            data.data?.forEach(folder => {
                console.log(`- ${folder.attributes?.displayName} (${folder.id})`);
            });
        }
    } catch (error) {
        console.error('Top folders test failed:', error);
    }

    // Test 3: Model Translation Status
    if (selectedModels && selectedModels.length > 0) {
        try {
            console.log('\n3. Testing Model Translation Status...');
            const model = selectedModels[0];
            const manifestUrl = `https://developer.api.autodesk.com/modelderivative/v2/designdata/${model.versionUrn}/manifest`;
            const response = await fetch(manifestUrl, {
                headers: { 'Authorization': `Bearer ${forgeAccessToken}` }
            });
            console.log(`Manifest endpoint: ${response.status} ${response.statusText}`);
            if (response.ok) {
                const manifest = await response.json();
                console.log('Translation status:', manifest.status);
                console.log('Progress:', manifest.progress);
                console.log('Derivatives:', manifest.derivatives?.length || 0);
            }
        } catch (error) {
            console.error('Manifest test failed:', error);
        }
    }

    console.log('\n=== END API TESTS ===');
}

// Add to window for easy testing
window.testAPIEndpoints = testAPIEndpoints;

// UI Functions
function updateAuthStatus(status, info = '') {
    const statusElement = document.getElementById('authStatus');
    const infoElement = document.getElementById('authInfo');
    const indicator = document.getElementById('authIndicator');

    if (statusElement) statusElement.textContent = status;
    if (infoElement) infoElement.textContent = info;

    if (indicator) {
        indicator.classList.remove('authenticated', 'error');
        if (status.includes('✅') || status.includes('Connected')) {
            indicator.classList.add('authenticated');
        } else if (status.includes('❌') || status.includes('Error')) {
            indicator.classList.add('error');
        }
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
        }, 3000);
    }
}

// Navigation
function goBack() {
    window.location.href = 'engineering.html';
}

// Initialize UI
function initializeUI() {
    console.log('Initializing UI elements...');

    // Add any UI initialization here
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', function () {
    console.log('DOM loaded, initializing calculator...');
    initializeCalculator();
});

// Export functions for global access
window.CalculatorModule = {
    openModelSelector,
    closeModelSelection,
    handleModelSelection,
    proceedWithoutModel,
    selectDiscoveredModel,
    useManualModelUrn,
    onProjectChange,
    switchTab,
    calculatePointLoad,
    calculateColumn,
    clearResults,
    saveCalculation,
    loadHistoryItem,
    goBack,
    showNotification,
    resetView,
    toggleIsolate,
    retryModelLoad,
    testAPIEndpoints
};