// Erection Sequence Scheduling Module
console.log('Erection Sequencing module loaded');

// Global State
let isAuthenticated = false;
let globalHubData = null;
let selectedProjectId = null;
let selectedElementGroup = null;
let viewer = null;
let viewerModel = null;
let scheduleData = null;
let isPlaying = false;
let playInterval = null;
let currentDayIndex = 0;
let timelineDays = [];
let activityElementMap = new Map(); // Map<activityName, Set<propertyValue>>
let dayActivitiesMap = new Map(); // Map<dayISO, Set<activityName>>

// Make token available globally for GraphQL helper
window.forgeAccessToken = null;

// UI Elements
const authProcessing = document.getElementById('authProcessing');
const authTitle = document.getElementById('authTitle');
const authMessage = document.getElementById('authMessage');

// Initialize the module
async function initializeErectionSequencing() {
    try {
        console.log('=== ERECTION SEQUENCING INITIALIZATION ===');

        updateAuthStatus('Checking Authentication...', 'Verifying access to ACC and AEC Data Model...');

        // Auth bootstrap - same pattern as production-scheduling.js
        if (window.opener && window.opener.CastLinkAuth) {
            const parentAuth = window.opener.CastLinkAuth;
            try {
                const isParentAuth = await parentAuth.waitForAuth();
                if (isParentAuth) {
                    window.forgeAccessToken = parentAuth.getToken();
                    globalHubData = parentAuth.getHubData();
                    await completeAuthentication();
                    return;
                }
            } catch (error) {
                console.warn('Parent auth not available:', error);
            }
        }

        // Fallback to stored token
        const storedToken = getStoredToken();
        if (storedToken && !isTokenExpired(storedToken)) {
            window.forgeAccessToken = storedToken.access_token;
            
            // Try to get hub data from session storage
            const sessionHubData = sessionStorage.getItem('castlink_hub_data');
            if (sessionHubData) {
                try {
                    globalHubData = JSON.parse(sessionHubData);
                } catch (e) {
                    console.error('Failed to parse session hub data:', e);
                }
            }
            
            await completeAuthentication();
        } else {
            redirectToMainApp();
        }

    } catch (error) {
        console.error('Erection Sequencing initialization failed:', error);
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
        updateAuthStatus('Loading Project Data...', 'Connecting to ACC and AEC Data Model...');

        isAuthenticated = true;

        const projectCount = globalHubData && globalHubData.projects ? globalHubData.projects.length : 0;
        const accountName = globalHubData && globalHubData.accountInfo ? globalHubData.accountInfo.name : 'ACC Account';

        updateAuthStatus('Success!', `Connected to ${accountName} with ${projectCount} projects`);

        await new Promise(resolve => setTimeout(resolve, 800));

        // Hide auth overlay
        if (authProcessing) {
            authProcessing.classList.remove('active');
        }
        document.body.classList.remove('auth-loading');

        // Show auth status badge
        const authStatusBadge = document.getElementById('authStatusBadge');
        if (authStatusBadge) {
            authStatusBadge.style.display = 'inline-flex';
            authStatusBadge.innerHTML = `
                <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
                Connected to ${accountName}
            `;
        }

        // Populate project dropdown
        populateProjectDropdown();

        // Initialize Viewer
        initializeViewer();

        // Set up event listeners
        setupEventListeners();

        console.log('✅ Erection Sequencing ready');

    } catch (error) {
        console.error('Authentication completion failed:', error);
        showAuthError('Failed to initialize: ' + error.message);
    }
}

function populateProjectDropdown() {
    const projectSelect = document.getElementById('esProjectSelect');
    if (!projectSelect) return;

    if (!globalHubData || !globalHubData.projects || globalHubData.projects.length === 0) {
        projectSelect.innerHTML = '<option value="">No projects available</option>';
        return;
    }

    projectSelect.innerHTML = '<option value="">Select a project...</option>';
    
    globalHubData.projects.forEach(project => {
        const option = document.createElement('option');
        option.value = project.id;
        option.textContent = `${project.name}${project.number && project.number !== 'N/A' ? ' (' + project.number + ')' : ''}`;
        option.dataset.projectData = JSON.stringify(project);
        projectSelect.appendChild(option);
    });

    projectSelect.disabled = false;

    // Auto-select first project if available
    if (globalHubData.projects.length > 0) {
        projectSelect.value = globalHubData.projects[0].id;
        onProjectChange();
    }
}

