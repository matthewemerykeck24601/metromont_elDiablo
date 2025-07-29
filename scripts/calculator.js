// Engineering Calculator Module
console.log('Calculator.js loading...');

// Global variables
let selectedProject = null;
let globalHubData = null;
let forgeAccessToken = null;
let discoveredModels = [];
let selectedModels = [];
let forgeViewer = null;
let currentCalculationType = 'pointLoad';
let calculationHistory = [];

// Initialize calculator
async function initializeCalculator() {
    console.log('Initializing Engineering Calculator...');

    // Get project and hub data from parent
    const urlParams = new URLSearchParams(window.location.search);
    selectedProject = urlParams.get('project');

    if (!selectedProject) {
        console.error('No project specified');
        showNotification('No project selected. Please return to main page.', 'error');
        return;
    }

    console.log('Selected project:', selectedProject);

    // Get authentication data
    await getAuthenticationData();

    // Initialize UI
    initializeUI();

    // Load calculation history
    loadCalculationHistory();

    // Initialize project data
    await initializeWithProjectData();
}

// Get authentication data
async function getAuthenticationData() {
    try {
        // Try to get from session storage first
        const storedToken = sessionStorage.getItem('forgeAccessToken');
        const storedHub = sessionStorage.getItem('hubData');

        if (storedToken && storedHub) {
            forgeAccessToken = storedToken;
            globalHubData = JSON.parse(storedHub);
            console.log('Authentication data loaded from session');
            updateAuthStatus('✅ Connected', `Hub: ${globalHubData.hubName}`);
            return;
        }

        // Otherwise, get from parent window if in iframe
        if (window.parent !== window) {
            console.log('Requesting auth data from parent...');
            window.parent.postMessage({ type: 'REQUEST_AUTH_DATA' }, '*');

            // Wait for response
            return new Promise((resolve) => {
                window.addEventListener('message', function handler(event) {
                    if (event.data.type === 'AUTH_DATA_RESPONSE') {
                        forgeAccessToken = event.data.token;
                        globalHubData = event.data.hubData;

                        // Store in session
                        sessionStorage.setItem('forgeAccessToken', forgeAccessToken);
                        sessionStorage.setItem('hubData', JSON.stringify(globalHubData));

                        console.log('Auth data received from parent');
                        updateAuthStatus('✅ Connected', `Hub: ${globalHubData.hubName}`);

                        window.removeEventListener('message', handler);
                        resolve();
                    }
                });
            });
        }
    } catch (error) {
        console.error('Error getting authentication:', error);
        updateAuthStatus('❌ Not Connected', 'Authentication required');
    }
}

// Initialize with project data
async function initializeWithProjectData() {
    if (!selectedProject || !forgeAccessToken) {
        console.error('Missing project or authentication');
        return;
    }

    try {
        console.log('Loading project models...');
        await discoverProjectModels();

        // Update UI based on discovered models
        updateModelSelectionUI();

    } catch (error) {
        console.error('Error initializing project data:', error);
        showNotification('Error loading project data', 'error');
    }
}

// Discover models in project
async function discoverProjectModels() {
    discoveredModels = [];

    try {
        const hubId = globalHubData?.hubId || getHubId();
        if (!hubId) {
            console.error('No hub ID available');
            return;
        }

        console.log('Discovering models in project:', selectedProject);
        console.log('Hub ID:', hubId);

        // Get top folders
        const foldersUrl = `https://developer.api.autodesk.com/project/v1/hubs/${hubId}/projects/${selectedProject}/topFolders`;
        console.log('Fetching folders from:', foldersUrl);

        const foldersResponse = await fetch(foldersUrl, {
            headers: {
                'Authorization': `Bearer ${forgeAccessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!foldersResponse.ok) {
            console.error('Failed to fetch folders:', foldersResponse.status, foldersResponse.statusText);
            if (foldersResponse.status === 403 || foldersResponse.status === 401) {
                showNotification('Authentication expired. Please refresh the page.', 'error');
            }
            return;
        }

        const foldersData = await foldersResponse.json();
        console.log('Top folders found:', foldersData.data?.length || 0);

        // Search each folder for models
        for (const folder of foldersData.data || []) {
            await searchFolderForModels(folder, hubId);
        }

        console.log(`Total models discovered: ${discoveredModels.length}`);

    } catch (error) {
        console.error('Error discovering models:', error);
        showNotification('Error loading project models', 'error');
    }
}

// Search folder for models
async function searchFolderForModels(folder, hubId, parentPath = '') {
    try {
        const folderPath = parentPath ? `${parentPath}/${folder.attributes.displayName}` : folder.attributes.displayName;
        console.log('Searching folder:', folderPath);

        // Get folder contents
        const contentsUrl = `https://developer.api.autodesk.com/data/v1/projects/${selectedProject}/folders/${folder.id}/contents`;

        const contentsResponse = await fetch(contentsUrl, {
            headers: {
                'Authorization': `Bearer ${forgeAccessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!contentsResponse.ok) {
            console.error('Failed to fetch folder contents:', contentsResponse.status);
            return;
        }

        const contentsData = await contentsResponse.json();

        // Process items
        for (const item of contentsData.data || []) {
            if (item.type === 'folders') {
                // Recursively search subfolders
                await searchFolderForModels(item, hubId, folderPath);
            } else if (item.type === 'items') {
                // Check if it's a Revit model
                if (item.attributes.displayName.toLowerCase().endsWith('.rvt')) {
                    console.log('Found Revit model:', item.attributes.displayName);

                    // Get latest version
                    const versionsUrl = `https://developer.api.autodesk.com/data/v1/projects/${selectedProject}/items/${item.id}/versions`;

                    const versionsResponse = await fetch(versionsUrl, {
                        headers: {
                            'Authorization': `Bearer ${forgeAccessToken}`,
                            'Content-Type': 'application/json'
                        }
                    });

                    if (versionsResponse.ok) {
                        const versionsData = await versionsResponse.json();
                        const latestVersion = versionsData.data?.[0];

                        if (latestVersion) {
                            // Get the URN from the version
                            const versionId = latestVersion.id;
                            const versionUrn = btoa(versionId).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

                            discoveredModels.push({
                                id: item.id,
                                name: item.attributes.displayName,
                                path: folderPath,
                                folderId: folder.id,
                                versionId: versionId,
                                versionUrn: versionUrn,
                                versionNumber: latestVersion.attributes.versionNumber,
                                lastModified: latestVersion.attributes.lastModifiedTime,
                                size: latestVersion.attributes.storageSize
                            });
                        }
                    }
                }
            }
        }

        // Handle pagination if needed
        if (contentsData.links?.next) {
            console.log('Fetching next page of results...');
            // Implement pagination if needed
        }

    } catch (error) {
        console.error('Error searching folder:', error);
    }
}

// Update model selection UI
function updateModelSelectionUI() {
    const modelCount = discoveredModels.length;
    console.log('Updating UI with', modelCount, 'models');

    // Update any UI elements that show model count or status
    const modelStatus = document.getElementById('modelStatus');
    if (modelStatus) {
        if (modelCount > 0) {
            modelStatus.textContent = `${modelCount} model(s) available`;
            modelStatus.className = 'text-success';
        } else {
            modelStatus.textContent = 'No models found';
            modelStatus.className = 'text-warning';
        }
    }
}

// Handle model selection
function handleModelSelection(model) {
    console.log('Model selected:', model.name);

    selectedModels = [model];

    // Close modal
    closeModelSelection();

    // Open full calculator
    openFullCalculator();

    // Initialize Forge viewer
    setTimeout(() => {
        initializeForgeViewer();
    }, 500);
}

// Proceed without model
function proceedWithoutModel() {
    console.log('Proceeding without model');

    selectedModels = [];

    // Close modal
    closeModelSelection();

    // Open full calculator
    openFullCalculator();
}

// Select discovered model
function selectDiscoveredModel(index) {
    if (index >= 0 && index < discoveredModels.length) {
        handleModelSelection(discoveredModels[index]);
    }
}

// Use manual model URN
function useManualModelUrn() {
    const urnInput = document.getElementById('manualModelUrn');
    if (urnInput && urnInput.value) {
        const manualModel = {
            name: 'Manual Model',
            versionUrn: urnInput.value.trim(),
            manual: true
        };
        handleModelSelection(manualModel);
    }
}

// Initialize Forge Viewer
function initializeForgeViewer() {
    console.log('Initializing Forge Viewer...');

    if (!selectedModels || selectedModels.length === 0) {
        console.error('No model selected for viewer');
        return;
    }

    const model = selectedModels[0];
    console.log('Loading model:', model.name);
    console.log('Version URN:', model.versionUrn);

    // Load Forge Viewer script
    const viewerScript = document.getElementById('forgeViewerScript');
    if (!viewerScript) {
        const script = document.createElement('script');
        script.id = 'forgeViewerScript';
        script.src = 'https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*/viewer3D.min.js';
        script.onload = () => {
            console.log('Forge Viewer script loaded');
            startViewer(model);
        };
        script.onerror = (error) => {
            console.error('Failed to load Forge Viewer script:', error);
            showViewerError('Failed to load 3D viewer library');
        };
        document.head.appendChild(script);

        // Also load the CSS
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*/style.min.css';
        document.head.appendChild(link);
    } else {
        // Script already loaded
        startViewer(model);
    }
}

// Start Forge Viewer
function startViewer(model) {
    console.log('Starting Forge Viewer...');

    const viewerDiv = document.getElementById('forgeViewer');
    if (!viewerDiv) {
        console.error('Viewer container not found');
        return;
    }

    // Clear any existing content
    viewerDiv.innerHTML = '<div class="loading-message">Initializing 3D viewer...</div>';

    // Initialize viewer
    const options = {
        env: 'AutodeskProduction2',
        api: 'streamingV2',
        getAccessToken: getForgeToken
    };

    console.log('Viewer options:', options);

    Autodesk.Viewing.Initializer(options, function () {
        console.log('Viewer initialized, creating viewer instance...');

        // Create viewer
        forgeViewer = new Autodesk.Viewing.GuiViewer3D(viewerDiv);

        const startResult = forgeViewer.start();
        if (startResult > 0) {
            console.error('Failed to create viewer:', startResult);
            showViewerError('Failed to initialize 3D viewer');
            return;
        }

        console.log('✅ Viewer started successfully');

        // Load the model
        loadModel(model.versionUrn);
    });
}

// Get access token for Forge
function getForgeToken(callback) {
    console.log('Getting Forge access token...');
    // The callback expects (access_token, expires_in)
    // Pass the token and expiry time in seconds
    callback(forgeAccessToken, 3600);
}

// Load model into viewer
function loadModel(urn) {
    console.log('Loading model with URN:', urn);

    if (!forgeViewer) {
        console.error('Viewer not initialized');
        return;
    }

    // Make sure URN is properly formatted
    let documentId;

    // Check if URN already has the prefix
    if (urn.startsWith('urn:')) {
        documentId = urn;
    } else {
        documentId = 'urn:' + urn;
    }

    console.log('Document ID:', documentId);

    // First, let's check the model manifest to ensure it's translated
    checkModelManifest(urn).then((isReady) => {
        if (isReady) {
            // Load document
            Autodesk.Viewing.Document.load(
                documentId,
                onDocumentLoadSuccess,
                onDocumentLoadFailure
            );
        } else {
            console.log('Model not ready, triggering translation...');
            triggerModelTranslation(selectedModels[0]);
        }
    });
}

// Check model manifest before loading
async function checkModelManifest(urn) {
    try {
        const manifestUrl = `https://developer.api.autodesk.com/modelderivative/v2/designdata/${urn}/manifest`;
        console.log('Checking manifest:', manifestUrl);

        const response = await fetch(manifestUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${forgeAccessToken}`,
                'Accept': 'application/json'
            }
        });

        console.log('Manifest response:', response.status, response.statusText);

        if (response.status === 404) {
            console.log('Model not found - needs translation');
            return false;
        }

        if (!response.ok) {
            console.error('Failed to fetch manifest:', response.status);
            const errorText = await response.text();
            console.error('Error details:', errorText);
            return false;
        }

        const manifest = await response.json();
        console.log('Manifest:', manifest);

        // Check URN in manifest
        if (manifest.urn !== urn) {
            console.log('URN mismatch. Expected:', urn, 'Got:', manifest.urn);
        }

        if (manifest.status === 'success') {
            // Check if SVF2 derivative exists
            const hasSvf2 = manifest.derivatives?.some(d =>
                d.outputType === 'svf2' && d.status === 'success'
            );

            const hasSvf = manifest.derivatives?.some(d =>
                d.outputType === 'svf' && d.status === 'success'
            );

            console.log('Has SVF2:', hasSvf2);
            console.log('Has SVF:', hasSvf);

            if (!hasSvf2 && !hasSvf) {
                console.log('No viewable derivatives found, model needs translation');
                return false;
            }

            return true;
        } else if (manifest.status === 'inprogress') {
            console.log('Translation in progress:', manifest.progress);
            // Start checking status
            setTimeout(() => checkTranslationStatus(urn), 5000);
            return false;
        } else if (manifest.status === 'failed') {
            console.log('Translation failed:', manifest);
            return false;
        } else {
            console.log('Model not translated, status:', manifest.status);
            return false;
        }
    } catch (error) {
        console.error('Error checking manifest:', error);
        return false;
    }
}

// Document load success callback
function onDocumentLoadSuccess(doc) {
    console.log('Document loaded successfully');

    // Get the default viewable (3D view)
    const viewables = doc.getRoot().getDefaultGeometry();

    if (!viewables) {
        console.error('No viewables found in document');
        // Try to get any viewable
        const allViewables = doc.getRoot().search({ 'type': 'geometry' });
        if (allViewables.length > 0) {
            console.log('Found alternative viewables:', allViewables.length);
            forgeViewer.loadDocumentNode(doc, allViewables[0]).then(onModelLoaded).catch(onModelLoadError);
        }
        return;
    }

    // Load the viewable
    forgeViewer.loadDocumentNode(doc, viewables).then(onModelLoaded).catch(onModelLoadError);
}

// Model loaded successfully
function onModelLoaded(model) {
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
}

// Model load error
function onModelLoadError(error) {
    console.error('Error loading model:', error);
    showViewerError('Failed to load model: ' + error.message);
}

// Document load failure callback
function onDocumentLoadFailure(errorCode, errorMsg) {
    console.error('Failed to load document:', errorCode, errorMsg);

    // Common error codes:
    // 1 = An unknown failure
    // 2 = Bad data (corrupted or malformed file)
    // 3 = Missing asset
    // 4 = Unauthorized access
    // 5 = Forbidden
    // 6 = Unauthorized token
    // 7 = Network error (CORS)

    let userMessage = '';

    switch (errorCode) {
        case 4:
            userMessage = 'Model translation in progress. Please try again in a few moments.';
            triggerModelTranslation(selectedModels[0]);
            break;
        case 6:
            userMessage = 'Authentication token expired. Please refresh the page.';
            break;
        case 7:
            userMessage = 'Network error loading model. This might be a CORS issue.';
            // Try to provide a more specific solution
            console.log('Attempting to diagnose CORS issue...');
            console.log('Token:', forgeAccessToken ? 'Present' : 'Missing');
            console.log('URN:', selectedModels[0]?.versionUrn);
            break;
        default:
            userMessage = `Failed to load model: ${errorMsg} (Code: ${errorCode})`;
    }

    showViewerError(userMessage);
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
        // Use the version URN for translation
        const urnToTranslate = model.versionUrn;
        console.log('URN to translate:', urnToTranslate);

        const translationJob = {
            input: {
                urn: urnToTranslate,
                compressedUrn: true,
                rootFilename: model.name
            },
            output: {
                destination: {
                    region: "us"
                },
                formats: [
                    {
                        type: "svf2",
                        views: ["2d", "3d"],
                        advanced: {
                            generateMasterViews: true
                        }
                    }
                ]
            }
        };

        console.log('Translation job:', JSON.stringify(translationJob, null, 2));

        const response = await fetch(
            'https://developer.api.autodesk.com/modelderivative/v2/designdata/job',
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${forgeAccessToken}`,
                    'Content-Type': 'application/json',
                    'x-ads-force': 'true'  // Force re-translation
                },
                body: JSON.stringify(translationJob)
            }
        );

        console.log('Translation response:', response.status, response.statusText);

        if (response.ok) {
            const result = await response.json();
            console.log('Translation job result:', result);

            showViewerError('Model translation started. This may take a few minutes. Please wait...');

            // Check translation status after delay
            setTimeout(() => checkTranslationStatus(urnToTranslate), 10000);
        } else {
            const errorText = await response.text();
            console.error('Translation request failed:', errorText);

            // Parse error for more info
            try {
                const errorData = JSON.parse(errorText);
                if (errorData.diagnostic) {
                    console.error('Diagnostic info:', errorData.diagnostic);
                }
            } catch (e) {
                // Not JSON
            }

            showViewerError(`Translation failed: ${errorText}`);
        }
    } catch (error) {
        console.error('Error triggering translation:', error);
        showViewerError(`Translation error: ${error.message}`);
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
            console.log('Selected model:', model.name);
            console.log('Version ID:', model.versionId);
            console.log('Version URN:', model.versionUrn);

            const manifestUrl = `https://developer.api.autodesk.com/modelderivative/v2/designdata/${model.versionUrn}/manifest`;
            console.log('Manifest URL:', manifestUrl);

            const response = await fetch(manifestUrl, {
                headers: {
                    'Authorization': `Bearer ${forgeAccessToken}`,
                    'Content-Type': 'application/json'
                }
            });
            console.log(`Manifest endpoint: ${response.status} ${response.statusText}`);

            if (response.ok) {
                const manifest = await response.json();
                console.log('Translation status:', manifest.status);
                console.log('Progress:', manifest.progress);
                console.log('Has derivatives:', manifest.derivatives?.length || 0);

                if (manifest.derivatives) {
                    manifest.derivatives.forEach((deriv, idx) => {
                        console.log(`Derivative ${idx + 1}:`, {
                            outputType: deriv.outputType,
                            status: deriv.status
                        });
                    });
                }
            } else {
                const errorText = await response.text();
                console.error('Manifest error:', errorText);
            }
        } catch (error) {
            console.error('Manifest test failed:', error);
        }
    }

    console.log('\n=== END API TESTS ===');
}

