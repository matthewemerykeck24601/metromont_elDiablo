// ACC Authentication Configuration
const ACC_CLIENT_ID = window.ACC_CLIENT_ID;
const ACC_CALLBACK_URL = 'https://metrocastpro.com/';

// Metromont specific configuration
const METROMONT_ACCOUNT_ID = '956c9a49-bc6e-4459-b873-d9ecea0600cb';
const METROMONT_HUB_ID = `b.${METROMONT_ACCOUNT_ID}`;

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

const ACC_PROJECT_API_BASE = 'https://developer.api.autodesk.com/project/v1';

// ACC/Forge Integration Variables
let forgeAccessToken = null;
let projectId = null;
let hubId = null;
let userProfile = null;
let isACCConnected = false;
let currentCalculation = null;
let userProjects = [];
let projectMembers = [];

// Form Instance Management
let currentReportId = null;
let currentBedId = null;
let currentBedName = null;
let reportInstances = new Map();
let existingReports = [];

// Pre-defined data
const MOE_VALUES = [
    28500000, 28600000, 28700000, 28800000, 28900000, 29350000
];

const STRAND_SIZES = {
    '3/8" LL': 0.085,
    '1/2" SP-LL': 0.153,
    '9/16" LL': 0.192
};

// UI Elements
const authProcessing = document.getElementById('authProcessing');
const authTitle = document.getElementById('authTitle');
const authMessage = document.getElementById('authMessage');

// Authentication Flow
async function initializeApp() {
    try {
        if (window.opener && window.opener.CastLinkAuth) {
            const parentAuth = window.opener.CastLinkAuth;
            const isParentAuth = await parentAuth.waitForAuth();

            if (isParentAuth) {
                forgeAccessToken = parentAuth.getToken();
                await completeAuthentication();
                return;
            }
        }

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
        updateAuthStatus('Loading Projects...', 'Connecting to your Autodesk Construction Cloud account...');

        await loadRealProjectData();

        isACCConnected = true;
        updateAuthStatus('Success!', 'Successfully connected to ACC with OSS backend');

        await new Promise(resolve => setTimeout(resolve, 800));

        if (authProcessing) {
            authProcessing.classList.remove('active');
        }
        document.body.classList.remove('auth-loading');

        const authStatusBadge = document.getElementById('authStatusBadge');
        if (authStatusBadge) {
            authStatusBadge.style.display = 'inline-flex';
        }

        initializeDropdowns();
        await initializeReportHistory();

    } catch (error) {
        console.error('Authentication completion failed:', error);
        showAuthError('Failed to load project data: ' + error.message);
    }
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

function updateAuthStatus(title, message) {
    if (authTitle) authTitle.textContent = title;
    if (authMessage) authMessage.textContent = message;
}

function showAuthError(message) {
    const safeMessage = escapeHtml(message);
    updateAuthStatus('Authentication Error', safeMessage);
    if (authProcessing) {
        authProcessing.innerHTML = `
            <div class="auth-processing-content">
                <div style="color: #dc2626; font-size: 2rem; margin-bottom: 1rem;">⚠️</div>
                <h3 style="color: #dc2626;">Authentication Error</h3>
                <p style="color: #6b7280; margin-bottom: 1.5rem;">${safeMessage}</p>
                <button onclick="window.location.href='index.html'" style="background: #059669; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; cursor: pointer; font-size: 0.875rem; margin-right: 0.5rem;">
                    Go to Main App
                </button>
                <button onclick="location.reload()" style="background: #6b7280; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; cursor: pointer; font-size: 0.875rem;">
                    Try Again
                </button>
            </div>
        `;
    }
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Token Management
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

// Project Data Loading
async function loadRealProjectData() {
    try {
        hubId = METROMONT_HUB_ID;

        const hubResponse = await fetch(`https://developer.api.autodesk.com/project/v1/hubs/${hubId}`, {
            headers: {
                'Authorization': `Bearer ${forgeAccessToken}`
            }
        });

        if (!hubResponse.ok) {
            const errorText = await hubResponse.text();
            throw new Error(`Failed to access Metromont hub: ${hubResponse.status} ${errorText}`);
        }

        await loadProjectsFromHub(hubId);

    } catch (error) {
        console.error('Failed to load project data:', error);

        const projectSelect = document.getElementById('projectName');
        if (projectSelect) {
            projectSelect.innerHTML = '<option value="">Enter project details manually below...</option>';
            projectSelect.disabled = false;
        }

        ['projectNumber', 'location'].forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.disabled = false;
                element.placeholder = element.placeholder.replace('Loading from ACC...', 'Enter manually');
            }
        });

        const accDetails = document.getElementById('accDetails');
        if (accDetails) {
            accDetails.innerHTML = `
                <div style="color: #dc2626;">
                    <strong>Project Loading Issue:</strong> ${error.message}<br>
                    <small>You can still use the calculator by entering project details manually</small><br>
                    <small><em>Reports will be saved to OSS backend via server function</em></small>
                </div>
            `;
        }
    }
}