async function onProjectChange() {
    const projectSelect = document.getElementById('esProjectSelect');
    const modelSelect = document.getElementById('esModelSelect');
    
    if (!projectSelect || !projectSelect.value) {
        modelSelect.innerHTML = '<option value="">Select a project first...</option>';
        modelSelect.disabled = true;
        return;
    }

    selectedProjectId = projectSelect.value;
    console.log('Project selected:', selectedProjectId);

    // Reset model selection
    modelSelect.innerHTML = '<option value="">Loading designs from AEC Data Model...</option>';
    modelSelect.disabled = true;

    // Clear viewer
    if (viewer && viewerModel) {
        viewer.unloadModel(viewerModel);
        viewerModel = null;
    }

    try {
        // Load designs (element groups) for the selected project
        await loadDesignsForProject(selectedProjectId);
    } catch (error) {
        console.error('Error loading designs:', error);
        modelSelect.innerHTML = `<option value="">Error loading designs: ${error.message}</option>`;
        showNotification('Failed to load designs: ' + error.message, 'error');
    }
}

async function loadDesignsForProject(projectId) {
    const modelSelect = document.getElementById('esModelSelect');
    
    try {
        console.log('📂 Loading designs for project:', projectId);

        // Use AEC DM GraphQL helper
        const elementGroups = await window.AECDataModel.getElementGroups(projectId);

        if (!elementGroups || elementGroups.length === 0) {
            modelSelect.innerHTML = '<option value="">No AEC Data Model designs found</option>';
            showNotification('No designs found. Ensure AEC Data Model is activated and models are Revit 2024+', 'warning');
            return;
        }

        console.log(`✅ Found ${elementGroups.length} designs`);

        modelSelect.innerHTML = '<option value="">Select a design...</option>';

        elementGroups.forEach(eg => {
            const option = document.createElement('option');
            option.value = eg.id;
            option.textContent = eg.name;
            option.dataset.urn = eg.fileVersionUrn || '';
            option.dataset.egid = eg.id;
            modelSelect.appendChild(option);
        });

        modelSelect.disabled = false;

    } catch (error) {
        console.error('Error in loadDesignsForProject:', error);
        
        // Check if it's a region issue
        if (error.message.includes('404') || error.message.includes('not found')) {
            modelSelect.innerHTML = '<option value="">No data - check region or AEC DM activation</option>';
            showNotification('No AEC Data Model data. Try EMEA/AUS region or verify AEC DM is activated.', 'warning');
        } else {
            throw error;
        }
    }
}

async function onModelChange() {
    const modelSelect = document.getElementById('esModelSelect');
    
    if (!modelSelect || !modelSelect.value) {
        return;
    }

    const selectedOption = modelSelect.options[modelSelect.selectedIndex];
    const fileVersionUrn = selectedOption.dataset.urn;
    const elementGroupId = selectedOption.dataset.egid;

    if (!fileVersionUrn) {
        showNotification('No file version URN found for this design', 'error');
        return;
    }

    selectedElementGroup = {
        id: elementGroupId,
        name: selectedOption.textContent,
        urn: fileVersionUrn
    };

    console.log('Design selected:', selectedElementGroup);

    // Load the model in the viewer
    await loadModelInViewer(fileVersionUrn);
}

// Initialize Autodesk Viewer
function initializeViewer() {
    console.log('Initializing Forge Viewer...');

    const viewerDiv = document.getElementById('esViewer');
    if (!viewerDiv) {
        console.error('Viewer container not found');
        return;
    }

    const options = {
        env: 'AutodeskProduction2',
        api: 'streamingV2',
        getAccessToken: (callback) => {
            callback(window.forgeAccessToken, 3600);
        }
    };

    Autodesk.Viewing.Initializer(options, function() {
        console.log('Viewer initialized, creating viewer instance...');

        viewer = new Autodesk.Viewing.GuiViewer3D(viewerDiv);
        
        const startResult = viewer.start();
        if (startResult > 0) {
            console.error('Failed to create viewer:', startResult);
            showNotification('Failed to initialize 3D viewer', 'error');
            return;
        }

        console.log('✅ Viewer started successfully');
        updateViewerStatus('Viewer ready');
    });
}