// Debug function to check model URN
async function debugModelUrn() {
    if (!selectedModels || selectedModels.length === 0) {
        console.error('No model selected');
        return;
    }

    const model = selectedModels[0];
    console.log('=== MODEL URN DEBUG ===');
    console.log('Model name:', model.name);
    console.log('Version ID:', model.versionId);
    console.log('Version URN:', model.versionUrn);

    // Try different URN formats
    console.log('\nTrying different URN formats:');

    // Format 1: Direct version ID
    const urn1 = model.versionId;
    console.log('1. Direct version ID:', urn1);

    // Format 2: Base64 encoded version ID
    const urn2 = btoa(model.versionId).replace(/=/g, '');
    console.log('2. Base64 encoded (no padding):', urn2);

    // Format 3: Base64 with URL-safe encoding
    const urn3 = btoa(model.versionId).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    console.log('3. URL-safe Base64:', urn3);

    // Format 4: If version ID already has urn: prefix
    const urn4 = model.versionId.startsWith('urn:') ?
        btoa(model.versionId).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '') :
        btoa('urn:' + model.versionId).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    console.log('4. With urn: prefix:', urn4);

    console.log('\nChecking each format...');

    // Test each format
    for (const [name, urn] of [['Direct', urn1], ['Base64', urn2], ['URL-safe', urn3], ['With prefix', urn4]]) {
        try {
            const response = await fetch(
                `https://developer.api.autodesk.com/modelderivative/v2/designdata/${urn}/manifest`,
                {
                    headers: {
                        'Authorization': `Bearer ${forgeAccessToken}`
                    }
                }
            );
            console.log(`${name}: ${response.status} ${response.statusText}`);

            if (response.ok) {
                const manifest = await response.json();
                console.log(`✅ ${name} works! Status: ${manifest.status}`);
                console.log(`Correct URN format is: ${urn}`);

                // Update the model with correct URN
                model.versionUrn = urn;
                console.log('Model URN updated. Try loading again.');
                break;
            }
        } catch (error) {
            console.log(`${name}: Failed - ${error.message}`);
        }
    }

    console.log('=== END DEBUG ===');
}

