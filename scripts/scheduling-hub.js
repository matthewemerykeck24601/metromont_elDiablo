// Scheduling Hub Module
console.log('Scheduling Hub module loaded');

// Global state
let isAuthenticated = false;
let forgeAccessToken = null;
let globalHubData = null;

// UI Elements
const authProcessing = document.getElementById('authProcessing');
const authTitle = document.getElementById('authTitle');
const authMessage = document.getElementById('authMessage');

// Initialize the scheduling hub
async function initializeSchedulingHub() {
    try {
        console.log('=== SCHEDULING HUB INITIALIZATION ===');

        updateAuthStatus('Checking Authentication...', 'Verifying access...');

        // Check for parent window auth (same pattern as other modules)
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

        // Fallback to stored token
        const storedToken = getStoredToken();
        if (storedToken && !isTokenExpired(storedToken)) {
            forgeAccessToken = storedToken.access_token;
            
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
        console.error('Scheduling Hub initialization failed:', error);
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
        updateAuthStatus('Loading Data...', 'Connecting to ACC...');

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

        console.log('✅ Scheduling Hub ready');

    } catch (error) {
        console.error('Authentication completion failed:', error);
        showAuthError('Failed to initialize: ' + error.message);
    }
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

// Navigation function
function navigateToModule(module) {
    console.log('Navigation to:', module);

    if (!isAuthenticated) {
        alert('Please wait for authentication to complete');
        return;
    }

    switch (module) {
        case 'erection':
            window.location.href = 'erection-sequencing.html';
            break;
        case 'production':
            window.location.href = 'production-scheduling.html';
            break;
        default:
            console.error('Unknown module:', module);
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function () {
    console.log('Scheduling Hub page loaded');
    initializeSchedulingHub();
});

// Export for global access
window.SchedulingHub = {
    navigateToModule,
    isAuthenticated: () => isAuthenticated,
    getToken: () => forgeAccessToken,
    getHubData: () => globalHubData
};

