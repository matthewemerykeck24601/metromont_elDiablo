// Engineering Calculator JavaScript

// Global Variables
let forgeAccessToken = null;
let selectedProject = null;
let selectedProjectData = null;
let selectedModel = null;
let forgeViewer = null;
let calculationHistory = [];
let currentCalculation = null;

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

// Initialize the calculator
async function initializeCalculator() {
    console.log('Initializing Engineering Calculator...');

    try {
        // Check authentication from parent app
        await checkAuthentication();

        // Load project data
        await loadProjects();

        // Load calculation history
        loadCalculationHistory();

        // Initialize UI event listeners
        initializeUI();

        console.log('Calculator initialized successfully');
    } catch (error) {
        console.error('Failed to initialize calculator:', error);
        showNotification('Failed to initialize calculator: ' + error.message, 'error');
    }
}

// Authentication Functions
async function checkAuthentication() {
    console.log('Checking authentication...');

    try {
        // Method 1: Check if parent app has authentication (same as other modules)
        if (window.parent && window.parent !== window && window.parent.CastLinkAuth) {
            console.log('Checking parent app authentication...');
            const isAuth = await window.parent.CastLinkAuth.waitForAuth();
            if (isAuth) {
                forgeAccessToken = window.parent.CastLinkAuth.getToken();
                globalHubData = window.parent.CastLinkAuth.getHubData();
                if (forgeAccessToken) {
                    updateAuthStatus('✅ Connected', 'Authenticated with ACC');
                    console.log('Successfully authenticated via parent app');
                    return;
                }
            }
        }

        // Method 2: Check stored token (same pattern as other modules)
        console.log('Checking stored token...');
        const storedToken = getStoredToken();
        if (storedToken && !isTokenExpired(storedToken)) {
            // Verify token is still valid
            const isValid = await verifyToken(storedToken.access_token);
            if (isValid) {
                forgeAccessToken = storedToken.access_token;
                updateAuthStatus('✅ Connected', 'Using stored authentication');
                console.log('Successfully authenticated via stored token');
                return;
            } else {
                console.log('Stored token is invalid, clearing...');
                clearStoredToken();
            }
        }

        // Method 3: No valid authentication found - redirect to main app
        console.log('No valid authentication found - redirecting to main app');
        updateAuthStatus('❌ Authentication Required', 'Redirecting to main app for authentication...');

        // Redirect to main app for authentication
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 2000);

        throw new Error('No valid authentication found');

    } catch (error) {
        console.error('Authentication check failed:', error);
        updateAuthStatus('❌ Authentication Error', error.message);
        throw error;
    }
}

async function loadProjects() {
    console.log('Loading projects...');

    try {
        // Try to get hub data from parent app
        let hubData = null;
        if (window.parent && window.parent.CastLinkAuth) {
            hubData = window.parent.CastLinkAuth.getHubData();
        }

        if (!hubData) {
            // Fallback to stored hub data
            const stored = sessionStorage.getItem('castlink_hub_data');
            if (stored) {
                hubData = JSON.parse(stored);
            }
        }

        if (!hubData || !hubData.projects) {
            throw new Error('No project data available');
        }

        // Populate project dropdown
        const projectSelect = document.getElementById('projectSelect');
        projectSelect.innerHTML = '<option value="">Select a project...</option>';

        hubData.projects.forEach(project => {
            const option = document.createElement('option');
            option.value = project.id;
            option.textContent = project.attributes.name;
            projectSelect.appendChild(option);
        });

        console.log('Projects loaded successfully');

    } catch (error) {
        console.error('Failed to load projects:', error);
        const projectSelect = document.getElementById('projectSelect');
        projectSelect.innerHTML = '<option value="">No projects available</option>';
        projectSelect.disabled = true;
        throw error;
    }
}

