// User Profile & Hub Selector Component
// Provides persistent user session, hub selection, and logout functionality
console.log('User Profile module loaded');

class UserProfile {
    constructor() {
        this.userInfo = null;
        this.selectedHub = null;
        this.availableHubs = [];
        this.isInitialized = false;
    }

    async initialize(forgeToken, hubData) {
        console.log('🔐 Initializing User Profile...');
        console.log('Hub Data received:', hubData);

        try {
            // Fetch user profile from Autodesk
            const userProfile = await this.fetchUserProfile(forgeToken);
            console.log('User profile fetched:', userProfile);
            
            this.userInfo = {
                name: userProfile.name || userProfile.userName || userProfile.firstName || 'User',
                email: userProfile.emailId || userProfile.email || userProfile.emailAddress || '',
                userId: userProfile.userId || userProfile.sub,
                profileImage: userProfile.profileImages?.sizeX360 || userProfile.picture || null
            };

            // Set hub data - handle the actual structure from globalHubData
            if (hubData) {
                const hubName = hubData.hubInfo?.attributes?.name 
                    || hubData.accountInfo?.name 
                    || 'Metromont Hub';
                
                this.selectedHub = {
                    id: hubData.hubId || hubData.accountId,
                    name: hubName,
                    region: hubData.region || 'US'
                };

                console.log('✅ Hub configured:', this.selectedHub);

                // Store available hubs (for future multi-hub support)
                this.availableHubs = [this.selectedHub];
            } else {
                console.warn('⚠️ No hub data provided');
            }

            this.isInitialized = true;
            this.render();
            this.persistToStorage();

            console.log('✅ User Profile initialized:', this.userInfo.name);
            return true;

        } catch (error) {
            console.error('❌ Failed to initialize user profile:', error);
            console.error('Error details:', error.message);
            
            // Fallback: try to use hub data at least
            if (hubData && !this.userInfo) {
                console.log('Using fallback user info');
                this.userInfo = {
                    name: 'User',
                    email: '',
                    userId: null,
                    profileImage: null
                };
                
                const hubName = hubData.hubInfo?.attributes?.name 
                    || hubData.accountInfo?.name 
                    || 'Metromont Hub';
                
                this.selectedHub = {
                    id: hubData.hubId || hubData.accountId,
                    name: hubName,
                    region: 'US'
                };
                this.availableHubs = [this.selectedHub];
            }
            
            // Load from storage as last resort
            this.loadFromStorage();
            this.render();
            return false;
        }
    }

    async fetchUserProfile(token) {
        // Try the UserProfile API first
        try {
            const response = await fetch('https://api.userprofile.autodesk.com/userinfo', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                console.log('✅ UserProfile API response:', data);
                return data;
            }
            
            console.warn('UserProfile API failed with status:', response.status);
        } catch (error) {
            console.warn('UserProfile API error:', error);
        }

        // Fallback to OAuth userinfo endpoint
        try {
            console.log('Trying OAuth userinfo endpoint...');
            const response = await fetch('https://developer.api.autodesk.com/userprofile/v1/users/@me', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                console.log('✅ OAuth userinfo response:', data);
                return data;
            }
            
            console.warn('OAuth userinfo failed with status:', response.status);
        } catch (error) {
            console.warn('OAuth userinfo error:', error);
        }

        // If both fail, throw error
        throw new Error('Failed to fetch user profile from all endpoints');
    }

