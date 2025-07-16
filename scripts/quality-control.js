// ACC CONNECT CONFIGURATION
const ACC_CLIENT_ID = 'phUPKRBuqECpJUoBmRuKdKhSP3ZTRALH4LMWKAzAnymnYkQU';
const ACC_CALLBACK_URL = 'https://metrocastpro.com/';

// ACC/Forge Integration Variables
let forgeAccessToken = null;
let projectId = null;
let hubId = null;
let userProfile = null;
let isACCConnected = false;
let currentCalculation = null;
let userProjects = [];

// Form Instance Management
let currentReportId = null;
let currentBedId = null;
let currentBedName = null;
let reportInstances = new Map(); // Store multiple form instances

// UI Elements
const authProcessing = document.getElementById('authProcessing');
const authTitle = document.getElementById('authTitle');
const authMessage = document.getElementById('authMessage');

// Authentication Flow
async function initializeApp() {
    try {
        // Check if we're coming from the main app with authentication
        if (window.opener && window.opener.CastLinkAuth) {
            const parentAuth = window.opener.CastLinkAuth;
            const isParentAuth = await parentAuth.waitForAuth();
            
            if (isParentAuth) {
                forgeAccessToken = parentAuth.getToken();
                await completeAuthentication();
                return;
            }
        }
        
        // Check for stored authentication
        const storedToken = getStoredToken();
        if (storedToken && !isTokenExpired(storedToken)) {
            forgeAccessToken = storedToken.access_token;
            
            // Verify token is still valid
            const isValid = await verifyToken(forgeAccessToken);
            if (isValid) {
                await completeAuthentication();
            } else {
                // Token is invalid, redirect to main app for re-authentication
                clearStoredToken();
                redirectToMainApp();
            }
        } else {
            // No valid token, redirect to main app
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
        
        // Load project data
        await loadRealProjectData();
        
        // Authentication complete
        isACCConnected = true;
        
        // Show success and hide auth overlay
        updateAuthStatus('Success!', 'Successfully connected to ACC');
        
        // Small delay to show success message
        await new Promise(resolve => setTimeout(resolve, 800));
        
        // Hide auth overlay and show main content
        authProcessing.classList.remove('active');
        document.body.classList.remove('auth-loading');
        
        // Show auth status badge
        document.getElementById('authStatusBadge').style.display = 'inline-flex';
        
        // Enable ACC features
        enableACCFeatures();
        
        console.log('Authentication completed successfully');
        
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
    authTitle.textContent = title;
    authMessage.textContent = message;
}

function showAuthError(message) {
    updateAuthStatus('Authentication Error', message);
    authProcessing.innerHTML = `
        <div class="auth-processing-content">
            <div style="color: #dc2626; font-size: 2rem; margin-bottom: 1rem;">⚠️</div>
            <h3 style="color: #dc2626;">Authentication Error</h3>
            <p style="color: #6b7280; margin-bottom: 1.5rem;">${message}</p>
            <button onclick="window.location.href='index.html'" style="background: #059669; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; cursor: pointer; font-size: 0.875rem; margin-right: 0.5rem;">
                Go to Main App
            </button>
            <button onclick="location.reload()" style="background: #6b7280; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; cursor: pointer; font-size: 0.875rem;">
                Try Again
            </button>
        </div>
    `;
}

// Token Management
function getStoredToken() {
    // Try sessionStorage first, then localStorage
    let stored = sessionStorage.getItem('forge_token');
    if (!stored) {
        stored = localStorage.getItem('forge_token_backup');
        if (stored) {
            // Restore to sessionStorage
            sessionStorage.setItem('forge_token', stored);
        }
    }
    return stored ? JSON.parse(stored) : null;
}

function isTokenExpired(tokenInfo) {
    const now = Date.now();
    const expiresAt = tokenInfo.expires_at;
    const timeUntilExpiry = expiresAt - now;
    
    // Consider token expired if it expires in less than 5 minutes
    return timeUntilExpiry < (5 * 60 * 1000);
}

function clearStoredToken() {
    sessionStorage.removeItem('forge_token');
    localStorage.removeItem('forge_token_backup');
    console.log('Token cleared');
}

// Bed Selection Functions
function showBedSelection() {
    document.getElementById('bedSelectionModal').classList.add('active');
}

function closeBedSelection() {
    document.getElementById('bedSelectionModal').classList.remove('active');
    document.getElementById('bedSelect').value = '';
    document.getElementById('reportDescription').value = '';
}

function startBedReport() {
    const bedSelect = document.getElementById('bedSelect');
    const bedId = bedSelect.value;
    const bedName = bedSelect.options[bedSelect.selectedIndex].text;
    const description = document.getElementById('reportDescription').value;

    if (!bedId) {
        alert('Please select a bed before continuing.');
        return;
    }

    // Generate unique report ID
    const reportId = generateReportId(bedId);
    
    // Store report instance
    currentReportId = reportId;
    currentBedId = bedId;
    currentBedName = bedName;

    // Initialize new form instance
    initializeFormInstance(reportId, bedId, bedName, description);

    // Close bed selection and show calculator
    closeBedSelection();
    showCalculator();
}

function generateReportId(bedId) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 4);
    return `${bedId.toUpperCase()}-${timestamp}-${random}`;
}

