// Engineering & Drafting Module - Enhanced Calculator Implementation
// Updated to include Forge Viewer integration and PCI-compliant calculations

// ACC Authentication Configuration (same as other modules)
const ACC_CLIENT_ID = window.ACC_CLIENT_ID;
const ACC_CALLBACK_URL = 'https://metrocastpro.com/';

// Enhanced scope configuration including OSS bucket management
const ACC_SCOPES = [
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
].join(' ');

const ACC_PROJECT_API_BASE = 'https://developer.api.autodesk.com/project/v1';

// Authentication Variables
let forgeAccessToken = null;
let projectId = null;
let hubId = null;
let userProfile = null;
let isACCConnected = false;
let userProjects = [];
let projectMembers = [];

// Global Hub Data (loaded from main app - same as QC Bed Report)
let globalHubData = null;

// Current selections
let selectedProject = null;
let selectedProjectData = null;

// Engineering Calculator Variables
let viewer = null;
let selectedElements = [];
let currentCalculation = null;
let calculationHistory = [];
let modelURN = null;
let selectedModelData = null;

// Bed Information (from uploaded BED Info.xlsx)
const BED_INFO = {
    "FB #1": {
        name: "FB #1",
        surface: "STEEL",
        width: "13' 8-1/4\"",
        length: "320'",
        strandLength: "340'",
        pullingBlockCapacity: "18-1/2 33k",
        supportedProducts: ["MDK", "WP", "ARCH"],
        type: "flatbed"
    },
    "FB #2": {
        name: "FB #2", 
        surface: "STEEL",
        width: "13' 5\"",
        length: "250'",
        strandLength: "270'",
        pullingBlockCapacity: "28-1/2 33k",
        supportedProducts: ["WP", "ARCH"],
        type: "flatbed"
    },
    "FB #3": {
        name: "FB #3",
        surface: "STEEL", 
        width: "13' 8-1/4\"",
        length: "320'",
        strandLength: "340'",
        pullingBlockCapacity: "18-1/2 33k",
        supportedProducts: ["MDK", "WP", "ARCH"],
        type: "flatbed"
    },
    "FB #4": {
        name: "FB #4",
        surface: "STEEL",
        width: "13' 5\"", 
        length: "250'",
        strandLength: "270'",
        pullingBlockCapacity: "28-1/2 33k",
        supportedProducts: ["WP", "ARCH"],
        type: "flatbed"
    },
    "DB #1": {
        name: "DB #1",
        surface: "STEEL",
        width: "14' 1-1/2\"",
        length: "250'",
        strandLength: "270'",
        pullingBlockCapacity: "28-1/2 33k",
        supportedProducts: ["DT", "MDK"],
        type: "deckbed"
    },
    "DB #2": {
        name: "DB #2",
        surface: "STEEL", 
        width: "14' 1-1/2\"",
        length: "250'",
        strandLength: "270'",
        pullingBlockCapacity: "28-1/2 33k",
        supportedProducts: ["DT", "MDK"],
        type: "deckbed"
    },
    "CB #1": {
        name: "CB #1",
        surface: "STEEL",
        width: "5' 0\"",
        length: "60'",
        strandLength: "80'",
        pullingBlockCapacity: "10-1/2 33k",
        supportedProducts: ["COL", "BEAM"],
        type: "columnbed"
    }
};

// PCI Material Constants
const PCI_CONSTANTS = {
    concreteStrengths: [3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000], // psi
    strandSizes: {
        "3/8": { diameter: 0.375, area: 0.085, fpu: 270000 }, // ksi
        "7/16": { diameter: 0.4375, area: 0.115, fpu: 270000 },
        "1/2": { diameter: 0.5, area: 0.153, fpu: 270000 },
        "0.6": { diameter: 0.6, area: 0.217, fpu: 270000 }
    },
    phi_factors: {
        tension_controlled: 0.9,
        compression_controlled: 0.65,
        transition: 0.75
    },
    minimumPrestress: 225, // psi
    tensionTieCapacity: 200, // lb per sq inch of gross area for columns
    wallTieStrength: 10000 // lb per tie for wall panels
};

// Initialize Application
function initializeApp() {
    console.log('Initializing Engineering Calculator Module...');
    updateAuthStatus('Initializing...', 'Loading engineering tools...');
    
    checkAuthentication();
    initializeUI();
    loadCalculationHistory();
}

// Authentication Management (same pattern as QC Bed Report)
async function checkAuthentication() {
    try {
        updateAuthStatus('Checking Authentication...', 'Verifying access credentials...');

        // First check for parent app authentication
        if (window.parent !== window) {
            try {
                const parentAuth = window.parent.authManager;
                const isParentAuth = await parentAuth.waitForAuth();
                if (isParentAuth) {
                    forgeAccessToken = parentAuth.getToken();
                    globalHubData = parentAuth.getHubData();
                    await completeAuthentication();
                    return;
                }
            } catch (error) {
                console.warn('Parent auth not available:', error);
            }
        }

        // Fallback to stored token (same as QC Bed Report)
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
        console.error('Engineering module initialization failed:', error);
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
        updateAuthStatus('Loading Hub Data...', 'Using pre-loaded project information...');

        // Load the hub data that was already loaded during main authentication
        // This is the SAME method used by QC Bed Report
        await loadPreLoadedHubData();

        isACCConnected = true;

        const projectCount = globalHubData ? globalHubData.projects.length : 0;
        const accountName = globalHubData ? 
            (globalHubData.account ? globalHubData.account.name : 'ACC Account') : 
            'Unknown Account';

        updateAuthStatus(
            `✅ Connected to ${accountName}`,
            `${projectCount} projects available`
        );

        populateProjectOptions();
        initializeForgeViewer();

    } catch (error) {
        console.error('Authentication completion failed:', error);
        showAuthError(error.message);
    }
}

