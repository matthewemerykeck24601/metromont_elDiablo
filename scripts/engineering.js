// Engineering & Drafting Module
// Updated to use the same authentication and project loading method as QC Bed Report

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
        width: "13' 2\"",
        length: "240'",
        strandLength: "260'",
        pullingBlockCapacity: "24-1/2 33k",
        supportedProducts: ["WP", "SPA", "ARCH"],
        type: "flatbed"
    },
    "FB #4": {
        name: "FB #4",
        surface: "STEEL",
        width: "13' 5\"", 
        length: "250'",
        strandLength: "270'",
        pullingBlockCapacity: "28-1/2 33k",
        supportedProducts: ["WP", "ARCH", "MW"],
        type: "flatbed"
    },
    "FB #5": {
        name: "FB #5",
        surface: "STEEL",
        width: "13' 1\"",
        length: "250'", 
        strandLength: "270'",
        supportedProducts: ["WP", "SPA", "ARCH"],
        type: "flatbed"
    },
    "FB #6": {
        name: "FB #6",
        surface: "STEEL",
        width: "13' 1-1/2\"",
        length: "200'",
        strandLength: "220'",
        supportedProducts: ["WP", "ARCH"],
        type: "flatbed"
    },
    "FB #7": {
        name: "FB #7",
        surface: "FIBERGLASS",
        width: "14' 9-3/4\"",
        length: "190'",
        strandLength: "210'",
        supportedProducts: ["ARCH"],
        type: "flatbed"
    },
    "COLUMN": {
        name: "COLUMN",
        surface: "STEEL",
        width: "6' 8\"",
        length: "180'",
        strandLength: "200'",
        supportedProducts: ["COL"],
        type: "column"
    },
    "BEAMS": {
        name: "BEAMS",
        surface: "STEEL",
        width: "24\"",
        length: "230'",
        strandLength: "250'",
        supportedProducts: ["BMS"],
        type: "beam"
    },
    "DK #1": {
        name: "DK #1",
        surface: "FIBERGLASS",
        width: "16'",
        length: "44'",
        supportedProducts: ["SW"],
        type: "deck"
    },
    "DK #2": {
        name: "DK #2", 
        surface: "STEEL",
        width: "14'",
        length: "100'",
        supportedProducts: ["SW"],
        type: "deck"
    },
    "PC BED #1": {
        name: "PC BED #1",
        surface: "FIBERGLASS",
        width: "16'",
        length: "44'",
        supportedProducts: ["ARCH"],
        type: "pcbed"
    },
    "PC BED #2": {
        name: "PC BED #2",
        surface: "FIBERGLASS", 
        width: "16'",
        length: "44'",
        supportedProducts: ["ARCH"],
        type: "pcbed"
    },
    "PC BED #3": {
        name: "PC BED #3",
        surface: "FIBERGLASS",
        width: "16'",
        length: "88'",
        supportedProducts: ["ARCH"],
        type: "pcbed"
    }
};

// Product Type Definitions
const PRODUCT_TYPES = {
    "MDK": "Mega Double Tees",
    "WP": "Wall Panels", 
    "ARCH": "Architectural",
    "BMS": "Beams",
    "COL": "Columns",
    "SPA": "Spandrels",
    "MW": "Modular Walls",
    "SW": "Structural Walls",
    "FS": "Floor Slabs"
};

// UI Elements
const authIndicator = document.getElementById('authIndicator');
const authStatus = document.getElementById('authStatus');
const authInfo = document.getElementById('authInfo');

// Authentication Flow - Following QC Bed Report pattern exactly
async function initializeApp() {
    try {
        console.log('=== ENGINEERING MODULE INITIALIZATION ===');
        updateAuthStatus('Checking authentication...', 'Verifying your login status...');

        // Try to get authentication from parent window first (same as QC Bed Report)
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
        const accountName = globalHubData ? globalHubData.accountInfo.name : 'ACC Account';

        updateAuthStatus('Connected', `${accountName} - ${projectCount} projects`);
        updateAuthInfo('Engineering tools ready');

        // Update UI indicators
        if (authIndicator) {
            authIndicator.classList.add('authenticated');
        }

        // Initialize the project dropdown with pre-loaded data
        populateProjectDropdown();

        console.log('✅ Engineering module ready with pre-loaded data');

    } catch (error) {
        console.error('Authentication completion failed:', error);
        showAuthError('Failed to load project data: ' + error.message);
    }
}

