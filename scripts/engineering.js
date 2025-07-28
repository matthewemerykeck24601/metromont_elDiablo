// Engineering Module - Main Script
console.log('Engineering module script loaded');

// State Management
let isAuthenticated = false;
let authCheckComplete = false;
let forgeAccessToken = null;
let globalHubData = null;
let projectId = null;
let selectedProject = null;
let selectedProjectData = null;

// Token Management Functions (same as QC module)
function getStoredToken() {
    const tokenData = localStorage.getItem('forgeToken');
    return tokenData ? JSON.parse(tokenData) : null;
}

function clearStoredToken() {
    localStorage.removeItem('forgeToken');
}

function isTokenExpired(tokenData) {
    if (!tokenData || !tokenData.expires_at) return true;
    return Date.now() >= tokenData.expires_at;
}

// Auth Status UI Updates
function updateAuthStatus(status, info = '') {
    const statusElement = document.getElementById('authStatus');
    const infoElement = document.getElementById('authInfo');
    const indicator = document.getElementById('authIndicator');

    if (statusElement) statusElement.textContent = status;
    if (infoElement) infoElement.textContent = info;

    if (indicator) {
        indicator.classList.remove('authenticated', 'error');
        if (status.includes('Authenticated')) {
            indicator.classList.add('authenticated');
        } else if (status.includes('Error') || status.includes('Failed')) {
            indicator.classList.add('error');
        }
    }
}