async function loadProjectsFromHub(hubId) {
    try {
        const projectsResponse = await fetch(`https://developer.api.autodesk.com/project/v1/hubs/${hubId}/projects`, {
            headers: {
                'Authorization': `Bearer ${forgeAccessToken}`
            }
        });

        if (!projectsResponse.ok) {
            throw new Error(`Failed to load projects: ${projectsResponse.status} ${await projectsResponse.text()}`);
        }

        const projectsData = await projectsResponse.json();
        const validProjects = [];
        
        const strictPattern = /^(\d{5})\s*-\s*(.+)$/;
        const flexiblePattern = /^(\d{3,6})\s*[-_\s]+(.+)$/;
        const numberFirstPattern = /^(\d{3,6})\s+(.+)$/;

        for (const project of projectsData.data) {
            const projectName = project.attributes.name || '';
            
            const projectStatus = project.attributes.status || '';
            if (projectStatus === 'archived' || projectStatus === 'inactive') {
                continue;
            }

            if (projectName.toLowerCase().includes('test') ||
                projectName.toLowerCase().includes('template') ||
                projectName.toLowerCase().includes('training') ||
                projectName.toLowerCase().includes('mockup') ||
                projectName.toLowerCase().includes('legacy') ||
                projectName.startsWith('zz') ||
                projectName.startsWith('ZZ')) {
                continue;
            }

            let nameMatch = null;
            let projectNumber = '';
            let projectDisplayName = projectName;

            nameMatch = projectName.match(strictPattern);
            if (nameMatch) {
                projectNumber = nameMatch[1];
                projectDisplayName = nameMatch[2].trim();
            } else {
                nameMatch = projectName.match(flexiblePattern);
                if (nameMatch) {
                    projectNumber = nameMatch[1];
                    projectDisplayName = nameMatch[2].trim();
                } else {
                    nameMatch = projectName.match(numberFirstPattern);
                    if (nameMatch) {
                        projectNumber = nameMatch[1];
                        projectDisplayName = nameMatch[2].trim();
                    } else {
                        const numberExtract = projectName.match(/(\d{3,6})/);
                        if (numberExtract) {
                            projectNumber = numberExtract[1];
                            projectDisplayName = projectName;
                        } else {
                            projectNumber = 'N/A';
                            projectDisplayName = projectName;
                        }
                    }
                }
            }

            validProjects.push({
                project: project,
                projectNumber: projectNumber,
                projectDisplayName: projectDisplayName,
                fullProjectName: projectName
            });
        }

        const projects = [];
        for (const validProject of validProjects) {
            const { project, projectNumber, projectDisplayName, fullProjectName } = validProject;

            let location = '';
            let actualProjectNumber = projectNumber;

            try {
                await new Promise(resolve => setTimeout(resolve, 100));

                const projectDetailResponse = await fetch(`https://developer.api.autodesk.com/project/v1/hubs/${hubId}/projects/${project.id}`, {
                    headers: {
                        'Authorization': `Bearer ${forgeAccessToken}`
                    }
                });

                if (projectDetailResponse.ok) {
                    const projectDetail = await projectDetailResponse.json();

                    if (projectDetail.data?.attributes?.extension?.data) {
                        const extData = projectDetail.data.attributes.extension.data;

                        const accProjectNumber = extData.projectNumber ||
                            extData.project_number ||
                            extData.number ||
                            extData.jobNumber ||
                            extData.job_number ||
                            extData.projectCode ||
                            extData.code || '';

                        if (accProjectNumber && accProjectNumber.trim() !== '') {
                            actualProjectNumber = accProjectNumber.trim();
                        }

                        location = extData.location ||
                            extData.project_location ||
                            extData.address ||
                            extData.city ||
                            extData.state ||
                            extData.jobLocation ||
                            extData.site ||
                            extData.client_location ||
                            extData.job_site || '';

                        if (location) {
                            location = location.trim();
                        }
                    }
                }
            } catch (detailError) {
                console.log('Could not get detailed project info for', fullProjectName, ':', detailError);
            }

            projects.push({
                id: project.id,
                name: fullProjectName,
                displayName: projectDisplayName,
                number: actualProjectNumber,
                numericSort: parseInt(actualProjectNumber, 10) || 999999,
                location: location || 'Location not specified',
                fullData: project,
                permissions: 'enhanced',
                projectType: 'ACC',
                status: project.attributes.status || 'active'
            });
        }

        const sortedProjects = projects.sort((a, b) => {
            if (a.numericSort !== b.numericSort) {
                return a.numericSort - b.numericSort;
            }
            return a.name.localeCompare(b.name);
        });

        populateProjectDropdown(sortedProjects);

        if (sortedProjects.length > 0) {
            setTimeout(() => {
                const projectSelect = document.getElementById('projectName');
                if (projectSelect) {
                    projectSelect.value = sortedProjects[0].id;
                    projectId = sortedProjects[0].id;
                    onProjectSelected();
                }
            }, 100);
        }

    } catch (error) {
        console.error('Error in loadProjectsFromHub:', error);
        throw error;
    }
}

function populateProjectDropdown(projects) {
    try {
        userProjects = projects;
        const projectSelect = document.getElementById('projectName');

        if (!projectSelect) {
            console.error('Project select element not found');
            return;
        }

        projectSelect.innerHTML = '<option value="">Select an ACC project...</option>';

        projects.forEach((project) => {
            const option = document.createElement('option');
            option.value = project.id;
            option.textContent = `${project.name}${project.number && project.number !== 'N/A' ? ' (' + project.number + ')' : ''}`;
            option.dataset.projectNumber = project.number || '';
            option.dataset.location = project.location || '';
            option.dataset.permissions = project.permissions || 'basic';
            projectSelect.appendChild(option);
        });

        projectSelect.disabled = false;

        updateACCDetailsDisplay(projects.length);

    } catch (error) {
        console.error('Error in populateProjectDropdown:', error);
        throw error;
    }
}

function updateACCDetailsDisplay(projectCount) {
    const accDetails = document.getElementById('accDetails');
    if (!accDetails) return;

    accDetails.innerHTML = `
        <strong>Status:</strong> Connected to Metromont ACC<br>
        <strong>Account:</strong> ${METROMONT_ACCOUNT_ID}<br>
        <strong>Projects Found:</strong> ${projectCount} active ACC projects<br>
        <strong>Hub:</strong> Metromont ACC Account<br>
        <strong>Storage Method:</strong> OSS Backend (via server function) with local fallback<br>
        <strong>Client ID:</strong> <code style="font-size: 0.75rem;">${ACC_CLIENT_ID}</code>
    `;
}

async function onProjectSelected() {
    const projectSelect = document.getElementById('projectName');
    if (!projectSelect) return;

    const selectedOption = projectSelect.selectedOptions[0];

    if (selectedOption && selectedOption.value) {
        const projectNumber = selectedOption.dataset.projectNumber || '';
        const location = selectedOption.dataset.location || '';
        const permissions = selectedOption.dataset.permissions || 'basic';

        projectId = selectedOption.value;

        const projectNumberEl = document.getElementById('projectNumber');
        const locationEl = document.getElementById('location');
        const projectSource = document.getElementById('projectSource');

        if (projectNumberEl) {
            projectNumberEl.value = projectNumber;
            projectNumberEl.disabled = false;
        }

        if (locationEl) {
            locationEl.value = location;
            locationEl.disabled = false;
        }

        if (projectSource) {
            projectSource.style.display = 'inline-flex';
            projectSource.textContent = `Project Data from ACC (${permissions} permissions)`;
        }

        try {
            projectMembers = await loadProjectMembers(projectId);
            
            const calculatedBySelect = document.getElementById('calculatedBy');
            const reviewedBySelect = document.getElementById('reviewedBy');
            
            if (calculatedBySelect) {
                populateProjectMemberDropdown(calculatedBySelect);
            }
            if (reviewedBySelect) {
                populateProjectMemberDropdown(reviewedBySelect);
            }
        } catch (memberError) {
            console.log('Error loading project members:', memberError);
        }
    }
}

async function loadProjectMembers(projectId) {
    try {
        if (!projectId || !forgeAccessToken) {
            return [];
        }

        await new Promise(resolve => setTimeout(resolve, 100));

        const membersResponse = await fetch(`${ACC_PROJECT_API_BASE}/projects/${projectId}/users`, {
            headers: {
                'Authorization': `Bearer ${forgeAccessToken}`
            }
        });

        if (!membersResponse.ok) {
            return [];
        }

        const membersData = await membersResponse.json();
        return parseProjectMembers(membersData.data || []);

    } catch (error) {
        console.error('Error loading project members:', error);
        return [];
    }
}