// Load pre-loaded hub data - SAME method as QC Bed Report and Production Scheduling
async function loadPreLoadedHubData() {
    try {
        // Try to get hub data from parent window first
        if (!globalHubData && window.opener && window.opener.CastLinkAuth) {
            globalHubData = window.opener.CastLinkAuth.getHubData();
        }

        // If not available, try to load from session storage using the CORRECT key
        if (!globalHubData) {
            const storedHubData = sessionStorage.getItem('castlink_hub_data');
            if (storedHubData) {
                try {
                    globalHubData = JSON.parse(storedHubData);
                    console.log('✅ Loaded hub data from session storage');
                } catch (parseError) {
                    console.error('Error parsing stored hub data:', parseError);
                }
            }
        }

        if (!globalHubData) {
            throw new Error('No hub data available. Please authenticate through the main app.');
        }

        console.log(`✅ Hub data loaded with ${globalHubData.projects?.length || 0} projects`);

    } catch (error) {
        console.error('Error loading pre-loaded hub data:', error);
        throw error;
    }
}

// UI Update Functions
function updateAuthStatus(status, info = '') {
    if (authStatus) {
        authStatus.textContent = status;
    }
    if (info && authInfo) {
        authInfo.textContent = info;
    }
}

function updateAuthInfo(message) {
    if (authInfo) {
        authInfo.textContent = message;
    }
}

function showAuthError(message) {
    updateAuthStatus('Authentication Error', message);
    
    if (authIndicator) {
        authIndicator.classList.add('error');
    }

    // Create error notification
    showNotification('Authentication failed: ' + message, 'error');
}

// Token Management Functions (same as QC Bed Report)
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
    return timeUntilExpiry < (5 * 60 * 1000); // 5 minute buffer
}

function clearStoredToken() {
    sessionStorage.removeItem('forge_token');
    localStorage.removeItem('forge_token_backup');
    console.log('Token cleared');
}

