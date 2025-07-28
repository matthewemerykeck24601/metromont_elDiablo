// Engineering Calculator JavaScript - COMPLETE FILE WITH ALL FEATURES
// Replace your entire scripts/calculator.js with this file

// Global Variables (matching QC pattern + Architecture Alignment)
let forgeAccessToken = null;
let selectedProject = null;
let selectedProjectData = null;
let selectedModel = null;
let forgeViewer = null;
let calculationHistory = [];
let currentCalculation = null;
let globalHubData = null;
let userProjects = [];
let hubId = null;
let projectId = null;

// Architecture Alignment Variables
let modelPropertiesIndexed = false;
let aecDataModelElementGroup = null;
let discoveredModels = [];
let selectedModels = [];
let modelTranslationJobs = new Map();

// Bed Information from uploaded file
const BED_INFO = {
    "Column Bed 1": {
        bedType: "Column",
        maxWidth: 48,
        maxLength: 60,
        maxHeight: 20,
        supportedProducts: ["Columns", "Beams", "Walls"]
    },
    "Double Tee Bed 1": {
        bedType: "Double Tee",
        maxWidth: 144,
        maxLength: 600,
        maxHeight: 32,
        supportedProducts: ["Double Tees", "Hollow Core"]
    },
    "Wall Panel Bed 1": {
        bedType: "Wall Panel",
        maxWidth: 144,
        maxLength: 480,
        maxHeight: 12,
        supportedProducts: ["Wall Panels", "Cladding", "Architectural"]
    }
};

