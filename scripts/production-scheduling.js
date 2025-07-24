// ACC Authentication Configuration
const ACC_CLIENT_ID = window.ACC_CLIENT_ID;
const ACC_CALLBACK_URL = 'https://metrocastpro.com/';

// Enhanced scope configuration
const ACC_SCOPES = [
    'data:read',
    'data:write',
    'data:create',
    'data:search',
    'account:read',
    'user:read',
    'viewables:read'
].join(' ');

// Global Variables
let forgeAccessToken = null;
let hubId = null;
let projectId = null;
let isAuthenticated = false;
let globalHubData = null;

// Three.js Variables
let scene, camera, renderer, controls;
let bedMesh, gridHelper;
let pieceMeshes = new Map();
let selectedPiece = null;
let raycaster, mouse;
let isDragging = false;
let showStrandPattern = false;

// Production Data
let currentBed = null;
let currentSchedule = null;
let currentModel = null;
let availableAssets = [];
let placedPieces = [];
let validationIssues = [];

// ACC Custom Field Mappings
const CUSTOM_FIELD_MAPPINGS = {
    DateScheduled: 'DateScheduled',
    DatePoured: 'DatePoured',
    BedId: 'ProductionBedId',
    PourStatus: 'PourStatus',
    BedPosition: 'BedPosition',
    BedRotation: 'BedRotation'
};

// Bed Configurations
const BED_CONFIGS = {
    beam: { length: 500, width: 10, height: 0.5, type: 'beam', color: 0x8B4513 },
    deck1: { length: 400, width: 15, height: 0.5, type: 'deck', color: 0x696969 },
    deck2: { length: 400, width: 15, height: 0.5, type: 'deck', color: 0x696969 },
    flatbed1: { length: 300, width: 12, height: 0.5, type: 'flat', color: 0x708090 },
    flatbed2: { length: 300, width: 12, height: 0.5, type: 'flat', color: 0x708090 },
    flatbed3: { length: 300, width: 12, height: 0.5, type: 'flat', color: 0x708090 },
    flatbed4: { length: 300, width: 12, height: 0.5, type: 'flat', color: 0x708090 },
    flatbed5: { length: 300, width: 12, height: 0.5, type: 'flat', color: 0x708090 },
    flatbed6: { length: 300, width: 12, height: 0.5, type: 'flat', color: 0x708090 },
    flatbed7: { length: 300, width: 12, height: 0.5, type: 'flat', color: 0x708090 }
};

// Piece Type Configurations
const PIECE_CONFIGS = {
    beam: { defaultLength: 40, defaultWidth: 2, defaultHeight: 3, color: 0xFF6B6B },
    column: { defaultLength: 2, defaultWidth: 2, defaultHeight: 20, color: 0x4ECDC4 },
    wall: { defaultLength: 20, defaultWidth: 1, defaultHeight: 10, color: 0x45B7D1 },
    doubletee: { defaultLength: 60, defaultWidth: 10, defaultHeight: 2, color: 0x96CEB4 },
    slab: { defaultLength: 20, defaultWidth: 8, defaultHeight: 1, color: 0xDDA0DD }
};

// Initialize Application
async function initializeApp() {
    try {
        updateAuthStatus('Initializing...', 'Setting up production scheduler...');

        // Check for parent window auth
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

        // Check for stored token
        const storedToken = getStoredToken();
        if (storedToken && !isTokenExpired(storedToken)) {
            forgeAccessToken = storedToken.access_token;
            await completeAuthentication();
        } else {
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
        updateAuthStatus('Loading Data...', 'Connecting to ACC and loading projects...');

        // Load hub data
        await loadHubData();

        isAuthenticated = true;

        updateAuthStatus('Success!', 'Production scheduler ready');
        await new Promise(resolve => setTimeout(resolve, 800));

        // Hide auth overlay
        const authProcessing = document.getElementById('authProcessing');
        if (authProcessing) {
            authProcessing.classList.remove('active');
        }
        document.body.classList.remove('auth-loading');

        // Show auth status badge
        const authStatusBadge = document.getElementById('authStatusBadge');
        if (authStatusBadge) {
            authStatusBadge.style.display = 'inline-flex';
        }

        // Initialize UI
        initializeUI();
        initializeThreeJS();

        // Set default date to today
        const dateSelect = document.getElementById('dateSelect');
        if (dateSelect) {
            dateSelect.value = new Date().toISOString().split('T')[0];
        }

    } catch (error) {
        console.error('Authentication completion failed:', error);
        showAuthError('Failed to initialize: ' + error.message);
    }
}

async function loadHubData() {
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
            }
        }

        if (globalHubData && globalHubData.projects && globalHubData.projects.length > 0) {
            hubId = globalHubData.hubId;
            populateProjectDropdown(globalHubData.projects);
        } else {
            console.warn('No hub data available');
            handleMissingHubData();
        }

    } catch (error) {
        console.error('Error loading hub data:', error);
        handleMissingHubData();
    }
}

function populateProjectDropdown(projects) {
    const projectSelect = document.getElementById('projectSelect');
    if (!projectSelect) return;

    projectSelect.innerHTML = '<option value="">Select a project...</option>';

    projects.forEach(project => {
        const option = document.createElement('option');
        option.value = project.id;
        option.textContent = `${project.name}${project.number && project.number !== 'N/A' ? ' (' + project.number + ')' : ''}`;
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

function handleMissingHubData() {
    const projectSelect = document.getElementById('projectSelect');
    if (projectSelect) {
        projectSelect.innerHTML = '<option value="">No projects available</option>';
        projectSelect.disabled = true;
    }
}

function initializeUI() {
    // Add event listeners for UI controls
    document.addEventListener('keydown', handleKeyPress);

    // Initialize search functionality
    const assetSearch = document.getElementById('assetSearch');
    if (assetSearch) {
        assetSearch.addEventListener('input', debounce(filterAssets, 300));
    }
}

// Three.js Initialization
function initializeThreeJS() {
    const container = document.getElementById('threejsContainer');
    if (!container) return;

    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    scene.fog = new THREE.Fog(0xf0f0f0, 100, 1000);

    // Camera setup
    const aspect = container.clientWidth / container.clientHeight;
    camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 2000);
    camera.position.set(100, 100, 100);
    camera.lookAt(0, 0, 0);

    // Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 10;
    controls.maxDistance = 500;
    controls.maxPolarAngle = Math.PI / 2;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight.position.set(50, 100, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.camera.left = -100;
    directionalLight.shadow.camera.right = 100;
    directionalLight.shadow.camera.top = 100;
    directionalLight.shadow.camera.bottom = -100;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    // Grid
    gridHelper = new THREE.GridHelper(600, 60, 0x888888, 0xcccccc);
    scene.add(gridHelper);

    // Raycaster for mouse interaction
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // Add event listeners
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('dblclick', onDoubleClick);
    window.addEventListener('resize', onWindowResize);

    // Start animation loop
    animate();
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();

    // Update piece positions if dragging
    if (isDragging && selectedPiece) {
        updateDragPosition();
    }

    renderer.render(scene, camera);
}

function onWindowResize() {
    const container = document.getElementById('threejsContainer');
    if (!container) return;

    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

// Mouse Interaction Handlers
function onMouseMove(event) {
    const container = document.getElementById('threejsContainer');
    const rect = container.getBoundingClientRect();

    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    if (!isDragging) {
        // Highlight pieces on hover
        raycaster.setFromCamera(mouse, camera);

        // Get all piece meshes (first child of each group)
        const pieceObjects = [];
        pieceMeshes.forEach(group => {
            if (group.children[0]) {
                pieceObjects.push(group.children[0]);
            }
        });

        const intersects = raycaster.intersectObjects(pieceObjects);

        // Reset all piece materials
        pieceMeshes.forEach((group, assetId) => {
            const mesh = group.children[0];
            if (mesh && mesh.material) {
                const piece = placedPieces.find(p => p.assetId === assetId);
                if (piece && !piece.validationErrors) {
                    mesh.material.emissive = new THREE.Color(0x000000);
                }
            }
        });

        // Highlight hovered piece
        if (intersects.length > 0) {
            const hoveredMesh = intersects[0].object;
            const hoveredGroup = hoveredMesh.parent;
            if (hoveredGroup && hoveredGroup.userData.assetId) {
                hoveredMesh.material.emissive = new THREE.Color(0x444444);
                document.body.style.cursor = 'pointer';
            }
        } else {
            document.body.style.cursor = 'default';
        }
    }
}

function onMouseDown(event) {
    if (event.button !== 0) return; // Only left click

    raycaster.setFromCamera(mouse, camera);

    const pieceObjects = [];
    pieceMeshes.forEach(group => {
        if (group.children[0]) {
            pieceObjects.push(group.children[0]);
        }
    });

    const intersects = raycaster.intersectObjects(pieceObjects);

    if (intersects.length > 0) {
        const clickedMesh = intersects[0].object;
        const clickedGroup = clickedMesh.parent;

        if (clickedGroup && clickedGroup.userData.assetId) {
            selectPiece(clickedGroup);
            isDragging = true;
            controls.enabled = false;

            // Store initial position
            selectedPiece.userData.startPosition = selectedPiece.position.clone();
        }
    } else {
        // Deselect if clicking empty space
        if (selectedPiece) {
            const mesh = selectedPiece.children[0];
            if (mesh && mesh.material) {
                mesh.material.emissive = new THREE.Color(0x000000);
            }
            selectedPiece = null;
        }
    }
}

function onMouseUp(event) {
    if (isDragging && selectedPiece) {
        isDragging = false;
        controls.enabled = true;

        // Validate new position
        validatePiecePlacement(selectedPiece);

        // Update piece data
        const piece = placedPieces.find(p => p.assetId === selectedPiece.userData.assetId);
        if (piece) {
            piece.position = {
                x: selectedPiece.position.x,
                y: selectedPiece.position.y,
                z: selectedPiece.position.z
            };
        }
    }
}

function onDoubleClick(event) {
    raycaster.setFromCamera(mouse, camera);

    const pieceObjects = [];
    pieceMeshes.forEach(group => {
        if (group.children[0]) {
            pieceObjects.push(group.children[0]);
        }
    });

    const intersects = raycaster.intersectObjects(pieceObjects);

    if (intersects.length > 0) {
        const clickedMesh = intersects[0].object;
        const clickedGroup = clickedMesh.parent;
        if (clickedGroup && clickedGroup.userData.assetId) {
            showPieceDetails(clickedGroup.userData.assetId);
        }
    }
}

function updateDragPosition() {
    if (!selectedPiece || !currentBed) return;

    raycaster.setFromCamera(mouse, camera);

    // Create a plane at bed height for dragging
    const bedConfig = BED_CONFIGS[currentBed];
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -bedConfig.height);

    const intersectPoint = new THREE.Vector3();
    raycaster.ray.intersectPlane(dragPlane, intersectPoint);

    if (intersectPoint) {
        // Constrain to bed boundaries
        const halfLength = bedConfig.length / 2;
        const halfWidth = bedConfig.width / 2;

        selectedPiece.position.x = Math.max(-halfLength, Math.min(halfLength, intersectPoint.x));
        selectedPiece.position.z = Math.max(-halfWidth, Math.min(halfWidth, intersectPoint.z));
        selectedPiece.position.y = bedConfig.height + selectedPiece.userData.dimensions.height / 2;
    }
}

// Bed Management
function onBedChange() {
    const bedSelect = document.getElementById('bedSelect');
    currentBed = bedSelect.value;

    if (!currentBed) {
        clearViewer();
        return;
    }

    // Update bed info
    updateBedInfo();

    // Create bed visualization
    createBedVisualization();

    // Load existing schedule for this bed and date
    loadBedSchedule();
}

function updateBedInfo() {
    if (!currentBed) return;

    const config = BED_CONFIGS[currentBed];
    document.getElementById('bedType').textContent = config.type;
    document.getElementById('bedLength').textContent = config.length + ' ft';
    document.getElementById('bedWidth').textContent = config.width + ' ft';
}

function createBedVisualization() {
    // Remove existing bed
    if (bedMesh) {
        scene.remove(bedMesh);
    }

    const config = BED_CONFIGS[currentBed];

    // Create bed geometry
    const geometry = new THREE.BoxGeometry(config.length, config.height, config.width);
    const material = new THREE.MeshPhongMaterial({
        color: config.color,
        specular: 0x111111,
        shininess: 30
    });

    const bedBox = new THREE.Mesh(geometry, material);
    bedBox.position.y = config.height / 2;
    bedBox.receiveShadow = true;

    // Add bed outline
    const edges = new THREE.EdgesGeometry(geometry);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000 }));
    line.position.copy(bedBox.position);

    // Create group for bed
    bedMesh = new THREE.Group();
    bedMesh.add(bedBox);
    bedMesh.add(line);
    bedMesh.userData.type = 'bed';

    scene.add(bedMesh);

    // Reset camera
    resetCamera();
}

function clearViewer() {
    // Remove bed
    if (bedMesh) {
        scene.remove(bedMesh);
        bedMesh = null;
    }

    // Remove all pieces and their strand patterns
    pieceMeshes.forEach(group => {
        if (group.userData.strandLines) {
            group.userData.strandLines.forEach(line => scene.remove(line));
        }
        scene.remove(group);
    });
    pieceMeshes.clear();
    placedPieces = [];
    selectedPiece = null;
}

// Asset Management
async function onProjectChange() {
    const projectSelect = document.getElementById('projectSelect');
    projectId = projectSelect.value;

    if (!projectId) {
        clearAssetsList();
        return;
    }

    // Load models for this project
    await loadProjectModels();
}

async function loadProjectModels() {
    try {
        updateViewerStatus('Loading project models...');

        // Get project folder contents
        const foldersUrl = `https://developer.api.autodesk.com/project/v1/hubs/${hubId}/projects/${projectId}/topFolders`;
        const foldersResponse = await fetch(foldersUrl, {
            headers: {
                'Authorization': `Bearer ${forgeAccessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!foldersResponse.ok) {
            throw new Error('Failed to load project folders');
        }

        const foldersData = await foldersResponse.json();

        // Find Project Files folder
        const projectFilesFolder = foldersData.data.find(folder =>
            folder.attributes.displayName === 'Project Files' ||
            folder.attributes.name === 'Project Files'
        );

        if (projectFilesFolder) {
            await loadFolderContents(projectFilesFolder.id);
        } else {
            // Load first available folder
            if (foldersData.data.length > 0) {
                await loadFolderContents(foldersData.data[0].id);
            }
        }

        updateViewerStatus('Ready');

    } catch (error) {
        console.error('Error loading models:', error);
        updateViewerStatus('Error loading models');
        updateModelDropdown([]);
    }
}

async function loadFolderContents(folderId) {
    try {
        const contentsUrl = `https://developer.api.autodesk.com/data/v1/projects/${projectId}/folders/${folderId}/contents`;
        const response = await fetch(contentsUrl, {
            headers: {
                'Authorization': `Bearer ${forgeAccessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Failed to load folder contents');
        }

        const data = await response.json();

        // Filter for Revit models
        const revitModels = data.data.filter(item =>
            item.type === 'items' &&
            (item.attributes.displayName.endsWith('.rvt') ||
                item.attributes.fileType === 'rvt')
        );

        updateModelDropdown(revitModels);

    } catch (error) {
        console.error('Error loading folder contents:', error);
        updateModelDropdown([]);
    }
}

function updateModelDropdown(models) {
    const modelSelect = document.getElementById('modelSelect');
    if (!modelSelect) return;

    modelSelect.innerHTML = '<option value="">Select Model...</option>';

    models.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.attributes.displayName;
        option.dataset.modelData = JSON.stringify(model);
        modelSelect.appendChild(option);
    });

    modelSelect.disabled = models.length === 0;
}

async function onModelChange() {
    const modelSelect = document.getElementById('modelSelect');
    currentModel = modelSelect.value;

    if (!currentModel) {
        clearAssetsList();
        return;
    }

    // Load ACC Assets mapped to this model
    await loadModelAssets();
}

async function loadModelAssets() {
    try {
        updateViewerStatus('Loading ACC Assets...');

        // Get assets for the project
        const assetsUrl = `https://developer.api.autodesk.com/construction/assets/v1/projects/${projectId.replace('b.', '')}/assets?filter[status.name]=active`;

        const response = await fetch(assetsUrl, {
            headers: {
                'Authorization': `Bearer ${forgeAccessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Failed to load ACC Assets');
        }

        const data = await response.json();

        // Process assets to extract piece information
        availableAssets = await processAssetsWithModelData(data.results || []);

        // Update filters
        updateDesignFilter();

        // Display assets
        displayAssets(availableAssets);

        updateViewerStatus('Ready');

    } catch (error) {
        console.error('Error loading assets:', error);
        updateViewerStatus('Error loading assets');

        // Fall back to mock data for testing
        availableAssets = generateMockAssets();
        updateDesignFilter();
        displayAssets(availableAssets);
    }
}

async function processAssetsWithModelData(assets) {
    const processedAssets = [];

    for (const asset of assets) {
        try {
            // Extract custom attributes
            const customAttributes = asset.customAttributes || {};

            // Get linked element data if available
            let elementData = null;
            if (asset.linkedDocumentUrn && asset.externalId) {
                elementData = await getElementProperties(asset.linkedDocumentUrn, asset.externalId);
            }

            // Determine piece type from category or name
            let pieceType = 'beam'; // default
            const displayName = asset.displayName || asset.name || '';

            if (displayName.toLowerCase().includes('column')) pieceType = 'column';
            else if (displayName.toLowerCase().includes('wall')) pieceType = 'wall';
            else if (displayName.toLowerCase().includes('double') || displayName.toLowerCase().includes('tee')) pieceType = 'doubletee';
            else if (displayName.toLowerCase().includes('slab')) pieceType = 'slab';

            // Extract dimensions from element properties or use defaults
            const dimensions = extractDimensions(elementData) || PIECE_CONFIGS[pieceType];

            processedAssets.push({
                id: asset.id,
                displayName: displayName,
                attributes: {
                    displayName: displayName,
                    pieceType: pieceType,
                    DESIGN_NUMBER: customAttributes.DESIGN_NUMBER || customAttributes.designNumber || null,
                    length: dimensions.defaultLength || dimensions.length || 20,
                    width: dimensions.defaultWidth || dimensions.width || 8,
                    height: dimensions.defaultHeight || dimensions.height || 2,
                    weight: customAttributes.weight || Math.round(Math.random() * 5000 + 1000),
                    status: asset.status?.name || 'active',
                    externalId: asset.externalId,
                    linkedDocumentUrn: asset.linkedDocumentUrn
                },
                originalAsset: asset
            });

        } catch (error) {
            console.error('Error processing asset:', asset.id, error);
        }
    }

    return processedAssets;
}

async function getElementProperties(documentUrn, externalId) {
    try {
        // This would call the Model Derivative API to get element properties
        // For now, return null as this requires additional setup
        return null;
    } catch (error) {
        console.error('Error getting element properties:', error);
        return null;
    }
}

function extractDimensions(elementData) {
    if (!elementData) return null;

    // Extract dimensions from element properties
    // This would parse the actual Revit element data
    return null;
}

function generateMockAssets() {
    const types = ['beam', 'column', 'wall', 'doubletee', 'slab'];
    const designs = ['D-101', 'D-102', 'D-103', 'D-201', 'D-202', null];
    const assets = [];

    for (let i = 0; i < 20; i++) {
        const type = types[Math.floor(Math.random() * types.length)];
        const design = designs[Math.floor(Math.random() * designs.length)];

        assets.push({
            id: `asset-${i + 1}`,
            attributes: {
                displayName: `${type.toUpperCase()}-${String(i + 1).padStart(3, '0')}`,
                pieceType: type,
                DESIGN_NUMBER: design,
                length: PIECE_CONFIGS[type].defaultLength + (Math.random() * 10 - 5),
                width: PIECE_CONFIGS[type].defaultWidth,
                height: PIECE_CONFIGS[type].defaultHeight,
                weight: Math.round(Math.random() * 5000 + 1000),
                status: 'Ready for Production'
            }
        });
    }

    return assets;
}

function updateDesignFilter() {
    const designFilter = document.getElementById('designFilter');
    const designs = new Set();

    availableAssets.forEach(asset => {
        if (asset.attributes.DESIGN_NUMBER) {
            designs.add(asset.attributes.DESIGN_NUMBER);
        }
    });

    designFilter.innerHTML = '<option value="">All Designs</option>';
    Array.from(designs).sort().forEach(design => {
        const option = document.createElement('option');
        option.value = design;
        option.textContent = design;
        designFilter.appendChild(option);
    });
}

function displayAssets(assets) {
    const assetsList = document.getElementById('assetsList');
    assetsList.innerHTML = '';

    if (assets.length === 0) {
        assetsList.innerHTML = '<div class="no-assets">No assets available</div>';
        return;
    }

    assets.forEach(asset => {
        const assetCard = createAssetCard(asset);
        assetsList.appendChild(assetCard);
    });
}

function createAssetCard(asset) {
    const card = document.createElement('div');
    card.className = 'asset-card';
    card.draggable = true;
    card.dataset.assetId = asset.id;

    const isPlaced = placedPieces.some(p => p.assetId === asset.id);
    if (isPlaced) {
        card.classList.add('placed');
    }

    card.innerHTML = `
        <div class="asset-header">
            <span class="asset-name">${asset.attributes.displayName}</span>
        </div>
        <div class="asset-type ${asset.attributes.pieceType}">${asset.attributes.pieceType.toUpperCase()}</div>
        <div class="asset-details">
            <div class="detail-item">
                <span class="detail-label">Design:</span>
                <span class="detail-value">${asset.attributes.DESIGN_NUMBER || 'None'}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Dimensions:</span>
                <span class="detail-value">${asset.attributes.length.toFixed(1)}'×${asset.attributes.width.toFixed(1)}'×${asset.attributes.height.toFixed(1)}'</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Weight:</span>
                <span class="detail-value">${asset.attributes.weight} lbs</span>
            </div>
        </div>
    `;

    // Add drag event listeners
    card.addEventListener('dragstart', (e) => handleDragStart(e, asset));
    card.addEventListener('dragend', handleDragEnd);

    return card;
}

function handleDragStart(event, asset) {
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('assetData', JSON.stringify(asset));
    event.target.classList.add('dragging');
}

function handleDragEnd(event) {
    event.target.classList.remove('dragging');
}

function handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
}

function handleDrop(event) {
    event.preventDefault();

    if (!currentBed) {
        alert('Please select a bed first');
        return;
    }

    try {
        const assetData = JSON.parse(event.dataTransfer.getData('assetData'));

        // Check if already placed
        if (placedPieces.some(p => p.assetId === assetData.id)) {
            alert('This piece is already placed on the bed');
            return;
        }

        // Add piece to bed at drop position
        const rect = event.target.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        addPieceToBedAtPosition(assetData, x, y);

    } catch (error) {
        console.error('Error handling drop:', error);
    }
}

// Piece Placement
function addPieceToBed(asset) {
    if (!currentBed) {
        alert('Please select a bed first');
        return;
    }

    // Check if already placed
    if (placedPieces.some(p => p.assetId === asset.id)) {
        alert('This piece is already placed on the bed');
        return;
    }

    const bedConfig = BED_CONFIGS[currentBed];
    const position = findAvailablePosition(asset, bedConfig);

    addPieceToBedAtPosition(asset, position.x, position.z);
}

function addPieceToBedAtPosition(asset, dropX, dropZ) {
    const bedConfig = BED_CONFIGS[currentBed];

    // Create piece visualization with actual dimensions
    const geometry = new THREE.BoxGeometry(
        asset.attributes.length,
        asset.attributes.height,
        asset.attributes.width
    );

    // Add edge geometry for better visibility
    const edges = new THREE.EdgesGeometry(geometry);
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
    const edgeLines = new THREE.LineSegments(edges, edgeMaterial);

    // Create material based on piece type
    const pieceConfig = PIECE_CONFIGS[asset.attributes.pieceType];
    const material = new THREE.MeshPhongMaterial({
        color: pieceConfig.color,
        specular: 0x111111,
        shininess: 30,
        opacity: 0.9,
        transparent: true
    });

    const pieceMesh = new THREE.Mesh(geometry, material);

    // Position on bed
    const yPosition = bedConfig.height + asset.attributes.height / 2;

    // Convert drop coordinates to world position
    let position;
    if (dropX !== undefined && dropZ !== undefined) {
        // Use raycaster to find exact position on bed
        raycaster.setFromCamera(new THREE.Vector2(dropX, dropZ), camera);

        // Get the bed box mesh (first child of bedMesh group)
        const bedBox = bedMesh ? bedMesh.children[0] : null;
        const intersects = bedBox ? raycaster.intersectObject(bedBox) : [];

        if (intersects.length > 0) {
            position = {
                x: intersects[0].point.x,
                y: yPosition,
                z: intersects[0].point.z
            };
        } else {
            position = findAvailablePosition(asset, bedConfig);
            position.y = yPosition;
        }
    } else {
        position = findAvailablePosition(asset, bedConfig);
        position.y = yPosition;
    }

    pieceMesh.position.set(position.x, position.y, position.z);

    // Add metadata
    pieceMesh.userData = {
        assetId: asset.id,
        asset: asset,
        dimensions: {
            length: asset.attributes.length,
            width: asset.attributes.width,
            height: asset.attributes.height
        },
        rotation: 0,
        flipped: false
    };

    pieceMesh.castShadow = true;
    pieceMesh.receiveShadow = true;

    // Create group for piece and edges
    const pieceGroup = new THREE.Group();
    pieceGroup.add(pieceMesh);
    pieceGroup.add(edgeLines);
    pieceGroup.userData = pieceMesh.userData;

    scene.add(pieceGroup);
    pieceMeshes.set(asset.id, pieceGroup);

    // Add to placed pieces
    placedPieces.push({
        assetId: asset.id,
        asset: asset,
        position: { x: position.x, y: 0, z: position.z },
        rotation: 0,
        flipped: false,
        designNumber: asset.attributes.DESIGN_NUMBER
    });

    // Validate placement
    validatePiecePlacement(pieceGroup);

    // Update UI
    updatePieceCount();
    refreshAssetsList();

    // Show strand pattern if enabled
    if (showStrandPattern) {
        addStrandPattern(pieceGroup, asset);
    }

    // Select the newly placed piece
    selectPiece(pieceGroup);
}

// Piece Manipulation Functions
function rotateSelectedPiece(degrees) {
    if (!selectedPiece) {
        alert('Please select a piece first');
        return;
    }

    const radians = THREE.MathUtils.degToRad(degrees);
    selectedPiece.rotation.y += radians;

    // Update stored rotation
    const piece = placedPieces.find(p => p.assetId === selectedPiece.userData.assetId);
    if (piece) {
        piece.rotation = THREE.MathUtils.radToDeg(selectedPiece.rotation.y) % 360;
    }

    // Revalidate placement
    validatePiecePlacement(selectedPiece);
}

function flipSelectedPiece() {
    if (!selectedPiece) {
        alert('Please select a piece first');
        return;
    }

    // Flip around the Z axis
    selectedPiece.scale.z *= -1;

    // Update stored flip state
    const piece = placedPieces.find(p => p.assetId === selectedPiece.userData.assetId);
    if (piece) {
        piece.flipped = !piece.flipped;
    }

    selectedPiece.userData.flipped = !selectedPiece.userData.flipped;

    // Revalidate placement
    validatePiecePlacement(selectedPiece);
}

function deleteSelectedPiece() {
    if (!selectedPiece) {
        alert('Please select a piece first');
        return;
    }

    removePiece(selectedPiece.userData.assetId);
    selectedPiece = null;
}

function selectPiece(pieceGroup) {
    // Deselect previous piece
    if (selectedPiece) {
        const prevMesh = selectedPiece.children[0];
        if (prevMesh && prevMesh.material) {
            prevMesh.material.emissive = new THREE.Color(0x000000);
        }
    }

    selectedPiece = pieceGroup;

    // Highlight selected piece
    const mesh = pieceGroup.children[0];
    if (mesh && mesh.material) {
        mesh.material.emissive = new THREE.Color(0x444444);
    }
}

function findAvailablePosition(asset, bedConfig) {
    // Simple placement algorithm - find first available spot
    const spacing = 2; // 2 feet spacing between pieces
    let x = -bedConfig.length / 2 + asset.attributes.length / 2 + spacing;
    let z = 0;

    // Check for collisions with existing pieces
    for (const placed of placedPieces) {
        const placedAsset = placed.asset;
        const overlap = checkOverlap(
            { x: x, z: z, length: asset.attributes.length, width: asset.attributes.width },
            {
                x: placed.position.x, z: placed.position.z,
                length: placedAsset.attributes.length, width: placedAsset.attributes.width
            }
        );

        if (overlap) {
            x = placed.position.x + placedAsset.attributes.length / 2 + asset.attributes.length / 2 + spacing;

            // Check if it fits on bed
            if (x + asset.attributes.length / 2 > bedConfig.length / 2) {
                // Move to next row
                x = -bedConfig.length / 2 + asset.attributes.length / 2 + spacing;
                z += asset.attributes.width + spacing;
            }
        }
    }

    return { x: x, y: 0, z: z };
}

function checkOverlap(rect1, rect2) {
    const r1Left = rect1.x - rect1.length / 2;
    const r1Right = rect1.x + rect1.length / 2;
    const r1Top = rect1.z - rect1.width / 2;
    const r1Bottom = rect1.z + rect1.width / 2;

    const r2Left = rect2.x - rect2.length / 2;
    const r2Right = rect2.x + rect2.length / 2;
    const r2Top = rect2.z - rect2.width / 2;
    const r2Bottom = rect2.z + rect2.width / 2;

    return !(r1Left > r2Right || r1Right < r2Left || r1Top > r2Bottom || r1Bottom < r2Top);
}

// Validation
function validatePiecePlacement(pieceGroup) {
    if (!pieceGroup || !currentBed) return;

    const piece = placedPieces.find(p => p.assetId === pieceGroup.userData.assetId);
    if (!piece) return;

    const bedConfig = BED_CONFIGS[currentBed];
    const issues = [];

    // Check if piece is within bed boundaries
    const halfLength = bedConfig.length / 2;
    const halfWidth = bedConfig.width / 2;
    const pieceHalfLength = piece.asset.attributes.length / 2;
    const pieceHalfWidth = piece.asset.attributes.width / 2;

    if (piece.position.x - pieceHalfLength < -halfLength ||
        piece.position.x + pieceHalfLength > halfLength) {
        issues.push({ type: 'boundary', message: 'Piece extends beyond bed length' });
    }

    if (piece.position.z - pieceHalfWidth < -halfWidth ||
        piece.position.z + pieceHalfWidth > halfWidth) {
        issues.push({ type: 'boundary', message: 'Piece extends beyond bed width' });
    }

    // Check for overlaps with other pieces
    for (const other of placedPieces) {
        if (other.assetId === piece.assetId) continue;

        const overlap = checkOverlap(
            {
                x: piece.position.x, z: piece.position.z,
                length: piece.asset.attributes.length, width: piece.asset.attributes.width
            },
            {
                x: other.position.x, z: other.position.z,
                length: other.asset.attributes.length, width: other.asset.attributes.width
            }
        );

        if (overlap) {
            issues.push({ type: 'overlap', message: `Overlaps with ${other.asset.attributes.displayName}` });
        }
    }

    // Check design number compatibility
    if (piece.designNumber && currentSchedule && currentSchedule.designNumber) {
        if (piece.designNumber !== currentSchedule.designNumber) {
            issues.push({ type: 'design', message: `Design mismatch: ${piece.designNumber} vs ${currentSchedule.designNumber}` });
        }
    }

    // Update piece validation status
    piece.validationErrors = issues;

    // Update visual feedback
    const mesh = pieceGroup.children[0]; // Get the mesh from the group
    if (mesh && mesh.material) {
        if (issues.length > 0) {
            mesh.material.color = new THREE.Color(0xFF0000);
            mesh.material.emissive = new THREE.Color(0x440000);
        } else {
            const pieceConfig = PIECE_CONFIGS[piece.asset.attributes.pieceType];
            mesh.material.color = new THREE.Color(pieceConfig.color);
            mesh.material.emissive = selectedPiece === pieceGroup ? new THREE.Color(0x444444) : new THREE.Color(0x000000);
        }
    }

    // Update validation panel
    updateValidationPanel();
}

function updateValidationPanel() {
    const validationPanel = document.getElementById('validationPanel');
    const validationMessages = document.getElementById('validationMessages');

    // Collect all validation issues
    const allIssues = [];
    placedPieces.forEach(piece => {
        if (piece.validationErrors && piece.validationErrors.length > 0) {
            piece.validationErrors.forEach(error => {
                allIssues.push({
                    piece: piece.asset.attributes.displayName,
                    ...error
                });
            });
        }
    });

    if (allIssues.length > 0) {
        validationPanel.style.display = 'block';
        validationMessages.innerHTML = allIssues.map(issue => `
            <div class="validation-item ${issue.type}">
                <span class="validation-piece">${issue.piece}:</span>
                <span class="validation-message">${issue.message}</span>
            </div>
        `).join('');
    } else {
        validationPanel.style.display = 'none';
    }
}

// Strand Pattern Visualization
function addStrandPattern(pieceGroup, asset) {
    // Default strand pattern - will be replaced with actual design data later
    const strandSpacing = 2; // 2 feet spacing
    const strandDiameter = 0.5; // 0.5 inch diameter

    const length = asset.attributes.length;
    const width = asset.attributes.width;

    // Create strand lines
    const strandMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });

    pieceGroup.userData.strandLines = [];

    for (let i = -width / 2 + 1; i <= width / 2 - 1; i += strandSpacing) {
        const points = [];
        points.push(new THREE.Vector3(-length / 2 + 1, 0.1, i));
        points.push(new THREE.Vector3(length / 2 - 1, 0.1, i));

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, strandMaterial);

        line.position.copy(pieceGroup.position);
        line.position.y = pieceGroup.position.y + asset.attributes.height / 2 + 0.1;

        pieceGroup.userData.strandLines.push(line);
        scene.add(line);
    }
}

function toggleStrandPattern() {
    showStrandPattern = !showStrandPattern;

    pieceMeshes.forEach((group, assetId) => {
        if (showStrandPattern) {
            const piece = placedPieces.find(p => p.assetId === assetId);
            if (piece) {
                addStrandPattern(group, piece.asset);
            }
        } else {
            // Remove strand lines
            if (group.userData.strandLines) {
                group.userData.strandLines.forEach(line => {
                    scene.remove(line);
                });
                group.userData.strandLines = [];
            }
        }
    });
}

// Schedule Management
async function saveBedSchedule() {
    if (!currentBed || !projectId || placedPieces.length === 0) {
        alert('Please select a bed and place at least one piece before saving');
        return;
    }

    try {
        updateViewerStatus('Saving schedule...');

        const schedule = {
            bedId: currentBed,
            projectId: projectId,
            date: document.getElementById('dateSelect').value,
            dateScheduled: document.getElementById('dateScheduled').value,
            datePoured: document.getElementById('datePoured').value,
            pourStatus: document.getElementById('pourStatus').value,
            pieces: placedPieces.map(p => ({
                assetId: p.assetId,
                position: p.position,
                rotation: p.rotation,
                flipped: p.flipped,
                designNumber: p.designNumber
            }))
        };

        // Update ACC Assets with schedule data
        const updatePromises = [];

        for (const piece of placedPieces) {
            const customAttributes = {
                [CUSTOM_FIELD_MAPPINGS.DateScheduled]: schedule.dateScheduled,
                [CUSTOM_FIELD_MAPPINGS.DatePoured]: schedule.datePoured,
                [CUSTOM_FIELD_MAPPINGS.BedId]: currentBed,
                [CUSTOM_FIELD_MAPPINGS.PourStatus]: schedule.pourStatus,
                [CUSTOM_FIELD_MAPPINGS.BedPosition]: JSON.stringify({
                    x: piece.position.x,
                    y: piece.position.y,
                    z: piece.position.z
                }),
                [CUSTOM_FIELD_MAPPINGS.BedRotation]: piece.rotation
            };

            updatePromises.push(updateAssetCustomAttributes(piece.assetId, customAttributes));
        }

        await Promise.all(updatePromises);

        // Save to local storage as backup
        const scheduleKey = `schedule_${projectId}_${currentBed}_${schedule.date}`;
        localStorage.setItem(scheduleKey, JSON.stringify(schedule));

        updateViewerStatus('Schedule saved successfully');

        alert('Schedule saved successfully to ACC!');

    } catch (error) {
        console.error('Error saving schedule:', error);
        updateViewerStatus('Error saving schedule');
        alert('Failed to save schedule: ' + error.message);
    }
}

async function updateAssetCustomAttributes(assetId, customAttributes) {
    try {
        const updateUrl = `https://developer.api.autodesk.com/construction/assets/v1/projects/${projectId.replace('b.', '')}/assets/${assetId}`;

        const response = await fetch(updateUrl, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${forgeAccessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                customAttributes: customAttributes
            })
        });

        if (!response.ok) {
            throw new Error(`Failed to update asset ${assetId}`);
        }

        return response.json();

    } catch (error) {
        console.error('Error updating asset:', assetId, error);
        // Continue with other assets even if one fails
        return null;
    }
}

async function loadBedSchedule() {
    if (!currentBed || !projectId) return;

    try {
        updateViewerStatus('Loading schedule...');

        const date = document.getElementById('dateSelect').value;
        const scheduleKey = `schedule_${projectId}_${currentBed}_${date}`;
        const savedSchedule = localStorage.getItem(scheduleKey);

        if (savedSchedule) {
            currentSchedule = JSON.parse(savedSchedule);

            // Clear current pieces
            pieceMeshes.forEach(group => {
                if (group.userData.strandLines) {
                    group.userData.strandLines.forEach(line => scene.remove(line));
                }
                scene.remove(group);
            });
            pieceMeshes.clear();
            placedPieces = [];

            // Load pieces from schedule
            for (const pieceData of currentSchedule.pieces) {
                const asset = availableAssets.find(a => a.id === pieceData.assetId);
                if (asset) {
                    // Add piece at saved position
                    addPieceToBedAtPosition(asset, pieceData.position.x, pieceData.position.z);

                    // Update position, rotation, and flip state
                    const group = pieceMeshes.get(asset.id);
                    if (group) {
                        group.position.set(pieceData.position.x, group.position.y, pieceData.position.z);

                        if (pieceData.rotation) {
                            group.rotation.y = THREE.MathUtils.degToRad(pieceData.rotation);
                        }

                        if (pieceData.flipped) {
                            group.scale.z = -1;
                        }

                        const piece = placedPieces.find(p => p.assetId === asset.id);
                        if (piece) {
                            piece.position = pieceData.position;
                            piece.rotation = pieceData.rotation || 0;
                            piece.flipped = pieceData.flipped || false;
                        }
                    }
                }
            }

            // Update schedule fields
            if (currentSchedule.dateScheduled) {
                document.getElementById('dateScheduled').value = currentSchedule.dateScheduled;
            }
            if (currentSchedule.datePoured) {
                document.getElementById('datePoured').value = currentSchedule.datePoured;
            }
            if (currentSchedule.pourStatus) {
                document.getElementById('pourStatus').value = currentSchedule.pourStatus;
            }

            updateViewerStatus('Schedule loaded');
        } else {
            currentSchedule = null;
            updateViewerStatus('No schedule found');
        }

    } catch (error) {
        console.error('Error loading schedule:', error);
        updateViewerStatus('Error loading schedule');
    }
}

// UI Helper Functions
function updateViewerStatus(status) {
    const viewerStatus = document.getElementById('viewerStatus');
    if (viewerStatus) {
        viewerStatus.textContent = status;
    }
}

function updatePieceCount() {
    const pieceCount = document.getElementById('pieceCount');
    if (pieceCount) {
        pieceCount.textContent = placedPieces.length;
    }

    // Update current design number if all pieces have same design
    const designs = new Set(placedPieces.map(p => p.designNumber).filter(d => d));
    const currentDesignNumber = document.getElementById('currentDesignNumber');
    if (currentDesignNumber) {
        if (designs.size === 1) {
            currentDesignNumber.textContent = Array.from(designs)[0];
        } else if (designs.size > 1) {
            currentDesignNumber.textContent = 'Multiple';
        } else {
            currentDesignNumber.textContent = 'None';
        }
    }
}

function refreshAssetsList() {
    displayAssets(filterAssetsInternal());
}

function filterAssets() {
    const filtered = filterAssetsInternal();
    displayAssets(filtered);
}

function filterAssetsInternal() {
    const searchTerm = document.getElementById('assetSearch').value.toLowerCase();
    const designFilter = document.getElementById('designFilter').value;
    const typeFilter = document.getElementById('typeFilter').value;

    return availableAssets.filter(asset => {
        const matchesSearch = !searchTerm ||
            asset.attributes.displayName.toLowerCase().includes(searchTerm) ||
            (asset.attributes.DESIGN_NUMBER && asset.attributes.DESIGN_NUMBER.toLowerCase().includes(searchTerm));

        const matchesDesign = !designFilter || asset.attributes.DESIGN_NUMBER === designFilter;
        const matchesType = !typeFilter || asset.attributes.pieceType === typeFilter;

        return matchesSearch && matchesDesign && matchesType;
    });
}

function clearAssetsList() {
    const assetsList = document.getElementById('assetsList');
    assetsList.innerHTML = '<div class="no-assets">Select a project to view assets</div>';
}

function showPieceDetails(assetId) {
    const piece = placedPieces.find(p => p.assetId === assetId);
    if (!piece) return;

    const modal = document.getElementById('pieceDetailsModal');
    const content = document.getElementById('pieceDetailsContent');

    content.innerHTML = `
        <div class="piece-details">
            <h4>${piece.asset.attributes.displayName}</h4>
            <div class="detail-grid">
                <div class="detail-row">
                    <label>Type:</label>
                    <span>${piece.asset.attributes.pieceType}</span>
                </div>
                <div class="detail-row">
                    <label>Design Number:</label>
                    <span>${piece.asset.attributes.DESIGN_NUMBER || 'None'}</span>
                </div>
                <div class="detail-row">
                    <label>Dimensions:</label>
                    <span>${piece.asset.attributes.length}' × ${piece.asset.attributes.width}' × ${piece.asset.attributes.height}'</span>
                </div>
                <div class="detail-row">
                    <label>Weight:</label>
                    <span>${piece.asset.attributes.weight} lbs</span>
                </div>
                <div class="detail-row">
                    <label>Position X:</label>
                    <input type="number" id="pieceX" value="${piece.position.x.toFixed(2)}" step="0.1">
                </div>
                <div class="detail-row">
                    <label>Position Z:</label>
                    <input type="number" id="pieceZ" value="${piece.position.z.toFixed(2)}" step="0.1">
                </div>
                <div class="detail-row">
                    <label>Rotation:</label>
                    <input type="number" id="pieceRotation" value="${piece.rotation || 0}" step="15" min="0" max="360">
                </div>
                ${piece.validationErrors && piece.validationErrors.length > 0 ? `
                    <div class="detail-row validation-errors">
                        <label>Issues:</label>
                        <div>${piece.validationErrors.map(e => e.message).join('<br>')}</div>
                    </div>
                ` : ''}
            </div>
        </div>
    `;

    modal.classList.add('active');
    modal.dataset.assetId = assetId;
}

function closePieceDetails() {
    const modal = document.getElementById('pieceDetailsModal');
    modal.classList.remove('active');
    delete modal.dataset.assetId;
}

function savePieceChanges() {
    const modal = document.getElementById('pieceDetailsModal');
    const assetId = modal.dataset.assetId;
    if (!assetId) return;

    const piece = placedPieces.find(p => p.assetId === assetId);
    const group = pieceMeshes.get(assetId);

    if (piece && group) {
        const newX = parseFloat(document.getElementById('pieceX').value);
        const newZ = parseFloat(document.getElementById('pieceZ').value);
        const newRotation = parseFloat(document.getElementById('pieceRotation').value);

        // Update position
        piece.position.x = newX;
        piece.position.z = newZ;
        piece.rotation = newRotation;

        group.position.x = newX;
        group.position.z = newZ;
        group.rotation.y = THREE.MathUtils.degToRad(newRotation);

        // Update strand pattern positions if visible
        if (group.userData.strandLines) {
            group.userData.strandLines.forEach(line => {
                line.position.x = newX;
                line.position.z = newZ;
                line.rotation.y = group.rotation.y;
            });
        }

        // Revalidate
        validatePiecePlacement(group);
    }

    closePieceDetails();
}

// View Controls
function resetCamera() {
    if (!currentBed) return;

    const bedConfig = BED_CONFIGS[currentBed];
    const distance = Math.max(bedConfig.length, bedConfig.width) * 1.5;

    camera.position.set(distance, distance, distance);
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.update();
}

function toggleGrid() {
    gridHelper.visible = !gridHelper.visible;
}

function toggleViewMode() {
    // Toggle between 3D and top-down view
    if (camera.position.y > camera.position.x) {
        // Switch to 3D view
        resetCamera();
    } else {
        // Switch to top-down view
        const bedConfig = BED_CONFIGS[currentBed] || { length: 100, width: 50 };
        const distance = Math.max(bedConfig.length, bedConfig.width) * 1.2;

        camera.position.set(0, distance, 0.1);
        camera.lookAt(0, 0, 0);
        controls.target.set(0, 0, 0);
        controls.update();
    }
}

function handleKeyPress(event) {
    if (selectedPiece && event.key === 'Delete') {
        removePiece(selectedPiece.userData.assetId);
    }
}

function removePiece(assetId) {
    const pieceGroup = pieceMeshes.get(assetId);
    if (pieceGroup) {
        // Remove strand pattern if exists
        if (pieceGroup.userData.strandLines) {
            pieceGroup.userData.strandLines.forEach(line => scene.remove(line));
        }

        // Remove the group and all its children
        scene.remove(pieceGroup);
        pieceMeshes.delete(assetId);

        const index = placedPieces.findIndex(p => p.assetId === assetId);
        if (index > -1) {
            placedPieces.splice(index, 1);
        }

        updatePieceCount();
        refreshAssetsList();
        updateValidationPanel();
    }
}

function onDateChange() {
    if (currentBed) {
        loadBedSchedule();
    }
}

function updateScheduleStatus() {
    // This will be called when schedule dates/status are changed
    // Could trigger auto-save or mark as dirty
}

// Auth Helper Functions
function updateAuthStatus(title, message) {
    const authTitle = document.getElementById('authTitle');
    const authMessage = document.getElementById('authMessage');

    if (authTitle) authTitle.textContent = title;
    if (authMessage) authMessage.textContent = message;
}

function showAuthError(message) {
    updateAuthStatus('Error', message);
    const authProcessing = document.getElementById('authProcessing');
    if (authProcessing) {
        authProcessing.innerHTML = `
            <div class="auth-processing-content">
                <div style="color: #dc2626; font-size: 2rem; margin-bottom: 1rem;">⚠️</div>
                <h3 style="color: #dc2626;">Error</h3>
                <p style="color: #6b7280; margin-bottom: 1.5rem;">${message}</p>
                <button onclick="window.location.href='index.html'" style="background: #059669; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; cursor: pointer; font-size: 0.875rem;">
                    Back to Dashboard
                </button>
            </div>
        `;
    }
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

// Utility Functions
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function () {
    console.log('Production Scheduling module loaded');
    initializeApp();
});