async function loadModelInViewer(urn) {
    if (!viewer) {
        showNotification('Viewer not initialized', 'error');
        return;
    }

    // Unload any existing model
    if (viewerModel) {
        viewer.unloadModel(viewerModel);
        viewerModel = null;
    }

    updateViewerStatus('Loading model...');
    showNotification('Loading model in viewer...', 'info');

    const documentId = `urn:${urn}`;
    console.log('Loading document:', documentId);

    Autodesk.Viewing.Document.load(
        documentId,
        onDocumentLoadSuccess,
        onDocumentLoadFailure
    );
}

function onDocumentLoadSuccess(doc) {
    console.log('✅ Document loaded successfully');

    const viewables = doc.getRoot().getDefaultGeometry();
    
    if (!viewables) {
        console.error('No viewables found');
        const allViewables = doc.getRoot().search({ 'type': 'geometry' });
        if (allViewables.length > 0) {
            viewer.loadDocumentNode(doc, allViewables[0]).then(onModelLoaded).catch(onModelLoadError);
        } else {
            showNotification('No 3D geometry found in model', 'error');
        }
        return;
    }

    viewer.loadDocumentNode(doc, viewables).then(onModelLoaded).catch(onModelLoadError);
}

function onModelLoaded(model) {
    console.log('✅ Model loaded successfully');
    viewerModel = model;

    viewer.fitToView();
    updateViewerStatus('Model loaded');
    showNotification('Model loaded successfully', 'success');

    // Update viewer info
    const viewerInfo = document.getElementById('viewerInfo');
    if (viewerInfo && selectedElementGroup) {
        viewerInfo.textContent = `Model: ${selectedElementGroup.name}`;
    }
}

function onModelLoadError(error) {
    console.error('❌ Error loading model:', error);
    updateViewerStatus('Model load failed');
    showNotification('Failed to load model: ' + (error.message || error), 'error');
}

function onDocumentLoadFailure(errorCode, errorMsg) {
    console.error('❌ Document load failed:', errorCode, errorMsg);
    updateViewerStatus('Document load failed');
    
    let userMessage = 'Failed to load model';
    
    switch (errorCode) {
        case 4:
            userMessage = 'Model translation in progress. Please try again in a few moments.';
            break;
        case 6:
            userMessage = 'Authentication expired. Please refresh the page.';
            break;
        case 7:
            userMessage = 'Network error loading model.';
            break;
        default:
            userMessage = `Failed to load model: ${errorMsg} (Code: ${errorCode})`;
    }
    
    showNotification(userMessage, 'error');
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

function updateAuthStatus(title, message) {
    if (authTitle) authTitle.textContent = title;
    if (authMessage) authMessage.textContent = message;
}

function showAuthError(message) {
    updateAuthStatus('Authentication Error', message);
    if (authProcessing) {
        authProcessing.innerHTML = `
            <div class="auth-processing-content">
                <div style="color: #dc2626; font-size: 2rem; margin-bottom: 1rem;">⚠️</div>
                <h3 style="color: #dc2626;">Authentication Error</h3>
                <p style="color: #6b7280; margin-bottom: 1.5rem;">${message}</p>
                <button onclick="window.location.href='scheduling-hub.html'" style="background: #059669; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; cursor: pointer; font-size: 0.875rem; margin-right: 0.5rem;">
                    Back to Hub
                </button>
                <button onclick="location.reload()" style="background: #6b7280; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; cursor: pointer; font-size: 0.875rem;">
                    Try Again
                </button>
            </div>
        `;
    }
}

// CSV Functions
function setupEventListeners() {
    const csvInput = document.getElementById('esCsvInput');
    if (csvInput) {
        csvInput.addEventListener('change', handleCSVUpload);
    }

    const modelSelect = document.getElementById('esModelSelect');
    if (modelSelect) {
        modelSelect.addEventListener('change', onModelChange);
    }

    const projectSelect = document.getElementById('esProjectSelect');
    if (projectSelect) {
        projectSelect.addEventListener('change', onProjectChange);
    }

    const scrubber = document.getElementById('timelineScrubber');
    if (scrubber) {
        scrubber.addEventListener('input', onTimelineScrub);
    }
}

async function handleCSVUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        const text = await file.text();
        parseAndLoadSchedule(text);
    } catch (error) {
        console.error('Error reading CSV:', error);
        showNotification('Failed to read CSV file', 'error');
    }
}