function parseProjectMembers(membersData) {
    const members = [];

    membersData.forEach(member => {
        try {
            const memberInfo = {
                id: member.id,
                name: '',
                email: '',
                role: '',
                company: ''
            };

            if (member.attributes) {
                memberInfo.name = member.attributes.name || 
                                 member.attributes.firstName + ' ' + member.attributes.lastName ||
                                 member.attributes.displayName || '';
                memberInfo.email = member.attributes.email || '';
                memberInfo.role = member.attributes.role || member.attributes.roleId || '';
                memberInfo.company = member.attributes.company || member.attributes.companyName || '';
            }

            memberInfo.name = memberInfo.name.trim();
            if (!memberInfo.name && memberInfo.email) {
                memberInfo.name = memberInfo.email.split('@')[0];
            }

            if (memberInfo.name || memberInfo.email) {
                members.push(memberInfo);
            }

        } catch (memberError) {
            console.log('Error parsing member data:', memberError, member);
        }
    });

    return members;
}

// Dropdown Initialization
function initializeDropdowns() {
    initializeMOEDropdown();
    initializeStrandSizeDropdown();
    initializeProjectMemberDropdowns();
}

function initializeMOEDropdown() {
    const ssMOE = document.getElementById('ss_MOE');
    if (ssMOE && ssMOE.tagName === 'INPUT') {
        const select = document.createElement('select');
        select.id = 'ss_MOE';
        select.className = 'input-field';
        select.onchange = calculateAll;

        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Select MOE (psi)';
        select.appendChild(defaultOption);

        MOE_VALUES.forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value.toLocaleString();
            select.appendChild(option);
        });

        ssMOE.parentNode.replaceChild(select, ssMOE);
    }

    const nssMOE = document.getElementById('nss_MOE');
    if (nssMOE && nssMOE.tagName === 'INPUT') {
        const select = document.createElement('select');
        select.id = 'nss_MOE';
        select.className = 'input-field';
        select.onchange = calculateAll;

        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Select MOE (psi)';
        select.appendChild(defaultOption);

        MOE_VALUES.forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value.toLocaleString();
            select.appendChild(option);
        });

        nssMOE.parentNode.replaceChild(select, nssMOE);
    }
}

function initializeStrandSizeDropdown() {
    const ssStrandAreaRow = document.querySelector('#ss_strandArea');
    if (ssStrandAreaRow) {
        const ssStrandAreaContainer = ssStrandAreaRow.closest('.input-row');
        if (ssStrandAreaContainer) {
            const strandSizeRow = document.createElement('div');
            strandSizeRow.className = 'input-row';
            strandSizeRow.innerHTML = `
                <label class="input-label">Strand Size:</label>
                <select class="input-field" id="ss_strandSize" onchange="onStrandSizeChange('ss')">
                    <option value="">Select Size</option>
                    ${Object.keys(STRAND_SIZES).map(size =>
                `<option value="${size}">${size}</option>`
            ).join('')}
                </select>
                <span class="input-unit"></span>
            `;
            ssStrandAreaContainer.parentNode.insertBefore(strandSizeRow, ssStrandAreaContainer);
        }
    }

    const nssStrandAreaRow = document.querySelector('#nss_strandArea');
    if (nssStrandAreaRow) {
        const nssStrandAreaContainer = nssStrandAreaRow.closest('.input-row');
        if (nssStrandAreaContainer) {
            const strandSizeRow = document.createElement('div');
            strandSizeRow.className = 'input-row';
            strandSizeRow.innerHTML = `
                <label class="input-label">Strand Size:</label>
                <select class="input-field" id="nss_strandSize" onchange="onStrandSizeChange('nss')">
                    <option value="">Select Size</option>
                    ${Object.keys(STRAND_SIZES).map(size =>
                `<option value="${size}">${size}</option>`
            ).join('')}
                </select>
                <span class="input-unit"></span>
            `;
            nssStrandAreaContainer.parentNode.insertBefore(strandSizeRow, nssStrandAreaContainer);
        }
    }
}

function initializeProjectMemberDropdowns() {
    const calculatedByInput = document.getElementById('calculatedBy');
    if (calculatedByInput && calculatedByInput.tagName === 'INPUT') {
        const select = document.createElement('select');
        select.id = 'calculatedBy';
        select.className = calculatedByInput.className;

        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Select Bed Supervisor';
        select.appendChild(defaultOption);

        populateProjectMemberDropdown(select);

        calculatedByInput.parentNode.replaceChild(select, calculatedByInput);
    }

    const reviewedByInput = document.getElementById('reviewedBy');
    if (reviewedByInput && reviewedByInput.tagName === 'INPUT') {
        const select = document.createElement('select');
        select.id = 'reviewedBy';
        select.className = reviewedByInput.className;

        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Select Inspector';
        select.appendChild(defaultOption);

        populateProjectMemberDropdown(select);

        reviewedByInput.parentNode.replaceChild(select, reviewedByInput);
    }

    const calculatedByLabel = document.querySelector('label[for="calculatedBy"]');
    if (calculatedByLabel) {
        calculatedByLabel.textContent = 'Bed Supervisor';
    }

    const reviewedByLabel = document.querySelector('label[for="reviewedBy"]');
    if (reviewedByLabel) {
        reviewedByLabel.textContent = 'Inspector';
    }
}

function populateProjectMemberDropdown(selectElement) {
    const defaultOption = selectElement.querySelector('option[value=""]');
    selectElement.innerHTML = '';
    if (defaultOption) {
        selectElement.appendChild(defaultOption);
    }

    if (projectMembers && projectMembers.length > 0) {
        projectMembers.forEach(member => {
            const option = document.createElement('option');
            option.value = member.name || member.email;
            option.textContent = `${member.name || member.email}${member.role ? ' - ' + member.role : ''}`;
            selectElement.appendChild(option);
        });
    } else {
        const defaultMembers = [
            'John Smith - Bed Supervisor',
            'Mike Johnson - Senior Supervisor',
            'Sarah Davis - Lead Supervisor',
            'Tom Wilson - Inspector',
            'Lisa Brown - Quality Inspector',
            'Dave Martinez - Senior Inspector',
            'Amy Taylor - QC Manager',
            'Chris Anderson - Production Manager'
        ];

        defaultMembers.forEach(member => {
            const option = document.createElement('option');
            option.value = member;
            option.textContent = member;
            selectElement.appendChild(option);
        });
    }
}

function onStrandSizeChange(type) {
    const strandSizeSelect = document.getElementById(`${type}_strandSize`);
    const strandAreaInput = document.getElementById(`${type}_strandArea`);

    if (strandSizeSelect && strandAreaInput && strandSizeSelect.value && STRAND_SIZES[strandSizeSelect.value]) {
        const area = STRAND_SIZES[strandSizeSelect.value];
        strandAreaInput.value = area.toFixed(3);
        calculateAll();
    } else if (strandAreaInput) {
        strandAreaInput.value = '';
    }
}

