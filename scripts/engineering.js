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
let currentProject = null;
let selectedProjectData = null;

// Engineering Tool Configurations
const ENGINEERING_TOOLS = {
    calculator: {
        name: 'Engineering Calculator',
        description: 'Precast design calculations & analysis',
        projectDependent: true,
        features: ['Stress Analysis', 'Load Calculations', 'Prestress Design', 'Code Compliance']
    },
    'design-summary': {
        name: 'Engineering Design Summaries',
        description: 'Technical documentation & reports',
        projectDependent: true,
        features: ['Design Reports', 'Spec Sheets', 'ACC Integration', 'Auto-Generation']
    },
    'piece-issue': {
        name: 'Piece Issue Management',
        description: 'Track & resolve production issues',
        projectDependent: true,
        features: ['Issue Tracking', 'Resolution Workflow', 'Design Conflicts', 'Quality Alerts']
    },
    'bom-query': {
        name: 'BOM Query System',
        description: 'Bill of materials analysis & reporting',
        projectDependent: true,
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

        // Load projects into dropdown
        if (globalHubData && globalHubData.projects) {
            loadProjectOptions();
        }

        updateAuthStatus('Connected', 'Engineering module ready');
        initializeEventListeners();
        
    } catch (error) {
        console.error('Error loading initial data:', error);
        updateAuthStatus('Error', 'Failed to load project data');
    }
}

// Load project options into dropdown
function loadProjectOptions() {
    const projectSelect = document.getElementById('projectSelect');
    if (!projectSelect || !globalHubData || !globalHubData.projects) return;

    // Clear existing options
    projectSelect.innerHTML = '<option value="">Select a project...</option>';

    // Add projects
    globalHubData.projects.forEach(project => {
        const option = document.createElement('option');
        option.value = project.id;
        option.textContent = `${project.number} - ${project.projectName}`;
        projectSelect.appendChild(option);
    });

    console.log(`Loaded ${globalHubData.projects.length} projects into dropdown`);
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

// Project Management Functions
function onProjectChange() {
    const projectSelect = document.getElementById('projectSelect');
    const projectId = projectSelect.value;

    if (projectId && globalHubData && globalHubData.projects) {
        const project = globalHubData.projects.find(p => p.id === projectId);
        if (project) {
            currentProject = projectId;
            selectedProjectData = project;
            updateProjectInfo();
            updateProjectFilterInfo();
            console.log('Project selected:', projectId, selectedProjectData);
        }
    } else {
        currentProject = null;
        selectedProjectData = null;
        updateProjectInfo();
        clearProjectFilterInfo();
    }
}

function updateProjectInfo() {
    const projectName = document.getElementById('projectName');
    const projectDetails = document.getElementById('projectDetails');

    if (selectedProjectData) {
        if (projectName) {
            projectName.textContent = `${selectedProjectData.number} - ${selectedProjectData.projectName}`;
        }
        if (projectDetails) {
            projectDetails.textContent = `${selectedProjectData.location || 'Location TBD'} • ${selectedProjectData.status || 'Active'}`;
        }
    } else {
        if (projectName) projectName.textContent = 'No project selected';
        if (projectDetails) projectDetails.textContent = 'Select a project to view design requirements';
    }
}

function updateProjectFilterInfo() {
    if (!selectedProjectData) return;

    const projectInfo = `${selectedProjectData.number} - ${selectedProjectData.projectName}`;
    
    // Update calculator filter info
    const calcFilter = document.getElementById('calcProjectFilter');
    if (calcFilter) {
        calcFilter.innerHTML = `<span class="filter-label">Calculations available for: ${projectInfo}</span>`;
    }

    // Update design summary filter info
    const designFilter = document.getElementById('designProjectFilter');
    if (designFilter) {
        designFilter.innerHTML = `<span class="filter-label">Design summaries filtered for: ${projectInfo}</span>`;
    }

    // Update issue filter info
    const issueFilter = document.getElementById('issueProjectFilter');
    if (issueFilter) {
        issueFilter.innerHTML = `<span class="filter-label">Issues filtered for project: ${projectInfo}</span>`;
    }

    // Update BOM filter info
    const bomFilter = document.getElementById('bomProjectFilter');
    if (bomFilter) {
        bomFilter.innerHTML = `<span class="filter-label">BOM data for project: ${projectInfo}</span>`;
    }
}

function clearProjectFilterInfo() {
    const filters = ['calcProjectFilter', 'designProjectFilter', 'issueProjectFilter', 'bomProjectFilter'];
    filters.forEach(filterId => {
        const element = document.getElementById(filterId);
        if (element) {
            element.innerHTML = `<span class="filter-label">Project-specific filtering available when project is selected</span>`;
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
    if (!currentProject) {
        showNotification('Please select a project first');
        return;
    }
    showNotification(`Creating new calculation for ${selectedProjectData.number} - ${selectedProjectData.projectName} - Coming Soon!`);
}

function generateReport() {
    if (!currentProject) {
        showNotification('Please select a project first');
        return;
    }
    showNotification(`Generating report for ${selectedProjectData.number} - ${selectedProjectData.projectName} - Coming Soon!`);
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

// Initialize the app on page load
document.addEventListener('DOMContentLoaded', initializeApp);