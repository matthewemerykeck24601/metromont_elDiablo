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
let isThreeJSInitialized = false;

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
            try {
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
        showAuthError('Initialization failed: ' + error.message);
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

        // Initialize UI and Three.js
        initializeUI();
        await initializeThreeJS();

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
            try {
                globalHubData = window.opener.CastLinkAuth.getHubData();
            } catch (error) {
                console.warn('Failed to get hub data from parent:', error);
            }
        }

        // If not available, try to load from session storage
        if (!globalHubData) {
            const storedHubData = sessionStorage.getItem('castlink_hub_data');
            if (storedHubData) {
                try {
                    globalHubData = JSON.parse(storedHubData);
                } catch (error) {
                    console.warn('Failed to parse stored hub data:', error);
                }
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

    // Add project change listener
    const projectSelect = document.getElementById('projectSelect');
    if (projectSelect) {
        projectSelect.addEventListener('change', onProjectChange);
    }
}

// Three.js Initialization
async function initializeThreeJS() {
    try {
        const container = document.getElementById('threejsContainer');
        if (!container) {
            console.error('Three.js container not found');
            return;
        }

        // Check if Three.js is available
        if (typeof THREE === 'undefined') {
            throw new Error('Three.js library not loaded');
        }

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

        // Controls (using our custom implementation)
        if (THREE.OrbitControls) {
            controls = new THREE.OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.05;
            controls.minDistance = 10;
            controls.maxDistance = 500;
            controls.maxPolarAngle = Math.PI / 2;
        } else {
            console.warn('OrbitControls not available, using basic mouse controls');
        }

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
        directionalLight.shadow.camera.near = 0.1;
        directionalLight.shadow.camera.far = 200;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        scene.add(directionalLight);

        // Raycaster for mouse interaction
        raycaster = new THREE.Raycaster();
        mouse = new THREE.Vector2();

        // Event listeners
        renderer.domElement.addEventListener('click', onMouseClick);
        renderer.domElement.addEventListener('mousemove', onMouseMove);
        window.addEventListener('resize', onWindowResize);

        // Start render loop
        animate();

        isThreeJSInitialized = true;
        console.log('Three.js initialized successfully');

    } catch (error) {
        console.error('Three.js initialization failed:', error);
        showThreeJSError(error.message);
    }
}

function showThreeJSError(message) {
    const container = document.getElementById('threejsContainer');
    if (container) {
        container.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; height: 100%; background: #f8f9fa; color: #6c757d; flex-direction: column; gap: 1rem;">
                <svg width="48" height="48" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
                <div style="text-align: center;">
                    <div style="font-weight: 600; margin-bottom: 0.5rem;">3D Viewer Error</div>
                    <div style="font-size: 0.875rem;">${message}</div>
                </div>
            </div>
        `;
    }
}

function animate() {
    requestAnimationFrame(animate);

    if (controls && controls.update) {
        controls.update();
    }

    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}

function onWindowResize() {
    if (!camera || !renderer) return;

    const container = document.getElementById('threejsContainer');
    if (!container) return;

    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

function onMouseClick(event) {
    if (!isThreeJSInitialized) return;

    const container = document.getElementById('threejsContainer');
    const rect = container.getBoundingClientRect();

    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // Get all piece meshes
    const meshes = Array.from(pieceMeshes.values()).flat();
    const intersects = raycaster.intersectObjects(meshes, true);

    if (intersects.length > 0) {
        const intersectedObject = intersects[0].object;
        const group = intersectedObject.parent;

        if (group && group.userData && group.userData.assetId) {
            selectPiece(group.userData.assetId);
        }
    } else {
        deselectPiece();
    }
}

function onMouseMove(event) {
    // Update mouse position for raycasting
    if (!isThreeJSInitialized) return;

    const container = document.getElementById('threejsContainer');
    const rect = container.getBoundingClientRect();

    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

// Bed Management Functions
function onBedChange() {
    const bedSelect = document.getElementById('bedSelect');
    const bedId = bedSelect.value;

    if (bedId && BED_CONFIGS[bedId]) {
        currentBed = bedId;
        loadBed(bedId);
        loadBedSchedule();
        updateBedInfo();
        updateViewerInfo(`Bed: ${bedId}`);
    } else {
        currentBed = null;
        clearBed();
        updateBedInfo();
        updateViewerInfo('Select a bed to begin');
    }
}

function loadBed(bedId) {
    if (!isThreeJSInitialized || !scene) return;

    // Clear existing bed
    clearBed();

    const config = BED_CONFIGS[bedId];
    if (!config) return;

    // Create bed geometry
    const geometry = new THREE.BoxGeometry(config.length, config.height, config.width);
    const material = new THREE.MeshLambertMaterial({ color: config.color });
    bedMesh = new THREE.Mesh(geometry, material);
    bedMesh.position.y = -config.height / 2;
    bedMesh.receiveShadow = true;
    scene.add(bedMesh);

    // Create grid
    gridHelper = new THREE.GridHelper(Math.max(config.length, config.width) * 1.2, 20);
    gridHelper.material.opacity = 0.3;
    gridHelper.material.transparent = true;
    scene.add(gridHelper);

    // Fit camera to view bed
    fitToView();
}

function clearBed() {
    if (!scene) return;

    if (bedMesh) {
        scene.remove(bedMesh);
        bedMesh = null;
    }

    if (gridHelper) {
        scene.remove(gridHelper);
        gridHelper = null;
    }

    clearPieces();
}

function clearPieces() {
    if (!scene) return;

    pieceMeshes.forEach(group => {
        scene.remove(group);
    });
    pieceMeshes.clear();
    placedPieces = [];
    selectedPiece = null;
}

function updateBedInfo() {
    const bedType = document.getElementById('bedType');
    const bedLength = document.getElementById('bedLength');
    const bedWidth = document.getElementById('bedWidth');
    const bedUtilization = document.getElementById('bedUtilization');
    const pieceCount = document.getElementById('pieceCount');

    if (currentBed && BED_CONFIGS[currentBed]) {
        const config = BED_CONFIGS[currentBed];
        if (bedType) bedType.textContent = config.type.charAt(0).toUpperCase() + config.type.slice(1);
        if (bedLength) bedLength.textContent = `${config.length}ft`;
        if (bedWidth) bedWidth.textContent = `${config.width}ft`;

        // Calculate utilization
        const utilization = calculateBedUtilization();
        if (bedUtilization) bedUtilization.textContent = `${Math.round(utilization)}%`;

        if (pieceCount) pieceCount.textContent = placedPieces.length;
    } else {
        if (bedType) bedType.textContent = 'Select a bed';
        if (bedLength) bedLength.textContent = '-';
        if (bedWidth) bedWidth.textContent = '-';
        if (bedUtilization) bedUtilization.textContent = '0%';
        if (pieceCount) pieceCount.textContent = '0';
    }
}

function calculateBedUtilization() {
    if (!currentBed || !BED_CONFIGS[currentBed]) return 0;

    const bedConfig = BED_CONFIGS[currentBed];
    const bedArea = bedConfig.length * bedConfig.width;

    let usedArea = 0;
    placedPieces.forEach(piece => {
        usedArea += piece.dimensions.length * piece.dimensions.width;
    });

    return (usedArea / bedArea) * 100;
}

function updateViewerInfo(text) {
    const viewerInfo = document.getElementById('viewerInfo');
    if (viewerInfo) {
        viewerInfo.textContent = text;
    }
}

// Project Management
function onProjectChange() {
    const projectSelect = document.getElementById('projectSelect');
    const selectedOption = projectSelect.selectedOptions[0];

    if (selectedOption && selectedOption.dataset.projectData) {
        try {
            const projectData = JSON.parse(selectedOption.dataset.projectData);
            projectId = projectData.id;
            loadProjectAssets(projectData);
        } catch (error) {
            console.error('Error parsing project data:', error);
        }
    }
}

async function loadProjectAssets(project) {
    try {
        updateAuthStatus('Loading Assets...', `Loading assets from ${project.name}...`);

        // Simulate loading assets - replace with actual API calls
        const mockAssets = generateMockAssets();
        availableAssets = mockAssets;

        populateModelFilter();
        refreshAssetsList();

    } catch (error) {
        console.error('Error loading project assets:', error);
        showAuthError('Failed to load project assets: ' + error.message);
    }
}

function generateMockAssets() {
    const assets = [];
    const types = ['beam', 'column', 'wall', 'doubletee', 'slab'];

    for (let i = 1; i <= 20; i++) {
        const type = types[Math.floor(Math.random() * types.length)];
        const config = PIECE_CONFIGS[type];

        assets.push({
            id: `asset_${i}`,
            name: `${type.toUpperCase()}-${String(i).padStart(3, '0')}`,
            type: type,
            mark: `MK-${String(i).padStart(3, '0')}`,
            dimensions: {
                length: config.defaultLength + (Math.random() - 0.5) * 10,
                width: config.defaultWidth + (Math.random() - 0.5) * 2,
                height: config.defaultHeight + (Math.random() - 0.5) * 2
            },
            weight: Math.round((config.defaultLength * config.defaultWidth * config.defaultHeight) * 150),
            designNumber: `DT-${String(Math.floor(Math.random() * 5) + 1).padStart(3, '0')}`,
            model: `Model_${Math.floor(Math.random() * 3) + 1}`
        });
    }

    return assets;
}

function populateModelFilter() {
    const modelFilter = document.getElementById('modelFilter');
    if (!modelFilter) return;

    const models = [...new Set(availableAssets.map(asset => asset.model))];
    modelFilter.innerHTML = '<option value="">Select Model...</option>';

    models.forEach(model => {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        modelFilter.appendChild(option);
    });
}

function refreshAssetsList() {
    const assetsGrid = document.getElementById('assetsGrid');
    if (!assetsGrid) return;

    if (availableAssets.length === 0) {
        assetsGrid.innerHTML = '<div class="no-assets">No assets available</div>';
        return;
    }

    // Apply filters
    const searchTerm = document.getElementById('assetSearch')?.value.toLowerCase() || '';
    const typeFilter = document.getElementById('typeFilter')?.value || '';
    const modelFilter = document.getElementById('modelFilter')?.value || '';

    let filteredAssets = availableAssets.filter(asset => {
        const matchesSearch = !searchTerm ||
            asset.name.toLowerCase().includes(searchTerm) ||
            asset.mark.toLowerCase().includes(searchTerm);
        const matchesType = !typeFilter || asset.type === typeFilter;
        const matchesModel = !modelFilter || asset.model === modelFilter;

        return matchesSearch && matchesType && matchesModel;
    });

    // Generate HTML
    assetsGrid.innerHTML = filteredAssets.map(asset => `
        <div class="asset-card" data-asset-id="${asset.id}" onclick="addPieceToScene('${asset.id}')">
            <div class="asset-header">
                <div class="asset-name">${asset.name}</div>
                <div class="asset-type ${asset.type}">${asset.type}</div>
            </div>
            <div class="asset-details">
                <div class="detail-item">
                    <span class="detail-label">Mark:</span>
                    <span class="detail-value">${asset.mark}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Length:</span>
                    <span class="detail-value">${Math.round(asset.dimensions.length)}'</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Width:</span>
                    <span class="detail-value">${Math.round(asset.dimensions.width)}'</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Height:</span>
                    <span class="detail-value">${Math.round(asset.dimensions.height)}'</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Weight:</span>
                    <span class="detail-value">${asset.weight} lbs</span>
                </div>
            </div>
        </div>
    `).join('');
}

function filterAssets() {
    refreshAssetsList();
}

// Piece Management
function addPieceToScene(assetId) {
    if (!isThreeJSInitialized || !scene || !currentBed) {
        alert('Please select a bed first');
        return;
    }

    const asset = availableAssets.find(a => a.id === assetId);
    if (!asset) return;

    // Check if piece already placed
    if (placedPieces.find(p => p.assetId === assetId)) {
        alert('This piece is already placed on the bed');
        return;
    }

    // Create piece geometry
    const geometry = new THREE.BoxGeometry(
        asset.dimensions.length,
        asset.dimensions.height,
        asset.dimensions.width
    );

    const config = PIECE_CONFIGS[asset.type];
    const material = new THREE.MeshLambertMaterial({ color: config.color });
    const mesh = new THREE.Mesh(geometry, material);

    // Create group for the piece
    const group = new THREE.Group();
    group.add(mesh);
    group.userData = { assetId: assetId, asset: asset };

    // Position piece
    group.position.x = (Math.random() - 0.5) * 50;
    group.position.y = asset.dimensions.height / 2;
    group.position.z = (Math.random() - 0.5) * 50;

    mesh.castShadow = true;
    mesh.receiveShadow = true;

    scene.add(group);
    pieceMeshes.set(assetId, group);

    // Add to placed pieces
    placedPieces.push({
        assetId: assetId,
        asset: asset,
        position: {
            x: group.position.x,
            y: group.position.y,
            z: group.position.z
        },
        rotation: 0,
        dimensions: asset.dimensions
    });

    updateBedInfo();
    validatePiecePlacement();
    updateValidationPanel();
}

function selectPiece(assetId) {
    // Deselect previous piece
    if (selectedPiece) {
        const prevGroup = pieceMeshes.get(selectedPiece);
        if (prevGroup) {
            prevGroup.children[0].material.emissive.setHex(0x000000);
        }
    }

    selectedPiece = assetId;
    const group = pieceMeshes.get(assetId);
    if (group) {
        group.children[0].material.emissive.setHex(0x444444);
        showPieceDetails(assetId);
    }
}

function deselectPiece() {
    if (selectedPiece) {
        const group = pieceMeshes.get(selectedPiece);
        if (group) {
            group.children[0].material.emissive.setHex(0x000000);
        }
        selectedPiece = null;
    }
}

function validatePiecePlacement() {
    validationIssues = [];

    if (!currentBed || !BED_CONFIGS[currentBed]) return;

    const bedConfig = BED_CONFIGS[currentBed];
    const bedBounds = {
        minX: -bedConfig.length / 2,
        maxX: bedConfig.length / 2,
        minZ: -bedConfig.width / 2,
        maxZ: bedConfig.width / 2
    };

    placedPieces.forEach(piece => {
        // Check bed boundaries
        const halfLength = piece.dimensions.length / 2;
        const halfWidth = piece.dimensions.width / 2;

        if (piece.position.x - halfLength < bedBounds.minX ||
            piece.position.x + halfLength > bedBounds.maxX ||
            piece.position.z - halfWidth < bedBounds.minZ ||
            piece.position.z + halfWidth > bedBounds.maxZ) {

            validationIssues.push({
                type: 'boundary',
                message: `${piece.asset.name} extends beyond bed boundaries`,
                assetId: piece.assetId
            });
        }

        // Check overlaps with other pieces
        placedPieces.forEach(otherPiece => {
            if (piece.assetId !== otherPiece.assetId) {
                if (checkPieceOverlap(piece, otherPiece)) {
                    validationIssues.push({
                        type: 'overlap',
                        message: `${piece.asset.name} overlaps with ${otherPiece.asset.name}`,
                        assetId: piece.assetId
                    });
                }
            }
        });
    });
}

function checkPieceOverlap(piece1, piece2) {
    const p1 = piece1.position;
    const p2 = piece2.position;
    const d1 = piece1.dimensions;
    const d2 = piece2.dimensions;

    return (Math.abs(p1.x - p2.x) < (d1.length + d2.length) / 2) &&
        (Math.abs(p1.z - p2.z) < (d1.width + d2.width) / 2);
}

function updateValidationPanel() {
    const validationMessages = document.getElementById('validationMessages');
    if (!validationMessages) return;

    if (validationIssues.length === 0) {
        validationMessages.innerHTML = '<div class="loading-message">No issues detected</div>';
        return;
    }

    validationMessages.innerHTML = validationIssues.map(issue => `
        <div class="validation-item ${issue.type}">
            <div class="validation-piece">${issue.assetId}</div>
            <div>${issue.message}</div>
        </div>
    `).join('');
}

// Viewer Controls
function resetCamera() {
    if (!camera || !controls) return;

    camera.position.set(100, 100, 100);
    camera.lookAt(0, 0, 0);

    if (controls.reset) {
        controls.reset();
    }
}

function fitToView() {
    if (!camera || !currentBed) return;

    const config = BED_CONFIGS[currentBed];
    const maxDimension = Math.max(config.length, config.width);
    const distance = maxDimension * 1.5;

    camera.position.set(distance, distance * 0.8, distance);
    camera.lookAt(0, 0, 0);
}

function toggleWireframe() {
    pieceMeshes.forEach(group => {
        group.children.forEach(mesh => {
            if (mesh.material) {
                mesh.material.wireframe = !mesh.material.wireframe;
            }
        });
    });
}

function toggleStrandPattern() {
    showStrandPattern = !showStrandPattern;
    // Implementation for strand pattern visualization
    console.log('Strand pattern toggle:', showStrandPattern);
}

// Schedule Management
async function saveSchedule() {
    try {
        if (!currentBed) {
            alert('Please select a bed first');
            return;
        }

        const scheduleData = {
            bedId: currentBed,
            dateScheduled: document.getElementById('dateSelect')?.value,
            datePoured: document.getElementById('datePoured')?.value,
            status: document.getElementById('statusSelect')?.value,
            pourStatus: document.getElementById('pourStatus')?.value,
            designNumber: document.getElementById('designNumber')?.value,
            pieces: placedPieces.length,
            placedPieces: placedPieces,
            validationIssues: validationIssues
        };

        console.log('Saving schedule:', scheduleData);

        // Here you would save to your backend/ACC
        // For now, just show success message
        alert('Schedule saved successfully!');

    } catch (error) {
        console.error('Error saving schedule:', error);
        alert('Failed to save schedule: ' + error.message);
    }
}

function loadBedSchedule() {
    // Load existing schedule for the selected bed and date
    console.log('Loading bed schedule for:', currentBed, document.getElementById('dateSelect')?.value);
}

function toggleView() {
    // Toggle between different view modes
    console.log('Toggling view mode');
}

// Piece Details Modal
function showPieceDetails(assetId) {
    const modal = document.getElementById('pieceDetailsModal');
    const content = document.getElementById('pieceDetailsContent');

    const piece = placedPieces.find(p => p.assetId === assetId);
    if (!piece) return;

    content.innerHTML = `
        <div class="piece-details">
            <h4>${piece.asset.name}</h4>
            <div class="detail-grid">
                <div class="detail-row">
                    <label>Mark:</label>
                    <span>${piece.asset.mark}</span>
                </div>
                <div class="detail-row">
                    <label>Type:</label>
                    <span>${piece.asset.type}</span>
                </div>
                <div class="detail-row">
                    <label>X Position:</label>
                    <input type="number" id="pieceX" value="${Math.round(piece.position.x * 100) / 100}" step="0.1" />
                </div>
                <div class="detail-row">
                    <label>Z Position:</label>
                    <input type="number" id="pieceZ" value="${Math.round(piece.position.z * 100) / 100}" step="0.1" />
                </div>
                <div class="detail-row">
                    <label>Rotation:</label>
                    <input type="number" id="pieceRotation" value="${piece.rotation || 0}" step="1" min="0" max="360" />
                </div>
                <div class="detail-row">
                    <label>Length:</label>
                    <span>${Math.round(piece.dimensions.length)}'</span>
                </div>
                <div class="detail-row">
                    <label>Width:</label>
                    <span>${Math.round(piece.dimensions.width)}'</span>
                </div>
                <div class="detail-row">
                    <label>Height:</label>
                    <span>${Math.round(piece.dimensions.height)}'</span>
                </div>
                <div class="detail-row">
                    <label>Weight:</label>
                    <span>${piece.asset.weight} lbs</span>
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
        validatePiecePlacement();
        updateBedInfo();
        refreshAssetsList();
        updateValidationPanel();
        closePieceDetails();
    }
}

// Event Handlers
function onDateChange() {
    if (currentBed) {
        loadBedSchedule();
    }
}

function updateScheduleStatus() {
    // This will be called when schedule dates/status are changed
    // Could trigger auto-save or mark as dirty
}

function handleKeyPress(event) {
    if (event.key === 'Delete' && selectedPiece) {
        // Remove selected piece
        const group = pieceMeshes.get(selectedPiece);
        if (group) {
            scene.remove(group);
            pieceMeshes.delete(selectedPiece);
            placedPieces = placedPieces.filter(p => p.assetId !== selectedPiece);
            selectedPiece = null;
            updateBedInfo();
            validatePiecePlacement();
            updateValidationPanel();
        }
    }
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