// API Token Verification
async function verifyToken(token) {
    try {
        const response = await fetch('https://developer.api.autodesk.com/userprofile/v1/users/@me', {
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

// Hub Data Loading - EXACT SAME as QC pattern
async function loadPreLoadedHubData() {
    console.log('Loading pre-loaded hub data...');

    if (!globalHubData) {
        console.log('No pre-loaded hub data available');
        fallbackToStoredData();
        return;
    }

    console.log('Using pre-loaded hub data:', globalHubData);

    // Populate project dropdown immediately
    populateProjectDropdown();
}

function fallbackToStoredData() {
    console.log('Attempting to use stored hub data...');

    const storedData = localStorage.getItem('hubData');
    if (storedData) {
        try {
            globalHubData = JSON.parse(storedData);
            console.log('Loaded hub data from storage');
            populateProjectDropdown();
        } catch (error) {
            console.error('Failed to parse stored hub data:', error);
            showFallbackMessage();
        }
    } else {
        console.log('No stored hub data found');
        showFallbackMessage();
    }
}

// Project Dropdown Population
function populateProjectDropdown() {
    console.log('=== POPULATING PROJECT DROPDOWN ===');

    const projectSelect = document.getElementById('projectSelect');
    if (!projectSelect) {
        console.error('Project select element not found');
        return;
    }

    projectSelect.innerHTML = '<option value="">Select a project...</option>';

    if (!globalHubData || !globalHubData.projects || globalHubData.projects.length === 0) {
        console.log('No projects available');
        projectSelect.innerHTML = '<option value="">No projects available</option>';
        projectSelect.disabled = true;
        return;
    }

    console.log(`Adding ${globalHubData.projects.length} projects to dropdown`);

    globalHubData.projects.forEach((project, index) => {
        const option = document.createElement('option');
        option.value = project.id;
        option.textContent = project.attributes.name;
        option.dataset.hubId = project.relationships.hub.data.id;
        option.dataset.projectIndex = index;
        projectSelect.appendChild(option);
    });

    projectSelect.disabled = false;
    console.log('✅ Project dropdown populated successfully');
}

// Notification System
function showNotification(message, type = 'info') {
    console.log(`Notification (${type}): ${message}`);

    const notification = document.getElementById('notification');
    if (!notification) return;

    notification.textContent = message;
    notification.className = `notification ${type} show`;

    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// Project Selection Handler
function onProjectChange() {
    console.log('=== onProjectChange START ===');

    const projectSelect = document.getElementById('projectSelect');
    if (!projectSelect) {
        console.error('Project select element not found');
        return;
    }

    const selectedValue = projectSelect.value;
    console.log('Selected project value:', selectedValue);

    if (selectedValue) {
        // Project selected
        selectedProject = selectedValue;
        projectId = selectedValue;

        const selectedOption = projectSelect.options[projectSelect.selectedIndex];
        const projectIndex = selectedOption.dataset.projectIndex;

        if (globalHubData && globalHubData.projects && projectIndex !== undefined) {
            selectedProjectData = globalHubData.projects[parseInt(projectIndex)];
            console.log('Selected project data:', selectedProjectData);
        }

        // Update UI
        const projectName = document.getElementById('projectName');
        const projectDetails = document.getElementById('projectDetails');

        if (projectName && selectedProjectData) {
            projectName.textContent = selectedProjectData.attributes.name;
        }

        if (projectDetails) {
            projectDetails.textContent = 'Project selected - ready for engineering tools';
        }

        console.log('✅ Project selected:', selectedProjectData?.attributes?.name || selectedProject);

    } else {
        // No selection
        console.log('No project selected');
        projectId = null;
        selectedProject = null;
        selectedProjectData = null;

        const projectName = document.getElementById('projectName');
        const projectDetails = document.getElementById('projectDetails');

        if (projectName) {
            projectName.textContent = 'No project selected';
        }

        if (projectDetails) {
            projectDetails.textContent = 'Select a project to view design requirements';
        }
    }
}

// Engineering Tool Functions
function openEngineeringTool(tool) {
    if (!isAuthenticated) {
        showNotification('Please authenticate with ACC first', 'warning');
        return;
    }

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
    console.log('Opening Engineering Calculator...');

    // Store current project info for calculator
    const projectInfo = {
        projectId: selectedProject,
        projectName: selectedProjectData?.attributes?.name || 'Unknown Project',
        hubId: selectedProjectData?.relationships?.hub?.data?.id || null
    };

    localStorage.setItem('selectedProject', JSON.stringify(projectInfo));

    // Open the calculator page
    window.location.href = 'engineering-calculator.html';
}

function openDesignSummary() {
    showNotification('Design Summary Generator coming soon!', 'info');
    console.log('Design summary tool opened for project:', selectedProjectData?.attributes?.name);
}

function openPieceIssue() {
    showNotification('Piece Issue Tickets coming soon!', 'info');
    console.log('Piece issue tool opened for project:', selectedProjectData?.attributes?.name);
}

function openBOMQuery() {
    showNotification('BOM Query & Reports coming soon!', 'info');
    console.log('BOM query tool opened for project:', selectedProjectData?.attributes?.name);
}

// Navigation Function
function goBack() {
    console.log('Navigating back to dashboard...');
    window.location.href = 'index.html';
}

// Fallback Message
function showFallbackMessage() {
    console.log('Showing fallback message - no projects available');
    updateAuthStatus('Not Authenticated', 'Please authenticate from main dashboard');

    const projectSelect = document.getElementById('projectSelect');
    if (projectSelect) {
        projectSelect.innerHTML = '<option value="">No projects available - please authenticate from main dashboard</option>';
        projectSelect.disabled = true;
    }
}

// Initialize the engineering page - EXACT SAME pattern as QC
async function initializeEngineering() {
    try {
        console.log('=== ENGINEERING MODULE INITIALIZATION ===');

        // Initialize UI
        initializeUI();

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
        console.error('Engineering module initialization failed:', error);
        showNotification('Failed to initialize: ' + error.message, 'error');
    } finally {
        authCheckComplete = true;
    }
}

function redirectToMainApp() {
    updateAuthStatus('Redirecting to Login...', 'Taking you to the main app for authentication...');
    showNotification('Redirecting to main app for authentication...', 'info');
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 2000);
}

async function completeAuthentication() {
    try {
        updateAuthStatus('Loading Projects...', 'Fetching project data...');

        // Load the hub data
        await loadPreLoadedHubData();

        isAuthenticated = true;

        const projectCount = globalHubData ? globalHubData.projects.length : 0;
        const accountName = globalHubData ? globalHubData.accountName : 'Unknown Account';

        updateAuthStatus('Authenticated', `Connected to ${accountName} (${projectCount} projects)`);

        console.log('✅ Authentication complete');

    } catch (error) {
        console.error('Failed to complete authentication:', error);
        updateAuthStatus('Error', 'Failed to load project data');
        showFallbackMessage();
    }
}

// Initialize UI Elements
function initializeUI() {
    console.log('Initializing UI elements...');

    // Set up project dropdown listener
    const projectSelect = document.getElementById('projectSelect');
    if (projectSelect) {
        projectSelect.addEventListener('change', onProjectChange);
    }

    // Add hover effects to engineering cards
    const engineeringCards = document.querySelectorAll('.engineering-card');
    engineeringCards.forEach(card => {
        card.addEventListener('mouseenter', function () {
            this.style.transform = 'translateY(-4px)';
        });

        card.addEventListener('mouseleave', function () {
            this.style.transform = 'translateY(0)';
        });
    });

    console.log('UI initialized');
}

// Global error handler to prevent page redirects
window.addEventListener('error', function (event) {
    console.error('Page error caught:', event.error);
    event.preventDefault();
});

// Prevent unhandled promise rejections
window.addEventListener('unhandledrejection', function (event) {
    console.error('Unhandled promise rejection:', event.reason);
    event.preventDefault();
});

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function () {
    console.log('DOM loaded, initializing engineering page...');

    // Small delay to ensure everything is ready
    setTimeout(() => {
        initializeEngineering();
    }, 100);
});

// Export functions for global access
window.EngineeringModule = {
    openEngineeringTool,
    onProjectChange,
    goBack,
    showNotification
};