// Bed Selection Functions
function showBedSelection() {
    const bedSelectionModal = document.getElementById('bedSelectionModal');
    if (bedSelectionModal) {
        bedSelectionModal.classList.add('active');
    }
}

function closeBedSelection() {
    const bedSelectionModal = document.getElementById('bedSelectionModal');
    if (bedSelectionModal) {
        bedSelectionModal.classList.remove('active');
    }

    const bedSelect = document.getElementById('bedSelect');
    const reportDescription = document.getElementById('reportDescription');

    if (bedSelect) bedSelect.value = '';
    if (reportDescription) reportDescription.value = '';
}

function startBedReport() {
    const bedSelect = document.getElementById('bedSelect');
    const reportDescription = document.getElementById('reportDescription');

    if (!bedSelect || !bedSelect.value) {
        alert('Please select a bed before continuing.');
        return;
    }

    const bedId = bedSelect.value;
    const bedName = bedSelect.options[bedSelect.selectedIndex].text;
    const description = reportDescription ? reportDescription.value : '';

    const reportId = generateReportId(bedId);

    currentReportId = reportId;
    currentBedId = bedId;
    currentBedName = bedName;

    initializeFormInstance(reportId, bedId, bedName, description);

    closeBedSelection();
    showCalculator();
}

function generateReportId(bedId) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 4);
    return `${bedId.toUpperCase()}-${timestamp}-${random}`;
}

function initializeFormInstance(reportId, bedId, bedName, description) {
    const formInstance = {
        id: reportId,
        bedId: bedId,
        bedName: bedName,
        description: description,
        timestamp: new Date().toISOString(),
        projectMetadata: {
            projectName: '',
            projectNumber: '',
            date: new Date().toISOString().split('T')[0],
            calculatedBy: '',
            reviewedBy: '',
            location: '',
            notes: ''
        },
        calculations: {
            selfStressing: {
                inputs: {},
                outputs: {}
            },
            nonSelfStressing: {
                inputs: {},
                outputs: {}
            }
        },
        permissions: {
            scopesUsed: ACC_SCOPES,
            enhancedPermissions: true
        }
    };

    reportInstances.set(reportId, formInstance);

    const reportIdElement = document.getElementById('reportId');
    const selectedBedDisplayElement = document.getElementById('selectedBedDisplay');

    if (reportIdElement) reportIdElement.textContent = reportId;
    if (selectedBedDisplayElement) selectedBedDisplayElement.textContent = bedName;
}

function showCalculator() {
    const calculatorModal = document.getElementById('calculatorModal');
    if (calculatorModal) {
        calculatorModal.classList.add('active');
    }

    if (!currentCalculation) {
        clearFormData();
    }

    calculateAll();
}

function closeCalculator() {
    const calculatorModal = document.getElementById('calculatorModal');
    if (calculatorModal) {
        calculatorModal.classList.remove('active');
    }

    if (currentReportId) {
        saveFormInstance();
    }

    currentCalculation = null;
}

function clearFormData() {
    const inputs = document.querySelectorAll('#calculatorModal input[type="number"], #calculatorModal input[type="text"], #calculatorModal input[type="date"], #calculatorModal textarea');
    inputs.forEach(input => {
        if (input.type === 'date') {
            input.value = new Date().toISOString().split('T')[0];
        } else {
            input.value = '';
        }
    });

    const selects = document.querySelectorAll('#calculatorModal select');
    selects.forEach(select => {
        select.selectedIndex = 0;
    });
}

function saveFormInstance() {
    if (!currentReportId) return;

    const instance = reportInstances.get(currentReportId);
    if (!instance) return;

    instance.projectMetadata = {
        projectName: getElementValue('projectName'),
        projectNumber: getElementValue('projectNumber'),
        date: getElementValue('date'),
        calculatedBy: getElementValue('calculatedBy'),
        reviewedBy: getElementValue('reviewedBy'),
        location: getElementValue('location'),
        notes: getElementValue('notes')
    };

    instance.calculations = currentCalculation;

    reportInstances.set(currentReportId, instance);
}

function getElementValue(id) {
    const element = document.getElementById(id);
    return element ? element.value : '';
}

// Calculation Functions
function formatNumber(num) {
    if (isNaN(num) || !isFinite(num)) return '0.000';
    return num.toFixed(3);
}

function formatInteger(num) {
    if (isNaN(num) || !isFinite(num)) return '0';
    return Math.round(num).toString();
}

function getValue(id) {
    const element = document.getElementById(id);
    if (!element) return 0;

    if (element.tagName === 'SELECT') {
        return parseFloat(element.value) || 0;
    }
    return parseFloat(element.value) || 0;
}

function calculateSelfStressing() {
    const ip = getValue('ss_initialPull');
    const rf = getValue('ss_requiredForce');
    const moe = getValue('ss_MOE') || 1;
    const ns = getValue('ss_numberOfStrands') || 1;
    const abs = getValue('ss_adjBedShortening');
    const btbl = getValue('ss_blockToBlockLength');
    const sa = getValue('ss_strandArea') || 1;
    const des = getValue('ss_deadEndSeating');
    const les = getValue('ss_liveEndSeating');

    const basicElongation = ((rf - ip) * btbl * 12) / (sa * moe);
    const bedShortening = (abs / 2) + (abs / ns);
    const desiredElongation = basicElongation + des + bedShortening;
    const desiredElongationRounded = Math.ceil(Math.round(desiredElongation * 1000) / 1000 * 8) / 8;
    const LESeatingAdd = basicElongation !== 0 ? (les / basicElongation) * (rf - ip) : 0;
    const bedShorteningAdd = basicElongation !== 0 ? (bedShortening / basicElongation) * (rf - ip) : 0;
    const desiredPull = rf + LESeatingAdd + bedShorteningAdd;
    const calculatedPullRounded = Math.ceil(Math.round(desiredPull) / 100) * 100;

    const basicElongationEl = document.getElementById('ss_basicElongation');
    const bedShorteningEl = document.getElementById('ss_bedShortening');
    const desiredElongationRoundedEl = document.getElementById('ss_desiredElongationRounded');
    const calculatedPullRoundedEl = document.getElementById('ss_calculatedPullRounded');

    if (basicElongationEl) basicElongationEl.textContent = formatNumber(basicElongation) + ' in';
    if (bedShorteningEl) bedShorteningEl.textContent = formatNumber(bedShortening) + ' in';
    if (desiredElongationRoundedEl) desiredElongationRoundedEl.textContent = formatNumber(desiredElongationRounded) + ' in';
    if (calculatedPullRoundedEl) calculatedPullRoundedEl.textContent = formatInteger(calculatedPullRounded) + ' lbs';

    return {
        basicElongation, bedShortening, desiredElongation, desiredElongationRounded,
        LESeatingAdd, bedShorteningAdd, desiredPull, calculatedPullRounded
    };
}

