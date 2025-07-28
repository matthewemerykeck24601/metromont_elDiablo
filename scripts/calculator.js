// Enhanced Calculator Initialization - Add this to your existing calculator.js

// Enhanced initialization that receives project data and auto-loads models
async function initializeCalculator() {
    try {
        console.log('=== ENGINEERING CALCULATOR INITIALIZATION ===');

        // First, check if we have project data passed from engineering page
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

        // Fallback to original authentication if no project data passed
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

// Enhanced authentication when project is already selected
async function completeAuthenticationWithProject() {
    try {
        updateAuthStatus('✅ Project Selected', `Loading models for ${selectedProjectData.name}...`);

        // Auto-load project models instead of showing project selection
        await loadProjectModels();

        // Show the model selection interface with auto-discovered models
        showModelSelectionWithAutoDiscovery();

        console.log('✅ Calculator ready with project pre-selected');

    } catch (error) {
        console.error('Enhanced authentication failed:', error);
        updateAuthStatus('❌ Error', 'Failed to load project models: ' + error.message);

        // Fallback to standard project selection
        await completeAuthentication();
    }
}

// Load Revit models from the selected ACC project
async function loadProjectModels() {
    try {
        console.log('🔍 Discovering Revit models in project:', selectedProjectData.name);

        if (!forgeAccessToken || !selectedProject) {
            throw new Error('Missing authentication or project selection');
        }

        // Get project folders
        const foldersResponse = await fetch(
            `https://developer.api.autodesk.com/data/v1/projects/${selectedProject}/folders`, {
            headers: {
                'Authorization': `Bearer ${forgeAccessToken}`
            }
        });

        if (!foldersResponse.ok) {
            throw new Error(`Failed to load folders: ${foldersResponse.status}`);
        }

        const foldersData = await foldersResponse.json();
        console.log('📁 Found folders:', foldersData.data.length);

        // Find Revit models in all folders
        const revitModels = [];
        for (const folder of foldersData.data) {
            const models = await findRevitModelsInFolder(folder);
            revitModels.push(...models);
        }

        console.log('🏗️ Found Revit models:', revitModels.length);

        // Store discovered models
        discoveredModels = revitModels;

        return revitModels;

    } catch (error) {
        console.error('Error loading project models:', error);
        throw error;
    }
}

// Find Revit models in a specific folder
async function findRevitModelsInFolder(folder) {
    try {
        const folderContentsResponse = await fetch(
            `https://developer.api.autodesk.com/data/v1/projects/${selectedProject}/folders/${folder.id}/contents`, {
            headers: {
                'Authorization': `Bearer ${forgeAccessToken}`
            }
        });

        if (!folderContentsResponse.ok) {
            return [];
        }

        const contentsData = await folderContentsResponse.json();
        const revitModels = [];

        for (const item of contentsData.data) {
            // Check if it's a Revit file
            if (item.attributes && item.attributes.displayName) {
                const fileName = item.attributes.displayName.toLowerCase();
                if (fileName.endsWith('.rvt') || fileName.includes('revit')) {

                    // Get latest version
                    const versionsResponse = await fetch(
                        `https://developer.api.autodesk.com/data/v1/projects/${selectedProject}/items/${item.id}/versions`, {
                        headers: {
                            'Authorization': `Bearer ${forgeAccessToken}`
                        }
                    });

                    if (versionsResponse.ok) {
                        const versionsData = await versionsResponse.json();
                        const latestVersion = versionsData.data[0]; // First is latest

                        revitModels.push({
                            id: item.id,
                            name: item.attributes.displayName,
                            fileName: fileName,
                            folderId: folder.id,
                            folderName: folder.attributes.name,
                            versionId: latestVersion.id,
                            versionUrn: btoa(latestVersion.id).replace(/=/g, ''), // Base64 encode for viewer
                            lastModified: latestVersion.attributes.lastModifiedTime,
                            size: latestVersion.attributes.storageSize
                        });
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

// Show model selection with auto-discovered models
function showModelSelectionWithAutoDiscovery() {
    // Update the project info to show it's already selected
    const projectName = document.getElementById('projectName');
    const projectDetails = document.getElementById('projectDetails');

    if (projectName) {
        projectName.textContent = selectedProjectData.name;
    }

    if (projectDetails) {
        projectDetails.textContent = `${discoveredModels.length} Revit models found - select one to begin calculations`;
    }

    // Auto-open the model selection modal with discovered models
    populateModelSelectionWithDiscoveredModels();

    const modal = document.getElementById('modelSelectionModal');
    if (modal) {
        modal.classList.add('active');
    }
}

// Populate model selection modal with auto-discovered Revit models
function populateModelSelectionWithDiscoveredModels() {
    const folderTree = document.querySelector('.folder-tree');
    if (!folderTree) return;

    folderTree.innerHTML = `
        <h4>Revit Models in ${selectedProjectData.name}</h4>
        <div class="models-list">
            ${discoveredModels.length === 0 ?
            '<p class="no-models">No Revit models found in this project</p>' :
            discoveredModels.map(model => `
                    <div class="tree-item model-item" onclick="selectDiscoveredModel('${model.id}', '${model.name}', '${model.versionUrn}')">
                        <input type="checkbox" class="model-checkbox" id="model_${model.id}" />
                        <span class="tree-icon">📋</span>
                        <div class="model-info">
                            <div class="model-name">${model.name}</div>
                            <div class="model-details">
                                <small>📁 ${model.folderName} • 📅 ${new Date(model.lastModified).toLocaleDateString()}</small>
                            </div>
                        </div>
                    </div>
                `).join('')
        }
        </div>
        ${discoveredModels.length > 0 ? `
            <div class="selection-actions">
                <button class="btn btn-sm btn-secondary" onclick="selectAllModels()">Select All</button>
                <button class="btn btn-sm btn-secondary" onclick="clearAllModels()">Clear All</button>
            </div>
        ` : ''}
    `;
}

// Select a discovered model (with checkbox support)
function selectDiscoveredModel(modelId, modelName, versionUrn) {
    const checkbox = document.getElementById(`model_${modelId}`);
    const wasChecked = checkbox.checked;

    // Toggle checkbox
    checkbox.checked = !wasChecked;

    // Update selected models array
    if (checkbox.checked) {
        if (!selectedModels.find(m => m.id === modelId)) {
            const modelData = discoveredModels.find(m => m.id === modelId);
            selectedModels.push({
                id: modelId,
                name: modelName,
                versionUrn: versionUrn,
                ...modelData
            });
        }
    } else {
        selectedModels = selectedModels.filter(m => m.id !== modelId);
    }

    // Update UI
    updateModelSelectionUI();
    updateLoadModelButton();
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
                <small>You can select multiple models for comparison</small>
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
                <small>Ready to load in calculator</small>
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
                <small>Multiple models will be available in calculator</small>
            </div>
        `;
    }
}

// Update Load Model button state
function updateLoadModelButton() {
    const loadModelBtn = document.getElementById('loadModelBtn');
    if (loadModelBtn) {
        loadModelBtn.disabled = selectedModels.length === 0;
        loadModelBtn.textContent = selectedModels.length === 0 ? 'Select Models' :
            selectedModels.length === 1 ? 'Load Model' :
                `Load ${selectedModels.length} Models`;
    }
}

// Utility functions
function selectAllModels() {
    discoveredModels.forEach(model => {
        const checkbox = document.getElementById(`model_${model.id}`);
        if (checkbox && !checkbox.checked) {
            checkbox.checked = true;
            selectDiscoveredModel(model.id, model.name, model.versionUrn);
        }
    });
}

function clearAllModels() {
    selectedModels = [];
    document.querySelectorAll('.model-checkbox').forEach(checkbox => {
        checkbox.checked = false;
    });
    updateModelSelectionUI();
    updateLoadModelButton();
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Global variables for enhanced functionality
let discoveredModels = [];
let selectedModels = [];

// Enhanced loadSelectedModel function
function loadSelectedModel() {
    if (selectedModels.length === 0) {
        showNotification('Please select at least one model', 'warning');
        return;
    }

    console.log('🚀 Loading selected models:', selectedModels.map(m => m.name));

    // Store selected models for calculator interface
    selectedModel = selectedModels.length === 1 ? selectedModels[0] : {
        id: 'multiple',
        name: `${selectedModels.length} Models`,
        models: selectedModels
    };

    closeModelSelection();
    initializeCalculatorInterface();
}