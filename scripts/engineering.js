// Engineering Module JavaScript
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
let currentBed = null;
let selectedBedData = null;

// Bed Configurations - Enhanced with production capabilities
const BED_CONFIGS = {
    beam: { 
        length: 500, 
        width: 10, 
        height: 0.5, 
        type: 'beam', 
        color: 0x8B4513,
        capacity: 'Long Structural Elements',
        suitableFor: ['beam', 'girder', 'spandrel'],
        maxLength: 500,
        maxWidth: 10,
        maxWeight: 50000,
        description: 'Designed for casting long structural beams, girders, and spandrel elements'
    },
    deck1: { 
        length: 400, 
        width: 15, 
        height: 0.5, 
        type: 'deck', 
        color: 0x696969,
        capacity: 'Double Tees & Slabs',
        suitableFor: ['doubletee', 'slab', 'deck'],
        maxLength: 400,
        maxWidth: 15,
        maxWeight: 35000,
        description: 'Optimized for double tee and slab production'
    },
    deck2: { 
        length: 400, 
        width: 15, 
        height: 0.5, 
        type: 'deck', 
        color: 0x696969,
        capacity: 'Double Tees & Slabs',
        suitableFor: ['doubletee', 'slab', 'deck'],
        maxLength: 400,
        maxWidth: 15,
        maxWeight: 35000,
        description: 'Optimized for double tee and slab production'
    },
    flatbed1: { 
        length: 300, 
        width: 12, 
        height: 0.5, 
        type: 'flat', 
        color: 0x708090,
        capacity: 'Wall Panels & Columns',
        suitableFor: ['wall', 'column', 'panel'],
        maxLength: 300,
        maxWidth: 12,
        maxWeight: 25000,
        description: 'Ideal for wall panels and column casting'
    },
    flatbed2: { 
        length: 300, 
        width: 12, 
        height: 0.5, 
        type: 'flat', 
        color: 0x708090,
        capacity: 'Wall Panels & Columns',
        suitableFor: ['wall', 'column', 'panel'],
        maxLength: 300,
        maxWidth: 12,
        maxWeight: 25000,
        description: 'Ideal for wall panels and column casting'
    },
    flatbed3: { 
        length: 300, 
        width: 12, 
        height: 0.5, 
        type: 'flat', 
        color: 0x708090,
        capacity: 'Specialty Elements',
        suitableFor: ['specialty', 'custom', 'mixed'],
        maxLength: 300,
        maxWidth: 12,
        maxWeight: 25000,
        description: 'Flexible bed for specialty and custom elements'
    },
    flatbed4: { 
        length: 300, 
        width: 12, 
        height: 0.5, 
        type: 'flat', 
        color: 0x708090,
        capacity: 'Wall Panels',
        suitableFor: ['wall', 'panel'],
        maxLength: 300,
        maxWidth: 12,
        maxWeight: 25000,
        description: 'Dedicated to wall panel production'
    },
    flatbed5: { 
        length: 300, 
        width: 12, 
        height: 0.5, 
        type: 'flat', 
        color: 0x708090,
        capacity: 'Wall Panels',
        suitableFor: ['wall', 'panel'],
        maxLength: 300,
        maxWidth: 12,
        maxWeight: 25000,
        description: 'Dedicated to wall panel production'
    },
    flatbed6: { 
        length: 300, 
        width: 12, 
        height: 0.5, 
        type: 'flat', 
        color: 0x708090,
        capacity: 'Columns & Beams',
        suitableFor: ['column', 'beam', 'structural'],
        maxLength: 300,
        maxWidth: 12,
        maxWeight: 25000,
        description: 'Optimized for columns and structural beams'
    },
    flatbed7: { 
        length: 300, 
        width: 12, 
        height: 0.5, 
        type: 'flat', 
        color: 0x708090,
        capacity: 'Mixed Elements',
        suitableFor: ['mixed', 'various', 'custom'],
        maxLength: 300,
        maxWidth: 12,
        maxWeight: 25000,
        description: 'Versatile bed for various element types'
    }
};

// Engineering Tool Configurations
const ENGINEERING_TOOLS = {
    calculator: {
        name: 'Engineering Calculator',
        description: 'Precast design calculations & analysis',
        bedDependent: true,
        features: ['Stress Analysis', 'Load Calculations', 'Prestress Design', 'Code Compliance']
    },
    'design-summary': {
        name: 'Engineering Design Summaries',
        description: 'Technical documentation & reports',
        bedDependent: true,
        features: ['Design Reports', 'Spec Sheets', 'ACC Integration', 'Auto-Generation']
    },
    'piece-issue': {
        name: 'Piece Issue Management',
        description: 'Track & resolve production issues',
        bedDependent: true,
        features: ['Issue Tracking', 'Resolution Workflow', 'Design Conflicts', 'Quality Alerts']
    },
    'bom-query': {
        name: 'BOM Query System',
        description: 'Bill of materials analysis & reporting',
        bedDependent: true,
        features: ['Material Takeoffs', 'Cost Analysis', 'Inventory Sync', 'Procurement']
    }
};