function parseAndLoadSchedule(csvText) {
    console.log('📋 Parsing CSV schedule...');

    try {
        const lines = csvText.trim().split('\n');
        if (lines.length < 2) {
            throw new Error('CSV file is empty or invalid');
        }

        // Expected columns: ActivityName, StartDate, DurationDays, EndDate, Type, Description, ElementValues
        const header = lines[0].split(',').map(h => h.trim());
        console.log('CSV Header:', header);

        const activities = [];
        const allDays = new Set();
        activityElementMap.clear();
        dayActivitiesMap.clear();

        for (let i = 1; i < lines.length; i++) {
            const row = lines[i].split(',').map(c => c.trim());
            if (row.length < 6) continue; // Skip invalid rows

            const activity = {
                name: row[0],
                startDate: row[1],
                durationDays: parseInt(row[2]) || 1,
                endDate: row[3],
                type: row[4] || 'Construct',
                description: row[5] || '',
                elementValues: row[6] ? row[6].split('|').map(v => v.trim()) : []
            };

            activities.push(activity);

            // Build activity -> element values map
            if (activity.elementValues.length > 0) {
                activityElementMap.set(activity.name, new Set(activity.elementValues));
            }

            // Build day -> activities map
            const start = new Date(activity.startDate);
            const end = new Date(activity.endDate);

            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                const dayISO = d.toISOString().split('T')[0];
                allDays.add(dayISO);

                if (!dayActivitiesMap.has(dayISO)) {
                    dayActivitiesMap.set(dayISO, new Set());
                }
                dayActivitiesMap.get(dayISO).add(activity.name);
            }
        }

        // Sort days
        timelineDays = Array.from(allDays).sort();

        scheduleData = {
            activities,
            totalActivities: activities.length,
            dateRange: `${timelineDays[0]} to ${timelineDays[timelineDays.length - 1]}`,
            days: timelineDays.length
        };

        console.log(`✅ Parsed ${activities.length} activities across ${timelineDays.length} days`);

        updateScheduleInfo();
        enablePlaybackControls();
        showNotification(`Schedule loaded: ${activities.length} activities`, 'success');

    } catch (error) {
        console.error('Error parsing CSV:', error);
        showNotification('Failed to parse CSV: ' + error.message, 'error');
    }
}

function updateScheduleInfo() {
    const totalActivitiesEl = document.getElementById('totalActivities');
    const dateRangeEl = document.getElementById('dateRange');
    const currentDayEl = document.getElementById('currentDay');

    if (totalActivitiesEl && scheduleData) {
        totalActivitiesEl.textContent = scheduleData.totalActivities;
    }

    if (dateRangeEl && scheduleData) {
        dateRangeEl.textContent = scheduleData.dateRange;
    }

    if (currentDayEl && timelineDays.length > 0) {
        currentDayEl.textContent = timelineDays[currentDayIndex] || '-';
    }

    // Update timeline scrubber
    const scrubber = document.getElementById('timelineScrubber');
    if (scrubber && timelineDays.length > 0) {
        scrubber.max = timelineDays.length - 1;
        scrubber.value = currentDayIndex;
        scrubber.disabled = false;
    }

    // Update timeline labels
    const timelineStart = document.getElementById('timelineStart');
    const timelineEnd = document.getElementById('timelineEnd');
    if (timelineStart && timelineDays.length > 0) {
        timelineStart.textContent = timelineDays[0];
    }
    if (timelineEnd && timelineDays.length > 0) {
        timelineEnd.textContent = timelineDays[timelineDays.length - 1];
    }
}

