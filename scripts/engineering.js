// Engineering & Drafting Module - Main JavaScript
console.log('Engineering module loading...');

// Global variables - EXACT SAME as QC
let forgeAccessToken = null;
let isAuthenticated = false;
let authToken = null;
let globalHubData = null;
let projectId = null;
let selectedProject = null;
let selectedProjectData = null;
let userProjects = [];
let hubId = null;
let authCheckComplete = false;

// Initialize Engineering Module - EXACT SAME pattern as QC
async function initializeEngineering() {
    console.log('🚀 Engineering module initializing...');

    try {
        console.log('=== ENGINEERING MODULE INITIALIZATION ===');

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
        console.error('❌ Engineering initialization failed:', error);
        updateAuthStatus('❌ Connection Failed', 'Failed to initialize engineering module');
    } finally {
        authCheckComplete = true;
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
        // This now calls populateProjectDropdown() internally - EXACT SAME as QC
        await loadPreLoadedHubData();

        isAuthenticated = true; // Set this flag

        const projectCount = globalHubData ? globalHubData.projects.length : 0;
        const accountName = globalHubData ? globalHubData.accountInfo.name : 'ACC Account';

        updateAuthStatus('✅ Connected', `Connected to ${accountName} with ${projectCount} projects available`);

        // Initialize UI
        initializeUI();

        console.log('✅ Engineering module ready with pre-loaded data');

    } catch (error) {
        console.error('Authentication completion failed:', error);
        updateAuthStatus('❌ Auth Error', 'Failed to load project data: ' + error.message);
    }
}

// NEW: Load pre-loaded hub data instead of making API calls - EXACT SAME as QC
async function loadPreLoadedHubData() {
    try {
        console.log('=== loadPreLoadedHubData START ===');

        // Try to get hub data from parent window first
        if (!globalHubData && window.opener && window.opener.CastLinkAuth) {
            globalHubData = window.opener.CastLinkAuth.getHubData();
            console.log('📱 Got hub data from parent window');
        }

        // If not available, try to load from session storage
        if (!globalHubData) {
            console.log('🔍 Trying session storage...');
            const storedHubData = sessionStorage.getItem('castlink_hub_data');
            console.log('Session storage data exists:', !!storedHubData);

            if (storedHubData) {
                globalHubData = JSON.parse(storedHubData);
                console.log('✅ Loaded hub data from session storage');
                console.log('Projects in data:', globalHubData?.projects?.length);
                console.log('First project:', globalHubData?.projects?.[0]);
            }
        }

        console.log('Final globalHubData check:');
        console.log('- globalHubData exists:', !!globalHubData);
        console.log('- globalHubData.projects exists:', !!globalHubData?.projects);
        console.log('- Projects length:', globalHubData?.projects?.length);

        if (globalHubData && globalHubData.projects && globalHubData.projects.length > 0) {
            console.log('✅ CONDITIONS MET - Processing projects');

            // Use the pre-loaded project data - EXACT SAME as QC
            userProjects = globalHubData.projects;
            hubId = globalHubData.hubId;

            // Set default project - EXACT SAME as QC
            if (globalHubData.projects.length > 0) {
                projectId = globalHubData.projects[0].id;
            }

            // Call populateProjectDropdown HERE (not in completeAuthentication) - EXACT SAME as QC
            console.log('🔥 CALLING populateProjectDropdown with', globalHubData.projects.length, 'projects');
            populateProjectDropdown(globalHubData.projects);

            console.log('✅ Using pre-loaded hub data:');
            console.log('   Hub ID:', globalHubData.hubId);
            console.log('   Projects:', globalHubData.projects.length);
            console.log('   Loaded at:', globalHubData.loadedAt);

        } else {
            console.warn('❌ CONDITIONS NOT MET - Falling back to manual entry');
            console.log('- globalHubData:', globalHubData);
            console.log('- globalHubData?.projects:', globalHubData?.projects);
            console.log('- length:', globalHubData?.projects?.length);
            await handleMissingHubData();
        }

        console.log('=== loadPreLoadedHubData END ===');

    } catch (error) {
        console.error('❌ Error loading pre-loaded hub data:', error);
        await handleMissingHubData();
    }
}