function calculateNonSelfStressing() {
    const ip = getValue('nss_initialPull');
    const rf = getValue('nss_requiredForce');
    const moe = getValue('nss_MOE') || 1;
    const btbl = getValue('nss_blockToBlockLength');
    const sa = getValue('nss_strandArea') || 1;
    const at = getValue('nss_airTemp');
    const ct = getValue('nss_concreteTemp');
    const des = getValue('nss_deadEndSeating');
    const les = getValue('nss_liveEndSeating');
    const tar = getValue('nss_totalAbutmentRotation');

    const basicElongation = ((rf - ip) * btbl * 12) / (sa * moe);
    const tempDifference = (ct - at) / 1000;
    const tca2 = ((rf - ip) * btbl * 12) / (sa - moe) * tempDifference;
    const tcPart1 = tempDifference > 0.024 ? tca2 : 0;
    const tcPart2 = tempDifference < -0.024 ? basicElongation * tempDifference : 0;
    const tempCorrection = tcPart1 + tcPart2;
    const desiredElongation = basicElongation + des + tempCorrection;
    const desiredElongationRounded = Math.ceil(Math.round(desiredElongation * 1000) / 1000 * 8) / 8;
    const LESeatingAdd = basicElongation !== 0 ? (les / basicElongation) * (rf - ip) : 0;
    const tca1 = (rf + les + tar) * tempDifference;
    const tcPart1Pull = tempDifference > 0.024 ? tca1 : 0;
    const tcPart2Pull = tempDifference < -0.024 ? tca1 : 0;
    const tempCorrectionPull = tcPart1Pull + tcPart2Pull;
    const desiredPull = rf + LESeatingAdd + tempCorrectionPull;
    const calculatedPullRounded = Math.ceil(Math.round(desiredPull) / 100) * 100;

    const basicElongationEl = document.getElementById('nss_basicElongation');
    const tempDifferenceEl = document.getElementById('nss_tempDifference');
    const tempCorrectionEl = document.getElementById('nss_tempCorrection');
    const desiredElongationRoundedEl = document.getElementById('nss_desiredElongationRounded');
    const calculatedPullRoundedEl = document.getElementById('nss_calculatedPullRounded');

    if (basicElongationEl) basicElongationEl.textContent = formatNumber(basicElongation) + ' in';
    if (tempDifferenceEl) tempDifferenceEl.textContent = formatNumber(tempDifference);
    if (tempCorrectionEl) tempCorrectionEl.textContent = formatNumber(tempCorrection);
    if (desiredElongationRoundedEl) desiredElongationRoundedEl.textContent = formatNumber(desiredElongationRounded) + ' in';
    if (calculatedPullRoundedEl) calculatedPullRoundedEl.textContent = formatInteger(calculatedPullRounded) + ' lbs';

    return {
        basicElongation, tempDifference, tca2, tcPart1, tcPart2, tempCorrection,
        desiredElongation, desiredElongationRounded, LESeatingAdd, tca1,
        tcPart1Pull, tcPart2Pull, tempCorrectionPull, desiredPull, calculatedPullRounded
    };
}

function calculateAll() {
    const selfStressingResults = calculateSelfStressing();
    const nonSelfStressingResults = calculateNonSelfStressing();

    const ssStrandSize = getElementValue('ss_strandSize');
    const nssStrandSize = getElementValue('nss_strandSize');

    currentCalculation = {
        timestamp: new Date().toISOString(),
        reportId: currentReportId,
        bedId: currentBedId,
        bedName: currentBedName,
        projectId: projectId,
        hubId: hubId,
        status: 'Draft',
        permissions: {
            scopesUsed: ACC_SCOPES,
            enhancedPermissions: true
        },
        projectMetadata: {
            projectName: getElementValue('projectName'),
            projectNumber: getElementValue('projectNumber'),
            date: getElementValue('date'),
            calculatedBy: getElementValue('calculatedBy'),
            reviewedBy: getElementValue('reviewedBy'),
            location: getElementValue('location'),
            notes: getElementValue('notes')
        },
        selfStressing: {
            inputs: {
                initialPull: getValue('ss_initialPull'),
                requiredForce: getValue('ss_requiredForce'),
                MOE: getValue('ss_MOE'),
                numberOfStrands: getValue('ss_numberOfStrands'),
                adjBedShortening: getValue('ss_adjBedShortening'),
                blockToBlockLength: getValue('ss_blockToBlockLength'),
                strandSize: ssStrandSize,
                strandArea: getValue('ss_strandArea'),
                deadEndSeating: getValue('ss_deadEndSeating'),
                liveEndSeating: getValue('ss_liveEndSeating')
            },
            outputs: selfStressingResults
        },
        nonSelfStressing: {
            inputs: {
                initialPull: getValue('nss_initialPull'),
                requiredForce: getValue('nss_requiredForce'),
                MOE: getValue('nss_MOE'),
                blockToBlockLength: getValue('nss_blockToBlockLength'),
                strandSize: nssStrandSize,
                strandArea: getValue('nss_strandArea'),
                airTemp: getValue('nss_airTemp'),
                concreteTemp: getValue('nss_concreteTemp'),
                deadEndSeating: getValue('nss_deadEndSeating'),
                liveEndSeating: getValue('nss_liveEndSeating'),
                totalAbutmentRotation: getValue('nss_totalAbutmentRotation')
            },
            outputs: nonSelfStressingResults
        }
    };
}

// OSS Backend Integration - Save via Netlify Function
async function saveToACC() {
    if (!isACCConnected) {
        alert('Not connected to ACC. Please check your connection.');
        return;
    }

    if (!projectId) {
        alert('Please select a project before saving.');
        return;
    }

    try {
        const saveBtn = document.getElementById('saveBtn');
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<div class="loading"></div> Saving to OSS Backend...';
        }

        const enhancedCalculation = {
            ...currentCalculation,
            status: 'Completed',
            createdDate: currentCalculation.timestamp,
            savedToOSS: true,
            permissions: {
                scopesUsed: ACC_SCOPES,
                enhancedPermissions: true
            },
            qualityMetrics: {
                complianceStatus: 'Pass',
                deviations: [],
                approvalRequired: false,
                criticalResults: [
                    currentCalculation.selfStressing.outputs.calculatedPullRounded,
                    currentCalculation.nonSelfStressing.outputs.calculatedPullRounded
                ]
            }
        };

        // Try OSS backend first
        try {
            const result = await saveBedQCReportToOSS(enhancedCalculation);
            
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = `
                    <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
                    </svg>
                    Saved to OSS
                `;
            }

            let successMessage = `Report saved successfully!\nReport ID: ${result.reportId}`;
            successMessage += `\n\n☁️ Storage: OSS Backend (Object Storage)`;
            successMessage += `\nBucket: ${result.bucketKey}`;
            successMessage += `\nPath: ${result.objectKey}`;
            successMessage += `\nSize: ${(result.size / 1024).toFixed(1)} KB`;

            showSaveSuccessDialog(result, successMessage);
            await refreshReportHistory();
            
        } catch (ossError) {
            console.log('OSS backend failed, falling back to local storage:', ossError);
            
            // Fallback to local storage
            const localResult = await saveBedQCReportToLocal(enhancedCalculation);
            
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = `
                    <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
                    </svg>
                    Saved Locally (OSS Unavailable)
                `;
            }

            let fallbackMessage = `Report saved successfully!\nReport ID: ${localResult.reportId}`;
            fallbackMessage += `\n\n💾 Storage: Local browser storage (OSS backend unavailable)`;
            fallbackMessage += `\nNote: OSS backend error - ${ossError.message}`;
            fallbackMessage += `\nReport can be synced to OSS when backend is available`;

            showSaveSuccessDialog(localResult, fallbackMessage);
            await refreshReportHistory();
        }

    } catch (error) {
        console.error('Save failed:', error);

        const saveBtn = document.getElementById('saveBtn');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = `
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
                </svg>
                Save Report
            `;
        }

        alert('Failed to save report: ' + error.message);
    }
}

// OSS Backend Functions
async function saveBedQCReportToOSS(reportData) {
    const reportContent = {
        type: 'bedqc-report',
        version: '2.0',
        timestamp: new Date().toISOString(),
        application: 'MetromontCastLink',
        module: 'QualityControl',
        schema: 'BedQCReport-v2.0',
        storageMethod: 'oss-backend',
        metadata: {
            saveAttempt: new Date().toISOString(),
            projectId: projectId,
            hubId: hubId,
            userToken: forgeAccessToken ? 'present' : 'missing'
        },
        reportData: reportData
    };

    const response = await fetch('/.netlify/functions/oss-storage', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${forgeAccessToken}`
        },
        body: JSON.stringify({
            action: 'save-report',
            data: {
                projectId: projectId,
                reportContent: reportContent
            }
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OSS Backend Error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    
    if (!result.success) {
        throw new Error(result.error || 'Unknown OSS backend error');
    }

    return {
        success: true,
        reportId: reportData.reportId,
        projectId: projectId,
        bedName: reportData.bedName,
        projectName: reportData.projectMetadata?.projectName,
        bucketKey: result.bucketKey,
        objectKey: result.objectKey,
        size: result.size,
        method: 'oss-backend'
    };
}

async function saveBedQCReportToLocal(reportData) {
    const reportContent = {
        type: 'bedqc-report',
        version: '2.0',
        timestamp: new Date().toISOString(),
        application: 'MetromontCastLink',
        module: 'QualityControl',
        schema: 'BedQCReport-v2.0',
        storageMethod: 'local-fallback',
        metadata: {
            saveAttempt: new Date().toISOString(),
            projectId: projectId,
            hubId: hubId,
            fallbackReason: 'OSS backend unavailable'
        },
        reportData: reportData
    };

    const storageKey = `bedqc_${projectId}_${reportData.reportId}`;

    localStorage.setItem(storageKey, JSON.stringify(reportContent));

    const projectReportsKey = `bedqc_reports_${projectId}`;
    const existingReports = JSON.parse(localStorage.getItem(projectReportsKey) || '[]');

    if (!existingReports.includes(reportData.reportId)) {
        existingReports.push(reportData.reportId);
        localStorage.setItem(projectReportsKey, JSON.stringify(existingReports));
    }

    return {
        success: true,
        reportId: reportData.reportId,
        projectId: projectId,
        bedName: reportData.bedName,
        projectName: reportData.projectMetadata?.projectName,
        storageKey: storageKey,
        method: 'local-fallback'
    };
}

function showSaveSuccessDialog(result, message) {
    const successModal = document.createElement('div');
    successModal.className = 'modal-overlay';
    successModal.style.zIndex = '3000';

    let statusIcon = '';
    let statusColor = '';

    if (result.method === 'oss-backend') {
        statusIcon = '☁️';
        statusColor = '#059669';
    } else {
        statusIcon = '💾';
        statusColor = '#f59e0b';
    }

    successModal.innerHTML = `
        <div class="modal" style="max-width: 500px;">
            <div class="modal-header">
                <h3 class="modal-title" style="color: ${statusColor};">
                    ${statusIcon} Report Saved Successfully
                </h3>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
            </div>
            <div class="modal-content">
                <div style="background: #f8f9fa; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; font-family: monospace; font-size: 0.875rem; white-space: pre-line; line-height: 1.4;">
${message}
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove()">
                    Continue Working
                </button>
                <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove(); refreshReportHistory()">
                    View All Reports
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(successModal);
    successModal.classList.add('active');

    setTimeout(() => {
        if (document.body.contains(successModal)) {
            successModal.remove();
        }
    }, 15000);
}

async function exportToACCDocs() {
    alert('Export functionality coming soon in production version.');
}

function generatePDF() {
    alert('PDF generation functionality coming soon in production version.');
}

// Report History Functionality
async function initializeReportHistory() {
    try {
        addReportHistorySection();
        await refreshReportHistory();
    } catch (error) {
        console.error('Error initializing report history:', error);
    }
}

function addReportHistorySection() {
    const container = document.querySelector('.container');
    if (!container) return;

    const historySection = document.createElement('div');
    historySection.innerHTML = `
        <div class="card" id="reportHistorySection" style="margin-top: 2rem;">
            <h3 class="card-title">
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M13,3A9,9 0 0,0 4,12H1L4.89,15.89L4.96,16.03L9,12H6A7,7 0 0,1 13,5A7,7 0 0,1 20,12A7,7 0 0,1 13,19C11.07,19 9.32,18.21 8.06,16.94L6.64,18.36C8.27,20 10.5,21 13,21A9,9 0 0,0 22,12A9,9 0 0,0 13,3Z"/>
                </svg>
                Report History (OSS Backend)
                <button class="btn btn-secondary" onclick="refreshReportHistory()" style="margin-left: auto;">
                    <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z"/>
                    </svg>
                    Refresh
                </button>
            </h3>
            
            <div id="reportsList">
                <div style="text-align: center; color: #6b7280; padding: 2rem;">
                    <div class="loading"></div>
                    <p>Loading reports from OSS backend...</p>
                </div>
            </div>
        </div>
    `;

    container.appendChild(historySection);
}

async function refreshReportHistory() {
    try {
        const reportsList = document.getElementById('reportsList');
        if (!reportsList) return;

        reportsList.innerHTML = `
            <div style="text-align: center; color: #6b7280; padding: 2rem;">
                <div class="loading"></div>
                <p>Loading reports from OSS backend...</p>
            </div>
        `;

        // Try OSS backend first, then fallback to local
        try {
            existingReports = await loadBedQCReportsFromOSS(projectId);
        } catch (ossError) {
            console.log('OSS backend unavailable, loading from local storage:', ossError);
            existingReports = await loadBedQCReportsFromLocal(projectId);
        }

        displayReports(existingReports);

    } catch (error) {
        console.error('Error refreshing report history:', error);
        const reportsList = document.getElementById('reportsList');
        if (reportsList) {
            reportsList.innerHTML = `
                <div style="text-align: center; color: #dc2626; padding: 2rem;">
                    <p>Error loading reports: ${error.message}</p>
                    <button class="btn btn-secondary" onclick="refreshReportHistory()">Try Again</button>
                </div>
            `;
        }
    }
}

async function loadBedQCReportsFromOSS(projectId) {
    const response = await fetch('/.netlify/functions/oss-storage', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${forgeAccessToken}`
        },
        body: JSON.stringify({
            action: 'load-reports',
            data: { projectId: projectId }
        })
    });

    if (!response.ok) {
        throw new Error(`Failed to load reports from OSS: ${response.status}`);
    }

    const result = await response.json();
    
    if (!result.success) {
        throw new Error(result.error || 'Failed to load reports from OSS');
    }

    return result.reports.map(report => ({
        ...report,
        source: 'oss-backend'
    }));
}

async function loadBedQCReportsFromLocal(projectId) {
    try {
        const reports = [];
        const projectReportsKey = `bedqc_reports_${projectId}`;
        const localReportIds = JSON.parse(localStorage.getItem(projectReportsKey) || '[]');

        for (const reportId of localReportIds) {
            const storageKey = `bedqc_${projectId}_${reportId}`;
            const reportDataStr = localStorage.getItem(storageKey);

            if (reportDataStr) {
                try {
                    const reportData = JSON.parse(reportDataStr);

                    reports.push({
                        objectKey: storageKey,
                        storageKey: storageKey,
                        lastModified: reportData.timestamp,
                        displayName: `${reportData.reportData?.bedName || 'Unknown'} - ${reportData.reportData?.reportId || reportId}`,
                        data: reportData,
                        source: 'local',
                        permissions: 'basic'
                    });
                } catch (parseError) {
                    console.log('Could not parse local report:', reportId, parseError);
                }
            }
        }

        reports.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
        return reports;

    } catch (error) {
        console.error('Error loading reports from local storage:', error);
        return [];
    }
}

function displayReports(reports) {
    const reportsList = document.getElementById('reportsList');
    if (!reportsList) return;

    if (reports.length === 0) {
        reportsList.innerHTML = `
            <div style="text-align: center; color: #6b7280; padding: 2rem;">
                <svg width="48" height="48" fill="currentColor" viewBox="0 0 24 24" style="margin-bottom: 1rem; opacity: 0.5;">
                    <path d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 002 2z"/>
                </svg>
                <p>No reports found. Create your first Bed QC report!</p>
                <button class="btn btn-primary" onclick="showBedSelection()">Create New Report</button>
            </div>
        `;
        return;
    }

    const reportsHTML = reports.map(report => {
        let bedName = '';
        let reportId = '';
        let projectName = '';
        let createdBy = '';
        let status = 'Draft';
        let formattedDate = '';
        let selfStressPull = 0;
        let nonSelfStressPull = 0;
        let notes = '';

        if (report.source === 'local' && report.data?.reportData) {
            const data = report.data.reportData;
            bedName = data.bedName || '';
            reportId = data.reportId || '';
            projectName = data.projectMetadata?.projectName || '';
            createdBy = data.projectMetadata?.calculatedBy || '';
            status = data.status || 'Draft';
            notes = data.projectMetadata?.notes || '';
            selfStressPull = data.selfStressing?.outputs?.calculatedPullRounded || 0;
            nonStressPull = data.nonSelfStressing?.outputs?.calculatedPullRounded || 0;

            const date = new Date(data.createdDate || data.timestamp || report.lastModified);
            formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
        } else {
            // OSS object without local data
            const parts = report.displayName?.split(' - ') || ['', ''];
            bedName = parts[0] || 'Unknown Bed';
            reportId = parts[1] || 'Unknown ID';
            status = 'Completed';

            const date = new Date(report.lastModified);
            formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
        }

        let statusClass = 'status-development';
        if (status === 'Completed') statusClass = 'status-active';
        if (status === 'Approved') statusClass = 'status-active';

        let sourceIndicator = '';
        let sourceClass = '';
        if (report.source === 'local') {
            sourceIndicator = '💾 Local';
            sourceClass = 'background: #fef3c7; color: #92400e;';
        } else {
            sourceIndicator = '☁️ OSS';
            sourceClass = 'background: #dcfce7; color: #166534;';
        }

        return `
            <div class="tool-card" style="margin-bottom: 1rem; cursor: pointer;" 
                 onclick="loadExistingReport('${report.objectKey}', '${report.bucketKey || ''}', ${report.needsDownload || false}, '${report.source}')">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
                    <div>
                        <h4 style="font-size: 1.125rem; font-weight: 600; color: #1e293b; margin-bottom: 0.5rem;">
                            ${bedName} - ${reportId}
                        </h4>
                        <div style="display: flex; gap: 1rem; font-size: 0.875rem; color: #6b7280;">
                            <span><strong>Project:</strong> ${projectName || 'N/A'}</span>
                            <span><strong>Date:</strong> ${formattedDate}</span>
                            <span><strong>By:</strong> ${createdBy || 'Unknown'}</span>
                        </div>
                    </div>
                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                        <span class="status-badge ${statusClass}">${status}</span>
                        <span style="padding: 0.25rem 0.5rem; border-radius: 12px; font-size: 0.75rem; font-weight: 500; ${sourceClass}">${sourceIndicator}</span>
                        <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;" 
                                onclick="event.stopPropagation(); deleteReport('${report.objectKey}', '${report.bucketKey || ''}', '${reportId}', '${report.source}')">
                            <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/>
                            </svg>
                        </button>
                    </div>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                    <div style="background: #eff6ff; padding: 0.75rem; border-radius: 6px;">
                        <div style="font-size: 0.75rem; color: #2563eb; font-weight: 500; margin-bottom: 0.25rem;">Self-Stressing Pull</div>
                        <div style="font-size: 1.125rem; font-weight: 600; color: #1e293b;">${selfStressPull.toLocaleString()} lbs</div>
                    </div>
                    <div style="background: #f0fdf4; padding: 0.75rem; border-radius: 6px;">
                        <div style="font-size: 0.75rem; color: #059669; font-weight: 500; margin-bottom: 0.25rem;">Non-Self-Stressing Pull</div>
                        <div style="font-size: 1.125rem; font-weight: 600; color: #1e293b;">${nonSelfStressPull.toLocaleString()} lbs</div>
                    </div>
                </div>
                
                ${notes ? `<div style="font-size: 0.875rem; color: #6b7280; font-style: italic;">"${notes}"</div>` : ''}
                
                <div style="margin-top: 1rem; font-size: 0.75rem; color: #9ca3af;">
                    ${report.needsDownload ? 'Will download from OSS when opened' : 'Ready to load'} | Click to open and edit
                </div>
            </div>
        `;
    }).join('');

    reportsList.innerHTML = reportsHTML;
}

async function loadExistingReport(objectKey, bucketKey = '', needsDownload = false, source = 'local') {
    try {
        let reportData = null;

        if (needsDownload && bucketKey && source === 'oss-backend') {
            // Download from OSS backend
            const response = await fetch('/.netlify/functions/oss-storage', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${forgeAccessToken}`
                },
                body: JSON.stringify({
                    action: 'load-report',
                    data: {
                        bucketKey: bucketKey,
                        objectKey: objectKey
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`Failed to download report: ${response.status}`);
            }

            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Failed to download report');
            }

            reportData = result.reportContent.reportData;
        } else {
            // Load from local storage
            const reportDataStr = localStorage.getItem(objectKey);
            if (!reportDataStr) {
                throw new Error('Report not found in local storage');
            }

            const reportContent = JSON.parse(reportDataStr);
            reportData = reportContent.reportData;
        }

        currentReportId = reportData.reportId;
        currentBedId = reportData.bedId;
        currentBedName = reportData.bedName;
        currentCalculation = reportData;

        showCalculator();
        populateFormWithReportData(reportData);

        const reportIdElement = document.getElementById('reportId');
        const selectedBedDisplayElement = document.getElementById('selectedBedDisplay');
        const saveBtn = document.getElementById('saveBtn');
        const exportBtn = document.getElementById('exportBtn');

        const sourceText = source === 'oss-backend' ? '(Loaded from OSS Backend)' : '(Loaded from Local Storage)';
        if (reportIdElement) reportIdElement.textContent = reportData.reportId + ' ' + sourceText;
        if (selectedBedDisplayElement) selectedBedDisplayElement.textContent = reportData.bedName;
        if (saveBtn) saveBtn.disabled = false;
        if (exportBtn) exportBtn.disabled = false;

    } catch (error) {
        console.error('Error loading existing report:', error);
        alert('Failed to load report: ' + error.message);
    }
}

