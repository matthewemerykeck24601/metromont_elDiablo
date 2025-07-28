// Engineering & Drafting Module - Main Page Only

// Global Variables (matching QC pattern)
let forgeAccessToken = null;
let isAuthenticated = false;
let authCheckComplete = false;
let selectedProject = null;
let selectedProjectData = null;
let globalHubData = null;
let userProjects = []; // Added from QC pattern
let hubId = null; // Added from QC pattern
let projectId = null; // Added from QC pattern

// Load pre-loaded hub data (EXACT SAME as QC Bed Report)
async function loadPreLoadedHubData() {
    try {
        console.log('=== loadPreLoadedHubData START ===');

        // Try to get hub data from parent window first - FIXED: window.opener not window.parent
        if (!globalHubData && window.opener && window.opener.CastLinkAuth) {
            console.log('Trying window.opener...');
            globalHubData = window.opener.CastLinkAuth.getHubData();
            console.log('Got from window.opener:', globalHubData);
        }

        // If not available, try to load from session storage
        if (!globalHubData) {
            console.log('Trying session storage...');
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

function populateProjectDropdown(projects) {
    try {
        console.log('=== populateProjectDropdown START ===');
        console.log('Projects passed in:', projects?.length);
        console.log('First project sample:', projects?.[0]);

        userProjects = projects; // EXACT SAME as QC
        const projectSelect = document.getElementById('projectSelect'); // FIXED: Use correct ID

        console.log('Looking for element with ID: projectSelect');
        console.log('Element found:', !!projectSelect);

        if (!projectSelect) {
            console.error('❌ Project select element not found');
            return;
        }

        const accountName = globalHubData ? globalHubData.accountInfo.name : 'ACC Account';
        console.log('Account name:', accountName);

        projectSelect.innerHTML = `<option value="">Select a project from ${accountName}...</option>`;
        console.log('✅ Set default option');

        projects.forEach((project, index) => {
            console.log(`Adding project ${index + 1}:`, project.name);
            const option = document.createElement('option');
            option.value = project.id;
            option.textContent = `${project.name}${project.number && project.number !== 'N/A' ? ' (' + project.number + ')' : ''}`;
            option.dataset.projectNumber = project.number || '';
            option.dataset.location = project.location || '';
            option.dataset.permissions = project.permissions || 'basic';
            projectSelect.appendChild(option);
        });

        projectSelect.disabled = false;
        console.log('✅ Projects added, dropdown enabled');

        // Auto-select first project - EXACT SAME as QC
        if (projects.length > 0) {
            console.log('🔥 Auto-selecting first project:', projects[0].name);
            setTimeout(() => {
                console.log('Setting dropdown value to:', projects[0].id);
                projectSelect.value = projects[0].id;
                projectId = projects[0].id;
                console.log('Calling onProjectChange()...');
                onProjectChange(); // Use our function name instead of onProjectSelected
            }, 100);
        }

        console.log('=== populateProjectDropdown END ===');

    } catch (error) {
        console.error('❌ Error in populateProjectDropdown:', error);
        throw error;
    }
}

async function handleMissingHubData() {
    console.log('=== handleMissingHubData called ===');
    console.log('This should NOT be called if projects are available!');

    const projectSelect = document.getElementById('projectSelect');
    if (projectSelect) {
        projectSelect.innerHTML = '<option value="">No projects available - please authenticate from main dashboard</option>';
        projectSelect.disabled = true;
        console.log('❌ Set fallback message in dropdown');
    }
}

// Initialize the engineering page
// Initialize the engineering page - EXACT SAME pattern as QC
async function initializeEngineering() {
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
        console.error('Engineering module initialization failed:', error);
        showNotification('Failed to initialize: ' + error.message, 'error');
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

        // Initialize UI after data is loaded - same as QC pattern
        initializeUI();

        console.log('✅ Engineering module ready with pre-loaded data');

    } catch (error) {
        console.error('Authentication completion failed:', error);
        showNotification('Failed to load project data: ' + error.message, 'error');
    }
}

// Authentication Functions
async function checkAuthentication() {
    console.log('Checking authentication...');

    try {
        // Method 1: Check if parent app has authentication (same as QC Bed Report)
        if (window.parent && window.parent !== window && window.parent.CastLinkAuth) {
            console.log('Checking parent app authentication...');
            const isAuth = await window.parent.CastLinkAuth.waitForAuth();
            if (isAuth) {
                forgeAccessToken = window.parent.CastLinkAuth.getToken();
                globalHubData = window.parent.CastLinkAuth.getHubData();
                if (forgeAccessToken) {
                    isAuthenticated = true;
                    updateAuthStatus('✅ Connected', 'Authenticated with ACC');
                    console.log('Successfully authenticated via parent app');
                    return;
                }
            }
        }

        // Method 2: Check stored token (same pattern as QC Bed Report)
        console.log('Checking stored token...');
        const storedToken = getStoredToken();
        if (storedToken && !isTokenExpired(storedToken)) {
            // Verify token is still valid
            const isValid = await verifyToken(storedToken.access_token);
            if (isValid) {
                forgeAccessToken = storedToken.access_token;
                isAuthenticated = true;
                updateAuthStatus('✅ Connected', 'Using stored authentication');
                console.log('Successfully authenticated via stored token');
                return;
            } else {
                console.log('Stored token is invalid, clearing...');
                clearStoredToken();
            }
        }

        // Method 3: No valid authentication found
        console.log('No valid authentication found - redirecting to main app');
        isAuthenticated = false;
        updateAuthStatus('❌ Authentication Required', 'Redirecting to main app for authentication...');

        // Redirect to main app for authentication
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 2000);

    } catch (error) {
        console.error('Authentication check failed:', error);
        isAuthenticated = false;
        updateAuthStatus('❌ Authentication Error', error.message);
    }
}

function handleMissingHubData() {
    const projectSelect = document.getElementById('projectSelect');
    if (projectSelect) {
        projectSelect.innerHTML = '<option value="">No projects available - please authenticate from main dashboard</option>';
        projectSelect.disabled = true;
    }
    console.warn('No hub data available - user may need to authenticate from main dashboard');
}

async function loadProjects() {
    console.log('Loading projects...');

    try {
        if (!globalHubData || !globalHubData.projects) {
            console.log('No hub data available, using placeholder projects');
            populateProjectDropdown([]);
            return;
        }

        populateProjectDropdown(globalHubData.projects);
        console.log('Projects loaded successfully:', globalHubData.projects.length);

    } catch (error) {
        console.error('Failed to load projects:', error);
        populateProjectDropdown([]);
    }
}

function populateProjectDropdown(projects) {
    const projectSelect = document.getElementById('projectSelect');
    if (!projectSelect) return;

    projectSelect.innerHTML = '<option value="">Select a project...</option>';

    if (projects.length === 0) {
        projectSelect.innerHTML += '<option value="" disabled>No projects available</option>';
        projectSelect.disabled = true;
        return;
    }

    projects.forEach(project => {
        const option = document.createElement('option');
        option.value = project.id;
        option.textContent = project.attributes.name;
        projectSelect.appendChild(option);
    });

    projectSelect.disabled = false;
}

// Project Selection
// Project Selection - Updated to match QC pattern
function onProjectChange() {
    console.log('=== onProjectChange START ===');

    const projectSelect = document.getElementById('projectSelect');
    if (!projectSelect) {
        console.error('❌ projectSelect element not found');
        return;
    }

    const selectedOption = projectSelect.selectedOptions[0];
    console.log('Selected option:', selectedOption?.textContent);

    if (selectedOption && selectedOption.value) {
        const projectNumber = selectedOption.dataset.projectNumber || '';
        const location = selectedOption.dataset.location || '';
        const permissions = selectedOption.dataset.permissions || 'basic';

        projectId = selectedOption.value;
        selectedProject = selectedOption.value; // Keep both for compatibility

        console.log('Project selected:', selectedProject);
        console.log('Project number:', projectNumber);

        // Find project data
        if (globalHubData && globalHubData.projects) {
            selectedProjectData = globalHubData.projects.find(p => p.id === selectedProject);
            console.log('Found project data:', selectedProjectData?.name);
        }

        // Update project info display
        const projectName = document.getElementById('projectName');
        const projectDetails = document.getElementById('projectDetails');

        console.log('Looking for projectName element:', !!projectName);
        console.log('Looking for projectDetails element:', !!projectDetails);

        if (projectName && selectedProjectData) {
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

function openCalculator() {
    console.log('Opening Engineering Calculator...');

    if (!selectedProject) {
        showNotification('Please select a project first', 'warning');
        return;
    }

    // Open the dedicated calculator page
    window.location.href = 'engineering-calculator.html';
}

function openDesignSummary() {
    showNotification('Opening Design Summary Generator...', 'info');
    console.log('Design summary tool opened for project:', selectedProject);

    if (!selectedProject) {
        showNotification('Please select a project first', 'warning');
        return;
    }

    // Placeholder for design summary functionality
    console.log('Design Summary Generator - Project:', selectedProjectData?.attributes?.name);
}

function openPieceIssue() {
    showNotification('Opening Piece Issue Management...', 'info');
    console.log('Piece issue tool opened for project:', selectedProject);

    if (!selectedProject) {
        showNotification('Please select a project first', 'warning');
        return;
    }

    // Placeholder for piece issue functionality
    console.log('Piece Issue Management - Project:', selectedProjectData?.attributes?.name);
}

function openBOMQuery() {
    showNotification('Opening BOM Query Tool...', 'info');
    console.log('BOM query tool opened for project:', selectedProject);

    if (!selectedProject) {
        showNotification('Please select a project first', 'warning');
        return;
    }

    // Placeholder for BOM query functionality
    console.log('BOM Query Tool - Project:', selectedProjectData?.attributes?.name);
}

// Authentication Helper Functions
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
    } catch (error) {
        console.error('Token verification failed:', error);
        return false;
    }
}

// UI Functions
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

function showNotification(message, type = 'info') {
    // Try to find notification element
    let notification = document.getElementById('notification');
    let notificationText = document.getElementById('notificationText');

    if (notification && notificationText) {
        notificationText.textContent = message;
        notification.className = `notification ${type} show`;

        setTimeout(() => {
            notification.classList.remove('show');
        }, 4000);
    } else {
        // Fallback to console if notification element not found
        console.log(`Notification (${type}): ${message}`);

        // Try to create a simple notification if possible
        if (document.body) {
            const tempNotification = document.createElement('div');
            tempNotification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: white;
                border: 1px solid #ccc;
                border-radius: 8px;
                padding: 1rem;
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                z-index: 1000;
                max-width: 300px;
            `;
            tempNotification.textContent = message;
            document.body.appendChild(tempNotification);

            setTimeout(() => {
                if (tempNotification.parentNode) {
                    tempNotification.parentNode.removeChild(tempNotification);
                }
            }, 4000);
        }
    }
}

function initializeUI() {
    console.log('Initializing UI...');

    // Add any general UI initialization here
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