async function verifyToken(token) {
    try {
        const response = await fetch('https://developer.api.autodesk.com/project/v1/hubs', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return response.ok;
    } catch (error) {
        console.error('Token verification failed:', error);
        return false;
    }
}

// Project Management Functions
function populateProjectDropdown() {
    try {
        const projectSelect = document.getElementById('projectSelect');
        if (!projectSelect) {
            console.error('Project select element not found');
            return;
        }

        if (!globalHubData || !globalHubData.projects) {
            console.error('No project data available');
            projectSelect.innerHTML = '<option value="">No projects available</option>';
            return;
        }

        const accountName = globalHubData.accountInfo ? globalHubData.accountInfo.name : 'ACC Account';
        projectSelect.innerHTML = `<option value="">Select a project from ${accountName}...</option>`;

        // Populate with pre-loaded projects (same data as QC Bed Report)
        globalHubData.projects.forEach((project) => {
            const option = document.createElement('option');
            option.value = project.id;
            option.textContent = `${project.name}${project.number && project.number !== 'N/A' ? ' (' + project.number + ')' : ''}`;
            option.dataset.projectData = JSON.stringify(project);
            projectSelect.appendChild(option);
        });

        projectSelect.disabled = false;
        console.log(`✅ Populated project dropdown with ${globalHubData.projects.length} projects`);

    } catch (error) {
        console.error('Error populating project dropdown:', error);
        showNotification('Failed to load projects', 'error');
    }
}

function onProjectChange() {
    const projectSelect = document.getElementById('projectSelect');
    const projectInfo = document.getElementById('projectInfo');
    const projectName = document.getElementById('projectName');
    const projectDetails = document.getElementById('projectDetails');

    if (!projectSelect.value) {
        // No project selected
        if (projectName) projectName.textContent = 'No project selected';
        if (projectDetails) projectDetails.textContent = 'Select a project to view design requirements';
        selectedProject = null;
        selectedProjectData = null;
        updateProjectFilterInfo();
        return;
    }

    try {
        const selectedOption = projectSelect.selectedOptions[0];
        if (selectedOption && selectedOption.dataset.projectData) {
            selectedProjectData = JSON.parse(selectedOption.dataset.projectData);
            selectedProject = selectedProjectData.id;
            
            // Update project info display
            if (projectName) {
                projectName.textContent = selectedProjectData.displayName || selectedProjectData.name;
            }
            if (projectDetails) {
                projectDetails.textContent = `${selectedProjectData.location || 'Location not specified'} • ${selectedProjectData.status || 'Active'}`;
            }

            // Update filter information for engineering cards
            updateProjectFilterInfo();

            console.log('✅ Project selected:', selectedProjectData.name);
            showNotification(`Project selected: ${selectedProjectData.name}`, 'success');
        }
    } catch (error) {
        console.error('Error handling project change:', error);
        showNotification('Error selecting project', 'error');
    }
}

function updateProjectFilterInfo() {
    // Update filter information on engineering cards
    const filterElements = [
        'calcProjectFilter',
        'designProjectFilter', 
        'bomProjectFilter'
    ];

    filterElements.forEach(elementId => {
        const element = document.getElementById(elementId);
        if (element) {
            const filterLabel = element.querySelector('.filter-label');
            if (filterLabel) {
                if (selectedProject) {
                    filterLabel.textContent = `Data scoped to project: ${selectedProjectData.displayName || selectedProjectData.name}`;
                } else {
                    filterLabel.textContent = getDefaultFilterText(elementId);
                }
            }
        }
    });
}

function getDefaultFilterText(elementId) {
    const defaultTexts = {
        'calcProjectFilter': 'Project-specific calculations available when project is selected',
        'designProjectFilter': 'Design summaries filtered by project requirements and specifications',
        'bomProjectFilter': 'BOM data scoped to selected project materials and specifications'
    };
    return defaultTexts[elementId] || 'Project-specific data available when project is selected';
}

// Engineering Tool Functions
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
    showNotification('Opening Engineering Calculator...', 'info');
    // TODO: Implement calculator modal/page
    console.log('Calculator tool opened for project:', selectedProject);
}

function openDesignSummary() {
    showNotification('Opening Design Summary Generator...', 'info');
    // TODO: Implement design summary tool
    console.log('Design summary tool opened for project:', selectedProject);
}

function openPieceIssue() {
    showNotification('Opening Piece Issue Management...', 'info');
    // TODO: Implement piece issue tracker
    console.log('Piece issue tool opened for project:', selectedProject);
}

function openBOMQuery() {
    showNotification('Opening BOM Query Tool...', 'info');
    // TODO: Implement BOM query interface
    console.log('BOM query tool opened for project:', selectedProject);
}

// Quick Action Functions
function createNewCalculation() {
    if (!selectedProject) {
        showNotification('Please select a project first', 'warning');
        return;
    }
    openCalculator();
}

function generateReport() {
    if (!selectedProject) {
        showNotification('Please select a project first', 'warning');
        return;
    }
    showNotification('Report generation coming soon...', 'info');
}

function syncWithACC() {
    if (!selectedProject) {
        showNotification('Please select a project first', 'warning');
        return;
    }
    showNotification('Syncing with ACC...', 'info');
    // TODO: Implement ACC sync functionality
}

function viewRecentItems() {
    showNotification('Recent items view coming soon...', 'info');
    // TODO: Implement recent items viewer
}

// Utility Functions
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

// Navigation Functions
function goBack() {
    window.location.href = 'index.html';
}

// Notification System
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

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeApp);