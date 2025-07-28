// Engineering Calculator - Fixed Project Loading
// This file should be saved as scripts/engineering.js

console.log('=== ENGINEERING CALCULATOR INITIALIZATION ===');

// Global state
let globalProjectData = {
    currentProjectId: null,
    currentHubId: null,
    accToken: null,
    projects: []
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function () {
    console.log('Engineering Calculator DOM loaded');
    initializeEngineeringCalculator();
});

async function initializeEngineeringCalculator() {
    try {
        console.log('Starting engineering calculator initialization...');

        // Get authentication token
        await getAuthToken();

        // Try to inherit project selection from parent page
        const inheritedProject = await getInheritedProjectSelection();

        if (inheritedProject) {
            console.log('Inherited project from parent:', inheritedProject.name);
            globalProjectData.currentProjectId = inheritedProject.projectId;
            globalProjectData.currentHubId = inheritedProject.hubId;

            // Skip project loading and go straight to showing calculator
            updateProjectStatus(`Using project: ${inheritedProject.name}`);
            showCalculatorOptions();

            // Load project folders for this specific project
            await loadInitialProjectFolders();
        } else {
            console.log('No inherited project, loading all projects...');
            // Load all projects for selection
            await loadProjectsForCalculator();
        }

        console.log('Engineering calculator initialized successfully');

    } catch (error) {
        console.error('Failed to initialize engineering calculator:', error);
        showErrorMessage('Failed to initialize: ' + error.message);
    }
}

async function getAuthToken() {
    console.log('Getting authentication token...');

    try {
        // Try to get token from parent window (if embedded)
        if (window.parent && window.parent !== window) {
            try {
                globalProjectData.accToken = window.parent.localStorage.getItem('accToken');
                if (globalProjectData.accToken) {
                    console.log('Found token in parent window');
                    return;
                }
            } catch (e) {
                console.log('Cannot access parent storage');
            }
        }

        // Try local storage
        globalProjectData.accToken = localStorage.getItem('accToken');
        if (globalProjectData.accToken) {
            console.log('Found token in local storage');
            return;
        }

        // Try session storage
        globalProjectData.accToken = sessionStorage.getItem('accToken');
        if (globalProjectData.accToken) {
            console.log('Found token in session storage');
            return;
        }

        throw new Error('No ACC authentication token found. Please authenticate first.');

    } catch (error) {
        console.error('Authentication error:', error);
        throw error;
    }
}

async function loadProjectsForCalculator() {
    console.log('Loading projects for engineering calculator...');

    if (!globalProjectData.accToken) {
        throw new Error('No authentication token available');
    }

    try {
        // Update UI to show loading
        updateProjectStatus('Loading ACC projects...');

        // Get hubs first
        console.log('Fetching hubs...');
        const hubsResponse = await fetch('https://developer.api.autodesk.com/project/v1/hubs', {
            headers: {
                'Authorization': `Bearer ${globalProjectData.accToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!hubsResponse.ok) {
            throw new Error(`Failed to fetch hubs: ${hubsResponse.status} ${hubsResponse.statusText}`);
        }

        const hubsData = await hubsResponse.json();
        console.log('Hubs received:', hubsData.data?.length || 0);

        if (!hubsData.data || hubsData.data.length === 0) {
            throw new Error('No ACC hubs found for this account');
        }

        // Get projects from all hubs
        const allProjects = [];
        for (const hub of hubsData.data) {
            console.log(`Loading projects from hub: ${hub.attributes.name}`);

            try {
                const projectsResponse = await fetch(`https://developer.api.autodesk.com/project/v1/hubs/${hub.id}/projects`, {
                    headers: {
                        'Authorization': `Bearer ${globalProjectData.accToken}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (projectsResponse.ok) {
                    const projectsData = await projectsResponse.json();
                    if (projectsData.data && projectsData.data.length > 0) {
                        projectsData.data.forEach(project => {
                            allProjects.push({
                                id: project.id,
                                name: project.attributes.name,
                                hubId: hub.id,
                                hubName: hub.attributes.name,
                                fullData: project
                            });
                        });
                        console.log(`Found ${projectsData.data.length} projects in hub ${hub.attributes.name}`);
                    }
                } else {
                    console.warn(`Failed to load projects from hub ${hub.id}: ${projectsResponse.status}`);
                }
            } catch (error) {
                console.warn(`Error loading projects from hub ${hub.id}:`, error);
            }
        }

        if (allProjects.length === 0) {
            throw new Error('No projects found in any accessible hub');
        }

        console.log(`Total projects found: ${allProjects.length}`);
        globalProjectData.projects = allProjects;

        // Populate the project dropdown
        populateProjectDropdown(allProjects);

        updateProjectStatus(`Found ${allProjects.length} projects`);

    } catch (error) {
        console.error('Failed to load projects:', error);
        updateProjectStatus('Failed to load projects');
        throw error;
    }
}

function populateProjectDropdown(projects) {
    console.log('Populating project dropdown...');

    // Find the project select element
    const projectSelect = document.getElementById('projectSelect') ||
        document.querySelector('select[name="project"]') ||
        document.querySelector('.project-select');

    if (!projectSelect) {
        console.error('Project select element not found');
        return;
    }

    // Clear existing options
    projectSelect.innerHTML = '<option value="">Select a project...</option>';

    // Add project options
    projects.forEach(project => {
        const option = document.createElement('option');
        option.value = JSON.stringify({
            projectId: project.id,
            hubId: project.hubId,
            name: project.name
        });
        option.textContent = `${project.name} (${project.hubName})`;
        projectSelect.appendChild(option);
    });

    // Enable the dropdown
    projectSelect.disabled = false;

    // Add change event listener
    projectSelect.addEventListener('change', handleProjectChange);

    console.log('Project dropdown populated successfully');
}

function handleProjectChange(event) {
    const value = event.target.value;

    if (value) {
        try {
            const projectData = JSON.parse(value);
            globalProjectData.currentProjectId = projectData.projectId;
            globalProjectData.currentHubId = projectData.hubId;

            console.log('Selected project:', projectData.name);
            console.log('Project ID:', projectData.projectId);
            console.log('Hub ID:', projectData.hubId);

            // Show calculator options or next steps
            showCalculatorOptions();

        } catch (error) {
            console.error('Failed to parse project data:', error);
        }
    } else {
        // Clear selection
        globalProjectData.currentProjectId = null;
        globalProjectData.currentHubId = null;
        hideCalculatorOptions();
    }
}

function showCalculatorOptions() {
    console.log('Showing calculator options for selected project');

    // Show calculator grid if it exists
    const calculatorGrid = document.getElementById('calculatorGrid') ||
        document.querySelector('.calculator-grid');

    if (calculatorGrid) {
        calculatorGrid.style.display = 'grid';
    }

    // Enable calculator buttons
    const calculatorButtons = document.querySelectorAll('.calculator-card, .calculator-button');
    calculatorButtons.forEach(button => {
        button.classList.remove('disabled');
        button.style.pointerEvents = 'auto';
        button.style.opacity = '1';
    });

    // Update status
    updateProjectStatus(`Project selected: ${globalProjectData.currentProjectId}`);
}

function hideCalculatorOptions() {
    console.log('Hiding calculator options');

    // Hide calculator grid
    const calculatorGrid = document.getElementById('calculatorGrid') ||
        document.querySelector('.calculator-grid');

    if (calculatorGrid) {
        calculatorGrid.style.display = 'none';
    }

    // Disable calculator buttons
    const calculatorButtons = document.querySelectorAll('.calculator-card, .calculator-button');
    calculatorButtons.forEach(button => {
        button.classList.add('disabled');
        button.style.pointerEvents = 'none';
        button.style.opacity = '0.5';
    });
}

async function getInheritedProjectSelection() {
    console.log('Checking for inherited project selection...');

    try {
        // Method 1: Try to get from parent window (if calculator opened from engineering.html)
        if (window.parent && window.parent !== window) {
            try {
                const parentProjectData = window.parent.getCurrentSelectedProject ?
                    window.parent.getCurrentSelectedProject() : null;

                if (parentProjectData && parentProjectData.projectId) {
                    console.log('Found project in parent window:', parentProjectData);
                    return parentProjectData;
                }
            } catch (e) {
                console.log('Cannot access parent window project data');
            }
        }

        // Method 2: Try to get from URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const projectId = urlParams.get('projectId');
        const hubId = urlParams.get('hubId');
        const projectName = urlParams.get('projectName');

        if (projectId && hubId) {
            console.log('Found project in URL parameters');
            return {
                projectId: projectId,
                hubId: hubId,
                name: projectName || 'Selected Project'
            };
        }

        // Method 3: Try to get from session storage
        const sessionProject = sessionStorage.getItem('selectedProject');
        if (sessionProject) {
            try {
                const projectData = JSON.parse(sessionProject);
                if (projectData.projectId && projectData.hubId) {
                    console.log('Found project in session storage');
                    return projectData;
                }
            } catch (e) {
                console.log('Failed to parse session project data');
            }
        }

        // Method 4: Try to get from local storage
        const localProject = localStorage.getItem('selectedProject');
        if (localProject) {
            try {
                const projectData = JSON.parse(localProject);
                if (projectData.projectId && projectData.hubId) {
                    console.log('Found project in local storage');
                    return projectData;
                }
            } catch (e) {
                console.log('Failed to parse local project data');
            }
        }

        console.log('No inherited project selection found');
        return null;

    } catch (error) {
        console.error('Error checking for inherited project:', error);
        return null;
    }
}

async function loadInitialProjectFolders() {
    console.log('Loading initial project folders for selected project...');

    try {
        const folders = await loadProjectFolders(
            globalProjectData.currentProjectId,
            globalProjectData.currentHubId
        );

        console.log(`Loaded ${folders.length} top-level folders`);

        // Display the folders in UI if there's a folder display element
        displayProjectFolders(folders);

    } catch (error) {
        console.error('Failed to load initial project folders:', error);
        showErrorMessage('Failed to load project folders: ' + error.message);
    }
}

function displayProjectFolders(folders) {
    console.log('Displaying project folders in UI...');

    // Find folder display container
    const folderContainer = document.getElementById('folderDisplay') ||
        document.querySelector('.folder-display') ||
        document.querySelector('.project-folders');

    if (!folderContainer) {
        console.log('No folder display container found');
        return;
    }

    // Clear existing content
    folderContainer.innerHTML = '';

    if (folders.length === 0) {
        folderContainer.innerHTML = '<p class="no-folders">No folders found in this project</p>';
        return;
    }

    // Create folder list
    const folderList = document.createElement('div');
    folderList.className = 'folder-list';

    folders.forEach(folder => {
        const folderItem = document.createElement('div');
        folderItem.className = 'folder-item';
        folderItem.innerHTML = `
            <div class="folder-header" data-folder-id="${folder.id}">
                <span class="folder-icon">📁</span>
                <span class="folder-name">${folder.attributes.displayName || folder.attributes.name}</span>
            </div>
        `;

        // Add click handler to expand folder
        folderItem.addEventListener('click', function () {
            expandFolder(folder.id, folderItem);
        });

        folderList.appendChild(folderItem);
    });

    folderContainer.appendChild(folderList);
    folderContainer.style.display = 'block';
}

async function expandFolder(folderId, folderElement) {
    console.log('Expanding folder:', folderId);

    try {
        const contents = await loadFolderContents(globalProjectData.currentProjectId, folderId);

        // Create or update folder contents display
        let contentsDiv = folderElement.querySelector('.folder-contents');
        if (!contentsDiv) {
            contentsDiv = document.createElement('div');
            contentsDiv.className = 'folder-contents';
            folderElement.appendChild(contentsDiv);
        }

        if (contentsDiv.style.display === 'block') {
            contentsDiv.style.display = 'none';
            return;
        }

        contentsDiv.innerHTML = '';

        if (contents.length === 0) {
            contentsDiv.innerHTML = '<p class="empty-folder">No items in this folder</p>';
        } else {
            contents.forEach(item => {
                const itemDiv = document.createElement('div');
                itemDiv.className = item.type === 'folders' ? 'subfolder-item' : 'file-item';
                itemDiv.innerHTML = `
                    <span class="item-icon">${item.type === 'folders' ? '📁' : '📄'}</span>
                    <span class="item-name">${item.attributes.displayName || item.attributes.name}</span>
                `;

                if (item.type === 'folders') {
                    itemDiv.addEventListener('click', function () {
                        expandFolder(item.id, itemDiv);
                    });
                }

                contentsDiv.appendChild(itemDiv);
            });
        }

        contentsDiv.style.display = 'block';

    } catch (error) {
        console.error('Failed to expand folder:', error);
        showErrorMessage('Failed to load folder contents: ' + error.message);
    }
}

function showErrorMessage(message) {
    console.error('Error message:', message);

    // Try to find and show error display
    const errorDisplay = document.getElementById('errorDisplay') ||
        document.querySelector('.error-display');

    if (errorDisplay) {
        const errorMessage = errorDisplay.querySelector('#errorMessage') ||
            errorDisplay.querySelector('.error-message');

        if (errorMessage) {
            errorMessage.textContent = message;
        }

        errorDisplay.style.display = 'block';
    } else {
        // Fallback to alert
        alert('Engineering Calculator Error: ' + message);
    }
}

// Utility function to get current project data
function getCurrentProject() {
    return {
        projectId: globalProjectData.currentProjectId,
        hubId: globalProjectData.currentHubId,
        token: globalProjectData.accToken
    };
}

// Function to load project folders (for model selection)
async function loadProjectFolders(projectId, hubId) {
    console.log('Loading folders for project:', projectId);

    if (!globalProjectData.accToken) {
        throw new Error('No authentication token available');
    }

    try {
        const response = await fetch(`https://developer.api.autodesk.com/data/v1/projects/${projectId}/topFolders`, {
            headers: {
                'Authorization': `Bearer ${globalProjectData.accToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to load project folders: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log('Project folders loaded:', data.data?.length || 0);

        return data.data || [];

    } catch (error) {
        console.error('Failed to load project folders:', error);
        throw error;
    }
}

// Function to load folder contents
async function loadFolderContents(projectId, folderId) {
    console.log('Loading contents for folder:', folderId);

    if (!globalProjectData.accToken) {
        throw new Error('No authentication token available');
    }

    try {
        const response = await fetch(`https://developer.api.autodesk.com/data/v1/projects/${projectId}/folders/${folderId}/contents`, {
            headers: {
                'Authorization': `Bearer ${globalProjectData.accToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to load folder contents: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log('Folder contents loaded:', data.data?.length || 0);

        return data.data || [];

    } catch (error) {
        console.error('Failed to load folder contents:', error);
        throw error;
    }
}

function updateProjectStatus(message) {
    console.log('Status update:', message);

    // Find status elements and update them
    const statusElements = [
        document.getElementById('projectStatus'),
        document.getElementById('projectCount'),
        document.querySelector('.project-status'),
        document.querySelector('.status-text')
    ];

    statusElements.forEach(element => {
        if (element) {
            element.textContent = message;
        }
    });
}

// Function that the parent engineering.html page can call to pass project data
function setSelectedProject(projectData) {
    console.log('Project selection received from parent:', projectData);

    globalProjectData.currentProjectId = projectData.projectId;
    globalProjectData.currentHubId = projectData.hubId;

    // Store in session storage for persistence
    sessionStorage.setItem('selectedProject', JSON.stringify(projectData));

    // Update UI and load folders
    updateProjectStatus(`Using project: ${projectData.name}`);
    showCalculatorOptions();
    loadInitialProjectFolders();
}

// Export this function so parent pages can access it
window.setSelectedProject = setSelectedProject;

// Export functions for use by other scripts
window.EngineeringCalculator = {
    getCurrentProject: getCurrentProject,
    loadProjectFolders: loadProjectFolders,
    loadFolderContents: loadFolderContents,
    setSelectedProject: setSelectedProject,
    globalProjectData: globalProjectData
};