// Manual URN fix function
function fixModelUrn(newUrn) {
    if (!selectedModels || selectedModels.length === 0) {
        console.error('No model selected');
        return;
    }

    console.log('Updating model URN from:', selectedModels[0].versionUrn);
    console.log('To:', newUrn);

    selectedModels[0].versionUrn = newUrn;

    console.log('URN updated. You can now retry loading the model.');
}

// Add to window for easy access
window.fixModelUrn = fixModelUrn;

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

// Model Selection Functions
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
            '<div class="loading-message">Loading 3D model...</div>' :
            '<div class="no-model-message"><p>No model selected</p><p>Continue with manual calculations</p></div>'
        }
            </div>
        </div>
        
        <!-- Calculation Panel -->
        <div class="calculation-panel">
            <div class="calc-header">
                <h3>Engineering Calculations</h3>
            </div>
            
            <!-- Calculation Tabs -->
            <div class="calc-tabs">
                <button class="calc-tab active" onclick="switchTab('pointLoad')">Point Loads</button>
                <button class="calc-tab" onclick="switchTab('column')">Columns</button>
                <button class="calc-tab" onclick="switchTab('wall')">Walls/Panels</button>
                <button class="calc-tab" onclick="switchTab('beam')">Beams/Spandrels</button>
                <button class="calc-tab" onclick="switchTab('doubleTee')">Double Tees</button>
            </div>
            
            <!-- Calculation Content -->
            <div class="calc-content" id="calcContent">
                <!-- Dynamic content loaded here -->
            </div>
            
            <!-- Calculation Actions -->
            <div class="calc-actions">
                <button class="btn btn-primary" onclick="performCalculation()">Calculate</button>
                <button class="btn btn-secondary" onclick="clearResults()">Clear</button>
                <button class="btn btn-secondary" onclick="saveCalculation()">Save</button>
            </div>
        </div>
        
        <!-- Results Panel -->
        <div class="results-panel">
            <div class="results-header">
                <h3>Results</h3>
                <button class="btn btn-sm" onclick="exportResults()">Export</button>
            </div>
            <div class="results-content" id="resultsContent">
                <div class="no-results">
                    <p>No calculations performed yet</p>
                    <p>Select a calculation type and input parameters</p>
                </div>
            </div>
            
            <!-- History -->
            <div class="history-section">
                <h4>Recent Calculations</h4>
                <div class="history-list" id="historyList">
                    <!-- Dynamic history items -->
                </div>
            </div>
        </div>
    `;

    // Load initial tab content
    switchTab('pointLoad');
}

// Get hub ID from project
function getHubId() {
    if (selectedProject) {
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
                    <input type="text" id="manualModelUrn" placeholder="Enter model URN">
                    <button class="btn btn-primary" onclick="useManualModelUrn()">
                        Use This URN
                    </button>
                </div>
            `;
        }
    } else {
        // Build folder tree
        if (folderTree && modelsList) {
            const folderStructure = buildFolderStructure();
            folderTree.innerHTML = renderFolderTree(folderStructure);

            // Show all models initially
            showModelsInFolder(discoveredModels);
        }
    }
}