// FIXED: Use correct element ID and match QC pattern exactly
function populateProjectDropdown(projects) {
    try {
        console.log('=== populateProjectDropdown START ===');
        console.log('Projects passed in:', projects?.length);
        console.log('First project sample:', projects?.[0]);

        userProjects = projects; // EXACT SAME as QC
        const projectSelect = document.getElementById('projectSelect'); // Use the ID that exists in engineering.html

        console.log('Looking for element with ID: projectSelect');
        console.log('Element found:', !!projectSelect);

        if (!projectSelect) {
            console.error('❌ Project select element not found');
            return;
        }

        const accountName = globalHubData ? globalHubData.accountInfo.name : 'ACC Account';
        projectSelect.innerHTML = `<option value="">Select a project from ${accountName}...</option>`;

        projects.forEach((project) => {
            const option = document.createElement('option');
            option.value = project.id;
            option.textContent = `${project.name}${project.number && project.number !== 'N/A' ? ` (${project.number})` : ''}`;

            // Add data attributes for additional info
            option.dataset.projectNumber = project.number || '';
            option.dataset.location = project.location || '';
            option.dataset.permissions = project.permissions || 'basic';

            projectSelect.appendChild(option);
        });

        projectSelect.disabled = false;
        console.log('✅ Populated dropdown with', projects.length, 'projects');

    } catch (error) {
        console.error('❌ Error populating project dropdown:', error);
    }
}

async function handleMissingHubData() {
    console.log('Setting up manual entry fallback...');

    const projectSelect = document.getElementById('projectSelect');
    if (projectSelect) {
        projectSelect.innerHTML = '<option value="">No projects available - please authenticate from main dashboard</option>';
        projectSelect.disabled = true;
        console.log('❌ Set fallback message in dropdown');
    }
}