// Initialize Application
async function initializeApp() {
    try {
        updateAuthStatus('Initializing...', 'Setting up engineering module...');

        // Check for parent window auth
        if (window.opener && window.opener.CastLinkAuth) {
            const parentAuth = window.opener.CastLinkAuth;
            const parentIsAuth = await parentAuth.waitForAuth();
            
            if (parentIsAuth) {
                forgeAccessToken = parentAuth.getToken();
                globalHubData = parentAuth.getHubData();
                isAuthenticated = true;
                updateAuthStatus('Authenticated', 'Connected to ACC');
                
                console.log('Engineering module authenticated via parent window');
                await loadInitialData();
                return;
            }
        }

        // Check stored token
        const storedToken = getStoredToken();
        if (storedToken && !isTokenExpired(storedToken)) {
            forgeAccessToken = storedToken.access_token;
            updateAuthStatus('Authenticated', 'Using stored credentials');
            isAuthenticated = true;
            await loadInitialData();
            return;
        }

        // If no valid token, redirect to login
        updateAuthStatus('Authentication Required', 'Redirecting to login...');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 2000);

    } catch (error) {
        console.error('Error initializing engineering module:', error);
        updateAuthStatus('Error', 'Authentication failed');
    }
}

// Load initial data after authentication
async function loadInitialData() {
    try {
        // Load hub data if not available
        if (!globalHubData) {
            const hubData = sessionStorage.getItem('castlink_hub_data');
            if (hubData) {
                globalHubData = JSON.parse(hubData);
            }
        }

        updateAuthStatus('Connected', 'Engineering module ready');
        initializeEventListeners();
        
    } catch (error) {
        console.error('Error loading initial data:', error);
        updateAuthStatus('Error', 'Failed to load project data');
    }
}

// Initialize event listeners
function initializeEventListeners() {
    // Bed selection event listener is already set in HTML via onchange
    console.log('Engineering module initialized successfully');
}

// Authentication helper functions
function updateAuthStatus(status, info) {
    const statusElement = document.getElementById('authStatus');
    const infoElement = document.getElementById('authInfo');
    const indicator = document.getElementById('authIndicator');

    if (statusElement) statusElement.textContent = status;
    if (infoElement) infoElement.textContent = info;

    if (indicator) {
        indicator.className = 'status-indicator';
        if (status === 'Authenticated' || status === 'Connected') {
            indicator.classList.add('authenticated');
        } else if (status === 'Error') {
            indicator.classList.add('error');
        }
    }
}

function getStoredToken() {
    const sessionToken = sessionStorage.getItem('forge_token');
    const localToken = localStorage.getItem('forge_token_backup');
    return sessionToken ? JSON.parse(sessionToken) : (localToken ? JSON.parse(localToken) : null);
}

function isTokenExpired(tokenInfo) {
    const now = Date.now();
    const expiresAt = tokenInfo.expires_at;
    const timeUntilExpiry = expiresAt - now;
    return timeUntilExpiry < (5 * 60 * 1000);
}

// Navigation functions
function goBack() {
    if (window.opener) {
        window.close();
    } else {
        window.location.href = 'index.html';
    }
}

// Bed Management Functions
function onBedChange() {
    const bedSelect = document.getElementById('bedSelect');
    const bedId = bedSelect.value;

    if (bedId && BED_CONFIGS[bedId]) {
        currentBed = bedId;
        selectedBedData = BED_CONFIGS[bedId];
        updateBedInfo();
        updateBedFilterInfo();
        console.log('Bed selected:', bedId, selectedBedData);
    } else {
        currentBed = null;
        selectedBedData = null;
        updateBedInfo();
        clearBedFilterInfo();
    }
}

function updateBedInfo() {
    const bedType = document.getElementById('bedType');
    const bedCapacity = document.getElementById('bedCapacity');

    if (selectedBedData) {
        if (bedType) {
            bedType.textContent = `${selectedBedData.type.charAt(0).toUpperCase() + selectedBedData.type.slice(1)} Bed - ${selectedBedData.capacity}`;
        }
        if (bedCapacity) {
            bedCapacity.textContent = `${selectedBedData.description} (${selectedBedData.length}' x ${selectedBedData.width}')`;
        }
    } else {
        if (bedType) bedType.textContent = 'No bed selected';
        if (bedCapacity) bedCapacity.textContent = 'Select a bed to view capacity details';
    }
}

function updateBedFilterInfo() {
    if (!selectedBedData) return;

    const bedInfo = `${selectedBedData.capacity} - ${selectedBedData.suitableFor.join(', ')}`;
    
    // Update calculator filter info
    const calcFilter = document.getElementById('calcBedFilter');
    if (calcFilter) {
        calcFilter.innerHTML = `<span class="filter-label">Calculations available for: ${bedInfo}</span>`;
    }

    // Update design summary filter info
    const designFilter = document.getElementById('designBedFilter');
    if (designFilter) {
        designFilter.innerHTML = `<span class="filter-label">Design summaries filtered for: ${bedInfo}</span>`;
    }

    // Update issue filter info
    const issueFilter = document.getElementById('issueBedFilter');
    if (issueFilter) {
        issueFilter.innerHTML = `<span class="filter-label">Issues filtered for pieces suitable for: ${bedInfo}</span>`;
    }

    // Update BOM filter info
    const bomFilter = document.getElementById('bomBedFilter');
    if (bomFilter) {
        bomFilter.innerHTML = `<span class="filter-label">BOM data for bed capacity: ${selectedBedData.maxWeight} lbs, ${selectedBedData.maxLength}' x ${selectedBedData.maxWidth}'</span>`;
    }
}