// ALIGNED: Enhanced initialization following directives
async function initializeCalculator() {
    try {
        console.log('=== ALIGNED ENGINEERING CALCULATOR INITIALIZATION ===');

        // FIRST: Check if we have project data passed from engineering page
        const calculatorData = getCalculatorProjectData();

        if (calculatorData) {
            console.log('📦 Received project data from engineering page:', calculatorData.selectedProjectData?.name);

            // Restore all the authentication and project context
            forgeAccessToken = calculatorData.forgeAccessToken;
            selectedProject = calculatorData.selectedProject;
            selectedProjectData = calculatorData.selectedProjectData;
            globalHubData = calculatorData.globalHubData;

            // Complete authentication with existing project data
            await completeAuthenticationWithProject();

        } else {
            console.log('🔄 No project data found, checking authentication...');

            // Check parent window authentication (same as QC pattern)
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
        showNotification('Failed to initialize calculator: ' + error.message, 'error');
    }
}

// Get project data passed from engineering page
function getCalculatorProjectData() {
    try {
        const data = sessionStorage.getItem('calculator_project_data');
        if (data) {
            const parsed = JSON.parse(data);

            // Check if data is recent (within 5 minutes)
            const age = Date.now() - parsed.timestamp;
            if (age < 5 * 60 * 1000) { // 5 minutes
                console.log('✅ Using recent project data from engineering page');
                return parsed;
            } else {
                console.log('⏰ Project data expired, clearing');
                sessionStorage.removeItem('calculator_project_data');
            }
        }
        return null;
    } catch (error) {
        console.error('Error reading calculator project data:', error);
        return null;
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
        updateAuthStatus('Loading Hub Data...', 'Using pre-loaded project information...');

        // Load the hub data that was already loaded during main authentication
        await loadPreLoadedHubData();

        const projectCount = globalHubData ? globalHubData.projects.length : 0;
        const accountName = globalHubData ? globalHubData.accountInfo.name : 'ACC Account';

        updateAuthStatus('✅ Connected', `Connected to ${accountName} with ${projectCount} projects available`);

        // Load calculation history
        loadCalculationHistory();

        // Initialize UI event listeners
        initializeUI();

        console.log('✅ Calculator ready with pre-loaded data');

    } catch (error) {
        console.error('Authentication completion failed:', error);
        showNotification('Failed to load project data: ' + error.message, 'error');
    }
}

// Enhanced authentication when project is already selected
async function completeAuthenticationWithProject() {
    try {
        updateAuthStatus('✅ Project Selected', `Loading models for ${selectedProjectData.name}...`);

        // Hide the project selection interface since project is already selected
        const projectSelection = document.getElementById('projectSelection');
        if (projectSelection) {
            projectSelection.style.display = 'none';
        }

        // ALIGNED: Follow proper architecture workflow
        await initializeWithProjectData();

        console.log('✅ Calculator ready with project pre-selected');

    } catch (error) {
        console.error('Enhanced authentication failed:', error);
        updateAuthStatus('❌ Error', 'Failed to load project models: ' + error.message);

        // Fallback to standard project selection
        const projectSelection = document.getElementById('projectSelection');
        if (projectSelection) {
            projectSelection.style.display = 'block';
        }
        await completeAuthentication();
    }
}

// ALIGNED: Initialize with proper architecture workflow
async function initializeWithProjectData() {
    try {
        updateAuthStatus('🔍 Discovering Models', `Scanning ${selectedProjectData.name} for Revit models...`);

        // Log project data to understand the format
        console.log('Selected Project ID:', selectedProject);
        console.log('Selected Project Data:', selectedProjectData);
        console.log('Global Hub Data:', globalHubData);

        // Step 1: Discover Revit models in ACC project
        const models = await discoverRevitModels();

        if (models && models.length > 0) {
            // Step 2: Ensure models are translated to SVF2 (required for Model Properties API)
            await ensureModelsTranslatedToSVF2();
        }

        // Step 3: Show enhanced model selection with translation status
        showAlignedModelSelection();

        console.log('✅ Calculator initialized following architecture directives');

    } catch (error) {
        console.error('Enhanced initialization failed:', error);
        updateAuthStatus('❌ Error', 'Failed to initialize: ' + error.message);

        // Show the selection dialog anyway to allow manual mode
        showAlignedModelSelection();
    }
}

// ALIGNED: Discover Revit models with proper metadata
async function discoverRevitModels() {
    try {
        console.log('🔍 Discovering Revit models with enhanced metadata...');
        console.log('Project ID:', selectedProject);
        console.log('Project Data:', selectedProjectData);

        if (!forgeAccessToken || !selectedProject) {
            throw new Error('Missing authentication or project selection');
        }

        // Check if we need to construct the full project ID
        let fullProjectId = selectedProject;

        // If the project ID doesn't start with 'b.', we need to construct it
        if (!selectedProject.startsWith('b.')) {
            // Try to get the hub ID from globalHubData
            const hubId = getHubId();
            if (hubId) {
                // For ACC/BIM360 projects, the format is typically b.{account_id}.{project_guid}
                // But if we only have the project number, we need to use the original ID from globalHubData
                const projectFromHub = globalHubData?.projects?.find(p =>
                    p.number === selectedProject ||
                    p.name.includes(selectedProject) ||
                    p.id === selectedProject
                );

                if (projectFromHub) {
                    fullProjectId = projectFromHub.id;
                    console.log('Found full project ID from hub data:', fullProjectId);
                }
            }
        }

        // Try different approaches to get folder data
        const models = await tryMultipleFolderApproaches(fullProjectId);

        discoveredModels = models || [];
        console.log('🏗️ Found Revit models:', discoveredModels.length);

        return discoveredModels;

    } catch (error) {
        console.error('Error discovering models:', error);

        // Don't throw - allow manual mode
        discoveredModels = [];
        return [];
    }
}

// Try multiple approaches to get folder data
async function tryMultipleFolderApproaches(projectId) {
    const models = [];

    // Approach 1: Try topFolders endpoint
    try {
        const hubId = getHubId();
        if (hubId) {
            const topFoldersUrl = `https://developer.api.autodesk.com/project/v1/hubs/${hubId}/projects/${projectId}`;
            console.log('Trying project endpoint:', topFoldersUrl);

            const projectResponse = await fetch(topFoldersUrl, {
                headers: { 'Authorization': `Bearer ${forgeAccessToken}` }
            });

            if (projectResponse.ok) {
                const projectData = await projectResponse.json();
                console.log('Project data retrieved:', projectData.data?.attributes?.name);

                // Now try to get top folders
                const topFoldersResponse = await fetch(
                    `https://developer.api.autodesk.com/project/v1/hubs/${hubId}/projects/${projectId}/topFolders`, {
                    headers: { 'Authorization': `Bearer ${forgeAccessToken}` }
                });

                if (topFoldersResponse.ok) {
                    const topFoldersData = await topFoldersResponse.json();
                    console.log('✅ Top folders found:', topFoldersData.data.length);

                    for (const folder of topFoldersData.data) {
                        const folderModels = await findRevitModelsWithMetadata(folder);
                        models.push(...folderModels);
                        await scanSubfolders(folder, models);
                    }

                    return models;
                }
            }
        }
    } catch (error) {
        console.error('TopFolders approach failed:', error);
    }

    // Approach 2: Try direct folders endpoint
    try {
        const foldersUrl = `https://developer.api.autodesk.com/data/v1/projects/${encodeURIComponent(projectId)}/folders`;
        console.log('Trying folders endpoint:', foldersUrl);

        const foldersResponse = await fetch(foldersUrl, {
            headers: { 'Authorization': `Bearer ${forgeAccessToken}` }
        });

        if (foldersResponse.ok) {
            const foldersData = await foldersResponse.json();
            console.log('✅ Folders found:', foldersData.data.length);

            for (const folder of foldersData.data) {
                const folderModels = await findRevitModelsWithMetadata(folder);
                models.push(...folderModels);
            }

            return models;
        }
    } catch (error) {
        console.error('Folders approach failed:', error);
    }

    // Approach 3: Return empty array but don't fail
    console.log('All folder discovery approaches failed. Manual mode will be available.');
    return [];
}

// Helper function to get hub ID from project ID or global data
function getHubId() {
    // First check if we have it in globalHubData
    if (globalHubData && globalHubData.hubId) {
        console.log('Hub ID from globalHubData:', globalHubData.hubId);
        return globalHubData.hubId;
    }

    // Try to extract from any project ID in globalHubData
    if (globalHubData && globalHubData.projects && globalHubData.projects.length > 0) {
        // Look for a project with a proper ACC format ID
        const accProject = globalHubData.projects.find(p => p.id && p.id.startsWith('b.'));
        if (accProject) {
            // ACC project IDs are typically b.{account_id}.{project_guid}
            // The hub ID is b.{account_id}
            const parts = accProject.id.split('.');
            if (parts.length >= 2) {
                const hubId = `${parts[0]}.${parts[1]}`;
                console.log('Hub ID extracted from project:', hubId);
                return hubId;
            }
        }
    }

    // Try to extract from selectedProject if it's in proper format
    if (selectedProject && selectedProject.startsWith('b.')) {
        const parts = selectedProject.split('.');
        if (parts.length >= 2) {
            const hubId = `${parts[0]}.${parts[1]}`;
            console.log('Hub ID extracted from selectedProject:', hubId);
            return hubId;
        }
    }

    console.error('Unable to determine hub ID');
    return null;
}

// Scan subfolders recursively
async function scanSubfolders(parentFolder, revitModels) {
    try {
        const subfolderResponse = await fetch(
            `https://developer.api.autodesk.com/data/v1/projects/${encodeURIComponent(selectedProject)}/folders/${parentFolder.id}/contents`, {
            headers: { 'Authorization': `Bearer ${forgeAccessToken}` }
        });

        if (!subfolderResponse.ok) return;

        const subfolderData = await subfolderResponse.json();

        for (const item of subfolderData.data) {
            if (item.type === 'folders') {
                // Recursively scan subfolder
                await scanSubfolders(item, revitModels);
            }
        }
    } catch (error) {
        console.error(`Error scanning subfolder ${parentFolder.attributes.displayName}:`, error);
    }
}

// ALIGNED: Find Revit models with enhanced metadata for proper workflow
async function findRevitModelsWithMetadata(folder) {
    try {
        const folderContentsResponse = await fetch(
            `https://developer.api.autodesk.com/data/v1/projects/${encodeURIComponent(selectedProject)}/folders/${folder.id}/contents`, {
            headers: { 'Authorization': `Bearer ${forgeAccessToken}` }
        });

        if (!folderContentsResponse.ok) {
            console.error(`Failed to get contents for folder ${folder.attributes.displayName}:`, folderContentsResponse.status);
            return [];
        }

        const contentsData = await folderContentsResponse.json();
        const revitModels = [];

        // Find all Revit models in folder
        for (const item of contentsData.data) {
            if (item.type === 'items' && item.attributes.displayName.toLowerCase().endsWith('.rvt')) {

                try {
                    // Get latest version details
                    const versionsResponse = await fetch(
                        `https://developer.api.autodesk.com/data/v1/projects/${encodeURIComponent(selectedProject)}/items/${item.id}/versions`, {
                        headers: { 'Authorization': `Bearer ${forgeAccessToken}` }
                    });

                    if (versionsResponse.ok) {
                        const versionsData = await versionsResponse.json();
                        const latestVersion = versionsData.data[0]; // First is latest

                        if (latestVersion) {
                            const modelData = {
                                id: item.id,
                                name: item.attributes.displayName,
                                folderName: folder.attributes.displayName,
                                folderId: folder.id,
                                versionId: latestVersion.id,
                                versionUrn: btoa(latestVersion.id).replace(/=/g, ''), // Base64 encode and remove padding
                                size: item.attributes.storageSize || 0,
                                lastModified: latestVersion.attributes.lastModifiedTime,
                                translationStatus: 'pending',
                                modelPropertiesReady: false,
                                isCloudWorkshared: false,
                                modelGuid: null
                            };

                            revitModels.push(modelData);
                        }
                    }
                } catch (versionError) {
                    console.error(`Error getting version for ${item.attributes.displayName}:`, versionError);
                }
            }
        }

        return revitModels;

    } catch (error) {
        console.error(`Error scanning folder ${folder.attributes.name}:`, error);
        return [];
    }
}

// ALIGNED: Ensure models are translated to SVF2 (required for Model Properties API)
async function ensureModelsTranslatedToSVF2() {
    try {
        console.log('🔄 Ensuring SVF2 translation for Model Properties API compatibility...');

        for (const model of discoveredModels) {
            try {
                // Check current translation status
                const manifestResponse = await fetch(
                    `https://developer.api.autodesk.com/modelderivative/v2/designdata/${model.versionUrn}/manifest`, {
                    headers: { 'Authorization': `Bearer ${forgeAccessToken}` }
                });

                if (manifestResponse.ok) {
                    const manifest = await manifestResponse.json();

                    // Check if SVF2 derivative exists
                    const svf2Derivative = manifest.derivatives?.find(d =>
                        d.outputType === 'svf2' && d.status === 'success'
                    );

                    if (svf2Derivative) {
                        model.translationStatus = 'ready';
                        model.modelPropertiesReady = true;
                        console.log(`✅ ${model.name} - SVF2 ready`);
                    } else if (manifest.status === 'inprogress') {
                        model.translationStatus = 'translating';
                        console.log(`⏳ ${model.name} - Translation in progress`);
                    } else {
                        // Trigger SVF2 translation
                        await triggerSVF2Translation(model);
                    }
                } else if (manifestResponse.status === 404) {
                    // No manifest exists, trigger translation
                    await triggerSVF2Translation(model);
                } else {
                    throw new Error(`Manifest check failed: ${manifestResponse.status}`);
                }

            } catch (error) {
                console.error(`Translation check failed for ${model.name}:`, error);
                model.translationStatus = 'error';
            }
        }

    } catch (error) {
        console.error('SVF2 translation setup failed:', error);
        throw error;
    }
}

// ALIGNED: Trigger SVF2 translation (required for Model Properties API)
async function triggerSVF2Translation(model) {
    try {
        console.log(`🔄 Triggering SVF2 translation for ${model.name}...`);

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
            'https://developer.api.autodesk.com/modelderivative/v2/designdata/job', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${forgeAccessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(translationJob)
        });

        if (response.ok) {
            const result = await response.json();
            model.translationStatus = 'translating';
            modelTranslationJobs.set(model.id, result.urn);
            console.log(`🔄 ${model.name} - Translation started`);
        } else {
            const errorText = await response.text();
            throw new Error(`Translation request failed: ${response.status} - ${errorText}`);
        }

    } catch (error) {
        console.error(`SVF2 translation failed for ${model.name}:`, error);
        model.translationStatus = 'error';
    }
}