    render() {
        const container = document.getElementById('userProfileContainer');
        if (!container) {
            console.warn('User profile container not found');
            return;
        }

        const initials = this.getInitials();
        const displayName = this.userInfo?.name || 'User';
        const hubName = this.selectedHub?.name || 'No Hub Selected';

        container.innerHTML = `
            <div class="user-profile-widget" id="userProfileWidget">
                <div class="user-avatar" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
                    ${this.userInfo?.profileImage 
                        ? `<img src="${this.userInfo.profileImage}" alt="${displayName}">` 
                        : `<span>${initials}</span>`
                    }
                </div>
                <div class="user-info">
                    <div class="user-name">${displayName}</div>
                    <div class="user-hub">${hubName}</div>
                </div>
                <svg class="dropdown-icon" width="12" height="12" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M7 10l5 5 5-5z"/>
                </svg>
            </div>
            <div class="user-dropdown" id="userDropdown" style="display: none;">
                <div class="dropdown-header">
                    <div class="user-details">
                        <strong>${displayName}</strong>
                        ${this.userInfo?.email ? `<div class="user-email">${this.userInfo.email}</div>` : ''}
                    </div>
                </div>
                <div class="dropdown-divider"></div>
                <div class="dropdown-section">
                    <div class="dropdown-label">Current Hub</div>
                    <div class="current-hub">
                        <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                        </svg>
                        <span>${hubName}</span>
                    </div>
                    ${this.availableHubs.length > 1 ? this.renderHubSelector() : `
                        <div style="margin-top: 0.75rem; padding: 0.5rem; background: #f9fafb; border-radius: 6px; font-size: 0.75rem; color: #6b7280; text-align: center;">
                            Multi-hub switching coming soon
                        </div>
                    `}
                </div>
                <div class="dropdown-divider"></div>
                <button class="dropdown-item" onclick="window.UserProfile.logout()">
                    <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/>
                    </svg>
                    Logout
                </button>
            </div>
        `;

        // Add click handler to toggle dropdown
        const widget = document.getElementById('userProfileWidget');
        if (widget) {
            widget.addEventListener('click', () => this.toggleDropdown());
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            const container = document.getElementById('userProfileContainer');
            if (container && !container.contains(e.target)) {
                this.closeDropdown();
            }
        });
    }

    renderHubSelector() {
        return `
            <div class="dropdown-label" style="margin-top: 1rem;">Switch Hub</div>
            <select class="hub-selector" onchange="window.UserProfile.switchHub(this.value)">
                ${this.availableHubs.map(hub => `
                    <option value="${hub.id}" ${hub.id === this.selectedHub?.id ? 'selected' : ''}>
                        ${hub.name}
                    </option>
                `).join('')}
            </select>
        `;
    }

    getInitials() {
        if (!this.userInfo?.name) return 'U';
        const parts = this.userInfo.name.split(' ');
        if (parts.length >= 2) {
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return this.userInfo.name.substring(0, 2).toUpperCase();
    }

    toggleDropdown() {
        const dropdown = document.getElementById('userDropdown');
        if (dropdown) {
            const isVisible = dropdown.style.display !== 'none';
            dropdown.style.display = isVisible ? 'none' : 'block';
        }
    }

    closeDropdown() {
        const dropdown = document.getElementById('userDropdown');
        if (dropdown) {
            dropdown.style.display = 'none';
        }
    }

    switchHub(hubId) {
        const hub = this.availableHubs.find(h => h.id === hubId);
        if (hub) {
            this.selectedHub = hub;
            this.persistToStorage();
            
            // Show notification
            if (window.showNotification) {
                window.showNotification(`Switched to ${hub.name}`, 'success');
            }
            
            // Reload page to apply hub change
            setTimeout(() => {
                location.reload();
            }, 1000);
        }
    }

    logout() {
        console.log('👋 Logging out...');

        // Clear all stored data
        sessionStorage.clear();
        localStorage.removeItem('forge_token_backup');
        localStorage.removeItem('castlink_hub_data');
        localStorage.removeItem('user_profile_data');

        // Clear caches
        if ('caches' in window) {
            caches.keys().then(names => {
                names.forEach(name => caches.delete(name));
            });
        }

        // Show logout message
        if (document.getElementById('userProfileContainer')) {
            document.getElementById('userProfileContainer').innerHTML = `
                <div class="user-profile-widget" style="opacity: 0.6;">
                    <div class="user-info">
                        <div class="user-name">Logging out...</div>
                    </div>
                </div>
            `;
        }

        // Redirect to login
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 500);
    }

    persistToStorage() {
        const data = {
            userInfo: this.userInfo,
            selectedHub: this.selectedHub,
            availableHubs: this.availableHubs,
            timestamp: Date.now()
        };

        try {
            localStorage.setItem('user_profile_data', JSON.stringify(data));
            console.log('💾 User profile persisted to storage');
        } catch (error) {
            console.error('Failed to persist user profile:', error);
        }
    }

    loadFromStorage() {
        try {
            const stored = localStorage.getItem('user_profile_data');
            if (stored) {
                const data = JSON.parse(stored);
                
                // Check if data is recent (within 24 hours)
                const age = Date.now() - (data.timestamp || 0);
                if (age < 24 * 60 * 60 * 1000) {
                    this.userInfo = data.userInfo;
                    this.selectedHub = data.selectedHub;
                    this.availableHubs = data.availableHubs || [data.selectedHub];
                    this.isInitialized = true;
                    console.log('✅ User profile loaded from storage');
                    return true;
                }
            }
        } catch (error) {
            console.error('Failed to load user profile from storage:', error);
        }
        return false;
    }

    getUserInfo() {
        return this.userInfo;
    }

    getSelectedHub() {
        return this.selectedHub;
    }
}

// Create global instance
window.UserProfile = new UserProfile();

console.log('✅ User Profile system ready');