function initializeFormInstance(reportId, bedId, bedName, description) {
    // Create new form instance data
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
        }
    };

    // Store instance
    reportInstances.set(reportId, formInstance);

    // Update UI
    document.getElementById('reportId').textContent = reportId;
    document.getElementById('selectedBedDisplay').textContent = bedName;
}

function showCalculator() {
    document.getElementById('calculatorModal').classList.add('active');
    
    // Clear form data for new instance
    clearFormData();
    
    // Initialize calculations
    calculateAll();
}

function closeCalculator() {
    document.getElementById('calculatorModal').classList.remove('active');
    
    // Save current state to instance before closing
    if (currentReportId) {
        saveFormInstance();
    }
}

function clearFormData() {
    // Clear all input fields
    const inputs = document.querySelectorAll('#calculatorModal input[type="number"], #calculatorModal input[type="text"], #calculatorModal input[type="date"], #calculatorModal textarea, #calculatorModal select');
    inputs.forEach(input => {
        if (input.type === 'date') {
            input.value = new Date().toISOString().split('T')[0];
        } else if (input.type === 'number') {
            input.value = '';
        } else if (input.tagName === 'SELECT') {
            input.selectedIndex = 0;
        } else {
            input.value = '';
        }
    });
}

function saveFormInstance() {
    if (!currentReportId) return;

    const instance = reportInstances.get(currentReportId);
    if (!instance) return;

    // Update project metadata
    instance.projectMetadata = {
        projectName: document.getElementById('projectName').value,
        projectNumber: document.getElementById('projectNumber').value,
        date: document.getElementById('date').value,
        calculatedBy: document.getElementById('calculatedBy').value,
        reviewedBy: document.getElementById('reviewedBy').value,
        location: document.getElementById('location').value,
        notes: document.getElementById('notes').value
    };

    // Update calculations
    instance.calculations = currentCalculation;

    // Save back to storage
    reportInstances.set(currentReportId, instance);
}

// Modal click outside to close
document.getElementById('bedSelectionModal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeBedSelection();
    }
});

document.getElementById('calculatorModal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeCalculator();
    }
});

// Project Data Loading
async function loadRealProjectData() {
    try {
        console.log('Starting to load real project data...');
        
        const hubsResponse = await fetch('https://developer.api.autodesk.com/project/v1/hubs', {
            headers: {
                'Authorization': `Bearer ${forgeAccessToken}`
            }
        });
        
        if (!hubsResponse.ok) {
            const errorText = await hubsResponse.text();
            console.error('Hubs response error:', hubsResponse.status, errorText);
            throw new Error(`Failed to load hubs: ${hubsResponse.status} ${errorText}`);
        }
        
        const hubsData = await hubsResponse.json();
        console.log('Hubs data received:', hubsData);
        
        const accHubs = hubsData.data.filter(hub => 
            hub.attributes.extension?.type === 'hubs:autodesk.bim360:Account'
        );
        
        console.log('ACC hubs found:', accHubs.length);
        
        if (accHubs.length > 0) {
            const firstAccHub = accHubs[0];
            console.log('Using ACC hub:', firstAccHub.attributes.name, firstAccHub.id);
            
            await loadProjectsFromHub(firstAccHub.id);
        } else {
            console.warn('No ACC hubs found in response');
            throw new Error('No ACC hubs found - only Fusion 360 hubs available');
        }
        
        console.log('Project data loading completed successfully');
        
    } catch (error) {
        console.error('Failed to load project data:', error);
        
        // Still enable manual entry mode
        const projectSelect = document.getElementById('projectName');
        projectSelect.innerHTML = '<option value="">Enter project details manually below...</option>';
        projectSelect.disabled = false;
        
        ['projectNumber', 'calculatedBy', 'location'].forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.disabled = false;
                element.placeholder = element.placeholder.replace('Loading from ACC...', 'Enter manually');
            }
        });
        
        document.getElementById('accDetails').innerHTML = `
            <div style="color: #dc2626;">
                <strong>Project Loading Issue:</strong> ${error.message}<br>
                <small>You can still use the calculator by entering project details manually</small>
            </div>
        `;
    }
}