function clearBedFilterInfo() {
    const filters = ['calcBedFilter', 'designBedFilter', 'issueBedFilter', 'bomBedFilter'];
    filters.forEach(filterId => {
        const element = document.getElementById(filterId);
        if (element) {
            element.innerHTML = `<span class="filter-label">Bed-specific filtering available when bed is selected</span>`;
        }
    });
}

// Engineering Tool Functions
function openEngineeringTool(toolType) {
    if (!isAuthenticated) {
        showNotification('Please wait for authentication to complete');
        return;
    }

    const tool = ENGINEERING_TOOLS[toolType];
    if (!tool) {
        showNotification('Engineering tool not found');
        return;
    }

    // Check if tool requires bed selection
    if (tool.bedDependent && !currentBed) {
        showNotification('Please select a production bed first');
        return;
    }

    showLoadingOverlay(`Loading ${tool.name}...`);

    // Simulate tool loading with bed-specific data
    setTimeout(() => {
        hideLoadingOverlay();
        
        switch (toolType) {
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
                showNotification('Tool coming soon!');
        }
    }, 1500);
}

function openCalculator() {
    const bedInfo = selectedBedData ? ` for ${selectedBedData.capacity}` : '';
    showNotification(`Engineering Calculator${bedInfo} - Coming Soon!`);
    console.log('Opening calculator with bed data:', selectedBedData);
}

function openDesignSummary() {
    const bedInfo = selectedBedData ? ` filtered for ${selectedBedData.capacity}` : '';
    showNotification(`Design Summaries${bedInfo} - Coming Soon!`);
    console.log('Opening design summary with bed data:', selectedBedData);
}

function openPieceIssue() {
    const bedInfo = selectedBedData ? ` for ${selectedBedData.capacity} pieces` : '';
    showNotification(`Piece Issue Management${bedInfo} - In Development!`);
    console.log('Opening piece issue tracker with bed data:', selectedBedData);
}

function openBOMQuery() {
    const bedInfo = selectedBedData ? ` scoped to ${selectedBedData.capacity}` : '';
    showNotification(`BOM Query System${bedInfo} - In Development!`);
    console.log('Opening BOM query with bed data:', selectedBedData);
}

// Quick Action Functions
function createNewCalculation() {
    if (!currentBed) {
        showNotification('Please select a production bed first');
        return;
    }
    showNotification(`Creating new calculation for ${selectedBedData.capacity} - Coming Soon!`);
}

function generateReport() {
    if (!currentBed) {
        showNotification('Please select a production bed first');
        return;
    }
    showNotification(`Generating report for ${selectedBedData.capacity} - Coming Soon!`);
}

function syncWithACC() {
    if (!isAuthenticated) {
        showNotification('Authentication required for ACC sync');
        return;
    }
    showLoadingOverlay('Syncing with ACC...');
    
    setTimeout(() => {
        hideLoadingOverlay();
        showNotification('ACC sync completed successfully!');
    }, 2000);
}

function viewRecentItems() {
    showNotification('Recent items view - Coming Soon!');
}

// Utility Functions
function showNotification(message) {
    const notification = document.getElementById('notification');
    const notificationText = document.getElementById('notificationText');

    if (notification && notificationText) {
        notificationText.textContent = message;
        notification.classList.add('show');

        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }
}

function showLoadingOverlay(message = 'Loading...') {
    const overlay = document.getElementById('loadingOverlay');
    const text = overlay.querySelector('p');
    
    if (overlay) {
        if (text) text.textContent = message;
        overlay.classList.add('show');
    }
}

function hideLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.remove('show');
    }
}

// Piece filtering functions based on bed selection
function getFilteredPiecesForBed(pieces, bedId) {
    if (!bedId || !BED_CONFIGS[bedId]) return pieces;
    
    const bedConfig = BED_CONFIGS[bedId];
    return pieces.filter(piece => {
        // Filter pieces that are suitable for the selected bed
        return bedConfig.suitableFor.includes(piece.type) &&
               piece.dimensions.length <= bedConfig.maxLength &&
               piece.dimensions.width <= bedConfig.maxWidth &&
               piece.weight <= bedConfig.maxWeight;
    });
}

// Export bed mapping functionality for use by other modules
window.EngineeringModule = {
    getBedConfig: (bedId) => BED_CONFIGS[bedId],
    getAllBedConfigs: () => BED_CONFIGS,
    getCurrentBed: () => currentBed,
    getSelectedBedData: () => selectedBedData,
    isAuthenticated: () => isAuthenticated,
    filterPiecesForBed: getFilteredPiecesForBed
};

// Initialize the app on page load
document.addEventListener('DOMContentLoaded', initializeApp);