// Build folder structure from discovered models
function buildFolderStructure() {
    const structure = {};

    discoveredModels.forEach(model => {
        const pathParts = model.path.split('/');
        let current = structure;

        pathParts.forEach(part => {
            if (!current[part]) {
                current[part] = {
                    folders: {},
                    models: []
                };
            }
            current = current[part].folders;
        });

        // Add model to the last folder
        const lastFolder = pathParts[pathParts.length - 1];
        if (!structure[lastFolder]) {
            structure[lastFolder] = { folders: {}, models: [] };
        }
        structure[lastFolder].models.push(model);
    });

    return structure;
}

// Render folder tree
function renderFolderTree(structure, level = 0) {
    let html = '';

    Object.keys(structure).forEach(folderName => {
        const folder = structure[folderName];
        const indent = level * 20;

        html += `
            <div class="folder-item" style="padding-left: ${indent}px;">
                <span class="folder-icon">📁</span>
                <span class="folder-name" onclick="showModelsInFolder('${folderName}')">${folderName}</span>
                <span class="model-count">(${folder.models.length})</span>
            </div>
        `;

        // Render subfolders
        if (Object.keys(folder.folders).length > 0) {
            html += renderFolderTree(folder.folders, level + 1);
        }
    });

    return html;
}

// Show models in selected folder
function showModelsInFolder(models) {
    const modelsList = document.getElementById('availableModels');
    if (!modelsList) return;

    // If models is a string (folder name), filter the models
    if (typeof models === 'string') {
        models = discoveredModels.filter(m => m.path.includes(models));
    }

    if (models.length === 0) {
        modelsList.innerHTML = '<p class="no-models">No models in this folder</p>';
        return;
    }

    modelsList.innerHTML = models.map((model, index) => `
        <div class="model-item" onclick="selectDiscoveredModel(${discoveredModels.indexOf(model)})">
            <div class="model-icon">📄</div>
            <div class="model-info">
                <div class="model-name">${model.name}</div>
                <div class="model-details">
                    Version ${model.versionNumber} • 
                    ${new Date(model.lastModified).toLocaleDateString()} • 
                    ${formatFileSize(model.size)}
                </div>
            </div>
        </div>
    `).join('');
}