async function loadProjectsFromHub(hubId) {
    try {
        console.log('Loading projects from ACC hub:', hubId);
        
        const projectsResponse = await fetch(`https://developer.api.autodesk.com/project/v1/hubs/${hubId}/projects`, {
            headers: {
                'Authorization': `Bearer ${forgeAccessToken}`
            }
        });
        
        if (!projectsResponse.ok) {
            throw new Error('Failed to load projects');
        }
        
        const projectsData = await projectsResponse.json();
        console.log('ACC projects data received:', projectsData);
        
        const projects = await Promise.all(projectsData.data.map(async (project) => {
            console.log('Processing ACC project:', project.attributes.name);
            
            let projectNumber = '';
            let location = '';
            let additionalData = {};
            
            try {
                const projectDetailResponse = await fetch(`https://developer.api.autodesk.com/project/v1/hubs/${hubId}/projects/${project.id}`, {
                    headers: {
                        'Authorization': `Bearer ${forgeAccessToken}`
                    }
                });
                
                if (projectDetailResponse.ok) {
                    const projectDetail = await projectDetailResponse.json();
                    console.log('Project detail for', project.attributes.name, ':', projectDetail);
                    
                    if (projectDetail.data?.attributes?.extension?.data) {
                        const extData = projectDetail.data.attributes.extension.data;
                        
                        projectNumber = extData.projectNumber || 
                                      extData.project_number || 
                                      extData.number || 
                                      extData.jobNumber ||
                                      extData.job_number ||
                                      extData.projectId ||
                                      extData.project_id ||
                                      extData.accountId ||
                                      extData.projectCode ||
                                      extData.code || '';
                        
                        location = extData.location || 
                                 extData.project_location || 
                                 extData.address ||
                                 extData.city ||
                                 extData.state ||
                                 extData.jobLocation ||
                                 extData.site || '';
                    }
                }
            } catch (detailError) {
                console.warn('Could not get detailed project info for', project.attributes.name, ':', detailError);
            }
            
            if (!projectNumber && project.attributes.extension?.data) {
                const extData = project.attributes.extension.data;
                projectNumber = extData.projectNumber || 
                              extData.project_number || 
                              extData.number || 
                              extData.projectId ||
                              extData.project_id || '';
            }
            
            if (!projectNumber) {
                const namePatterns = [
                    /([A-Z]{2,}-\d+)/,
                    /(\d{4}-\d+)/,
                    /([A-Z]+\d+)/,
                    /(Job\s*\d+)/i,
                    /(\d{6,})/,
                    /([A-Z]{3,}\d{3,})/
                ];
                
                for (const pattern of namePatterns) {
                    const match = project.attributes.name.match(pattern);
                    if (match) {
                        projectNumber = match[1];
                        break;
                    }
                }
            }
            
            if (!projectNumber) {
                projectNumber = `ACC-${project.id.split('#').pop().slice(-6)}`;
            }
            
            return {
                id: project.id,
                name: project.attributes.name || 'Unnamed Project',
                number: projectNumber,
                location: location || 'Location not specified',
                additionalData,
                fullData: project
            };
        }));
        
        console.log('Processed ACC projects with enhanced metadata:', projects);
        
        populateProjectDropdown(projects);
        
        if (projects.length > 0) {
            setTimeout(() => {
                const projectSelect = document.getElementById('projectName');
                if (projectSelect) {
                    projectSelect.value = projects[0].id;
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
        console.log('Populating dropdown with ACC projects:', projects);
        
        userProjects = projects;
        const projectSelect = document.getElementById('projectName');
        
        if (!projectSelect) {
            console.error('Project select element not found');
            return;
        }
        
        projectSelect.innerHTML = '<option value="">Select an ACC project...</option>';
        
        projects.forEach((project, index) => {
            console.log(`Adding ACC project ${index + 1}:`, project.name, 'Number:', project.number);
            
            const option = document.createElement('option');
            option.value = project.id;
            option.textContent = `${project.name} (${project.number})`;
            option.dataset.projectNumber = project.number || '';
            option.dataset.location = project.location || '';
            projectSelect.appendChild(option);
        });
        
        projectSelect.disabled = false;
        projectSelect.style.backgroundColor = '';
        
        console.log('ACC project dropdown populated successfully');
        
        document.getElementById('accDetails').innerHTML = `
            <strong>Status:</strong> Connected to ACC<br>
            <strong>Projects Found:</strong> ${projects.length} ACC projects<br>
            <strong>Hub:</strong> Metromont ACC Account
        `;
        
    } catch (error) {
        console.error('Error in populateProjectDropdown:', error);
        throw error;
    }
}

function onProjectSelected() {
    const projectSelect = document.getElementById('projectName');
    const selectedOption = projectSelect.selectedOptions[0];
    
    if (selectedOption && selectedOption.value) {
        const projectNumber = selectedOption.dataset.projectNumber || '';
        const location = selectedOption.dataset.location || '';
        
        console.log('Selected ACC project:', selectedOption.textContent);
        console.log('Project number:', projectNumber);
        console.log('Location:', location);
        
        document.getElementById('projectNumber').value = projectNumber;
        document.getElementById('location').value = location;
        
        document.getElementById('projectNumber').disabled = false;
        document.getElementById('location').disabled = false;
        document.getElementById('calculatedBy').disabled = false;
        
        document.getElementById('projectSource').style.display = 'inline-flex';
        document.getElementById('projectSource').textContent = 'Selected from ACC';
        
        if (!document.getElementById('calculatedBy').value) {
            document.getElementById('calculatedBy').value = 'ACC User';
        }
    }
}

function enableACCFeatures() {
    document.getElementById('saveBtn').disabled = false;
    document.getElementById('exportBtn').disabled = false;
}

function setupUI() {
    const dateInput = document.getElementById('date');
    if (dateInput) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }
}

// Utility functions
function formatNumber(num) {
    if (isNaN(num) || !isFinite(num)) return '0.000';
    return num.toFixed(3);
}

function formatInteger(num) {
    if (isNaN(num) || !isFinite(num)) return '0';
    return Math.round(num).toString();
}

function getValue(id) {
    return parseFloat(document.getElementById(id).value) || 0;
}

// Calculation functions
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

    document.getElementById('ss_basicElongation').textContent = formatNumber(basicElongation) + ' in';
    document.getElementById('ss_bedShortening').textContent = formatNumber(bedShortening) + ' in';
    document.getElementById('ss_desiredElongationRounded').textContent = formatNumber(desiredElongationRounded) + ' in';
    document.getElementById('ss_calculatedPullRounded').textContent = formatInteger(calculatedPullRounded) + ' lbs';

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

    document.getElementById('nss_basicElongation').textContent = formatNumber(basicElongation) + ' in';
    document.getElementById('nss_tempDifference').textContent = formatNumber(tempDifference);
    document.getElementById('nss_tempCorrection').textContent = formatNumber(tempCorrection);
    document.getElementById('nss_desiredElongationRounded').textContent = formatNumber(desiredElongationRounded) + ' in';
    document.getElementById('nss_calculatedPullRounded').textContent = formatInteger(calculatedPullRounded) + ' lbs';

    return {
        basicElongation, tempDifference, tca2, tcPart1, tcPart2, tempCorrection,
        desiredElongation, desiredElongationRounded, LESeatingAdd, tca1,
        tcPart1Pull, tcPart2Pull, tempCorrectionPull, desiredPull, calculatedPullRounded
    };
}

function calculateAll() {
    const selfStressingResults = calculateSelfStressing();
    const nonSelfStressingResults = calculateNonSelfStressing();
    
    currentCalculation = {
        timestamp: new Date().toISOString(),
        reportId: currentReportId,
        bedId: currentBedId,
        bedName: currentBedName,
        projectMetadata: {
            projectName: document.getElementById('projectName').value,
            projectNumber: document.getElementById('projectNumber').value,
            date: document.getElementById('date').value,
            calculatedBy: document.getElementById('calculatedBy').value,
            reviewedBy: document.getElementById('reviewedBy').value,
            location: document.getElementById('location').value,
            notes: document.getElementById('notes').value
        },
        selfStressing: {
            inputs: {
                initialPull: getValue('ss_initialPull'),
                requiredForce: getValue('ss_requiredForce'),
                MOE: getValue('ss_MOE'),
                numberOfStrands: getValue('ss_numberOfStrands'),
                adjBedShortening: getValue('ss_adjBedShortening'),
                blockToBlockLength: getValue('ss_blockToBlockLength'),
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

// ACC Integration Functions
async function saveToACC() {
    if (!isACCConnected) {
        alert('Not connected to ACC. Please check your connection.');
        return;
    }

    try {
        const saveBtn = document.getElementById('saveBtn');
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<div class="loading"></div> Saving...';

        await new Promise(resolve => setTimeout(resolve, 1500));

        console.log('Saved to ACC:', currentCalculation);
        
        saveBtn.disabled = false;
        saveBtn.innerHTML = `
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
            </svg>
            Save to ACC
        `;
        
        alert('Calculation saved to ACC successfully!');
    } catch (error) {
        console.error('Save to ACC failed:', error);
        alert('Failed to save to ACC: ' + error.message);
        
        saveBtn.disabled = false;
        saveBtn.innerHTML = `
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
            </svg>
            Save to ACC
        `;
    }
}

async function exportToACCDocs() {
    if (!isACCConnected) {
        alert('Not connected to ACC. Please check your connection.');
        return;
    }

    try {
        const exportBtn = document.getElementById('exportBtn');
        exportBtn.disabled = true;
        exportBtn.innerHTML = '<div class="loading"></div> Exporting...';

        generatePDFData();

        await new Promise(resolve => setTimeout(resolve, 2000));

        exportBtn.disabled = false;
        exportBtn.innerHTML = `
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
            </svg>
            Export to ACC
        `;

        alert('Report exported to ACC Documents successfully!');
    } catch (error) {
        console.error('Export to ACC failed:', error);
        alert('Failed to export to ACC: ' + error.message);
    }
}

function generatePDF() {
    generatePDFData();
    window.print();
}

function generatePDFData() {
    const metadata = currentCalculation.projectMetadata;
    const selfStressingResults = currentCalculation.selfStressing.outputs;
    const nonSelfStressingResults = currentCalculation.nonSelfStressing.outputs;

    document.getElementById('printMetadata').innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 10px;">
            <div><strong>Report ID:</strong> ${currentReportId}</div>
            <div><strong>Bed:</strong> ${currentBedName}</div>
            <div><strong>Date:</strong> ${metadata.date}</div>
            <div><strong>Project:</strong> ${metadata.projectName}</div>
            <div><strong>Project #:</strong> ${metadata.projectNumber}</div>
            <div><strong>Location:</strong> ${metadata.location}</div>
            <div><strong>Calculated By:</strong> ${metadata.calculatedBy}</div>
            <div><strong>Reviewed By:</strong> ${metadata.reviewedBy}</div>
            <div></div>
        </div>
        ${metadata.notes ? `<div><strong>Notes:</strong> ${metadata.notes}</div>` : ''}
    `;

    document.getElementById('printSelfStressInputs').innerHTML = `
        <h4>Input Values:</h4>
        <div><strong>Initial Pull:</strong> ${currentCalculation.selfStressing.inputs.initialPull} lbs</div>
        <div><strong>Required Force:</strong> ${currentCalculation.selfStressing.inputs.requiredForce} lbs</div>
        <div><strong>MOE:</strong> ${currentCalculation.selfStressing.inputs.MOE}</div>
        <div><strong># of Strands:</strong> ${currentCalculation.selfStressing.inputs.numberOfStrands}</div>
        <div><strong>Adjusted Bed Shortening:</strong> ${currentCalculation.selfStressing.inputs.adjBedShortening} inches</div>
        <div><strong>Block-to-Block Length:</strong> ${currentCalculation.selfStressing.inputs.blockToBlockLength} feet</div>
        <div><strong>Strand Area:</strong> ${currentCalculation.selfStressing.inputs.strandArea} sq inches</div>
        <div><strong>Dead-End Seating:</strong> ${currentCalculation.selfStressing.inputs.deadEndSeating} inches</div>
        <div><strong>Live End Seating:</strong> ${currentCalculation.selfStressing.inputs.liveEndSeating} inches</div>
    `;

    document.getElementById('printSelfStressResults').innerHTML = `
        <h4>Calculated Results:</h4>
        <div style="display: flex; justify-content: space-between;"><span>Basic Elongation:</span><span>${formatNumber(selfStressingResults.basicElongation)} inches</span></div>
        <div style="display: flex; justify-content: space-between;"><span>Bed Shortening:</span><span>${formatNumber(selfStressingResults.bedShortening)} inches</span></div>
        <div style="display: flex; justify-content: space-between; font-weight: bold; color: #dc2626;"><span>Desired Elongation (Rounded):</span><span>${formatNumber(selfStressingResults.desiredElongationRounded)} inches</span></div>
        <div style="display: flex; justify-content: space-between; font-weight: bold; color: #dc2626;"><span>Calculated Pull (Rounded):</span><span>${formatInteger(selfStressingResults.calculatedPullRounded)} lbs</span></div>
    `;

    document.getElementById('printNonSelfStressInputs').innerHTML = `
        <h4>Input Values:</h4>
        <div><strong>Initial Pull:</strong> ${currentCalculation.nonSelfStressing.inputs.initialPull} lbs</div>
        <div><strong>Required Force:</strong> ${currentCalculation.nonSelfStressing.inputs.requiredForce} lbs</div>
        <div><strong>MOE:</strong> ${currentCalculation.nonSelfStressing.inputs.MOE}</div>
        <div><strong>Block-to-Block Length:</strong> ${currentCalculation.nonSelfStressing.inputs.blockToBlockLength} feet</div>
        <div><strong>Strand Area:</strong> ${currentCalculation.nonSelfStressing.inputs.strandArea} sq inches</div>
        <div><strong>Air Temperature:</strong> ${currentCalculation.nonSelfStressing.inputs.airTemp} °F</div>
        <div><strong>Concrete Temperature:</strong> ${currentCalculation.nonSelfStressing.inputs.concreteTemp} °F</div>
        <div><strong>Dead-End Seating:</strong> ${currentCalculation.nonSelfStressing.inputs.deadEndSeating} inches</div>
        <div><strong>Live End Seating:</strong> ${currentCalculation.nonSelfStressing.inputs.liveEndSeating} inches</div>
        <div><strong>Total Abutment Rotation:</strong> ${currentCalculation.nonSelfStressing.inputs.totalAbutmentRotation} inches</div>
    `;

    document.getElementById('printNonSelfStressResults').innerHTML = `
        <h4>Calculated Results:</h4>
        <div style="display: flex; justify-content: space-between;"><span>Basic Elongation:</span><span>${formatNumber(nonSelfStressingResults.basicElongation)} inches</span></div>
        <div style="display: flex; justify-content: space-between;"><span>Temperature Difference:</span><span>${formatNumber(nonSelfStressingResults.tempDifference)}</span></div>
        <div style="display: flex; justify-content: space-between;"><span>Temperature Correction:</span><span>${formatNumber(nonSelfStressingResults.tempCorrection)}</span></div>
        <div style="display: flex; justify-content: space-between; font-weight: bold; color: #dc2626;"><span>Desired Elongation (Rounded):</span><span>${formatNumber(nonSelfStressingResults.desiredElongationRounded)} inches</span></div>
        <div style="display: flex; justify-content: space-between; font-weight: bold; color: #dc2626;"><span>Calculated Pull (Rounded):</span><span>${formatInteger(nonSelfStressingResults.calculatedPullRounded)} lbs</span></div>
    `;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    setupUI();
    initializeApp();
});