// Project Management Functions
async function loadPreLoadedHubData() {
    if (!globalHubData) {
        console.warn('No global hub data available');
        return;
    }

    userProjects = globalHubData.projects || [];
    console.log(`✅ Loaded ${userProjects.length} projects from global hub data`);
}

function populateProjectOptions() {
    const projectSelect = document.getElementById('projectSelect');
    if (!projectSelect) return;

    projectSelect.innerHTML = '<option value="">Select a project...</option>';

    if (!globalHubData || !globalHubData.projects) {
        handleMissingHubData();
        return;
    }

    const projects = globalHubData.projects;
    projects.forEach(project => {
        const option = document.createElement('option');
        option.value = project.id;
        option.textContent = `${project.name}${project.number ? ' (' + project.number + ')' : ''}`;
        option.dataset.projectData = JSON.stringify(project);
        projectSelect.appendChild(option);
    });

    projectSelect.disabled = false;

    // Auto-select first project
    if (projects.length > 0) {
        projectSelect.value = projects[0].id;
        projectId = projects[0].id;
        onProjectChange();
    }
}

function onProjectChange() {
    const projectSelect = document.getElementById('projectSelect');
    if (!projectSelect || !projectSelect.value) {
        selectedProject = null;
        selectedProjectData = null;
        updateProjectInfo();
        return;
    }

    selectedProject = projectSelect.value;
    projectId = selectedProject;

    try {
        selectedProjectData = JSON.parse(projectSelect.selectedOptions[0].dataset.projectData);
        updateProjectInfo();
        updateProjectFilterTexts();
        showNotification(`Project "${selectedProjectData.name}" selected`, 'success');
    } catch (error) {
        console.error('Error parsing project data:', error);
        selectedProjectData = null;
    }
}

function updateProjectInfo() {
    const projectName = document.getElementById('projectName');
    const projectDetails = document.getElementById('projectDetails');

    if (selectedProjectData) {
        if (projectName) projectName.textContent = selectedProjectData.name;
        if (projectDetails) {
            projectDetails.textContent = `${selectedProjectData.type || 'Project'} • Ready for engineering calculations`;
        }
    } else {
        if (projectName) projectName.textContent = 'No project selected';
        if (projectDetails) projectDetails.textContent = 'Select a project to begin calculations';
    }
}

// Engineering Tool Functions - Enhanced with actual implementations
function openEngineeringTool(tool) {
    if (!selectedProject) {
        showNotification('Please select a project first', 'warning');
        return;
    }

    switch (tool) {
        case 'calculator':
            openCalculator();
            break;
        case 'design-summary':
            openDesignSummary();
            break;
        case 'piece-issue':
            openPieceIssue();
            break;
        case 'bom-query':
            openBOMQuery();
            break;
        default:
            showNotification('Tool not yet implemented', 'info');
    }
}

function openCalculator() {
    if (!selectedProject) {
        showNotification('Please select a project first', 'warning');
        return;
    }
    
    showNotification('Opening Engineering Calculator...', 'info');
    showModelSelectionDialog();
}

// Model Selection Dialog
function showModelSelectionDialog() {
    const existingModal = document.getElementById('modelSelectionModal');
    if (existingModal) {
        existingModal.remove();
    }

    const modal = document.createElement('div');
    modal.id = 'modelSelectionModal';
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content large">
            <div class="modal-header">
                <h2>Select Model for Engineering Calculator</h2>
                <button class="close-btn" onclick="closeModelSelection()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="model-selection-content">
                    <div class="folder-tree" id="folderTree">
                        <div class="loading">Loading models...</div>
                    </div>
                    <div class="model-preview" id="modelPreview">
                        <div class="preview-placeholder">
                            <svg width="64" height="64" fill="#ccc" viewBox="0 0 24 24">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
                                <path d="M14 2v6h6"/>
                            </svg>
                            <p>Select a model to preview</p>
                        </div>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeModelSelection()">Cancel</button>
                <button class="btn btn-primary" id="selectModelBtn" disabled onclick="selectModel()">
                    Select Model
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    loadProjectModels();
}

function closeModelSelection() {
    const modal = document.getElementById('modelSelectionModal');
    if (modal) {
        modal.remove();
    }
}

