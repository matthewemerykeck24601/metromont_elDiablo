// Engineering & Drafting Module - Main Page Only

// Global Variables
let forgeAccessToken = null;
let isAuthenticated = false;
let authCheckComplete = false;
let selectedProject = null;
let selectedProjectData = null;
let globalHubData = null;

// Initialize the engineering page
async function initializeEngineering() {
    console.log('Initializing Engineering & Drafting module...');
    
    try {
        // Update auth status to show checking
        updateAuthStatus('Checking authentication...', 'Connecting to ACC...');
        
        // Check authentication
        await checkAuthentication();
        
        // Load project data if authenticated
        if (isAuthenticated) {
            await loadProjects();
        }
        
        // Initialize UI
        initializeUI();
        
        console.log('Engineering module initialized successfully');
        
    } catch (error) {
        console.error('Failed to initialize engineering module:', error);
        showNotification('Failed to initialize: ' + error.message, 'error');
    } finally {
        authCheckComplete = true;
    }
}

// Authentication Functions
async function checkAuthentication() {
    console.log('Checking authentication...');
    
    try {
        // Method 1: Check if parent app has authentication
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
        
        // Method 2: Check stored token
        console.log('Checking stored token...');
        const storedToken = getStoredToken();
        if (storedToken && !isTokenExpired(storedToken)) {
            // Verify token is still valid
            const isValid = await verifyToken(storedToken.access_token);
            if (isValid) {
                forgeAccessToken = storedToken.access_token;
                isAuthenticated = true;
                updateAuthStatus('✅ Connected', 'Using stored authentication');
                
                // Try to load hub data from session storage
                const hubDataStr = sessionStorage.getItem('castlink_hub_data');
                if (hubDataStr) {
                    globalHubData = JSON.parse(hubDataStr);
                }
                
                console.log('Successfully authenticated via stored token');
                return;
            } else {
                console.log('Stored token is invalid, clearing...');
                clearStoredToken();
            }
        }
        
        // Method 3: No valid authentication found
        console.log('No valid authentication found');
        isAuthenticated = false;
        updateAuthStatus('❌ Authentication Required', 'Please authenticate with ACC from the main dashboard');
        
    } catch (error) {
        console.error('Authentication check failed:', error);
        isAuthenticated = false;
        updateAuthStatus('❌ Authentication Error', error.message);
    }
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
function onProjectChange() {
    const projectSelect = document.getElementById('projectSelect');
    const projectName = document.getElementById('projectName');
    const projectDetails = document.getElementById('projectDetails');
    
    selectedProject = projectSelect.value;
    
    if (selectedProject && globalHubData && globalHubData.projects) {
        selectedProjectData = globalHubData.projects.find(p => p.id === selectedProject);
        if (selectedProjectData) {
            if (projectName) projectName.textContent = selectedProjectData.attributes.name;
            if (projectDetails) projectDetails.textContent = 'Project selected - ready for engineering tools';
            console.log('Project selected:', selectedProjectData.attributes.name);
            return;
        }
    }
    
    // Fallback or no selection
    if (projectName) projectName.textContent = selectedProject ? 'Project selected' : 'No project selected';
    if (projectDetails) projectDetails.textContent = selectedProject ? 'Ready for engineering tools' : 'Select a project to begin';
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
function getStoredToken() {
    try {
        // Try multiple storage locations for compatibility
        let tokenStr = localStorage.getItem('forgeToken');
        if (!tokenStr) {
            tokenStr = sessionStorage.getItem('forge_token');
        }
        if (!tokenStr) {
            tokenStr = localStorage.getItem('forge_token_backup');
        }
        
        return tokenStr ? JSON.parse(tokenStr) : null;
    } catch (error) {
        console.error('Error reading stored token:', error);
        return null;
    }
}

function isTokenExpired(token) {
    if (!token || !token.expires_at) return true;
    const now = Date.now();
    const expiresAt = token.expires_at;
    const timeUntilExpiry = expiresAt - now;
    
    // Consider token expired if it expires in less than 5 minutes
    return timeUntilExpiry < (5 * 60 * 1000);
}

function clearStoredToken() {
    localStorage.removeItem('forgeToken');
    sessionStorage.removeItem('forge_token');
    localStorage.removeItem('forge_token_backup');
    sessionStorage.removeItem('castlink_hub_data');
    console.log('Stored tokens cleared');
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
        card.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-4px)';
        });
        
        card.addEventListener('mouseleave', function() {
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
window.addEventListener('error', function(event) {
    console.error('Page error caught:', event.error);
    // Don't let errors cause navigation issues
    event.preventDefault();
});

// Prevent any unhandled promise rejections from causing issues
window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled promise rejection:', event.reason);
    event.preventDefault();
});

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
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