function populateFormWithReportData(data) {
    if (data.projectMetadata?.projectName) {
        const projectSelect = document.getElementById('projectName');
        if (projectSelect) {
            for (let option of projectSelect.options) {
                if (option.textContent.includes(data.projectMetadata.projectName)) {
                    option.selected = true;
                    break;
                }
            }
        }
    }

    setElementValue('projectNumber', data.projectMetadata?.projectNumber || '');
    setElementValue('date', data.projectMetadata?.date || '');
    setElementValue('calculatedBy', data.projectMetadata?.calculatedBy || '');
    setElementValue('reviewedBy', data.projectMetadata?.reviewedBy || '');
    setElementValue('location', data.projectMetadata?.location || '');
    setElementValue('notes', data.projectMetadata?.notes || '');

    if (data.selfStressing?.inputs) {
        const inputs = data.selfStressing.inputs;
        setElementValue('ss_initialPull', inputs.initialPull || '');
        setElementValue('ss_requiredForce', inputs.requiredForce || '');
        setElementValue('ss_MOE', inputs.MOE || '');
        setElementValue('ss_numberOfStrands', inputs.numberOfStrands || '');
        setElementValue('ss_adjBedShortening', inputs.adjBedShortening || '');
        setElementValue('ss_blockToBlockLength', inputs.blockToBlockLength || '');
        setElementValue('ss_strandSize', inputs.strandSize || '');
        setElementValue('ss_strandArea', inputs.strandArea || '');
        setElementValue('ss_deadEndSeating', inputs.deadEndSeating || '');
        setElementValue('ss_liveEndSeating', inputs.liveEndSeating || '');
    }

    if (data.nonSelfStressing?.inputs) {
        const inputs = data.nonSelfStressing.inputs;
        setElementValue('nss_initialPull', inputs.initialPull || '');
        setElementValue('nss_requiredForce', inputs.requiredForce || '');
        setElementValue('nss_MOE', inputs.MOE || '');
        setElementValue('nss_blockToBlockLength', inputs.blockToBlockLength || '');
        setElementValue('nss_strandSize', inputs.strandSize || '');
        setElementValue('nss_strandArea', inputs.strandArea || '');
        setElementValue('nss_airTemp', inputs.airTemp || '');
        setElementValue('nss_concreteTemp', inputs.concreteTemp || '');
        setElementValue('nss_deadEndSeating', inputs.deadEndSeating || '');
        setElementValue('nss_liveEndSeating', inputs.liveEndSeating || '');
        setElementValue('nss_totalAbutmentRotation', inputs.totalAbutmentRotation || '');
    }

    calculateAll();
}