// Format file size
function formatFileSize(bytes) {
    if (!bytes) return 'Unknown size';

    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

// Switch calculation tab
function switchTab(tabName) {
    console.log('Switching to tab:', tabName);
    currentCalculationType = tabName;

    // Update tab styles
    document.querySelectorAll('.calc-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    event.target?.classList.add('active');

    // Load tab content
    const content = document.getElementById('calcContent');
    if (content) {
        content.innerHTML = getCalculationForm(tabName);
    }
}

// Get calculation form for tab
function getCalculationForm(type) {
    switch (type) {
        case 'pointLoad':
            return `
                <h4>Point Load Calculation</h4>
                <form id="pointLoadForm">
                    <div class="form-group">
                        <label>Load (kN)</label>
                        <input type="number" name="load" step="0.1" required>
                    </div>
                    <div class="form-group">
                        <label>Distance from Support A (m)</label>
                        <input type="number" name="distanceA" step="0.01" required>
                    </div>
                    <div class="form-group">
                        <label>Span Length (m)</label>
                        <input type="number" name="span" step="0.01" required>
                    </div>
                    <div class="form-group">
                        <label>Load Factor</label>
                        <input type="number" name="loadFactor" step="0.1" value="1.4" required>
                    </div>
                </form>
            `;

        case 'column':
            return `
                <h4>Column Design (PCI)</h4>
                <form id="columnForm">
                    <div class="form-group">
                        <label>Axial Load (kN)</label>
                        <input type="number" name="axialLoad" step="1" required>
                    </div>
                    <div class="form-group">
                        <label>Moment about X-axis (kN·m)</label>
                        <input type="number" name="momentX" step="0.1" required>
                    </div>
                    <div class="form-group">
                        <label>Moment about Y-axis (kN·m)</label>
                        <input type="number" name="momentY" step="0.1" required>
                    </div>
                    <div class="form-group">
                        <label>Column Height (m)</label>
                        <input type="number" name="height" step="0.01" required>
                    </div>
                    <div class="form-group">
                        <label>Width (mm)</label>
                        <input type="number" name="width" step="10" value="400" required>
                    </div>
                    <div class="form-group">
                        <label>Depth (mm)</label>
                        <input type="number" name="depth" step="10" value="400" required>
                    </div>
                    <div class="form-group">
                        <label>Concrete Strength f'c (MPa)</label>
                        <input type="number" name="fc" step="1" value="35" required>
                    </div>
                    <div class="form-group">
                        <label>Strand Type</label>
                        <select name="strandType">
                            <option value="grade270">Grade 270 (1860 MPa)</option>
                            <option value="grade250">Grade 250 (1725 MPa)</option>
                        </select>
                    </div>
                </form>
            `;

        case 'wall':
            return `
                <h4>Wall Panel Design</h4>
                <form id="wallForm">
                    <div class="form-group">
                        <label>Panel Height (m)</label>
                        <input type="number" name="height" step="0.01" required>
                    </div>
                    <div class="form-group">
                        <label>Panel Width (m)</label>
                        <input type="number" name="width" step="0.01" required>
                    </div>
                    <div class="form-group">
                        <label>Panel Thickness (mm)</label>
                        <input type="number" name="thickness" step="5" value="150" required>
                    </div>
                    <div class="form-group">
                        <label>Wind Load (kPa)</label>
                        <input type="number" name="windLoad" step="0.1" required>
                    </div>
                    <div class="form-group">
                        <label>Number of Lifting Points</label>
                        <input type="number" name="liftingPoints" step="1" value="4" required>
                    </div>
                </form>
            `;

        case 'beam':
            return `
                <h4>Beam/Spandrel Design</h4>
                <form id="beamForm">
                    <div class="form-group">
                        <label>Span Length (m)</label>
                        <input type="number" name="span" step="0.01" required>
                    </div>
                    <div class="form-group">
                        <label>Dead Load (kN/m)</label>
                        <input type="number" name="deadLoad" step="0.1" required>
                    </div>
                    <div class="form-group">
                        <label>Live Load (kN/m)</label>
                        <input type="number" name="liveLoad" step="0.1" required>
                    </div>
                    <div class="form-group">
                        <label>Beam Width (mm)</label>
                        <input type="number" name="width" step="10" value="300" required>
                    </div>
                    <div class="form-group">
                        <label>Beam Depth (mm)</label>
                        <input type="number" name="depth" step="10" value="600" required>
                    </div>
                    <div class="form-group">
                        <label>Number of Strands</label>
                        <input type="number" name="strands" step="1" value="6" required>
                    </div>
                </form>
            `;

        case 'doubleTee':
            return `
                <h4>Double Tee Design</h4>
                <form id="doubleTeeForm">
                    <div class="form-group">
                        <label>Span Length (m)</label>
                        <input type="number" name="span" step="0.01" required>
                    </div>
                    <div class="form-group">
                        <label>DT Width (m)</label>
                        <input type="number" name="width" step="0.01" value="2.4" required>
                    </div>
                    <div class="form-group">
                        <label>Stem Depth (mm)</label>
                        <input type="number" name="stemDepth" step="10" value="600" required>
                    </div>
                    <div class="form-group">
                        <label>Flange Thickness (mm)</label>
                        <input type="number" name="flangeThickness" step="5" value="75" required>
                    </div>
                    <div class="form-group">
                        <label>Superimposed Dead Load (kPa)</label>
                        <input type="number" name="sdl" step="0.1" required>
                    </div>
                    <div class="form-group">
                        <label>Live Load (kPa)</label>
                        <input type="number" name="liveLoad" step="0.1" required>
                    </div>
                </form>
            `;

        default:
            return '<p>Select a calculation type</p>';
    }
}

// Perform calculation
function performCalculation() {
    console.log('Performing calculation:', currentCalculationType);

    const form = document.querySelector(`#${currentCalculationType}Form`);
    if (!form) {
        showNotification('No calculation form found', 'error');
        return;
    }

    const formData = new FormData(form);
    const inputs = {};

    for (let [key, value] of formData.entries()) {
        inputs[key] = parseFloat(value) || value;
    }

    console.log('Calculation inputs:', inputs);

    // Perform calculation based on type
    let results = {};

    switch (currentCalculationType) {
        case 'pointLoad':
            results = calculatePointLoad(inputs);
            break;
        case 'column':
            results = calculateColumn(inputs);
            break;
        case 'wall':
            results = calculateWall(inputs);
            break;
        case 'beam':
            results = calculateBeam(inputs);
            break;
        case 'doubleTee':
            results = calculateDoubleTee(inputs);
            break;
    }

    // Display results
    displayResults(results);

    // Add to history
    addToHistory({
        type: currentCalculationType,
        inputs: inputs,
        results: results,
        timestamp: new Date().toISOString()
    });
}

// Calculation functions
function calculatePointLoad(inputs) {
    const { load, distanceA, span, loadFactor } = inputs;

    const factoredLoad = load * loadFactor;
    const distanceB = span - distanceA;

    const reactionA = (factoredLoad * distanceB) / span;
    const reactionB = (factoredLoad * distanceA) / span;

    const maxMoment = (reactionA * distanceA);
    const maxShear = Math.max(reactionA, reactionB);

    return {
        title: 'Point Load Analysis Results',
        values: [
            { label: 'Factored Load', value: factoredLoad.toFixed(2), unit: 'kN' },
            { label: 'Reaction at A', value: reactionA.toFixed(2), unit: 'kN' },
            { label: 'Reaction at B', value: reactionB.toFixed(2), unit: 'kN' },
            { label: 'Maximum Moment', value: maxMoment.toFixed(2), unit: 'kN·m' },
            { label: 'Maximum Shear', value: maxShear.toFixed(2), unit: 'kN' }
        ],
        status: 'Complete',
        notes: 'Simple beam analysis with point load'
    };
}

function calculateColumn(inputs) {
    const { axialLoad, momentX, momentY, height, width, depth, fc, strandType } = inputs;

    // Column properties
    const area = (width * depth) / 1e6; // m²
    const Ix = (width * depth * depth * depth) / 12e12; // m⁴
    const Iy = (depth * width * width * width) / 12e12; // m⁴

    // Slenderness check
    const rx = Math.sqrt(Ix / area);
    const ry = Math.sqrt(Iy / area);
    const slendernessX = height / rx;
    const slendernessY = height / ry;
    const maxSlenderness = Math.max(slendernessX, slendernessY);

    // P-M interaction (simplified)
    const Pn = 0.85 * fc * area * 1000; // kN
    const phiPn = 0.65 * Pn;

    // Moment capacity (simplified)
    const Mnx = 0.1 * Pn * depth / 1000; // kN·m
    const Mny = 0.1 * Pn * width / 1000; // kN·m

    // Unity check
    const unityCheck = (axialLoad / phiPn) + (momentX / Mnx) + (momentY / Mny);

    return {
        title: 'Column Design Results (PCI)',
        values: [
            { label: 'Column Area', value: (area * 1e6).toFixed(0), unit: 'mm²' },
            { label: 'Slenderness Ratio', value: maxSlenderness.toFixed(1), unit: '' },
            { label: 'Nominal Capacity (Pn)', value: Pn.toFixed(0), unit: 'kN' },
            { label: 'Design Capacity (φPn)', value: phiPn.toFixed(0), unit: 'kN' },
            { label: 'Unity Check', value: unityCheck.toFixed(3), unit: '' }
        ],
        status: unityCheck <= 1.0 ? 'PASS' : 'FAIL',
        notes: `Column ${unityCheck <= 1.0 ? 'adequate' : 'inadequate'} for combined loading`
    };
}

function calculateWall(inputs) {
    const { height, width, thickness, windLoad, liftingPoints } = inputs;

    // Wall properties
    const area = width * height; // m²
    const weight = area * thickness * 24 / 1000; // kN (assuming 24 kN/m³)

    // Wind load
    const totalWind = windLoad * area; // kN
    const momentWind = totalWind * height / 2; // kN·m

    // Lifting analysis
    const liftingForce = weight / liftingPoints; // kN per point

    // Stress check (simplified)
    const sectionModulus = (width * thickness * thickness) / 6e6; // m³
    const stress = momentWind / sectionModulus / 1000; // MPa

    return {
        title: 'Wall Panel Analysis Results',
        values: [
            { label: 'Panel Weight', value: weight.toFixed(1), unit: 'kN' },
            { label: 'Total Wind Force', value: totalWind.toFixed(1), unit: 'kN' },
            { label: 'Wind Moment', value: momentWind.toFixed(1), unit: 'kN·m' },
            { label: 'Lifting Force/Point', value: liftingForce.toFixed(1), unit: 'kN' },
            { label: 'Maximum Stress', value: stress.toFixed(2), unit: 'MPa' }
        ],
        status: stress < 5.0 ? 'PASS' : 'CHECK',
        notes: 'Simplified wall panel analysis'
    };
}

function calculateBeam(inputs) {
    const { span, deadLoad, liveLoad, width, depth, strands } = inputs;

    // Load combinations
    const wu = 1.2 * deadLoad + 1.6 * liveLoad; // kN/m

    // Maximum moment and shear
    const Mu = (wu * span * span) / 8; // kN·m
    const Vu = (wu * span) / 2; // kN

    // Section properties
    const area = (width * depth) / 1e6; // m²
    const I = (width * depth * depth * depth) / 12e12; // m⁴
    const c = depth / 2000; // m
    const S = I / c; // m³

    // Prestress (simplified)
    const strandArea = 140; // mm² per strand
    const totalStrandArea = strands * strandArea / 1e6; // m²
    const fps = 1860; // MPa for Grade 270
    const Pe = totalStrandArea * fps * 0.7 * 1000; // kN (assuming 30% losses)

    return {
        title: 'Beam Design Results',
        values: [
            { label: 'Factored Load', value: wu.toFixed(2), unit: 'kN/m' },
            { label: 'Maximum Moment', value: Mu.toFixed(1), unit: 'kN·m' },
            { label: 'Maximum Shear', value: Vu.toFixed(1), unit: 'kN' },
            { label: 'Prestress Force', value: Pe.toFixed(0), unit: 'kN' },
            { label: 'Section Modulus', value: (S * 1e6).toFixed(0), unit: 'mm³' }
        ],
        status: 'Complete',
        notes: 'Prestressed beam preliminary design'
    };
}

function calculateDoubleTee(inputs) {
    const { span, width, stemDepth, flangeThickness, sdl, liveLoad } = inputs;

    // Self weight (approximate)
    const selfWeight = 4.5; // kPa typical for DT
    const totalDead = selfWeight + sdl; // kPa

    // Load per stem
    const wu = (1.2 * totalDead + 1.6 * liveLoad) * width / 2; // kN/m per stem

    // Maximum moment and shear per stem
    const Mu = (wu * span * span) / 8; // kN·m
    const Vu = (wu * span) / 2; // kN

    // Deflection check (simplified)
    const L_over_d = span * 1000 / stemDepth;
    const deflectionOK = L_over_d <= 40;

    return {
        title: 'Double Tee Design Results',
        values: [
            { label: 'Total Dead Load', value: totalDead.toFixed(2), unit: 'kPa' },
            { label: 'Factored Load/Stem', value: wu.toFixed(2), unit: 'kN/m' },
            { label: 'Moment/Stem', value: Mu.toFixed(1), unit: 'kN·m' },
            { label: 'Shear/Stem', value: Vu.toFixed(1), unit: 'kN' },
            { label: 'L/d Ratio', value: L_over_d.toFixed(1), unit: '' }
        ],
        status: deflectionOK ? 'PASS' : 'CHECK DEFLECTION',
        notes: `DT preliminary design - ${deflectionOK ? 'deflection OK' : 'check deflection'}`
    };
}

// Display results
function displayResults(results) {
    const resultsContent = document.getElementById('resultsContent');
    if (!resultsContent) return;

    let html = `
        <div class="results-summary">
            <h4>${results.title}</h4>
            <div class="status-badge ${results.status.toLowerCase().replace(' ', '-')}">${results.status}</div>
        </div>
        <div class="results-values">
    `;

    results.values.forEach(item => {
        html += `
            <div class="result-item">
                <span class="result-label">${item.label}:</span>
                <span class="result-value">${item.value} ${item.unit}</span>
            </div>
        `;
    });

    html += `
        </div>
        <div class="results-notes">
            <p>${results.notes}</p>
        </div>
    `;

    resultsContent.innerHTML = html;
}

// Clear results
function clearResults() {
    const resultsContent = document.getElementById('resultsContent');
    if (resultsContent) {
        resultsContent.innerHTML = `
            <div class="no-results">
                <p>No calculations performed yet</p>
                <p>Select a calculation type and input parameters</p>
            </div>
        `;
    }

    // Clear form
    const form = document.querySelector(`#${currentCalculationType}Form`);
    if (form) form.reset();
}

// Save calculation
async function saveCalculation() {
    const calculation = calculationHistory[calculationHistory.length - 1];
    if (!calculation) {
        showNotification('No calculation to save', 'warning');
        return;
    }

    // Prepare data for OSS storage
    const saveData = {
        projectId: selectedProject,
        calculationType: calculation.type,
        inputs: calculation.inputs,
        results: calculation.results,
        timestamp: calculation.timestamp,
        engineerName: sessionStorage.getItem('engineerName') || 'Unknown',
        modelInfo: selectedModels.length > 0 ? {
            name: selectedModels[0].name,
            urn: selectedModels[0].versionUrn
        } : null
    };

    // Save to OSS (similar to QC Bed Report)
    try {
        // This would use your ACC OSS storage pattern
        console.log('Saving calculation to OSS:', saveData);

        // For now, save to local storage
        const savedCalcs = JSON.parse(localStorage.getItem('engineeringCalculations') || '[]');
        savedCalcs.push(saveData);
        localStorage.setItem('engineeringCalculations', JSON.stringify(savedCalcs));

        showNotification('Calculation saved successfully', 'success');
    } catch (error) {
        console.error('Error saving calculation:', error);
        showNotification('Error saving calculation', 'error');
    }
}

// Export results
function exportResults() {
    const calculation = calculationHistory[calculationHistory.length - 1];
    if (!calculation) {
        showNotification('No results to export', 'warning');
        return;
    }

    // Create CSV content
    let csv = 'Engineering Calculation Report\n\n';
    csv += `Project: ${selectedProject}\n`;
    csv += `Calculation Type: ${calculation.type}\n`;
    csv += `Date: ${new Date(calculation.timestamp).toLocaleString()}\n\n`;

    csv += 'Inputs:\n';
    Object.entries(calculation.inputs).forEach(([key, value]) => {
        csv += `${key},${value}\n`;
    });

    csv += '\nResults:\n';
    calculation.results.values.forEach(item => {
        csv += `${item.label},${item.value},${item.unit}\n`;
    });

    csv += `\nStatus: ${calculation.results.status}\n`;
    csv += `Notes: ${calculation.results.notes}\n`;

    // Download CSV
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `calculation_${calculation.type}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// Load calculation history
function loadCalculationHistory() {
    const saved = localStorage.getItem('calculationHistory');
    if (saved) {
        calculationHistory = JSON.parse(saved);
        updateHistoryDisplay();
    }
}

// Add to history
function addToHistory(calculation) {
    calculationHistory.push(calculation);

    // Keep only last 10
    if (calculationHistory.length > 10) {
        calculationHistory.shift();
    }

    // Save to local storage
    localStorage.setItem('calculationHistory', JSON.stringify(calculationHistory));

    updateHistoryDisplay();
}

// Update history display
function updateHistoryDisplay() {
    const historyList = document.getElementById('historyList');
    if (!historyList) return;

    if (calculationHistory.length === 0) {
        historyList.innerHTML = '<p class="no-history">No calculation history</p>';
        return;
    }

    historyList.innerHTML = calculationHistory.slice().reverse().map((calc, index) => `
        <div class="history-item" onclick="loadHistoryItem(${calculationHistory.length - 1 - index})">
            <div class="history-type">${calc.type}</div>
            <div class="history-date">${new Date(calc.timestamp).toLocaleString()}</div>
            <div class="history-status">${calc.results.status}</div>
        </div>
    `).join('');
}

// Load history item
function loadHistoryItem(index) {
    const calculation = calculationHistory[index];
    if (!calculation) return;

    // Switch to the correct tab
    switchTab(calculation.type);

    // Fill in the form
    const form = document.querySelector(`#${calculation.type}Form`);
    if (form) {
        Object.entries(calculation.inputs).forEach(([key, value]) => {
            const input = form.elements[key];
            if (input) input.value = value;
        });
    }

    // Display results
    displayResults(calculation.results);
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
    testAPIEndpoints,
    debugModelUrn
};