// ALIGNED: Show enhanced model selection following architecture
function showAlignedModelSelection() {
    const modal = document.getElementById('modelSelectionModal');
    if (!modal) {
        // If no modal exists, try to go directly to calculator
        if (discoveredModels.length > 0) {
            selectedModel = discoveredModels[0];
            selectedModels = [discoveredModels[0]];
            initializeCalculatorInterface();
        }
        return;
    }

    modal.style.display = 'flex';

    const folderTree = document.getElementById('folderTree');
    if (folderTree) {
        // Check if we have discovered models
        if (discoveredModels.length === 0) {
            // Show manual entry option
            folderTree.innerHTML = `
                <h4>Model Selection for ${selectedProjectData.name}</h4>
                <div class="no-models-found">
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
        } else {
            // Show discovered models
            folderTree.innerHTML = `
                <h4>Revit Models in ${selectedProjectData.name}</h4>
                <p class="architecture-note">🏗️ Following Forge Viewer + Model Properties + AEC Data workflow</p>
                <div class="models-list">
                    ${discoveredModels.map(model => `
                        <div class="tree-item model-item enhanced" onclick="selectEnhancedModel('${model.id}', '${model.name}', '${model.versionUrn}')">
                            <input type="checkbox" class="model-checkbox" id="model_${model.id}" />
                            <span class="tree-icon">📋</span>
                            <div class="model-info">
                                <div class="model-name">${model.name}</div>
                                <div class="model-details">
                                    <small>📁 ${model.folderName} • 📅 ${new Date(model.lastModified).toLocaleDateString()}</small>
                                </div>
                                <div class="architecture-status">
                                    <span class="status-badge ${getTranslationStatusClass(model.translationStatus)}">
                                        ${getTranslationStatusText(model.translationStatus)}
                                    </span>
                                    <span class="status-badge ${model.modelPropertiesReady ? 'ready' : 'pending'}">
                                        Model Properties: ${model.modelPropertiesReady ? 'Ready' : 'Pending'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="model-actions">
                    <button class="btn btn-sm" onclick="selectAllModels()">Select All Ready</button>
                    <button class="btn btn-sm" onclick="clearAllModels()">Clear Selection</button>
                    <button class="btn btn-sm" onclick="refreshTranslationStatus()">Refresh Status</button>
                </div>
            `;
        }
    }

    // Also populate models grid if it exists
    const modelsGrid = document.getElementById('modelsGrid');
    if (modelsGrid) {
        modelsGrid.innerHTML = discoveredModels.map(model => createModelTile(model).outerHTML).join('');
    }

    updateAuthStatus('📐 Select Models', 'Choose one or more 3D models for calculations');
}

// Create model tile for selection
function createModelTile(model) {
    const tile = document.createElement('div');
    tile.className = 'model-tile';
    tile.dataset.modelId = model.id;

    const statusClass = model.translationStatus === 'ready' ? 'ready' :
        model.translationStatus === 'translating' ? 'translating' :
            model.translationStatus === 'error' ? 'error' : 'pending';

    tile.innerHTML = `
        <div class="model-icon">
            <svg width="40" height="40" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
        </div>
        <div class="model-info">
            <h4>${model.name}</h4>
            <p>${model.folderName}</p>
            <p class="model-size">${formatFileSize(model.size)}</p>
        </div>
        <div class="model-status ${statusClass}">
            ${statusClass === 'ready' ? 'Ready' :
            statusClass === 'translating' ? 'Processing...' :
                statusClass === 'error' ? 'Error' : 'Pending'}
        </div>
    `;

    if (model.translationStatus === 'ready') {
        tile.onclick = () => selectModelTile(model);
    } else {
        tile.style.opacity = '0.6';
        tile.style.cursor = 'not-allowed';
    }

    return tile;
}

// Handle model tile selection
function selectModelTile(model) {
    const tile = document.querySelector(`[data-model-id="${model.id}"]`);

    if (tile.classList.contains('selected')) {
        // Deselect
        tile.classList.remove('selected');
        selectedModels = selectedModels.filter(m => m.id !== model.id);
    } else {
        // Select
        tile.classList.add('selected');
        selectedModels.push(model);
    }

    // Enable/disable confirm button
    const selectBtn = document.getElementById('selectModelBtn');
    if (selectBtn) {
        selectBtn.disabled = selectedModels.length === 0;
    }
}

// ALIGNED: Enhanced model selection with architecture validation
function selectEnhancedModel(modelId, modelName, versionUrn) {
    const model = discoveredModels.find(m => m.id === modelId);
    const checkbox = document.getElementById(`model_${modelId}`);

    if (!model || !checkbox) return;

    // Validate model readiness for architecture workflow
    if (model.translationStatus !== 'ready') {
        showNotification(`${modelName} is not ready. SVF2 translation required for Model Properties API.`, 'warning');
        return;
    }

    const wasChecked = checkbox.checked;
    checkbox.checked = !wasChecked;

    // Update selected models array
    if (checkbox.checked) {
        if (!selectedModels.find(m => m.id === modelId)) {
            selectedModels.push({
                id: modelId,
                name: modelName,
                versionUrn: versionUrn,
                ...model
            });
        }
    } else {
        selectedModels = selectedModels.filter(m => m.id !== modelId);
    }

    updateModelSelectionUI();
    updateLoadModelButton();
}

// Confirm model selection and load
async function confirmModelSelection() {
    try {
        if (selectedModels.length === 0) {
            showNotification('Please select at least one model', 'warning');
            return;
        }

        updateAuthStatus('🔄 Loading Models', 'Initializing selected models...');

        // Set primary model
        selectedModel = selectedModels.length === 1 ? selectedModels[0] : {
            id: 'multiple',
            name: `${selectedModels.length} Models`,
            models: selectedModels
        };

        closeModelSelection();

        // ALIGNED: Initialize full architecture workflow
        await initializeFullArchitectureWorkflow();

    } catch (error) {
        console.error('Failed to load models with full architecture:', error);
        showNotification('Failed to initialize architecture workflow: ' + error.message, 'error');
    }
}

// ALIGNED: Initialize the complete architecture workflow as specified in directives
async function initializeFullArchitectureWorkflow() {
    try {
        updateAuthStatus('🏗️ Initializing Architecture', 'Setting up Forge Viewer + Model Properties + AEC Data workflow...');

        // Step 1: Initialize Forge Viewer with proper configuration
        await initializeForgeViewerProperly();

        // Step 2: Setup element selection and filtering capabilities
        setupEnhancedElementSelection();

        // Step 3: Show calculator interface with full capabilities
        showEnhancedCalculatorInterface();

        console.log('✅ Full architecture workflow initialized');

    } catch (error) {
        console.error('Architecture workflow initialization failed:', error);
        throw error;
    }
}

// Calculator Interface
function initializeCalculatorInterface() {
    const projectSelection = document.getElementById('projectSelection');
    const calculatorInterface = document.getElementById('calculatorInterface');

    // Hide project selection and show calculator
    projectSelection.style.display = 'none';
    calculatorInterface.style.display = 'grid';

    // Initialize Forge Viewer
    initializeForgeViewer();

    // Load calculation history
    updateCalculationHistoryUI();

    showNotification('Calculator initialized with model: ' + selectedModel.name, 'success');
}

function showEnhancedCalculatorInterface() {
    const projectSelection = document.getElementById('projectSelection');
    const calculatorInterface = document.getElementById('calculatorInterface');

    // Hide project selection and show calculator
    projectSelection.style.display = 'none';
    calculatorInterface.style.display = 'grid';

    // Update selected model name display
    const selectedModelName = document.getElementById('selectedModelName');
    if (selectedModelName) {
        selectedModelName.textContent = selectedModel.name;
    }

    // Load calculation history
    updateCalculationHistoryUI();

    showNotification('Calculator initialized with enhanced architecture: ' + selectedModel.name, 'success');
}

// ALIGNED: Initialize Forge Viewer following directives
async function initializeForgeViewerProperly() {
    try {
        console.log('🎨 Initializing Forge Viewer with SVF2 support...');

        const viewerContainer = document.getElementById('forgeViewer');
        const viewerLoading = document.getElementById('viewerLoading');

        // Load Forge Viewer JavaScript dynamically
        await loadForgeViewerScript();

        // Initialize viewer with proper options for Model Properties API
        const options = {
            env: 'AutodeskProduction',
            api: 'derivativeV2',
            getAccessToken: function (onTokenReady) {
                const token = forgeAccessToken;
                const timeInSeconds = 3600; // 1 hour
                onTokenReady(token, timeInSeconds);
            }
        };

        return new Promise((resolve, reject) => {
            Autodesk.Viewing.Initializer(options, function () {
                // Create viewer instance
                forgeViewer = new Autodesk.Viewing.GuiViewer3D(viewerContainer);

                const startedCode = forgeViewer.start();
                if (startedCode > 0) {
                    console.error('Failed to create a Viewer: WebGL not supported.');
                    reject(new Error('WebGL not supported'));
                    return;
                }

                // Load the first selected model
                const primaryModel = selectedModels[0] || selectedModel;
                loadModelInViewer(primaryModel);

                // Setup enhanced event handlers for architecture workflow
                setupEnhancedViewerEventHandlers();

                resolve();
            });
        });

    } catch (error) {
        console.error('Forge Viewer initialization failed:', error);
        throw error;
    }
}

// Forge Viewer Integration
async function initializeForgeViewer() {
    const viewerContainer = document.getElementById('forgeViewer');
    const viewerLoading = document.getElementById('viewerLoading');

    try {
        // Load Forge Viewer script dynamically
        await loadForgeViewerScript();

        const options = {
            env: 'AutodeskProduction',
            api: 'derivativeV2',
            getAccessToken: function (onTokenReady) {
                const token = forgeAccessToken;
                const timeInSeconds = 3600;
                onTokenReady(token, timeInSeconds);
            }
        };

        return new Promise((resolve, reject) => {
            Autodesk.Viewing.Initializer(options, function () {
                forgeViewer = new Autodesk.Viewing.GuiViewer3D(viewerContainer);

                const startedCode = forgeViewer.start();
                if (startedCode > 0) {
                    console.error('Failed to create a Viewer: WebGL not supported.');
                    reject(new Error('WebGL not supported'));
                    return;
                }

                // Hide loading indicator
                if (viewerLoading) viewerLoading.style.display = 'none';

                // Setup viewer tools
                setupViewerTools();

                resolve();
            });
        });
    } catch (error) {
        console.error('Failed to initialize Forge Viewer:', error);
        showNotification('Failed to initialize 3D viewer', 'error');
        throw error;
    }
}

// Load Forge Viewer script
function loadForgeViewerScript() {
    return new Promise((resolve, reject) => {
        if (typeof Autodesk !== 'undefined') {
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*/viewer3D.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);

        const style = document.createElement('link');
        style.rel = 'stylesheet';
        style.type = 'text/css';
        style.href = 'https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*/style.min.css';
        document.head.appendChild(style);
    });
}

// Load model in viewer
function loadModelInViewer(model) {
    const viewerLoading = document.getElementById('viewerLoading');
    if (viewerLoading) viewerLoading.style.display = 'flex';

    const documentId = `urn:${model.versionUrn}`;

    Autodesk.Viewing.Document.load(documentId, onDocumentLoadSuccess, onDocumentLoadFailure);

    function onDocumentLoadSuccess(doc) {
        const viewables = doc.getRoot().getDefaultGeometry();
        forgeViewer.loadDocumentNode(doc, viewables).then(() => {
            if (viewerLoading) viewerLoading.style.display = 'none';
            setupViewerTools();
        });
    }

    function onDocumentLoadFailure(viewerErrorCode) {
        console.error('Failed to load document:', viewerErrorCode);
        if (viewerLoading) viewerLoading.style.display = 'none';
        showNotification('Failed to load 3D model', 'error');
    }
}

// Setup enhanced viewer event handlers
function setupEnhancedViewerEventHandlers() {
    if (!forgeViewer) return;

    // Selection changed event
    forgeViewer.addEventListener(Autodesk.Viewing.SELECTION_CHANGED_EVENT, (event) => {
        const dbIds = event.dbIdArray;
        if (dbIds.length > 0) {
            handleElementSelection(dbIds);
        }
    });

    // Model loaded event
    forgeViewer.addEventListener(Autodesk.Viewing.GEOMETRY_LOADED_EVENT, () => {
        console.log('✅ Model geometry loaded');
        indexModelProperties();
    });
}

// Setup viewer tools
function setupViewerTools() {
    if (!forgeViewer) return;

    // Add measurement tool
    forgeViewer.loadExtension('Autodesk.Measure');

    // Setup selection highlighting
    forgeViewer.addEventListener(Autodesk.Viewing.SELECTION_CHANGED_EVENT, (event) => {
        const dbIds = event.dbIdArray;
        if (dbIds.length > 0) {
            getElementProperties(dbIds[0]);
        }
    });
}

// ALIGNED: Setup enhanced element selection following architecture
function setupEnhancedElementSelection() {
    console.log('🎯 Setting up enhanced element selection for BIM data extraction...');
    // This would integrate with Model Properties API
    // and AEC Data Model as specified in directives
}

// ALIGNED: Index model properties for efficient queries
async function indexModelProperties() {
    try {
        console.log('📊 Indexing model properties...');

        if (!forgeViewer || !forgeViewer.model) return;

        const tree = forgeViewer.model.getInstanceTree();
        const dbIds = [];

        tree.enumNodeChildren(tree.getRootId(), (dbId) => {
            dbIds.push(dbId);
        }, true);

        // Get properties for all elements
        const propertyPromises = dbIds.map(dbId => new Promise((resolve) => {
            forgeViewer.getProperties(dbId, (props) => {
                resolve({ dbId, properties: props });
            });
        }));

        const allProperties = await Promise.all(propertyPromises);
        console.log(`✅ Indexed ${allProperties.length} elements`);

        modelPropertiesIndexed = true;

    } catch (error) {
        console.error('Property indexing failed:', error);
    }
}

// Handle element selection
function handleElementSelection(dbIds) {
    console.log('Selected elements:', dbIds);

    // Get properties of first selected element
    if (dbIds.length > 0) {
        getElementProperties(dbIds[0]);
    }
}

// Get element properties
function getElementProperties(dbId) {
    if (!forgeViewer) return;

    forgeViewer.getProperties(dbId, (result) => {
        console.log('Element properties:', result);
        displayElementInfo(result);
        updateSelectedElementInfo(result);
    });
}

// Display element information
function displayElementInfo(properties) {
    const resultsDiv = document.getElementById('calculationResults');
    if (!resultsDiv) return;

    const elementInfo = `
        <div class="element-info">
            <h4>Selected Element</h4>
            <p><strong>Name:</strong> ${properties.name}</p>
            <p><strong>ID:</strong> ${properties.dbId}</p>
            <p><strong>Type:</strong> ${properties.properties.find(p => p.displayName === 'Type')?.displayValue || 'N/A'}</p>
        </div>
    `;

    resultsDiv.innerHTML = elementInfo;
}

function updateSelectedElementInfo(properties) {
    // Update current calculation with selected element info
    if (currentCalculation) {
        currentCalculation.selectedElement = {
            name: properties.name,
            dbId: properties.dbId,
            properties: properties.properties
        };
    }

    showNotification('Element selected: ' + properties.name, 'info');
}

// Viewer controls
function resetViewerView() {
    if (forgeViewer) {
        forgeViewer.navigation.setRequestHomeView(true);
    }
}

function fitViewerToWindow() {
    if (forgeViewer) {
        forgeViewer.navigation.fitBounds(true);
    }
}

// Tab switching
function switchTab(tabName) {
    // Remove active class from all tabs
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    // Add active class to selected tab
    event.target.classList.add('active');
    const tabContent = document.getElementById(tabName);
    if (tabContent) tabContent.classList.add('active');
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

// Display calculation results
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
}

// Format label for display
function formatLabel(key) {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
}

// Add calculation to history
function addToHistory(calculation) {
    calculation.timestamp = new Date().toISOString();
    calculation.project = selectedProjectData?.name || 'Unknown Project';

    calculationHistory.unshift(calculation);
    if (calculationHistory.length > 10) {
        calculationHistory.pop();
    }

    saveCalculationHistory();
    updateCalculationHistoryUI();
}

// Save calculation to OSS
async function saveCalculation() {
    try {
        const currentResult = calculationHistory[0];
        if (!currentResult) {
            showNotification('No calculation to save', 'warning');
            return;
        }

        showNotification('Saving calculation to ACC...', 'info');

        // Create calculation report
        const report = {
            type: 'engineering-calc-report',
            project: selectedProjectData?.name,
            projectId: selectedProject,
            model: selectedModel?.name,
            calculations: [currentResult],
            timestamp: new Date().toISOString(),
            metadata: {
                engineer: globalHubData?.accountInfo?.name || 'Unknown',
                designNumber: `CALC-${Date.now()}`
            }
        };

        // Use existing OSS storage function
        await saveReportToOSS(report);

        showNotification('Calculation saved successfully', 'success');

    } catch (error) {
        console.error('Failed to save calculation:', error);
        showNotification('Failed to save calculation: ' + error.message, 'error');
    }
}

// Save report to OSS (matching QC pattern)
async function saveReportToOSS(report) {
    try {
        const fileName = `engineering_calc_${Date.now()}.json`;
        const fileContent = JSON.stringify(report, null, 2);
        const blob = new Blob([fileContent], { type: 'application/json' });

        // Get signed URL
        const response = await fetch('/.netlify/functions/oss-storage', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${forgeAccessToken}`
            },
            body: JSON.stringify({
                action: 'getUploadUrl',
                fileName: fileName,
                contentType: 'application/json',
                projectId: selectedProject
            })
        });

        if (!response.ok) throw new Error('Failed to get upload URL');

        const { uploadUrl } = await response.json();

        // Upload to S3
        const uploadResponse = await fetch(uploadUrl, {
            method: 'PUT',
            body: blob,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!uploadResponse.ok) throw new Error('Failed to upload file');

        return fileName;

    } catch (error) {
        console.error('OSS save failed:', error);
        throw error;
    }
}

// Load calculation history
function loadCalculationHistory() {
    const stored = localStorage.getItem('engineering_calc_history');
    if (stored) {
        calculationHistory = JSON.parse(stored);
        updateCalculationHistoryUI();
    }
}

// Save calculation history
function saveCalculationHistory() {
    localStorage.setItem('engineering_calc_history', JSON.stringify(calculationHistory));
}

// Update calculation history UI
function updateCalculationHistoryUI() {
    const historyDiv = document.getElementById('calculationHistory');
    if (!historyDiv) return;

    if (calculationHistory.length === 0) {
        historyDiv.innerHTML = '<p class="placeholder">No recent calculations</p>';
        return;
    }

    const html = calculationHistory.map((calc, index) => `
        <div class="history-item" onclick="loadHistoryItem(${index})">
            <div class="history-type">${calc.type}</div>
            <div class="history-time">${new Date(calc.timestamp).toLocaleString()}</div>
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

// Model selection functions
function openModelSelector() {
    if (!selectedProject) {
        showNotification('Please select a project first', 'warning');
        return;
    }

    // Initialize model discovery if not already done
    if (discoveredModels.length === 0) {
        initializeWithProjectData();
    } else {
        showAlignedModelSelection();
    }
}

function closeModelSelection() {
    const modal = document.getElementById('modelSelectionModal');
    if (modal) modal.style.display = 'none';
}

// Project selection
async function onProjectChange() {
    const projectSelect = document.getElementById('projectSelect');
    selectedProject = projectSelect.value;

    if (!selectedProject) {
        document.getElementById('projectName').textContent = 'No project selected';
        document.getElementById('projectDetails').textContent = 'Select a project to begin calculations';
        document.getElementById('modelSelectBtn').disabled = true;
        return;
    }

    // Find project data
    selectedProjectData = globalHubData.projects.find(p => p.id === selectedProject);

    if (selectedProjectData) {
        document.getElementById('projectName').textContent = selectedProjectData.name;
        document.getElementById('projectDetails').textContent = `ID: ${selectedProjectData.id}`;
        document.getElementById('modelSelectBtn').disabled = false;

        // Clear discovered models for new project
        discoveredModels = [];
        selectedModels = [];
    }
}

// Populate project dropdown
function populateProjectDropdown() {
    const projectSelect = document.getElementById('projectSelect');
    if (!projectSelect || !globalHubData) return;

    projectSelect.innerHTML = '<option value="">Select a project...</option>';

    globalHubData.projects.forEach(project => {
        const option = document.createElement('option');
        option.value = project.id;
        option.textContent = project.name;
        projectSelect.appendChild(option);
    });

    // If project was pre-selected, set it
    if (selectedProject) {
        projectSelect.value = selectedProject;
        onProjectChange();
    }
}

// Load pre-loaded hub data
async function loadPreLoadedHubData() {
    try {
        if (!globalHubData) {
            // Try to get from parent window
            if (window.opener && window.opener.CastLinkAuth) {
                globalHubData = window.opener.CastLinkAuth.getHubData();
            }

            // Or load from stored data
            if (!globalHubData) {
                const stored = sessionStorage.getItem('hub_data');
                if (stored) {
                    globalHubData = JSON.parse(stored);
                }
            }
        }

        if (globalHubData) {
            console.log(`✅ Loaded ${globalHubData.projects.length} projects`);
            populateProjectDropdown();
        }

    } catch (error) {
        console.error('Failed to load hub data:', error);
    }
}

// Helper functions for enhanced architecture
function getTranslationStatusClass(status) {
    switch (status) {
        case 'ready': return 'ready';
        case 'translating': return 'translating';
        case 'error': return 'error';
        default: return 'pending';
    }
}

function getTranslationStatusText(status) {
    switch (status) {
        case 'ready': return 'SVF2 Ready';
        case 'translating': return 'Translating...';
        case 'error': return 'Translation Error';
        default: return 'Translation Pending';
    }
}

// Update model selection UI
function updateModelSelectionUI() {
    const preview = document.querySelector('.model-preview');
    if (!preview) return;

    if (selectedModels.length === 0) {
        preview.innerHTML = `
            <div class="preview-placeholder">
                <h4>No Models Selected</h4>
                <p>Check the boxes next to models to select them</p>
                <small>Select models with SVF2 ready status</small>
            </div>
        `;
    } else if (selectedModels.length === 1) {
        const model = selectedModels[0];
        preview.innerHTML = `
            <div class="preview-placeholder">
                <h4>${model.name}</h4>
                <p>📁 ${model.folderName}</p>  
                <p>📅 Modified: ${new Date(model.lastModified).toLocaleDateString()}</p>
                <p>📏 Size: ${formatFileSize(model.size)}</p>
                <p>🏗️ Status: ${getTranslationStatusText(model.translationStatus)}</p>
                <small>Ready for architecture workflow</small>
            </div>
        `;
    } else {
        preview.innerHTML = `
            <div class="preview-placeholder">
                <h4>${selectedModels.length} Models Selected</h4>
                <ul style="text-align: left; font-size: 0.75rem;">
                    ${selectedModels.slice(0, 3).map(m => `<li>• ${m.name}</li>`).join('')}
                    ${selectedModels.length > 3 ? `<li>• ... and ${selectedModels.length - 3} more</li>` : ''}
                </ul>
                <small>Multiple models for comparative analysis</small>
            </div>
        `;
    }
}

// Update Load Model button state
function updateLoadModelButton() {
    const loadModelBtn = document.getElementById('loadModelBtn');
    if (loadModelBtn) {
        const readyModels = selectedModels.filter(m => m.translationStatus === 'ready');
        loadModelBtn.disabled = readyModels.length === 0;

        if (readyModels.length === 0) {
            loadModelBtn.textContent = 'Select Ready Models';
        } else if (readyModels.length === 1) {
            loadModelBtn.textContent = 'Load Model';
        } else {
            loadModelBtn.textContent = `Load ${readyModels.length} Models`;
        }
    }
}

// Utility functions
function selectAllModels() {
    const readyModels = discoveredModels.filter(m => m.translationStatus === 'ready');
    readyModels.forEach(model => {
        const checkbox = document.getElementById(`model_${model.id}`);
        if (checkbox && !checkbox.checked) {
            checkbox.checked = true;
            if (!selectedModels.find(m => m.id === model.id)) {
                selectedModels.push({
                    id: model.id,
                    name: model.name,
                    versionUrn: model.versionUrn,
                    ...model
                });
            }
        }
    });
    updateModelSelectionUI();
    updateLoadModelButton();
}

function clearAllModels() {
    selectedModels = [];
    document.querySelectorAll('.model-checkbox').forEach(checkbox => {
        checkbox.checked = false;
    });
    updateModelSelectionUI();
    updateLoadModelButton();
}

function refreshTranslationStatus() {
    showNotification('Refreshing translation status...', 'info');
    // Re-check translation status for all models
    ensureModelsTranslatedToSVF2().then(() => {
        showAlignedModelSelection();
        showNotification('Translation status updated', 'success');
    });
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Token management functions (same as QC)
function getStoredToken() {
    const stored = sessionStorage.getItem('forge_token') || localStorage.getItem('forge_token_backup');
    return stored ? JSON.parse(stored) : null;
}

function isTokenExpired(tokenInfo) {
    const now = Date.now();
    const expiresAt = tokenInfo.expires_at;
    const timeUntilExpiry = expiresAt - now;
    return timeUntilExpiry < (5 * 60 * 1000);
}

function clearStoredToken() {
    sessionStorage.removeItem('forge_token');
    localStorage.removeItem('forge_token_backup');
    console.log('Token cleared');
}

async function verifyToken(token) {
    try {
        const response = await fetch('https://developer.api.autodesk.com/userprofile/v1/users/@me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return response.ok;
    } catch {
        return false;
    }
}

function updateAuthStatus(status, description) {
    const authStatus = document.getElementById('authStatus');
    const authInfo = document.getElementById('authInfo');
    const authIndicator = document.getElementById('authIndicator');

    if (authStatus) authStatus.textContent = status;
    if (authInfo) authInfo.textContent = description;

    if (authIndicator) {
        authIndicator.className = 'status-indicator';
        if (status.includes('✅')) {
            authIndicator.classList.add('authenticated');
        } else if (status.includes('❌')) {
            authIndicator.classList.add('error');
        }
    }
}

function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    const notificationContent = document.getElementById('notificationContent');

    if (notification && notificationContent) {
        notificationContent.textContent = message;
        notification.className = `notification ${type} show`;

        setTimeout(() => {
            notification.classList.remove('show');
        }, 4000);
    } else {
        console.log(`Notification (${type}): ${message}`);
    }
}

function initializeUI() {
    // Project selection event listener is already set in HTML
    console.log('UI event listeners initialized');
}

// Helper function to proceed without a model
function proceedWithoutModel() {
    selectedModel = {
        id: 'no-model',
        name: 'No Model Selected',
        versionUrn: null
    };

    closeModelSelection();

    // Show calculator interface without Forge viewer
    const projectSelection = document.getElementById('projectSelection');
    const calculatorInterface = document.getElementById('calculatorInterface');

    if (projectSelection) projectSelection.style.display = 'none';
    if (calculatorInterface) calculatorInterface.style.display = 'grid';

    // Hide viewer panel or show placeholder
    const viewerPanel = document.querySelector('.viewer-panel');
    if (viewerPanel) {
        const forgeViewer = document.getElementById('forgeViewer');
        if (forgeViewer) {
            forgeViewer.innerHTML = `
                <div class="viewer-placeholder">
                    <h3>No Model Loaded</h3>
                    <p>You can still perform calculations without a 3D model.</p>
                    <p>Element selection features are not available.</p>
                </div>
            `;
        }
    }

    // Update model name display
    const selectedModelName = document.getElementById('selectedModelName');
    if (selectedModelName) {
        selectedModelName.textContent = 'No model - Manual calculation mode';
    }

    // Load calculation history
    updateCalculationHistoryUI();

    showNotification('Calculator ready in manual mode', 'info');
}

// Navigation
function goBack() {
    window.location.href = 'engineering.html';
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', initializeCalculator);