function enablePlaybackControls() {
    document.getElementById('esBtnPlay').disabled = false;
    document.getElementById('esBtnPause').disabled = false;
    document.getElementById('esBtnStep').disabled = false;
    document.getElementById('esBtnReset').disabled = false;
}

// Sample CSV data
function useSampleCSV() {
    console.log('Loading sample CSV...');

    const sampleCSV = `ActivityName,StartDate,DurationDays,EndDate,Type,Description,ElementValues
Foundation Work,2025-01-01,3,2025-01-03,Construct,Pour foundation,MK-001|MK-002|MK-003
Column Erection Phase 1,2025-01-04,2,2025-01-05,Construct,Install columns A-D,MK-004|MK-005|MK-006|MK-007
Beam Installation,2025-01-06,2,2025-01-07,Construct,Install beams level 1,MK-008|MK-009|MK-010
Wall Panel Phase 1,2025-01-08,3,2025-01-10,Construct,Install wall panels north,MK-011|MK-012|MK-013
Column Erection Phase 2,2025-01-11,2,2025-01-12,Construct,Install columns E-H,MK-014|MK-015|MK-016|MK-017
Deck Installation,2025-01-13,2,2025-01-14,Construct,Install deck level 1,MK-018|MK-019|MK-020
Wall Panel Phase 2,2025-01-15,2,2025-01-16,Construct,Install wall panels south,MK-021|MK-022|MK-023
Roof Structure,2025-01-17,3,2025-01-19,Construct,Install roof beams,MK-024|MK-025|MK-026`;

    parseAndLoadSchedule(sampleCSV);
}

// Playback Controls
function playSequence() {
    if (isPlaying) return;

    console.log('▶️ Playing sequence');
    isPlaying = true;

    document.getElementById('esBtnPlay').disabled = true;
    document.getElementById('esBtnPause').disabled = false;

    playInterval = setInterval(() => {
        stepForward();
        
        if (currentDayIndex >= timelineDays.length - 1) {
            pauseSequence();
        }
    }, 2000); // 2 seconds per day
}

function pauseSequence() {
    console.log('⏸️ Pausing sequence');
    isPlaying = false;

    if (playInterval) {
        clearInterval(playInterval);
        playInterval = null;
    }

    document.getElementById('esBtnPlay').disabled = false;
    document.getElementById('esBtnPause').disabled = true;
}

function stepForward() {
    if (currentDayIndex < timelineDays.length - 1) {
        currentDayIndex++;
    }

    updateTimelinePosition();
    updateCurrentActivities();
    isolateElementsForCurrentDay();
}

function resetSequence() {
    console.log('🔄 Resetting sequence');

    pauseSequence();
    currentDayIndex = 0;

    updateTimelinePosition();
    updateCurrentActivities();
    isolateElementsForCurrentDay();
}

function onTimelineScrub(event) {
    currentDayIndex = parseInt(event.target.value);
    pauseSequence();
    updateTimelinePosition();
    updateCurrentActivities();
    isolateElementsForCurrentDay();
}

function updateTimelinePosition() {
    const scrubber = document.getElementById('timelineScrubber');
    if (scrubber) {
        scrubber.value = currentDayIndex;
    }

    const currentDayEl = document.getElementById('currentDay');
    if (currentDayEl && timelineDays[currentDayIndex]) {
        currentDayEl.textContent = timelineDays[currentDayIndex];
    }
}

function updateCurrentActivities() {
    const activitiesList = document.getElementById('currentActivitiesList');
    if (!activitiesList) return;

    const currentDay = timelineDays[currentDayIndex];
    if (!currentDay) {
        activitiesList.innerHTML = '<p class="empty-message">No day selected</p>';
        return;
    }

    const activities = dayActivitiesMap.get(currentDay);
    if (!activities || activities.size === 0) {
        activitiesList.innerHTML = '<p class="empty-message">No activities for this day</p>';
        return;
    }

    const activitiesArray = Array.from(activities);
    const html = activitiesArray.map(name => {
        const activity = scheduleData.activities.find(a => a.name === name);
        const typeClass = activity ? activity.type.toLowerCase() : 'construct';
        
        return `
            <div class="activity-item activity-${typeClass}">
                <div class="activity-name">${name}</div>
                ${activity ? `<div class="activity-desc">${activity.description}</div>` : ''}
            </div>
        `;
    }).join('');

    activitiesList.innerHTML = html;
}

