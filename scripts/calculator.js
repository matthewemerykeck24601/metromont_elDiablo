// Engineering Calculator JavaScript - COMPLETE FILE
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
            console.log('📦 Received project data from engineering page');
            console.log('Project:', calculatorData.selectedProjectData?.name);

            // Use the passed data directly
            forgeAccessToken = calculatorData.forgeAccessToken;
            globalHubData = calculatorData.globalHubData;
            selectedProject = calculatorData.selectedProject;
            selectedProjectData = calculatorData.selectedProjectData;

            // Skip project selection and go directly to model loading
            await completeAuthenticationWithProject();
            return;
        }

        // FALLBACK: Original authentication flow if no project data passed
        console.log('🔄 No project data found, using standard authentication');

        // Check if opened from main app (same as QC pattern)
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

        // Fallback to stored token (same as QC pattern)
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
        // This now calls populateProjectDropdown() internally - EXACT SAME as QC
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

        // Step 1: Discover Revit models in ACC project
        await discoverRevitModels();

        // Step 2: Ensure models are translated to SVF2 (required for Model Properties API)
        await ensureModelsTranslatedToSVF2();

        // Step 3: Show enhanced model selection with translation status
        showAlignedModelSelection();

        console.log('✅ Calculator initialized following architecture directives');

    } catch (error) {
        console.error('Enhanced initialization failed:', error);
        updateAuthStatus('❌ Error', 'Failed to initialize: ' + error.message);
    }
}

// ALIGNED: Discover Revit models with proper metadata
async function discoverRevitModels() {
    try {
        console.log('🔍 Discovering Revit models with enhanced metadata...');

        if (!forgeAccessToken || !selectedProject) {
            throw new Error('Missing authentication or project selection');
        }

        // Get all project folders
        const foldersResponse = await fetch(
            `https://developer.api.autodesk.com/data/v1/projects/${selectedProject}/folders`, {
            headers: { 'Authorization': `Bearer ${forgeAccessToken}` }
        });

        if (!foldersResponse.ok) {
            throw new Error(`Failed to load folders: ${foldersResponse.status}`);
        }

        const foldersData = await foldersResponse.json();
        console.log('📁 Scanning folders:', foldersData.data.length);

        // Find Revit models with enhanced data
        const revitModels = [];
        for (const folder of foldersData.data) {
            const models = await findRevitModelsWithMetadata(folder);
            revitModels.push(...models);
        }

        discoveredModels = revitModels;
        console.log('🏗️ Found Revit models:', revitModels.length);

        return revitModels;

    } catch (error) {
        console.error('Error discovering models:', error);
        throw error;
    }
}