// Project Selection
function onProjectChange() {
    const projectSelect = document.getElementById('projectSelect');
    const projectInfo = document.getElementById('projectInfo');
    const projectName = document.getElementById('projectName');
    const projectDetails = document.getElementById('projectDetails');
    const modelSelectBtn = document.getElementById('modelSelectBtn');

    selectedProject = projectSelect.value;

    if (selectedProject && globalHubData && globalHubData.projects) {
        selectedProjectData = globalHubData.projects.find(p => p.id === selectedProject);
        if (selectedProjectData) {
            if (projectName) projectName.textContent = selectedProjectData.name;
            if (projectDetails) projectDetails.textContent = 'Ready for engineering calculations';
            if (modelSelectBtn) modelSelectBtn.disabled = false;
            console.log('Project selected:', selectedProjectData.name);
            return;
        }
    }

    // Fallback or no selection
    if (projectName) projectName.textContent = selectedProject ? 'Project selected' : 'No project selected';
    if (projectDetails) projectDetails.textContent = selectedProject ? 'Ready for engineering calculations' : 'Select a project to begin calculations';
    if (modelSelectBtn) modelSelectBtn.disabled = !selectedProject;
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
    document.getElementById('loadModelBtn').disabled = true;
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
    if (!selectedModel) {
        showNotification('Please select a model first', 'warning');
        return;
    }

    closeModelSelection();
    initializeCalculatorInterface();
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

// Forge Viewer Integration
function initializeForgeViewer() {
    const viewerContainer = document.getElementById('forgeViewer');
    const viewerLoading = document.getElementById('viewerLoading');

    try {
        // Load Forge Viewer scripts dynamically
        loadForgeViewerScripts().then(() => {
            // Initialize viewer with sample model
            const options = {
                env: 'AutodeskProduction',
                api: 'derivativeV2',
                getAccessToken: function (onTokenReady) {
                    onTokenReady(forgeAccessToken, 3600);
                }
            };

            Autodesk.Viewing.Initializer(options, function () {
                // Hide loading indicator
                viewerLoading.style.display = 'none';

                // Create viewer
                forgeViewer = new Autodesk.Viewing.GuiViewer3D(viewerContainer);
                forgeViewer.start();

                // Load sample model (replace with actual model URN)
                const modelUrn = 'dXJuOmFkc2sub2JqZWN0czpvcy5vYmplY3Q6bW9kZWwyMDIwL3JzdF9iYXNpY19zYW1wbGVfcHJvamVjdC5ydnQ';

                forgeViewer.loadDocumentNode(
                    'urn:' + modelUrn,
                    null,
                    function onLoadModelSuccess() {
                        console.log('Model loaded successfully');
                        setupViewerEventHandlers();
                    },
                    function onLoadModelError(errorCode) {
                        console.error('Failed to load model:', errorCode);
                        showNotification('Failed to load 3D model', 'error');
                    }
                );
            });
        });
    } catch (error) {
        console.error('Failed to initialize Forge Viewer:', error);
        viewerLoading.innerHTML = `
            <div class="error">
                <p>Failed to load 3D viewer</p>
                <small>Using placeholder interface</small>
            </div>
        `;
    }
}

function loadForgeViewerScripts() {
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
    document.getElementById('resultsPanel').style.display = 'none';
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
    const length = parseFloat(document.getElementById('columnLength').value);
    const axialLoad = parseFloat(document.getElementById('axialLoad').value);
    const moment = parseFloat(document.getElementById('moment').value);
    const prestressForce = parseFloat(document.getElementById('prestressForce').value);

    // Basic P-M interaction analysis (simplified)
    const area = width * depth;
    const section_modulus = width * depth * depth / 6;
    const min_prestress = 225; // psi per PCI
    const tension_tie_force = 200 * area; // 200 Ag per PCI

    const axial_stress = (axialLoad * 1000 + prestressForce * 1000) / area;
    const bending_stress = (moment * 12 * 1000) / section_modulus;
    const combined_stress = axial_stress + bending_stress;

    const results = {
        type: 'Column Design (PCI)',
        inputs: { width, depth, length, axialLoad, moment, prestressForce },
        outputs: {
            area: area.toFixed(1),
            section_modulus: section_modulus.toFixed(1),
            axial_stress: axial_stress.toFixed(0),
            bending_stress: bending_stress.toFixed(0),
            combined_stress: combined_stress.toFixed(0),
            min_prestress_required: min_prestress,
            tension_tie_required: tension_tie_force.toFixed(0),
            prestress_check: prestressForce >= min_prestress ? 'PASS' : 'FAIL',
            pci_compliance: 'Per PCI standards - minimum 225 psi prestress'
        }
    };

    displayResults(results);
}

function calculateWall(event) {
    event.preventDefault();

    const height = parseFloat(document.getElementById('wallHeight').value);
    const thickness = parseFloat(document.getElementById('wallThickness').value);
    const length = parseFloat(document.getElementById('wallLength').value);
    const windLoad = parseFloat(document.getElementById('windLoad').value);
    const seismicLoad = parseFloat(document.getElementById('seismicLoad').value) || 0;
    const tensionTies = document.getElementById('tensionTies').checked;

    // Wall design calculations
    const area = length * height * 144; // sq ft to sq in
    const moment = windLoad * height * height * length / 8; // kip-ft
    const section_modulus = length * thickness * thickness / 6;
    const bending_stress = (moment * 12 * 1000) / section_modulus;

    // PCI requirements for wall panels
    const min_ties = 2;
    const tie_capacity = 10000; // lbs per PCI
    const total_tie_capacity = min_ties * tie_capacity;

    const results = {
        type: 'Wall Panel Design',
        inputs: { height, thickness, length, windLoad, seismicLoad, tensionTies },
        outputs: {
            panel_area: area.toFixed(0),
            design_moment: moment.toFixed(1),
            bending_stress: bending_stress.toFixed(0),
            min_ties_required: min_ties,
            tie_capacity_each: tie_capacity,
            total_tie_capacity: total_tie_capacity,
            ties_provided: tensionTies ? 'YES' : 'NO',
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
            stress_check: net_stress <= 0 ? 'COMPRESSION (GOOD)' : 'TENSION (CHECK REQUIRED)',
            strand_utilization: ((prestress_force / (strand_area * 270 * 1000)) * 100).toFixed(1) + '%'
        }
    };

    displayResults(results);
}

function calculateDoubleTee(event) {
    event.preventDefault();

    const width = parseFloat(document.getElementById('dtWidth').value);
    const depth = parseFloat(document.getElementById('dtDepth').value);
    const span = parseFloat(document.getElementById('dtSpan').value);
    const liveLoad = parseFloat(document.getElementById('dtLiveLoad').value);
    const superimposed = parseFloat(document.getElementById('dtSuperimposed').value) || 0;
    const shearReinforcement = document.getElementById('shearReinforcement').value;

    // Double tee calculations
    const selfWeight = 50; // psf approximation
    const totalLoad = selfWeight + liveLoad + superimposed;
    const tributaryWidth = width;
    const uniformLoad = totalLoad * tributaryWidth / 1000; // klf
    const moment = uniformLoad * span * span / 8;
    const shear = uniformLoad * span / 2;

    // PCI allows shear reinforcement omission under certain conditions
    const shear_capacity_without_stirrups = 2 * Math.sqrt(5000) * width * depth / 1000; // Simplified
    const shear_ok_without_reinforcement = shear <= shear_capacity_without_stirrups * 0.75;

    const results = {
        type: 'Double Tee Design',
        inputs: { width, depth, span, liveLoad, superimposed, shearReinforcement },
        outputs: {
            self_weight: selfWeight,
            total_load: totalLoad.toFixed(1),
            uniform_load: uniformLoad.toFixed(2),
            design_moment: moment.toFixed(1),
            design_shear: shear.toFixed(1),
            shear_capacity_no_stirrups: shear_capacity_without_stirrups.toFixed(1),
            shear_reinforcement_required: shear_ok_without_reinforcement ? 'NO' : 'YES',
            pci_shear_allowance: shear_ok_without_stirrups ? 'PERMITTED' : 'STIRRUPS REQUIRED',
            notes: 'PCI allows omission of shear reinforcement for certain double tee conditions'
        }
    };

    displayResults(results);
}

function updateTieRequirements() {
    const tensionTies = document.getElementById('tensionTies').checked;
    const form = document.getElementById('tensionTies').closest('form');

    if (tensionTies) {
        showNotification('Tension ties will be included per PCI requirements', 'info');
    }
}

// Results Display
function displayResults(results) {
    const resultsPanel = document.getElementById('resultsPanel');
    const resultsContent = document.getElementById('resultsContent');

    // Format results for display
    let resultText = `${results.type}\n`;
    resultText += '='.repeat(results.type.length) + '\n\n';

    resultText += 'INPUTS:\n';
    for (const [key, value] of Object.entries(results.inputs)) {
        resultText += `  ${key}: ${value}\n`;
    }

    resultText += '\nOUTPUTS:\n';
    for (const [key, value] of Object.entries(results.outputs)) {
        resultText += `  ${key}: ${value}\n`;
    }

    if (results.outputs.pci_compliance || results.outputs.notes) {
        resultText += '\nPCI COMPLIANCE:\n';
        if (results.outputs.pci_compliance) {
            resultText += `  Status: ${results.outputs.pci_compliance}\n`;
        }
        if (results.outputs.notes) {
            resultText += `  Notes: ${results.outputs.notes}\n`;
        }
    }

    resultsContent.textContent = resultText;
    resultsPanel.style.display = 'block';

    // Store current calculation
    currentCalculation = {
        id: generateCalculationId(),
        timestamp: new Date().toISOString(),
        projectId: selectedProject,
        modelId: selectedModel?.id,
        type: results.type,
        inputs: results.inputs,
        outputs: results.outputs,
        selectedElement: currentCalculation?.selectedElement
    };

    console.log('Calculation completed:', results.type);
}

// Save and Export Functions
async function saveCalculation() {
    if (!currentCalculation) {
        showNotification('No calculation to save', 'warning');
        return;
    }

    try {
        showNotification('Saving calculation...', 'info');

        // Save to OSS storage using the same pattern as QC Bed Report
        const result = await saveCalculationToOSS(currentCalculation);

        // Add to local history
        calculationHistory.unshift(currentCalculation);
        if (calculationHistory.length > 50) {
            calculationHistory = calculationHistory.slice(0, 50);
        }

        // Save to localStorage as backup
        localStorage.setItem('engineeringCalculations', JSON.stringify(calculationHistory));

        // Update UI
        updateCalculationHistoryUI();

        showNotification('Calculation saved successfully', 'success');

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

// Utility Functions
function generateCalculationId() {
    return 'calc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

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