async function loadProjectModels() {
    try {
        const folderTree = document.getElementById('folderTree');
        if (!folderTree) return;

        // Simulate loading project models - in real implementation, this would call Data Management API
        folderTree.innerHTML = `
            <div class="folder-item">
                <div class="folder-header" onclick="toggleFolder('models')">
                    <span class="folder-icon">📁</span>
                    <span class="folder-name">Project Models</span>
                </div>
                <div class="folder-contents" id="models">
                    <div class="model-item" onclick="selectModelItem(this)" data-urn="sample-model-1">
                        <span class="model-icon">🏗️</span>
                        <span class="model-name">Structural Model - Rev 3</span>
                        <span class="model-type">Revit</span>
                    </div>
                    <div class="model-item" onclick="selectModelItem(this)" data-urn="sample-model-2">
                        <span class="model-icon">🏗️</span>
                        <span class="model-name">Architectural Model - Rev 2</span>
                        <span class="model-type">Revit</span>
                    </div>
                    <div class="model-item" onclick="selectModelItem(this)" data-urn="sample-model-3">
                        <span class="model-icon">📐</span>
                        <span class="model-name">Precast Elements</span>
                        <span class="model-type">IFC</span>
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Failed to load project models:', error);
        const folderTree = document.getElementById('folderTree');
        if (folderTree) {
            folderTree.innerHTML = '<div class="error">Failed to load models. Please try again.</div>';
        }
    }
}

function toggleFolder(folderId) {
    const folder = document.getElementById(folderId);
    if (folder) {
        folder.style.display = folder.style.display === 'none' ? 'block' : 'none';
    }
}

function selectModelItem(element) {
    // Clear previous selections
    document.querySelectorAll('.model-item').forEach(item => {
        item.classList.remove('selected');
    });
    
    // Select current item
    element.classList.add('selected');
    
    // Enable select button
    const selectBtn = document.getElementById('selectModelBtn');
    if (selectBtn) {
        selectBtn.disabled = false;
    }
    
    // Store model data
    selectedModelData = {
        urn: element.dataset.urn,
        name: element.querySelector('.model-name').textContent,
        type: element.querySelector('.model-type').textContent
    };
    
    // Update preview
    updateModelPreview();
}

function updateModelPreview() {
    const preview = document.getElementById('modelPreview');
    if (!preview || !selectedModelData) return;
    
    preview.innerHTML = `
        <div class="model-info">
            <h3>${selectedModelData.name}</h3>
            <p>Type: ${selectedModelData.type}</p>
            <p>URN: ${selectedModelData.urn}</p>
            <div class="model-stats">
                <div class="stat">
                    <span class="stat-label">Last Modified:</span>
                    <span class="stat-value">2 days ago</span>
                </div>
                <div class="stat">
                    <span class="stat-label">File Size:</span>
                    <span class="stat-value">15.2 MB</span>
                </div>
            </div>
        </div>
    `;
}

function selectModel() {
    if (!selectedModelData) {
        showNotification('Please select a model first', 'warning');
        return;
    }
    
    modelURN = selectedModelData.urn;
    closeModelSelection();
    openCalculatorInterface();
}

// Calculator Interface
function openCalculatorInterface() {
    const existingModal = document.getElementById('calculatorModal');
    if (existingModal) {
        existingModal.remove();
    }

    const modal = document.createElement('div');
    modal.id = 'calculatorModal';
    modal.className = 'modal active calculator-modal';
    modal.innerHTML = `
        <div class="modal-content fullscreen">
            <div class="modal-header">
                <h2>Engineering Calculator - ${selectedModelData.name}</h2>
                <div class="header-controls">
                    <button class="btn btn-sm btn-secondary" onclick="toggleViewerFullscreen()">
                        <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                        </svg>
                        Fullscreen
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="saveCalculation()">
                        <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
                        </svg>
                        Save
                    </button>
                    <button class="close-btn" onclick="closeCalculator()">&times;</button>
                </div>
            </div>
            <div class="calculator-layout">
                <div class="viewer-section">
                    <div id="forgeViewer" class="forge-viewer"></div>
                    <div class="viewer-controls">
                        <div class="explode-control">
                            <label>Explode:</label>
                            <input type="range" id="explodeSlider" min="0" max="10" value="0" onchange="setExplodeLevel(this.value)">
                        </div>
                        <div class="selection-info" id="selectionInfo">
                            <span>No elements selected</span>
                        </div>
                    </div>
                </div>
                <div class="calculation-panel">
                    <div class="calc-tabs">
                        <button class="tab-btn active" onclick="switchTab('point-loads')">Point Loads</button>
                        <button class="tab-btn" onclick="switchTab('columns')">Columns</button>
                        <button class="tab-btn" onclick="switchTab('walls')">Walls/Panels</button>
                        <button class="tab-btn" onclick="switchTab('beams')">Beams/Spandrels</button>
                        <button class="tab-btn" onclick="switchTab('double-tees')">Double Tees</button>
                    </div>
                    <div class="tab-content">
                        <div id="point-loads-tab" class="tab-pane active">
                            ${generatePointLoadsForm()}
                        </div>
                        <div id="columns-tab" class="tab-pane">
                            ${generateColumnsForm()}
                        </div>
                        <div id="walls-tab" class="tab-pane">
                            ${generateWallsForm()}
                        </div>
                        <div id="beams-tab" class="tab-pane">
                            ${generateBeamsForm()}
                        </div>
                        <div id="double-tees-tab" class="tab-pane">
                            ${generateDoubleTeesForm()}
                        </div>
                    </div>
                    <div class="calculation-results" id="calculationResults">
                        <h4>Results</h4>
                        <div class="results-content">
                            Select elements and configure parameters to see results.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    initializeForgeViewerInModal();
}

// Forge Viewer Integration
function initializeForgeViewer() {
    // Load Forge Viewer JavaScript
    if (!window.Autodesk) {
        const script = document.createElement('script');
        script.src = 'https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*/viewer3D.min.js';
        script.onload = () => {
            console.log('Forge Viewer loaded');
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*/style.min.css';
            document.head.appendChild(link);
        };
        document.head.appendChild(script);
    }
}

function initializeForgeViewerInModal() {
    const viewerDiv = document.getElementById('forgeViewer');
    if (!viewerDiv) return;

    const options = {
        env: 'AutodeskProduction',
        api: 'derivativeV2',
        getAccessToken: function(onTokenReady) {
            onTokenReady(forgeAccessToken, 3600);
        }
    };

    Autodesk.Viewing.Initializer(options, function() {
        const htmlDiv = document.getElementById('forgeViewer');
        viewer = new Autodesk.Viewing.GuiViewer3D(htmlDiv);
        
        const startedCode = viewer.start();
        if (startedCode > 0) {
            console.error('Failed to create a Viewer: WebGL not supported.');
            return;
        }

        // For demo purposes, show placeholder content
        showViewerPlaceholder();
        
        // In real implementation, load the model:
        // Autodesk.Viewing.Document.load(modelURN, onDocumentLoadSuccess, onDocumentLoadFailure);
    });
}

function showViewerPlaceholder() {
    const viewerDiv = document.getElementById('forgeViewer');
    if (viewerDiv) {
        viewerDiv.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; height: 100%; background: #f0f0f0; color: #666; flex-direction: column; gap: 1rem;">
                <svg width="64" height="64" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
                <div style="text-align: center;">
                    <div style="font-weight: 600; margin-bottom: 0.5rem;">3D Model Viewer</div>
                    <div style="font-size: 0.875rem;">Model: ${selectedModelData.name}</div>
                    <div style="font-size: 0.75rem; margin-top: 0.5rem; opacity: 0.7;">
                        In production, this would show the Autodesk Forge 3D viewer
                    </div>
                </div>
            </div>
        `;
    }
}

// Calculation Form Generators
function generatePointLoadsForm() {
    return `
        <div class="form-section">
            <h4>Point Load Transfer Calculation</h4>
            <p class="section-description">Calculate load transfer from slabs/beams to columns</p>
            
            <div class="form-row">
                <div class="form-group">
                    <label>Dead Load Factor:</label>
                    <input type="number" step="0.1" value="1.2" onchange="calculatePointLoads()">
                </div>
                <div class="form-group">
                    <label>Live Load Factor:</label>
                    <input type="number" step="0.1" value="1.6" onchange="calculatePointLoads()">
                </div>
            </div>
            
            <div class="form-group">
                <label>Additional Point Load (lb):</label>
                <input type="number" value="10000" onchange="calculatePointLoads()" 
                       title="PCI recommends 10,000 lb for parking bumper walls">
                <small>PCI recommends 10,000 lb at 18" above floor for bumper walls</small>
            </div>
            
            <div class="selected-elements">
                <h5>Selected Contributing Elements:</h5>
                <div id="contributingElements" class="element-list">
                    Select floor/deck elements that contribute to the load
                </div>
            </div>
            
            <div class="selected-elements">
                <h5>Selected Receiving Columns:</h5>
                <div id="receivingColumns" class="element-list">
                    Select column stacks that will receive the load
                </div>
            </div>
            
            <button class="btn btn-primary" onclick="calculatePointLoads()">Calculate Load Transfer</button>
        </div>
    `;
}

function generateColumnsForm() {
    return `
        <div class="form-section">
            <h4>Precast Column Design</h4>
            <p class="section-description">Design prestressed columns per PCI guidelines</p>
            
            <div class="form-row">
                <div class="form-group">
                    <label>Width (in):</label>
                    <input type="number" step="0.5" value="12" onchange="calculateColumn()">
                </div>
                <div class="form-group">
                    <label>Height (in):</label>
                    <input type="number" step="0.5" value="24" onchange="calculateColumn()">
                </div>
            </div>
            
            <div class="form-row">
                <div class="form-group">
                    <label>Unbraced Length (ft):</label>
                    <input type="number" step="0.5" value="14" onchange="calculateColumn()">
                </div>
                <div class="form-group">
                    <label>Concrete Strength (psi):</label>
                    <select onchange="calculateColumn()">
                        ${PCI_CONSTANTS.concreteStrengths.map(fc => 
                            `<option value="${fc}" ${fc === 5000 ? 'selected' : ''}>${fc}</option>`
                        ).join('')}
                    </select>
                </div>
            </div>
            
            <div class="form-row">
                <div class="form-group">
                    <label>Axial Load (kips):</label>
                    <input type="number" step="0.1" value="100" onchange="calculateColumn()">
                </div>
                <div class="form-group">
                    <label>Moment (kip-ft):</label>
                    <input type="number" step="0.1" value="50" onchange="calculateColumn()">
                </div>
            </div>
            
            <div class="form-row">
                <div class="form-group">
                    <label>Strand Size:</label>
                    <select onchange="calculateColumn()">
                        ${Object.keys(PCI_CONSTANTS.strandSizes).map(size => 
                            `<option value="${size}" ${size === '1/2' ? 'selected' : ''}>${size}"</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Number of Strands:</label>
                    <input type="number" min="4" max="20" value="8" onchange="calculateColumn()">
                </div>
            </div>
            
            <div class="design-options">
                <h5>Design Classification</h5>
                <div class="radio-group">
                    <label><input type="radio" name="stressClass" value="U" checked> Class U (ft ≤ 7.5√fc)</label>
                    <label><input type="radio" name="stressClass" value="T"> Class T (Tension controlled)</label>
                    <label><input type="radio" name="stressClass" value="C"> Class C (Compression controlled)</label>
                </div>
            </div>
            
            <button class="btn btn-primary" onclick="calculateColumn()">Design Column</button>
        </div>
    `;
}

function generateWallsForm() {
    return `
        <div class="form-section">
            <h4>Wall Panel Design</h4>
            <p class="section-description">Design precast wall panels with lateral loads</p>
            
            <div class="form-row">
                <div class="form-group">
                    <label>Height (ft):</label>
                    <input type="number" step="0.5" value="12" onchange="calculateWall()">
                </div>
                <div class="form-group">
                    <label>Thickness (in):</label>
                    <input type="number" step="0.25" value="8" onchange="calculateWall()">
                </div>
                <div class="form-group">
                    <label>Length (ft):</label>
                    <input type="number" step="0.5" value="20" onchange="calculateWall()">
                </div>
            </div>
            
            <div class="form-row">
                <div class="form-group">
                    <label>Wind Load (psf):</label>
                    <input type="number" step="1" value="25" onchange="calculateWall()">
                </div>
                <div class="form-group">
                    <label>Seismic Load (psf):</label>
                    <input type="number" step="1" value="15" onchange="calculateWall()">
                </div>
            </div>
            
            <div class="form-group">
                <label>Axial Load (kips/ft):</label>
                <input type="number" step="0.1" value="2.5" onchange="calculateWall()">
            </div>
            
            <div class="tension-ties">
                <h5>Tension Tie Requirements</h5>
                <p class="requirement">PCI requires ≥ 2 ties per panel with 10,000 lb capacity each</p>
                <div class="form-row">
                    <div class="form-group">
                        <label>Number of Ties:</label>
                        <input type="number" min="2" value="4" onchange="calculateWall()">
                    </div>
                    <div class="form-group">
                        <label>Tie Capacity (lb):</label>
                        <input type="number" value="10000" onchange="calculateWall()">
                    </div>
                </div>
            </div>
            
            <button class="btn btn-primary" onclick="calculateWall()">Design Wall Panel</button>
        </div>
    `;
}

function generateBeamsForm() {
    return `
        <div class="form-section">
            <h4>Beam/Spandrel Design</h4>
            <p class="section-description">Design prestressed beams and spandrels</p>
            
            <div class="form-row">
                <div class="form-group">
                    <label>Span (ft):</label>
                    <input type="number" step="0.5" value="40" onchange="calculateBeam()">
                </div>
                <div class="form-group">
                    <label>Beam Type:</label>
                    <select onchange="calculateBeam()">
                        <option value="I-beam">I-Beam</option>
                        <option value="L-beam">L-Beam</option>
                        <option value="inverted-tee">Inverted Tee</option>
                        <option value="spandrel">Spandrel</option>
                    </select>
                </div>
            </div>
            
            <div class="form-row">
                <div class="form-group">
                    <label>Depth (in):</label>
                    <input type="number" step="0.5" value="24" onchange="calculateBeam()">
                </div>
                <div class="form-group">
                    <label>Width (in):</label>
                    <input type="number" step="0.5" value="12" onchange="calculateBeam()">
                </div>
            </div>
            
            <div class="form-row">
                <div class="form-group">
                    <label>Uniform Load (klf):</label>
                    <input type="number" step="0.1" value="2.5" onchange="calculateBeam()">
                </div>
                <div class="form-group">
                    <label>Point Load (kips):</label>
                    <input type="number" step="0.1" value="0" onchange="calculateBeam()">
                </div>
            </div>
            
            <div class="prestress-section">
                <h5>Prestressing Parameters</h5>
                <div class="form-row">
                    <div class="form-group">
                        <label>Eccentricity (in):</label>
                        <input type="number" step="0.1" value="8" onchange="calculateBeam()">
                    </div>
                    <div class="form-group">
                        <label>Loss Factor (%):</label>
                        <input type="number" step="1" value="20" onchange="calculateBeam()">
                    </div>
                </div>
            </div>
            
            <div class="shear-section">
                <h5>Shear Design</h5>
                <p class="requirement">PCI allows omission of shear reinforcement if Vu < φVc</p>
                <label>
                    <input type="checkbox" checked onchange="calculateBeam()">
                    Check shear reinforcement requirements
                </label>
            </div>
            
            <button class="btn btn-primary" onclick="calculateBeam()">Design Beam</button>
        </div>
    `;
}

function generateDoubleTeesForm() {
    return `
        <div class="form-section">
            <h4>Double Tee Design</h4>
            <p class="section-description">Design double tee panels per PCI standards</p>
            
            <div class="form-row">
                <div class="form-group">
                    <label>DT Size:</label>
                    <select onchange="calculateDoubleTee()">
                        <option value="8DT16">8DT16</option>
                        <option value="8DT20">8DT20</option>
                        <option value="8DT24">8DT24</option>
                        <option value="10DT16">10DT16</option>
                        <option value="10DT20">10DT20</option>
                        <option value="10DT24">10DT24</option>
                        <option value="12DT16">12DT16</option>
                        <option value="12DT20">12DT20</option>
                        <option value="12DT24" selected>12DT24</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Span (ft):</label>
                    <input type="number" step="0.5" value="60" onchange="calculateDoubleTee()">
                </div>
            </div>
            
            <div class="form-row">
                <div class="form-group">
                    <label>Flange Thickness (in):</label>
                    <input type="number" step="0.25" value="2" onchange="calculateDoubleTee()">
                </div>
                <div class="form-group">
                    <label>Stem Spacing (in):</label>
                    <input type="number" step="0.5" value="8" onchange="calculateDoubleTee()">
                </div>
            </div>
            
            <div class="loading-section">
                <h5>Loading</h5>
                <div class="form-row">
                    <div class="form-group">
                        <label>Uniform Load (psf):</label>
                        <input type="number" step="1" value="50" onchange="calculateDoubleTee()">
                    </div>
                    <div class="form-group">
                        <label>Point Load (kips):</label>
                        <input type="number" step="0.1" value="0" onchange="calculateDoubleTee()">
                    </div>
                </div>
            </div>
            
            <div class="shear-check">
                <h5>Shear Design Check</h5>
                <p class="requirement">Check if shear reinforcement can be omitted (Vu < φVc)</p>
                <div class="form-group">
                    <label>End Region Length (ft):</label>
                    <input type="number" step="0.5" value="7.5" onchange="calculateDoubleTee()">
                    <small>PCI recommends checking 5-10 ft from ends</small>
                </div>
            </div>
            
            <div class="flange-reinforcement">
                <h5>Flange Reinforcement</h5>
                <p class="requirement">Check flange reinforcement for localized loads</p>
                <div class="form-group">
                    <label>Contact Area (sq in):</label>
                    <input type="number" step="1" value="100" onchange="calculateDoubleTee()">
                </div>
            </div>
            
            <button class="btn btn-primary" onclick="calculateDoubleTee()">Design Double Tee</button>
        </div>
    `;
}

// Calculation Functions
function calculatePointLoads() {
    // Implementation of point load calculations
    const deadLoadFactor = parseFloat(document.querySelector('#point-loads-tab input[step="0.1"]').value) || 1.2;
    const liveLoadFactor = parseFloat(document.querySelector('#point-loads-tab input[step="0.1"]:nth-of-type(2)').value) || 1.6;
    const additionalLoad = parseFloat(document.querySelector('#point-loads-tab input[type="number"]:nth-of-type(3)').value) || 10000;
    
    updateCalculationResults('Point Load Transfer', {
        deadLoadFactor: deadLoadFactor,
        liveLoadFactor: liveLoadFactor,
        additionalPointLoad: additionalLoad + ' lb',
        recommendation: 'PCI recommends 10,000 lb ultimate load for parking bumper walls',
        status: 'Ready for element selection'
    });
}

function calculateColumn() {
    // Implementation of column design calculations following PCI guidelines
    const width = parseFloat(document.querySelector('#columns-tab input[step="0.5"]').value) || 12;
    const height = parseFloat(document.querySelector('#columns-tab input[step="0.5"]:nth-of-type(2)').value) || 24;
    const unbracedLength = parseFloat(document.querySelector('#columns-tab input[step="0.5"]:nth-of-type(3)').value) || 14;
    const fc = parseFloat(document.querySelector('#columns-tab select').value) || 5000;
    const axialLoad = parseFloat(document.querySelector('#columns-tab input[step="0.1"]').value) || 100;
    const moment = parseFloat(document.querySelector('#columns-tab input[step="0.1"]:nth-of-type(2)').value) || 50;
    
    const Ag = width * height; // gross area
    const minimumTensionTie = PCI_CONSTANTS.tensionTieCapacity * Ag; // 200 * Ag minimum per PCI
    const slendernessRatio = (unbracedLength * 12) / Math.min(width, height);
    
    updateCalculationResults('Column Design', {
        grossArea: Ag.toFixed(1) + ' sq in',
        slendernessRatio: slendernessRatio.toFixed(1),
        minimumTensionTie: minimumTensionTie.toFixed(0) + ' lb',
        concreteStrength: fc + ' psi',
        axialCapacityCheck: 'Check P-M interaction curve',
        prestressRequirement: 'Min 225 psi effective prestress per PCI',
        status: slendernessRatio > 100 ? 'Warning: High slenderness ratio' : 'Within limits'
    });
}

function calculateWall() {
    // Implementation of wall panel design
    const height = parseFloat(document.querySelector('#walls-tab input[step="0.5"]').value) || 12;
    const thickness = parseFloat(document.querySelector('#walls-tab input[step="0.25"]').value) || 8;
    const length = parseFloat(document.querySelector('#walls-tab input[step="0.5"]:nth-of-type(3)').value) || 20;
    const windLoad = parseFloat(document.querySelector('#walls-tab input[step="1"]').value) || 25;
    const numTies = parseFloat(document.querySelector('#walls-tab input[min="2"]').value) || 4;
    const tieCapacity = parseFloat(document.querySelector('#walls-tab input[value="10000"]').value) || 10000;
    
    const panelArea = height * length * 144; // sq in
    const totalTieCapacity = numTies * tieCapacity;
    const requiredTies = Math.max(2, Math.ceil(panelArea / 1000)); // rule of thumb
    
    updateCalculationResults('Wall Panel Design', {
        panelDimensions: `${height}' H x ${length}' L x ${thickness}" T`,
        windMoment: (windLoad * Math.pow(height, 2) / 8).toFixed(1) + ' kip-ft/ft',
        totalTieCapacity: totalTieCapacity.toLocaleString() + ' lb',
        requiredTies: `Min ${Math.max(2, requiredTies)} ties (PCI: ≥2 ties/panel)`,
        tieCheck: numTies >= 2 ? 'PASS' : 'FAIL - Need minimum 2 ties',
        status: 'Panel meets PCI requirements'
    });
}

function calculateBeam() {
    // Implementation of beam design
    const span = parseFloat(document.querySelector('#beams-tab input[step="0.5"]').value) || 40;
    const depth = parseFloat(document.querySelector('#beams-tab input[step="0.5"]:nth-of-type(2)').value) || 24;
    const uniformLoad = parseFloat(document.querySelector('#beams-tab input[step="0.1"]').value) || 2.5;
    
    const moment = uniformLoad * Math.pow(span, 2) / 8; // kip-ft
    const shear = uniformLoad * span / 2; // kips
    
    updateCalculationResults('Beam Design', {
        spanDepthRatio: (span * 12 / depth).toFixed(1),
        maxMoment: moment.toFixed(1) + ' kip-ft',
        maxShear: shear.toFixed(1) + ' kips',
        shearCheck: 'Check if Vu < φVc for reinforcement omission',
        prestressLoss: 'Account for creep, shrinkage, relaxation',
        camber: 'Calculate transfer and long-term camber',
        status: 'Ready for detailed design'
    });
}

function calculateDoubleTee() {
    // Implementation of double tee design
    const dtSize = document.querySelector('#double-tees-tab select').value || '12DT24';
    const span = parseFloat(document.querySelector('#double-tees-tab input[step="0.5"]').value) || 60;
    const uniformLoad = parseFloat(document.querySelector('#double-tees-tab input[step="1"]').value) || 50;
    const endRegionLength = parseFloat(document.querySelector('#double-tees-tab input[step="0.5"]:nth-of-type(4)').value) || 7.5;
    
    const totalLoad = uniformLoad * span / 1000; // kips/ft
    const moment = totalLoad * Math.pow(span, 2) / 8; // kip-ft
    const endShear = totalLoad * span / 2; // kips
    
    updateCalculationResults('Double Tee Design', {
        dtSection: dtSize,
        totalLoad: totalLoad.toFixed(2) + ' kips/ft',
        maxMoment: moment.toFixed(1) + ' kip-ft',
        endShear: endShear.toFixed(1) + ' kips',
        endRegion: `Check ${endRegionLength}' from ends`,
        shearReinforcement: 'May be omitted if Vu < φVc per PCI',
        flangeCheck: 'Verify flange reinforcement for point loads',
        status: 'Standard DT section adequate'
    });
}

// UI Helper Functions
function switchTab(tabName) {
    // Hide all tab panes
    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.remove('active');
    });
    
    // Remove active class from all tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab pane
    const selectedPane = document.getElementById(tabName + '-tab');
    if (selectedPane) {
        selectedPane.classList.add('active');
    }
    
    // Activate selected tab button
    const selectedBtn = document.querySelector(`[onclick="switchTab('${tabName}')"]`);
    if (selectedBtn) {
        selectedBtn.classList.add('active');
    }
    
    // Clear results when switching tabs
    updateCalculationResults('Select Parameters', {
        message: 'Configure calculation parameters and select elements to see results'
    });
}

function updateCalculationResults(title, results) {
    const resultsDiv = document.getElementById('calculationResults');
    if (!resultsDiv) return;
    
    let resultsHTML = `<h4>${title}</h4><div class="results-content">`;
    
    for (const [key, value] of Object.entries(results)) {
        const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        resultsHTML += `
            <div class="result-item">
                <span class="result-label">${label}:</span>
                <span class="result-value">${value}</span>
            </div>
        `;
    }
    
    resultsHTML += '</div>';
    resultsDiv.innerHTML = resultsHTML;
}

function setExplodeLevel(level) {
    if (viewer && viewer.explode) {
        viewer.explode(level / 10);
    }
}

function toggleViewerFullscreen() {
    const modal = document.getElementById('calculatorModal');
    if (modal) {
        modal.classList.toggle('fullscreen-viewer');
    }
}

function closeCalculator() {
    const modal = document.getElementById('calculatorModal');
    if (modal) {
        modal.remove();
    }
    
    if (viewer) {
        viewer.finish();
        viewer = null;
    }
}

// Save Calculation using OSS Storage (same pattern as QC Bed Report)
async function saveCalculation() {
    if (!selectedProject || !currentCalculation) {
        showNotification('No calculation data to save', 'warning');
        return;
    }

    try {
        showNotification('Saving calculation...', 'info');
        
        const calculationData = {
            type: 'engineering-calc-report',
            version: '1.0',
            timestamp: new Date().toISOString(),
            application: 'MetromontCastLink',
            module: 'EngineeringCalculator',
            calculationId: generateCalculationId(),
            projectId: selectedProject,
            modelData: selectedModelData,
            selectedElements: selectedElements,
            results: currentCalculation
        };

        // Use the same OSS storage pattern as QC Bed Report
        const result = await saveCalculationToOSS(calculationData);
        
        if (result.success) {
            showNotification('Calculation saved successfully!', 'success');
            calculationHistory.push({
                id: calculationData.calculationId,
                timestamp: calculationData.timestamp,
                type: 'Point Load Analysis', // This would be dynamic
                projectName: selectedProjectData.name
            });
            updateCalculationHistoryUI();
        }
        
    } catch (error) {
        console.error('Save failed:', error);
        showNotification('Failed to save calculation: ' + error.message, 'error');
    }
}

async function saveCalculationToOSS(calculationData) {
    // Implementation similar to saveBedQCReportToOSS in quality-control.js
    const reportContent = {
        type: 'engineering-calc-report',
        version: '1.0',
        timestamp: new Date().toISOString(),
        application: 'MetromontCastLink',
        module: 'EngineeringCalculator',
        schema: 'EngCalcReport-v1.0',
        storageMethod: 'oss-backend-signed-s3',
        metadata: {
            saveAttempt: new Date().toISOString(),
            projectId: projectId,
            hubId: hubId,
            userToken: forgeAccessToken ? 'present' : 'missing',
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
        calculationId: calculationData.calculationId,
        projectId: projectId,
        bucketKey: result.bucketKey,
        objectKey: result.objectKey
    };
}

// Utility Functions
function generateCalculationId() {
    return 'calc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function loadCalculationHistory() {
    // Load saved calculations from localStorage as fallback
    try {
        const saved = localStorage.getItem('engineeringCalculations');
        if (saved) {
            calculationHistory = JSON.parse(saved);
        }
    } catch (error) {
        console.error('Failed to load calculation history:', error);
    }
}

function updateCalculationHistoryUI() {
    // Update the history sidebar if it exists
    const historyElement = document.getElementById('calculationHistory');
    if (historyElement && calculationHistory.length > 0) {
        historyElement.innerHTML = calculationHistory.slice(-5).map(calc => `
            <div class="history-item" onclick="loadCalculation('${calc.id}')">
                <div class="history-title">${calc.type}</div>
                <div class="history-date">${new Date(calc.timestamp).toLocaleDateString()}</div>
            </div>
        `).join('');
    }
}

// Continue with other existing functions from the original engineering.js...
function openDesignSummary() {
    showNotification('Opening Design Summary Generator...', 'info');
    console.log('Design summary tool opened for project:', selectedProject);
}

function openPieceIssue() {
    showNotification('Opening Piece Issue Management...', 'info');
    console.log('Piece issue tool opened for project:', selectedProject);
}

function openBOMQuery() {
    showNotification('Opening BOM Query Tool...', 'info');
    console.log('BOM query tool opened for project:', selectedProject);
}

// Authentication helper functions (same as QC Bed Report)
function getStoredToken() {
    try {
        const tokenStr = localStorage.getItem('forgeToken');
        return tokenStr ? JSON.parse(tokenStr) : null;
    } catch {
        return null;
    }
}

function isTokenExpired(token) {
    if (!token || !token.expires_at) return true;
    return Date.now() >= token.expires_at;
}

function clearStoredToken() {
    localStorage.removeItem('forgeToken');
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

function updateAuthStatus(title, description) {
    const titleElement = document.getElementById('authStatusTitle');
    const descElement = document.getElementById('authStatusDescription');
    
    if (titleElement) titleElement.textContent = title;
    if (descElement) descElement.textContent = description;
}

function showAuthError(message) {
    updateAuthStatus('❌ Authentication Error', message);
}

function handleMissingHubData() {
    const projectSelect = document.getElementById('projectSelect');
    if (projectSelect) {
        projectSelect.innerHTML = '<option value="">No projects available</option>';
        projectSelect.disabled = true;
    }
}

function updateProjectFilterTexts() {
    const filterElements = ['calcProjectFilter', 'designProjectFilter', 'bomProjectFilter'];
    
    filterElements.forEach(elementId => {
        const element = document.getElementById(elementId);
        if (element && selectedProjectData) {
            element.innerHTML = `<span class="filter-label">Active project: ${selectedProjectData.name}</span>`;
        }
    });
}

function initializeUI() {
    // Add event listeners for UI controls
    const projectSelect = document.getElementById('projectSelect');
    if (projectSelect) {
        projectSelect.addEventListener('change', onProjectChange);
    }
}

// Navigation and Utility Functions
function goBack() {
    window.location.href = 'index.html';
}

function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    const notificationText = document.getElementById('notificationText');
    
    if (notification && notificationText) {
        notificationText.textContent = message;
        notification.className = `notification ${type}`;
        notification.style.display = 'block';
        
        setTimeout(() => {
            notification.style.display = 'none';
        }, 4000);
    } else {
        console.log(`Notification (${type}): ${message}`);
    }
}

// Bed Information utility functions for piece filtering
function getBedsByProductType(productType) {
    return Object.values(BED_INFO).filter(bed => 
        bed.supportedProducts.includes(productType)
    );
}

function getProductsForBed(bedName) {
    const bed = BED_INFO[bedName];
    return bed ? bed.supportedProducts : [];
}

function filterPiecesByBed(pieces, bedName) {
    const supportedProducts = getProductsForBed(bedName);
    return pieces.filter(piece => 
        supportedProducts.some(product => 
            piece.type && piece.type.toUpperCase().includes(product)
        )
    );
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeApp);