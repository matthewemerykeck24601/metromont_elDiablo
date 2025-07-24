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
let availableAssets = [];
let placedPieces = [];
let validationIssues = [];

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
        const intersects = raycaster.intersectObjects(Array.from(pieceMeshes.values()));

        // Reset all piece materials
        pieceMeshes.forEach((mesh, assetId) => {
            const piece = placedPieces.find(p => p.assetId === assetId);
            if (piece && !piece.validationErrors) {
                mesh.material.emissive = new THREE.Color(0x000000);
            }
        });

        // Highlight hovered piece
        if (intersects.length > 0) {
            const hoveredMesh = intersects[0].object;
            if (hoveredMesh.userData.assetId) {
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
    const intersects = raycaster.intersectObjects(Array.from(pieceMeshes.values()));

    if (intersects.length > 0) {
        const clickedMesh = intersects[0].object;
        if (clickedMesh.userData.assetId) {
            selectedPiece = clickedMesh;
            isDragging = true;
            controls.enabled = false;

            // Store initial position
            selectedPiece.userData.startPosition = selectedPiece.position.clone();
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

        selectedPiece = null;
    }
}

function onDoubleClick(event) {
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(Array.from(pieceMeshes.values()));

    if (intersects.length > 0) {
        const clickedMesh = intersects[0].object;
        if (clickedMesh.userData.assetId) {
            showPieceDetails(clickedMesh.userData.assetId);
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

    bedMesh = new THREE.Mesh(geometry, material);
    bedMesh.position.y = config.height / 2;
    bedMesh.receiveShadow = true;
    bedMesh.userData.type = 'bed';

    scene.add(bedMesh);

    // Add bed outline
    const edges = new THREE.EdgesGeometry(geometry);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000 }));
    line.position.copy(bedMesh.position);
    scene.add(line);

    // Reset camera
    resetCamera();
}

function clearViewer() {
    // Remove bed
    if (bedMesh) {
        scene.remove(bedMesh);
        bedMesh = null;
    }

    // Remove all pieces
    pieceMeshes.forEach(mesh => {
        scene.remove(mesh);
    });
    pieceMeshes.clear();
    placedPieces = [];
}

// Asset Management
async function onProjectChange() {
    const projectSelect = document.getElementById('projectSelect');
    projectId = projectSelect.value;

    if (!projectId) {
        clearAssetsList();
        return;
    }

    // Load ACC Assets for this project
    await loadProjectAssets();
}

async function loadProjectAssets() {
    try {
        updateViewerStatus('Loading ACC Assets...');

        // Mock assets for now - replace with actual ACC API call
        availableAssets = generateMockAssets();

        // Populate design filter
        updateDesignFilter();

        // Display assets
        displayAssets(availableAssets);

        updateViewerStatus('Ready');

    } catch (error) {
        console.error('Error loading assets:', error);
        updateViewerStatus('Error loading assets');
    }
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
            <span class="asset-type ${asset.attributes.pieceType}">${asset.attributes.pieceType}</span>
        </div>
        <div class="asset-details">
            <div class="detail-item">
                <span class="detail-label">Design:</span>
                <span class="detail-value">${asset.attributes.DESIGN_NUMBER || 'None'}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Dimensions:</span>
                <span class="detail-value">${asset.attributes.length}'×${asset.attributes.width}'×${asset.attributes.height}'</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Weight:</span>
                <span class="detail-value">${asset.attributes.weight} lbs</span>
            </div>
        </div>
        ${isPlaced ? '<div class="asset-status">Placed on bed</div>' : ''}
    `;

    // Add drag event listeners
    card.addEventListener('dragstart', (e) => handleDragStart(e, asset));
    card.addEventListener('click', () => {
        if (!isPlaced && currentBed) {
            addPieceToBed(asset);
        }
    });

    return card;
}

function handleDragStart(event, asset) {
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('assetId', asset.id);
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

    // Create piece visualization
    const pieceConfig = PIECE_CONFIGS[asset.attributes.pieceType];
    const geometry = new THREE.BoxGeometry(
        asset.attributes.length,
        asset.attributes.height,
        asset.attributes.width
    );

    const material = new THREE.MeshPhongMaterial({
        color: pieceConfig.color,
        specular: 0x111111,
        shininess: 30
    });

    const pieceMesh = new THREE.Mesh(geometry, material);

    // Position on bed
    const bedConfig = BED_CONFIGS[currentBed];
    const yPosition = bedConfig.height + asset.attributes.height / 2;

    // Find available position
    const position = findAvailablePosition(asset, bedConfig);
    pieceMesh.position.set(position.x, yPosition, position.z);

    // Add metadata
    pieceMesh.userData = {
        assetId: asset.id,
        asset: asset,
        dimensions: {
            length: asset.attributes.length,
            width: asset.attributes.width,
            height: asset.attributes.height
        }
    };

    pieceMesh.castShadow = true;
    pieceMesh.receiveShadow = true;

    scene.add(pieceMesh);
    pieceMeshes.set(asset.id, pieceMesh);

    // Add to placed pieces
    placedPieces.push({
        assetId: asset.id,
        asset: asset,
        position: position,
        rotation: 0,
        designNumber: asset.attributes.DESIGN_NUMBER
    });

    // Validate placement
    validatePiecePlacement(pieceMesh);

    // Update UI
    updatePieceCount();
    refreshAssetsList();

    // Show strand pattern if enabled
    if (showStrandPattern) {
        addStrandPattern(pieceMesh, asset);
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
function validatePiecePlacement(pieceMesh) {
    if (!pieceMesh || !currentBed) return;

    const piece = placedPieces.find(p => p.assetId === pieceMesh.userData.assetId);
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

    // Check if piece is skewed (not aligned with bed)
    // For now, we assume all pieces are aligned

    // Update piece validation status
    piece.validationErrors = issues;

    // Update visual feedback
    if (issues.length > 0) {
        pieceMesh.material.color = new THREE.Color(0xFF0000);
        pieceMesh.material.emissive = new THREE.Color(0x440000);
    } else {
        const pieceConfig = PIECE_CONFIGS[piece.asset.attributes.pieceType];
        pieceMesh.material.color = new THREE.Color(pieceConfig.color);
        pieceMesh.material.emissive = new THREE.Color(0x000000);
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
function addStrandPattern(pieceMesh, asset) {
    // Default strand pattern - will be replaced with actual design data later
    const strandSpacing = 2; // 2 feet spacing
    const strandDiameter = 0.5; // 0.5 inch diameter

    const length = asset.attributes.length;
    const width = asset.attributes.width;

    // Create strand lines
    const strandMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });

    for (let i = -width / 2 + 1; i <= width / 2 - 1; i += strandSpacing) {
        const points = [];
        points.push(new THREE.Vector3(-length / 2 + 1, 0.1, i));
        points.push(new THREE.Vector3(length / 2 - 1, 0.1, i));

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, strandMaterial);

        line.position.copy(pieceMesh.position);
        line.position.y = pieceMesh.position.y + asset.attributes.height / 2 + 0.1;

        pieceMesh.userData.strandLines = pieceMesh.userData.strandLines || [];
        pieceMesh.userData.strandLines.push(line);

        scene.add(line);
    }
}

function toggleStrandPattern() {
    showStrandPattern = !showStrandPattern;

    pieceMeshes.forEach((mesh, assetId) => {
        if (showStrandPattern) {
            const piece = placedPieces.find(p => p.assetId === assetId);
            if (piece) {
                addStrandPattern(mesh, piece.asset);
            }
        } else {
            // Remove strand lines
            if (mesh.userData.strandLines) {
                mesh.userData.strandLines.forEach(line => {
                    scene.remove(line);
                });
                mesh.userData.strandLines = [];
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
                designNumber: p.designNumber
            }))
        };

        // Update ACC Assets with schedule data
        for (const piece of placedPieces) {
            await updateAssetScheduleData(piece.assetId, {
                DateScheduled: schedule.dateScheduled,
                DatePoured: schedule.datePoured,
                BedId: currentBed,
                PourStatus: schedule.pourStatus
            });
        }

        // Save to local storage for now
        const scheduleKey = `schedule_${projectId}_${currentBed}_${schedule.date}`;
        localStorage.setItem(scheduleKey, JSON.stringify(schedule));

        updateViewerStatus('Schedule saved successfully');

        alert('Schedule saved successfully!');

    } catch (error) {
        console.error('Error saving schedule:', error);
        updateViewerStatus('Error saving schedule');
        alert('Failed to save schedule: ' + error.message);
    }
}

async function updateAssetScheduleData(assetId, scheduleData) {
    // This would update the ACC Asset custom attributes
    // For now, we'll simulate this
    console.log('Updating asset:', assetId, 'with schedule data:', scheduleData);

    // In production, this would be:
    // await updateACCAssetAttributes(assetId, scheduleData);
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
            pieceMeshes.forEach(mesh => scene.remove(mesh));
            pieceMeshes.clear();
            placedPieces = [];

            // Load pieces from schedule
            for (const pieceData of currentSchedule.pieces) {
                const asset = availableAssets.find(a => a.id === pieceData.assetId);
                if (asset) {
                    addPieceToBed(asset);

                    // Update position if different
                    const mesh = pieceMeshes.get(asset.id);
                    if (mesh && pieceData.position) {
                        mesh.position.set(pieceData.position.x, mesh.position.y, pieceData.position.z);

                        const piece = placedPieces.find(p => p.assetId === asset.id);
                        if (piece) {
                            piece.position = pieceData.position;
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
    const mesh = pieceMeshes.get(assetId);

    if (piece && mesh) {
        const newX = parseFloat(document.getElementById('pieceX').value);
        const newZ = parseFloat(document.getElementById('pieceZ').value);
        const newRotation = parseFloat(document.getElementById('pieceRotation').value);

        // Update position
        piece.position.x = newX;
        piece.position.z = newZ;
        piece.rotation = newRotation;

        mesh.position.x = newX;
        mesh.position.z = newZ;
        mesh.rotation.y = THREE.MathUtils.degToRad(newRotation);

        // Revalidate
        validatePiecePlacement(mesh);
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
    const mesh = pieceMeshes.get(assetId);
    if (mesh) {
        // Remove strand pattern if exists
        if (mesh.userData.strandLines) {
            mesh.userData.strandLines.forEach(line => scene.remove(line));
        }

        scene.remove(mesh);
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