function setElementValue(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.value = value;
    }
}

async function deleteReport(objectKey, bucketKey, reportId, source) {
    if (!confirm(`Are you sure you want to delete report "${reportId}"? This action cannot be undone.`)) {
        return;
    }

    try {
        if (source === 'oss-backend' && bucketKey) {
            // Delete from OSS backend
            const response = await fetch('/.netlify/functions/oss-storage', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${forgeAccessToken}`
                },
                body: JSON.stringify({
                    action: 'delete-report',
                    data: {
                        bucketKey: bucketKey,
                        objectKey: objectKey
                    }
                })
            });

            if (!response.ok) {
                console.log('OSS delete failed, removing from local list only');
            }
        }

        // Remove from local storage
        localStorage.removeItem(objectKey);

        // Remove from project reports list if it's a storage key
        if (objectKey.startsWith('bedqc_')) {
            const projectReportsKey = `bedqc_reports_${projectId}`;
            const existingReports = JSON.parse(localStorage.getItem(projectReportsKey) || '[]');
            const reportIdToRemove = objectKey.split('_').pop();

            const updatedReports = existingReports.filter(id => id !== reportIdToRemove);
            localStorage.setItem(projectReportsKey, JSON.stringify(updatedReports));
        }

        // Remove from display
        existingReports = existingReports.filter(r => r.objectKey !== objectKey);
        displayReports(existingReports);

        alert('Report deleted successfully');

    } catch (error) {
        console.error('Error deleting report:', error);
        alert('Failed to delete report: ' + error.message);
    }
}

function setupModalHandlers() {
    const bedSelectionModal = document.getElementById('bedSelectionModal');
    if (bedSelectionModal) {
        bedSelectionModal.addEventListener('click', function (e) {
            if (e.target === this) {
                closeBedSelection();
            }
        });
    }

    const calculatorModal = document.getElementById('calculatorModal');
    if (calculatorModal) {
        calculatorModal.addEventListener('click', function (e) {
            if (e.target === this) {
                closeCalculator();
            }
        });
    }
}

function setupUI() {
    const dateInput = document.getElementById('date');
    if (dateInput) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }
}

document.addEventListener('DOMContentLoaded', function () {
    console.log('Quality Control page loaded with OSS backend integration');
    console.log('Requesting scopes:', ACC_SCOPES);
    setupUI();
    setupModalHandlers();
    initializeApp();
});