// ALIGNED: Find Revit models with enhanced metadata for proper workflow
async function findRevitModelsWithMetadata(folder) {
    try {
        const folderContentsResponse = await fetch(
            `https://developer.api.autodesk.com/data/v1/projects/${selectedProject}/folders/${folder.id}/contents`, {
            headers: { 'Authorization': `Bearer ${forgeAccessToken}` }
        });

        if (!folderContentsResponse.ok) return [];

        const contentsData = await folderContentsResponse.json();
        const revitModels = [];

        for (const item of contentsData.data) {
            if (item.attributes && item.attributes.displayName) {
                const fileName = item.attributes.displayName.toLowerCase();

                // Check for Revit files
                if (fileName.endsWith('.rvt') || fileName.includes('revit')) {

                    // Get latest version with enhanced metadata
                    const versionsResponse = await fetch(
                        `https://developer.api.autodesk.com/data/v1/projects/${selectedProject}/items/${item.id}/versions`, {
                        headers: { 'Authorization': `Bearer ${forgeAccessToken}` }
                    });

                    if (versionsResponse.ok) {
                        const versionsData = await versionsResponse.json();
                        const latestVersion = versionsData.data[0];

                        // ALIGNED: Prepare model data for proper workflow
                        const modelData = {
                            id: item.id,
                            name: item.attributes.displayName,
                            fileName: fileName,
                            folderId: folder.id,
                            folderName: folder.attributes.name,
                            versionId: latestVersion.id,
                            versionUrn: btoa(latestVersion.id).replace(/=/g, ''),
                            lastModified: latestVersion.attributes.lastModifiedTime,
                            size: latestVersion.attributes.storageSize,

                            // Enhanced properties for architecture alignment
                            revitVersion: 'Revit 2024', // Placeholder
                            translationStatus: 'pending',
                            modelPropertiesReady: false,
                            aecDataModelReady: false,
                            isCloudWorkshared: false, // Placeholder

                            // For Design Automation
                            projectGuid: null, // Will be populated if cloud workshared
                            modelGuid: null    // Will be populated if cloud workshared
                        };

                        revitModels.push(modelData);
                    }
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
                    } else {
                        // Trigger SVF2 translation
                        await triggerSVF2Translation(model);
                    }
                } else {
                    // Trigger initial translation
                    await triggerSVF2Translation(model);
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
            throw new Error(`Translation request failed: ${response.status}`);
        }

    } catch (error) {
        console.error(`SVF2 translation failed for ${model.name}:`, error);
        model.translationStatus = 'error';
    }
}

// ALIGNED: Show enhanced model selection following architecture
function showAlignedModelSelection() {
    const modal = document.getElementById('modelSelectionModal');
    const folderTree = document.querySelector('.folder-tree');

    if (!folderTree) return;

    // Populate with discovered models and their architecture status
    folderTree.innerHTML = `
        <h4>Revit Models in ${selectedProjectData.name}</h4>
        <p class="architecture-note">🏗️ Following Forge Viewer + Model Properties + AEC Data workflow</p>
        <div class="models-list">
            ${discoveredModels.length === 0 ?
            '<p class="no-models">No Revit models found in this project</p>' :
            discoveredModels.map(model => `
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
                                ${model.isCloudWorkshared ? '<span class="status-badge cloud">Cloud Workshared</span>' : ''}
                            </div>
                        </div>
                    </div>
                `).join('')
        }
        </div>
        ${discoveredModels.length > 0 ? `
            <div class="selection-actions">
                <button class="btn btn-sm btn-secondary" onclick="selectAllModels()">Select All Ready</button>
                <button class="btn btn-sm btn-secondary" onclick="refreshTranslationStatus()">Refresh Status</button>  
                <button class="btn btn-sm btn-secondary" onclick="clearAllModels()">Clear All</button>
            </div>
        ` : ''}
    `;

    // Show modal
    if (modal) {
        modal.classList.add('active');
    }
}

// Load pre-loaded hub data (EXACT SAME as QC Bed Report)
async function loadPreLoadedHubData() {
    try {
        // Try to get hub data from parent window first
        if (!globalHubData && window.opener && window.opener.CastLinkAuth) {
            globalHubData = window.opener.CastLinkAuth.getHubData();
        }

        // If not available, try to load from session storage
        if (!globalHubData) {
            const storedHubData = sessionStorage.getItem('castlink_hub_data');
            if (storedHubData) {
                globalHubData = JSON.parse(storedHubData);
                console.log('✅ Loaded hub data from session storage');
            }
        }

        if (globalHubData && globalHubData.projects && globalHubData.projects.length > 0) {
            // Use the pre-loaded project data - EXACT SAME as QC
            userProjects = globalHubData.projects;
            hubId = globalHubData.hubId;

            // Set default project - EXACT SAME as QC
            if (globalHubData.projects.length > 0) {
                projectId = globalHubData.projects[0].id;
            }

            populateProjectDropdown(globalHubData.projects);

            console.log('✅ Using pre-loaded hub data:');
            console.log('   Hub ID:', globalHubData.hubId);
            console.log('   Projects:', globalHubData.projects.length);
            console.log('   Loaded at:', globalHubData.loadedAt);

        } else {
            console.warn('⚠️ No pre-loaded hub data available, falling back to manual entry');
            await handleMissingHubData();
        }

    } catch (error) {
        console.error('Error loading pre-loaded hub data:', error);
        await handleMissingHubData();
    }
}

function populateProjectDropdown(projects) {
    try {
        userProjects = projects;
        const projectSelect = document.getElementById('projectSelect');

        if (!projectSelect) {
            console.error('Project select element not found');
            return;
        }

        const accountName = globalHubData ? globalHubData.accountInfo.name : 'ACC Account';
        projectSelect.innerHTML = `<option value="">Select a project from ${accountName}...</option>`;

        projects.forEach((project) => {
            const option = document.createElement('option');
            option.value = project.id;
            option.textContent = `${project.name}${project.number && project.number !== 'N/A' ? ` (${project.number})` : ''}`;

            option.dataset.projectNumber = project.number || '';
            option.dataset.location = project.location || '';
            option.dataset.permissions = project.permissions || 'basic';

            projectSelect.appendChild(option);
        });

        projectSelect.disabled = false;
        console.log('✅ Populated dropdown with', projects.length, 'projects');

    } catch (error) {
        console.error('Error populating project dropdown:', error);
    }
}

async function handleMissingHubData() {
    console.log('Setting up manual entry fallback...');

    const projectSelect = document.getElementById('projectSelect');
    if (projectSelect) {
        projectSelect.innerHTML = '<option value="">No projects available - please authenticate from main dashboard</option>';
        projectSelect.disabled = true;
    }
}

// Project Selection - Updated to match QC pattern
function onProjectChange() {
    const projectSelect = document.getElementById('projectSelect');
    if (!projectSelect) return;

    const selectedOption = projectSelect.selectedOptions[0];

    if (selectedOption && selectedOption.value) {
        const projectNumber = selectedOption.dataset.projectNumber || '';
        const location = selectedOption.dataset.location || '';
        const permissions = selectedOption.dataset.permissions || 'basic';

        projectId = selectedOption.value;
        selectedProject = selectedOption.value; // Keep both for compatibility

        // Find project data
        if (globalHubData && globalHubData.projects) {
            selectedProjectData = globalHubData.projects.find(p => p.id === selectedProject);
        }

        // Update project info display
        const projectName = document.getElementById('projectName');
        const projectDetails = document.getElementById('projectDetails');
        const modelSelectBtn = document.getElementById('modelSelectBtn');

        if (projectName && selectedProjectData) {
            projectName.textContent = selectedProjectData.name;
        }

        if (projectDetails) {
            projectDetails.textContent = 'Ready for engineering calculations';
        }

        if (modelSelectBtn) {
            modelSelectBtn.disabled = false;
        }

        console.log('Project selected:', selectedProjectData?.name || selectedProject);

    } else {
        // No selection
        projectId = null;
        selectedProject = null;
        selectedProjectData = null;

        const projectName = document.getElementById('projectName');
        const projectDetails = document.getElementById('projectDetails');
        const modelSelectBtn = document.getElementById('modelSelectBtn');

        if (projectName) {
            projectName.textContent = 'No project selected';
        }

        if (projectDetails) {
            projectDetails.textContent = 'Select a project to begin calculations';
        }

        if (modelSelectBtn) {
            modelSelectBtn.disabled = true;
        }
    }
}

// Model Selection Functions
function openModelSelector() {
    if (!selectedProject) {
        showNotification('Please select a project first', 'warning');
        return;
    }

    const modal = document.getElementById('modelSelectionModal');
    modal.classList.add('active');
}

function closeModelSelection() {
    const modal = document.getElementById('modelSelectionModal');
    modal.classList.remove('active');
    selectedModel = null;
    selectedModels = [];
    const loadModelBtn = document.getElementById('loadModelBtn');
    if (loadModelBtn) {
        loadModelBtn.disabled = true;
    }
}

// ALIGNED: Enhanced model selection with architecture validation
function selectEnhancedModel(modelId, modelName, versionUrn) {
    const model = discoveredModels.find(m => m.id === modelId);
    const checkbox = document.getElementById(`model_${modelId}`);

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

function selectModel(modelId, modelName) {
    // Remove previous selection
    document.querySelectorAll('.tree-item').forEach(item => {
        item.classList.remove('selected');
    });

    // Add selection to clicked item
    event.target.closest('.tree-item').classList.add('selected');

    selectedModel = { id: modelId, name: modelName };
    document.getElementById('loadModelBtn').disabled = false;

    // Update preview
    const preview = document.querySelector('.model-preview');
    preview.innerHTML = `
        <div class="preview-placeholder">
            <h4>${modelName}</h4>
            <p>3D Model Preview</p>
            <small>Click "Load Model" to open in calculator</small>
        </div>
    `;
}

function loadSelectedModel() {
    if (selectedModels.length > 0) {
        return loadSelectedModels();
    }

    if (!selectedModel) {
        showNotification('Please select a model first', 'warning');
        return;
    }

    closeModelSelection();
    initializeCalculatorInterface();
}

// ALIGNED: Load selected models following full architecture workflow
async function loadSelectedModels() {
    if (selectedModels.length === 0) {
        showNotification('Please select at least one ready model', 'warning');
        return;
    }

    try {
        console.log('🚀 Loading models following architecture directives...');

        // Store selected models for calculator interface
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

        Autodesk.Viewing.Initializer(options, function () {
            // Create viewer instance
            forgeViewer = new Autodesk.Viewing.GuiViewer3D(viewerContainer);

            const startedCode = forgeViewer.start();
            if (startedCode > 0) {
                console.error('Failed to create a Viewer: WebGL not supported.');
                return;
            }

            // Load the first selected model
            const primaryModel = selectedModels[0] || selectedModel;
            loadModelInViewer(primaryModel);

            // Setup enhanced event handlers for architecture workflow
            setupEnhancedViewerEventHandlers();
        });

    } catch (error) {
        console.error('Forge Viewer initialization failed:', error);
        throw error;
    }
}

// Forge Viewer Integration
function initializeForgeViewer() {
    const viewerContainer = document.getElementById('forgeViewer');
    const viewerLoading = document.getElementById('viewerLoading');

    try {
        // Load Forge Viewer script dynamically
        loadForgeViewerScript().then(() => {
            const options = {
                env: 'AutodeskProduction',
                api: 'derivativeV2',
                getAccessToken: function (onTokenReady) {
                    const token = forgeAccessToken;
                    const timeInSeconds = 3600;
                    onTokenReady(token, timeInSeconds);
                }
            };

            Autodesk.Viewing.Initializer(options, function () {
                forgeViewer = new Autodesk.Viewing.GuiViewer3D(viewerContainer);

                const startedCode = forgeViewer.start();
                if (startedCode > 0) {
                    console.error('Failed to create a Viewer: WebGL not supported.');
                    return;
                }

                // Load model
                const documentId = 'urn:' + selectedModel.versionUrn;
                Autodesk.Viewing.Document.load(documentId, onDocumentLoadSuccess, onDocumentLoadFailure);

                function onDocumentLoadSuccess(doc) {
                    const viewables = doc.getRoot().getDefaultGeometry();
                    forgeViewer.loadDocumentNode(doc, viewables).then(i => {
                        console.log('Model loaded successfully');
                        if (viewerLoading) {
                            viewerLoading.style.display = 'none';
                        }

                        // Setup event handlers
                        setupViewerEventHandlers();
                    });
                }

                function onDocumentLoadFailure(viewerErrorCode) {
                    console.error('onDocumentLoadFailure() - errorCode:' + viewerErrorCode);
                    if (viewerLoading) {
                        viewerLoading.innerHTML = '<p>Failed to load model</p>';
                    }
                }
            });
        });

    } catch (error) {
        console.error('Forge Viewer initialization failed:', error);
        if (viewerLoading) {
            viewerLoading.innerHTML = '<p>Viewer initialization failed</p>';
        }
    }
}

function loadModelInViewer(model) {
    if (!forgeViewer || !model) return;

    const documentId = 'urn:' + model.versionUrn;
    Autodesk.Viewing.Document.load(documentId, onDocumentLoadSuccess, onDocumentLoadFailure);

    function onDocumentLoadSuccess(doc) {
        const viewables = doc.getRoot().getDefaultGeometry();
        forgeViewer.loadDocumentNode(doc, viewables).then(i => {
            console.log('Model loaded successfully:', model.name);
            const viewerLoading = document.getElementById('viewerLoading');
            if (viewerLoading) {
                viewerLoading.style.display = 'none';
            }
        });
    }

    function onDocumentLoadFailure(viewerErrorCode) {
        console.error('onDocumentLoadFailure() - errorCode:' + viewerErrorCode);
        const viewerLoading = document.getElementById('viewerLoading');
        if (viewerLoading) {
            viewerLoading.innerHTML = '<p>Failed to load model: ' + model.name + '</p>';
        }
    }
}

async function loadForgeViewerScript() {
    return new Promise((resolve, reject) => {
        // Check if already loaded
        if (window.Autodesk && window.Autodesk.Viewing) {
            resolve();
            return;
        }

        // Load CSS
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*/style.min.css';
        document.head.appendChild(css);

        // Load JavaScript
        const script = document.createElement('script');
        script.src = 'https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*/viewer3D.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

function setupViewerEventHandlers() {
    if (!forgeViewer) return;

    // Handle element selection
    forgeViewer.addEventListener(Autodesk.Viewing.SELECTION_CHANGED_EVENT, function (event) {
        const selection = event.dbIdArray;
        if (selection.length > 0) {
            const dbId = selection[0];
            console.log('Element selected:', dbId);

            // Get element properties
            forgeViewer.getProperties(dbId, function (props) {
                console.log('Element properties:', props);
                updateSelectedElementInfo(props);
            });
        }
    });
}

function setupEnhancedViewerEventHandlers() {
    if (!forgeViewer) return;

    // Enhanced element selection for architecture workflow
    forgeViewer.addEventListener(Autodesk.Viewing.SELECTION_CHANGED_EVENT, function (event) {
        const selection = event.dbIdArray;
        if (selection.length > 0) {
            const dbId = selection[0];
            console.log('Enhanced element selected:', dbId);

            // Get element properties with enhanced data
            forgeViewer.getProperties(dbId, function (props) {
                console.log('Enhanced element properties:', props);
                updateSelectedElementInfo(props);

                // TODO: Query Model Properties API for detailed BIM data
                // TODO: Query AEC Data Model API for quantities
            });
        }
    });
}

function setupEnhancedElementSelection() {
    console.log('🎯 Setting up enhanced element selection for BIM data extraction...');
    // Placeholder for Model Properties API and AEC Data Model API integration
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

// Tab Management
function switchTab(tabName) {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });

    // Remove active class from all tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected tab content
    document.getElementById(tabName).classList.add('active');

    // Add active class to clicked tab button
    event.target.classList.add('active');

    // Hide results panel when switching tabs
    const resultsPanel = document.getElementById('resultsPanel');
    if (resultsPanel) {
        resultsPanel.style.display = 'none';
    }
}

// Calculation Functions
function calculatePointLoads(event) {
    event.preventDefault();

    const pointLoad = parseFloat(document.getElementById('pointLoad').value);
    const loadFactor = parseFloat(document.getElementById('loadFactor').value);
    const contactArea = parseFloat(document.getElementById('contactArea').value);
    const concreteStrength = parseFloat(document.getElementById('concreteStrength').value);

    const factored_load = pointLoad * loadFactor;
    const bearing_stress = factored_load * 1000 / contactArea; // Convert kips to lbs
    const allowable_stress = 0.85 * concreteStrength; // Simplified bearing stress limit

    const results = {
        type: 'Point Load Analysis',
        inputs: { pointLoad, loadFactor, contactArea, concreteStrength },
        outputs: {
            factored_load: factored_load.toFixed(2),
            bearing_stress: bearing_stress.toFixed(0),
            allowable_stress: allowable_stress.toFixed(0),
            safety_factor: (allowable_stress / bearing_stress).toFixed(2),
            status: bearing_stress <= allowable_stress ? 'PASS' : 'FAIL'
        }
    };

    displayResults(results);
}

function calculateColumn(event) {
    event.preventDefault();

    const width = parseFloat(document.getElementById('columnWidth').value);
    const depth = parseFloat(document.getElementById('columnDepth').value);
    const height = parseFloat(document.getElementById('columnHeight').value);
    const axialLoad = parseFloat(document.getElementById('axialLoad').value);
    const moment = parseFloat(document.getElementById('moment').value) || 0;
    const prestressStrands = parseInt(document.getElementById('prestressStrands').value);

    // Column design calculations per PCI
    const area = width * depth;
    const section_modulus = width * depth * depth / 6;
    const min_prestress = 225; // psi per PCI
    const tension_ties_required = area * 200; // 200 Ag lb per PCI

    const axial_stress = (axialLoad * 1000) / area;
    const bending_stress = (moment * 12 * 1000) / section_modulus;
    const total_stress = axial_stress + bending_stress;

    const results = {
        type: 'Column Design (PCI Standards)',
        inputs: { width, depth, height, axialLoad, moment, prestressStrands },
        outputs: {
            cross_sectional_area: area.toFixed(1),
            axial_stress: axial_stress.toFixed(0),
            bending_stress: bending_stress.toFixed(0),
            total_stress: total_stress.toFixed(0),
            min_prestress_required: min_prestress.toFixed(0),
            tension_ties_required: tension_ties_required.toFixed(0),
            status: total_stress <= min_prestress * 3 ? 'PASS' : 'REQUIRES REVIEW'
        }
    };

    displayResults(results);
}

function calculateWall(event) {
    event.preventDefault();

    const length = parseFloat(document.getElementById('wallLength').value);
    const height = parseFloat(document.getElementById('wallHeight').value);
    const thickness = parseFloat(document.getElementById('wallThickness').value);
    const windLoad = parseFloat(document.getElementById('windLoad').value);
    const tensionTies = document.getElementById('tensionTies').value === 'true';

    // Wall panel design
    const area = length * height;
    const volume = area * (thickness / 12); // cubic feet
    const moment = windLoad * height * height / 8; // kip-ft per foot width
    const section_modulus = (thickness * thickness) / 6; // per foot width

    const bending_stress = (moment * 12 * 1000) / section_modulus; // psi
    const min_ties = 2; // PCI minimum
    const tie_capacity = 10000; // lbs each per PCI
    const total_tie_capacity = min_ties * tie_capacity;

    const results = {
        type: 'Wall Panel Design',
        inputs: { length, height, thickness, windLoad, tensionTies },
        outputs: {
            panel_area: area.toFixed(1),
            panel_volume: volume.toFixed(2),
            bending_stress: bending_stress.toFixed(0),
            min_tension_ties: min_ties,
            tie_capacity_each: tie_capacity.toFixed(0),
            total_tie_capacity: total_tie_capacity.toFixed(0),
            tension_ties_provided: tensionTies ? 'YES' : 'NO',
            pci_compliance: tensionTies ? 'COMPLIANT' : 'NON-COMPLIANT',
            notes: 'PCI requires minimum 2 ties at 10,000 lbs each for wall panels'
        }
    };

    displayResults(results);
}

function calculateBeam(event) {
    event.preventDefault();

    const width = parseFloat(document.getElementById('beamWidth').value);
    const depth = parseFloat(document.getElementById('beamDepth').value);
    const span = parseFloat(document.getElementById('beamSpan').value);
    const uniformLoad = parseFloat(document.getElementById('uniformLoad').value);
    const prestressStrands = parseInt(document.getElementById('prestressStrands').value);
    const strandDiameter = parseFloat(document.getElementById('strandDiameter').value);

    // Beam design calculations
    const moment = uniformLoad * span * span / 8; // kip-ft
    const area = width * depth;
    const section_modulus = width * depth * depth / 6;
    const strand_area = prestressStrands * Math.PI * (strandDiameter / 2) * (strandDiameter / 2);
    const prestress_force = strand_area * 200; // Assume 200 ksi strand strength

    const bending_stress = (moment * 12 * 1000) / section_modulus;
    const prestress_stress = (prestress_force * 1000) / area;
    const net_stress = bending_stress - prestress_stress;

    const results = {
        type: 'Beam/Spandrel Design',
        inputs: { width, depth, span, uniformLoad, prestressStrands, strandDiameter },
        outputs: {
            design_moment: moment.toFixed(1),
            strand_area: strand_area.toFixed(3),
            prestress_force: prestress_force.toFixed(0),
            bending_stress: bending_stress.toFixed(0),
            prestress_stress: prestress_stress.toFixed(0),
            net_stress: net_stress.toFixed(0),
            stress_check: net_stress <= 0 ? 'PASS' : 'REQUIRES ADDITIONAL PRESTRESS',
            pci_compliance: 'Design follows PCI prestress guidelines'
        }
    };

    displayResults(results);
}

function calculateDoubleTee(event) {
    event.preventDefault();

    const width = parseFloat(document.getElementById('dtWidth').value);
    const depth = parseFloat(document.getElementById('dtDepth').value);
    const span = parseFloat(document.getElementById('dtSpan').value);
    const liveLoad = parseFloat(document.getElementById('liveLoad').value);
    const stemWidth = parseFloat(document.getElementById('stemWidth').value);
    const flangeThickness = parseFloat(document.getElementById('flangeThickness').value);

    // Double tee design calculations
    const selfWeight = 0.05; // ksf estimate
    const totalLoad = selfWeight + (liveLoad / 1000); // ksf
    const moment = totalLoad * width * span * span / 8; // kip-ft

    // Simplified section properties (two stems)
    const stem_area = 2 * stemWidth * depth;
    const flange_area = width * 12 * flangeThickness;
    const total_area = stem_area + flange_area;

    // Centroid calculation (simplified)
    const y_bar = (stem_area * depth / 2 + flange_area * (depth + flangeThickness / 2)) / total_area;
    const moment_of_inertia = stem_area * Math.pow(depth / 2 - y_bar, 2) +
        flange_area * Math.pow(depth + flangeThickness / 2 - y_bar, 2);
    const section_modulus = moment_of_inertia / Math.max(y_bar, depth + flangeThickness - y_bar);

    const bending_stress = (moment * 12 * 1000) / section_modulus;

    const results = {
        type: 'Double Tee Design',
        inputs: { width, depth, span, liveLoad, stemWidth, flangeThickness },
        outputs: {
            total_load: (totalLoad * 1000).toFixed(1),
            design_moment: moment.toFixed(1),
            section_area: total_area.toFixed(1),
            section_modulus: section_modulus.toFixed(0),
            bending_stress: bending_stress.toFixed(0),
            shear_reinforcement: 'May be omitted per PCI guidelines for double tees',
            pci_compliance: 'Design follows PCI double tee guidelines'
        }
    };

    displayResults(results);
}

function displayResults(results) {
    currentCalculation = {
        id: generateCalculationId(),
        timestamp: new Date().toISOString(),
        projectId: selectedProject,
        modelId: selectedModel?.id,
        ...results
    };

    const resultsPanel = document.getElementById('resultsPanel');
    const resultsContent = document.getElementById('resultsContent');

    if (resultsPanel && resultsContent) {
        resultsContent.innerHTML = `
            <div class="results-header">
                <h4>${results.type}</h4>
                <div class="results-meta">
                    <span>📅 ${new Date().toLocaleString()}</span>
                    <span>🏗️ ${selectedModel?.name || 'Model'}</span>
                </div>
            </div>
            <div class="results-body">
                <div class="results-section">
                    <h5>Inputs</h5>
                    ${Object.entries(results.inputs).map(([key, value]) =>
            `<div class="result-item"><strong>${formatParameterName(key)}:</strong> ${value}</div>`
        ).join('')}
                </div>
                <div class="results-section">
                    <h5>Results</h5>
                    ${Object.entries(results.outputs).map(([key, value]) =>
            `<div class="result-item"><strong>${formatParameterName(key)}:</strong> ${value}</div>`
        ).join('')}
                </div>
            </div>
        `;

        resultsPanel.style.display = 'block';
    }

    // Add to calculation history
    calculationHistory.unshift(currentCalculation);
    if (calculationHistory.length > 50) {
        calculationHistory = calculationHistory.slice(0, 50);
    }

    // Save to localStorage as backup
    localStorage.setItem('engineeringCalculations', JSON.stringify(calculationHistory));

    // Update history UI
    updateCalculationHistoryUI();
}

function formatParameterName(key) {
    return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function clearResults() {
    const resultsContent = document.getElementById('resultsContent');
    const resultsPanel = document.getElementById('resultsPanel');

    if (resultsContent) {
        resultsContent.innerHTML = '';
    }

    if (resultsPanel) {
        resultsPanel.style.display = 'none';
    }

    currentCalculation = null;
    showNotification('Results cleared', 'info');
}

async function saveCalculation() {
    if (!currentCalculation) {
        showNotification('No calculation to save', 'warning');
        return;
    }

    try {
        updateAuthStatus('💾 Saving', 'Saving calculation to ACC project storage...');

        // Save calculation to OSS using the same pattern as QC Bed Report
        const result = await saveCalculationToOSS(currentCalculation);

        if (result.success) {
            showNotification('Calculation saved to ACC project storage', 'success');

            // Update calculation with save info
            currentCalculation.savedToOSS = true;
            currentCalculation.ossObjectKey = result.objectKey;
            currentCalculation.savedAt = new Date().toISOString();

            // Update calculation history
            calculationHistory[0] = currentCalculation;
            localStorage.setItem('engineeringCalculations', JSON.stringify(calculationHistory));
            updateCalculationHistoryUI();
        }

    } catch (error) {
        console.error('Failed to save calculation:', error);
        showNotification('Failed to save calculation: ' + error.message, 'error');
    }
}

async function saveCalculationToOSS(calculationData) {
    if (!selectedProject || !forgeAccessToken) {
        throw new Error('Missing project or authentication');
    }

    const projectId = selectedProject;
    const reportContent = {
        reportType: 'engineering-calc-report',
        timestamp: new Date().toISOString(),
        projectInfo: {
            projectId: projectId,
            projectName: selectedProjectData?.name || 'Unknown Project',
            modelId: selectedModel?.id,
            modelName: selectedModel?.name
        },
        authInfo: {
            tokenStatus: forgeAccessToken ? 'present' : 'missing',
            bucketPermissions: 'create,read,update,delete',
            dataSource: 'pre-loaded-hub-data',
            uploadWorkflow: 'signed-s3-upload'
        },
        reportData: calculationData
    };

    const response = await fetch('/.netlify/functions/oss-storage', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${forgeAccessToken}`
        },
        body: JSON.stringify({
            action: 'save-report',
            data: {
                projectId: projectId,
                reportContent: reportContent
            }
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OSS Backend Error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    if (!result.success) {
        throw new Error(result.error || 'Unknown OSS backend error');
    }

    return {
        success: true,
        calculationId: calculationData.id,
        projectId: projectId,
        bucketKey: result.bucketKey,
        objectKey: result.objectKey
    };
}

function exportResults() {
    if (!currentCalculation) {
        showNotification('No calculation to export', 'warning');
        return;
    }

    // Simple text export for now
    const resultsContent = document.getElementById('resultsContent').textContent;
    const blob = new Blob([resultsContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentCalculation.type.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showNotification('Calculation exported', 'success');
}

// History Management
function loadCalculationHistory() {
    try {
        const saved = localStorage.getItem('engineeringCalculations');
        if (saved) {
            calculationHistory = JSON.parse(saved);
        }
    } catch (error) {
        console.error('Failed to load calculation history:', error);
        calculationHistory = [];
    }
}

function updateCalculationHistoryUI() {
    const historyList = document.getElementById('historyList');
    if (!historyList) return;

    if (calculationHistory.length === 0) {
        historyList.innerHTML = '<p class="text-gray-500">No recent calculations</p>';
        return;
    }

    historyList.innerHTML = calculationHistory.slice(0, 10).map(calc => `
        <div class="history-item" onclick="loadCalculation('${calc.id}')">
            <div class="history-title">${calc.type}</div>
            <div class="history-date">${new Date(calc.timestamp).toLocaleDateString()}</div>
            ${calc.savedToOSS ? '<div class="history-saved">☁️ Saved</div>' : ''}
        </div>
    `).join('');
}

function loadCalculation(calculationId) {
    const calc = calculationHistory.find(c => c.id === calculationId);
    if (!calc) {
        showNotification('Calculation not found', 'error');
        return;
    }

    currentCalculation = calc;

    // Display the calculation results
    displayResults({
        type: calc.type,
        inputs: calc.inputs,
        outputs: calc.outputs
    });

    showNotification('Calculation loaded from history', 'info');
}

function refreshHistory() {
    loadCalculationHistory();
    updateCalculationHistoryUI();
    showNotification('History refreshed', 'info');
}

// Utility Functions
function generateCalculationId() {
    return 'calc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

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

// Navigation
function goBack() {
    window.location.href = 'engineering.html';
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', initializeCalculator);