async function isolateElementsForCurrentDay() {
    if (!viewer || !viewerModel || !selectedElementGroup) {
        console.log('Viewer or model not ready');
        return;
    }

    const currentDay = timelineDays[currentDayIndex];
    if (!currentDay) return;

    const activities = dayActivitiesMap.get(currentDay);
    if (!activities || activities.size === 0) {
        viewer.showAll();
        return;
    }

    updateViewerStatus(`Loading elements for ${currentDay}...`);

    try {
        // Collect all element values for today's activities
        const elementValues = new Set();
        activities.forEach(activityName => {
            const values = activityElementMap.get(activityName);
            if (values) {
                values.forEach(v => elementValues.add(v));
            }
        });

        if (elementValues.size === 0) {
            console.log('No element values for current activities');
            viewer.showAll();
            return;
        }

        console.log(`🔍 Isolating ${elementValues.size} elements for ${activities.size} activities`);

        // Get link property name
        const linkProperty = document.getElementById('esLinkProperty').value || 'Mark';

        // Build GraphQL filter
        const filter = window.AECDataModel.buildFilter(Array.from(elementValues));
        console.log('Filter:', filter);

        // Query elements from AEC DM
        const elements = await window.AECDataModel.getElements(
            selectedElementGroup.id,
            filter,
            'US',
            200
        );

        console.log(`✅ Got ${elements.length} elements from AEC DM`);

        if (elements.length === 0) {
            showNotification(`No elements found matching ${linkProperty} values`, 'warning');
            viewer.showAll();
            return;
        }

        // Extract external IDs
        const externalIds = elements.map(e => e.externalId).filter(id => id);
        console.log(`External IDs: ${externalIds.length}`);

        if (externalIds.length === 0) {
            showNotification('No external IDs found for elements', 'warning');
            viewer.showAll();
            return;
        }

        // Map external IDs to dbIds using Viewer API
        viewerModel.getExternalIdMapping((mapping) => {
            const dbIds = [];
            externalIds.forEach(extId => {
                const dbId = mapping[extId];
                if (dbId) {
                    dbIds.push(dbId);
                }
            });

            console.log(`✅ Mapped to ${dbIds.length} dbIds`);

            if (dbIds.length > 0) {
                viewer.isolate(dbIds);
                viewer.fitToView(dbIds);
                updateViewerStatus(`Showing ${dbIds.length} elements`);
            } else {
                showNotification('No matching elements found in model', 'warning');
                viewer.showAll();
            }
        });

    } catch (error) {
        console.error('Error isolating elements:', error);
        showNotification('Failed to isolate elements: ' + error.message, 'error');
        updateViewerStatus('Error loading elements');
    }
}

// Viewer Controls
function viewerReset() {
    if (viewer) {
        viewer.setViewFromCamera(viewer.getCamera());
    }
}

function viewerFitToView() {
    if (viewer) {
        viewer.fitToView();
    }
}

function viewerIsolate() {
    if (viewer) {
        const selection = viewer.getSelection();
        if (selection.length > 0) {
            viewer.isolate(selection);
        }
    }
}

function viewerShowAll() {
    if (viewer) {
        viewer.showAll();
        viewer.fitToView();
    }
}

// Utilities
function updateViewerStatus(text) {
    const statusEl = document.getElementById('viewerStatusText');
    if (statusEl) {
        statusEl.textContent = text;
    }
}

function showNotification(message, type = 'info') {
    console.log(`Notification (${type}): ${message}`);

    const notification = document.getElementById('notification');
    const content = document.getElementById('notificationContent');

    if (notification && content) {
        content.textContent = message;
        notification.className = `notification ${type} show`;

        setTimeout(() => {
            notification.classList.remove('show');
        }, 4000);
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function () {
    console.log('Erection Sequencing page loaded');
    initializeErectionSequencing();
});