// Project Change Handler - EXACT SAME pattern as QC
function onProjectChange() {
    console.log('=== onProjectChange START ===');

    const projectSelect = document.getElementById('projectSelect');
    if (!projectSelect) {
        console.log('No projectSelect element found');
        return;
    }

    const selectedOption = projectSelect.selectedOptions[0];
    console.log('Selected option:', selectedOption?.value, selectedOption?.textContent);

    if (selectedOption && selectedOption.value) {
        const projectNumber = selectedOption.dataset.projectNumber || '';
        const location = selectedOption.dataset.location || '';
        const permissions = selectedOption.dataset.permissions || 'basic';

        projectId = selectedOption.value;
        selectedProject = selectedOption.value; // Keep both for compatibility

        // Find project data - SAFE way to get project name
        if (globalHubData && globalHubData.projects) {
            selectedProjectData = globalHubData.projects.find(p => p.id === selectedProject);
            console.log('Found project data:', !!selectedProjectData);
        }

        // Update project info display - SAFE way to handle undefined
        const projectName = document.getElementById('projectName');
        const projectDetails = document.getElementById('projectDetails');

        console.log('Looking for projectName element:', !!projectName);
        console.log('Looking for projectDetails element:', !!projectDetails);

        if (projectName && selectedProjectData && selectedProjectData.name) {
            projectName.textContent = selectedProjectData.name;
            console.log('✅ Updated projectName display');
        }

        if (projectDetails) {
            projectDetails.textContent = 'Project selected - ready for engineering tools';
            console.log('✅ Updated projectDetails display');
        }

        console.log('✅ Project selected:', selectedProjectData?.name || selectedProject);

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

    console.log('=== onProjectChange END ===');
}

// Token Management - EXACT SAME as QC
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

function clearStoredToken() {
    sessionStorage.removeItem('forge_token');
    localStorage.removeItem('forge_token_backup');
    console.log('Token cleared');
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

// Engineering Tool Functions
function openEngineeringTool(tool) {
    if (!isAuthenticated) {
        showNotification('Please authenticate with ACC first', 'warning');
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

// FIXED: Pass project data to calculator
function openCalculator() {
    console.log('Opening Engineering Calculator...');

    if (!selectedProject) {
        showNotification('Please select a project first', 'warning');
        return;
    }

    console.log('🚀 Opening calculator with project:', selectedProjectData?.name);

    // Store project data in sessionStorage for calculator to access
    const calculatorData = {
        selectedProject: selectedProject,
        selectedProjectData: selectedProjectData,
        forgeAccessToken: forgeAccessToken,
        globalHubData: globalHubData,
        timestamp: Date.now()
    };

    try {
        sessionStorage.setItem('calculator_project_data', JSON.stringify(calculatorData));
        console.log('✅ Stored project data for calculator');

        // Open the dedicated calculator page
        window.location.href = 'engineering-calculator.html';

    } catch (error) {
        console.error('❌ Failed to store project data:', error);
        showNotification('Failed to prepare calculator data', 'error');
    }
}

function openDesignSummary() {
    showNotification('Opening Design Summary Generator...', 'info');
    console.log('Design summary tool opened for project:', selectedProject);

    if (!selectedProject) {
        showNotification('Please select a project first', 'warning');
        return;
    }

    // Placeholder for design summary functionality
    console.log('Design Summary Generator - Project:', selectedProjectData?.name);
    showNotification('Design Summary Generator coming soon', 'info');
}

function openPieceIssue() {
    showNotification('Opening Piece Issue Tracker...', 'info');
    console.log('Piece issue tracker opened for project:', selectedProject);

    if (!selectedProject) {
        showNotification('Please select a project first', 'warning');
        return;
    }

    // Placeholder for piece issue functionality
    console.log('Piece Issue Tracker - Project:', selectedProjectData?.name);
    showNotification('Piece Issue Tracker coming soon', 'info');
}

function openBOMQuery() {
    showNotification('Opening BOM Query Tool...', 'info');
    console.log('BOM query tool opened for project:', selectedProject);

    if (!selectedProject) {
        showNotification('Please select a project first', 'warning');
        return;
    }

    // Placeholder for BOM query functionality
    console.log('BOM Query Tool - Project:', selectedProjectData?.name);
    showNotification('BOM Query Tool coming soon', 'info');
}

// Auth Status Functions
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

// Notification System
function showNotification(message, type = 'info') {
    console.log(`Notification (${type}): ${message}`);

    const notification = document.getElementById('notification');
    const notificationContent = document.getElementById('notificationContent');

    if (notification && notificationContent) {
        notificationContent.textContent = message;
        notification.className = `notification ${type} show`;

        setTimeout(() => {
            notification.classList.remove('show');
        }, 4000);
    }
}

// UI Initialization
function initializeUI() {
    console.log('Initializing UI...');

    // Project selection event listener
    const projectSelect = document.getElementById('projectSelect');
    if (projectSelect) {
        projectSelect.addEventListener('change', onProjectChange);
        console.log('✅ Added project change listener');
    } else {
        console.warn('❌ No projectSelect element found for event listener');
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

// Navigation Functions
function goBack() {
    console.log('Navigating back to dashboard...');
    window.location.href = 'index.html';
}

// Global error handler to prevent page redirects
window.addEventListener('error', function (event) {
    console.error('Page error caught:', event.error);
    // Don't let errors cause navigation issues
    event.preventDefault();
});

// Prevent any unhandled promise rejections from causing issues
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

// Export functions for global access if needed
window.EngineeringModule = {
    openEngineeringTool,
    onProjectChange,
    goBack,
    showNotification
};