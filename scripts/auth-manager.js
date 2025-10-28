// scripts/auth-manager.js
// Centralized authentication management for El Diablo platform

console.log('Auth Manager module loaded');

class AuthManager {
  constructor() {
    this.tokenKey = 'auth_token';
    this.profileKey = 'user_profile_data';
    this.refreshKey = 'refresh_token';
    this.expiryBuffer = 5 * 60 * 1000; // 5 minutes before expiry
    this.isRefreshing = false;
    this.refreshPromise = null;
  }

  // Get current token with automatic refresh
  async getToken() {
    try {
      const stored = this.getStoredToken();
      if (!stored) {
        console.warn('No stored token found');
        return null;
      }

      if (this.isExpiringSoon(stored)) {
        console.log('🔄 Token expiring soon, refreshing...');
        return await this.refreshToken();
      }

      return stored.token;
    } catch (error) {
      console.error('❌ Error getting token:', error);
      return null;
    }
  }

  // Check if token is expiring soon
  isExpiringSoon(tokenData) {
    if (!tokenData || !tokenData.expiresAt) return true;
    const expiresAt = tokenData.expiresAt - this.expiryBuffer;
    return Date.now() >= expiresAt;
  }

  // Get stored token from localStorage
  getStoredToken() {
    try {
      const stored = localStorage.getItem(this.tokenKey);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('Error parsing stored token:', error);
      return null;
    }
  }

  // Store token with expiry
  storeToken(token, expiresIn = 3600) {
    const tokenData = {
      token,
      expiresAt: Date.now() + (expiresIn * 1000),
      storedAt: Date.now()
    };
    
    try {
      localStorage.setItem(this.tokenKey, JSON.stringify(tokenData));
      console.log('✅ Token stored successfully');
    } catch (error) {
      console.error('❌ Error storing token:', error);
    }
  }

  // Refresh token (placeholder - implement based on your auth system)
  async refreshToken() {
    if (this.isRefreshing) {
      console.log('🔄 Token refresh already in progress, waiting...');
      return await this.refreshPromise;
    }

    this.isRefreshing = true;
    this.refreshPromise = this.performTokenRefresh();

    try {
      const newToken = await this.refreshPromise;
      return newToken;
    } finally {
      this.isRefreshing = false;
      this.refreshPromise = null;
    }
  }

  async performTokenRefresh() {
    try {
      // For now, just return the current token
      // TODO: Implement actual token refresh logic based on your auth system
      const currentToken = this.getStoredToken();
      if (currentToken) {
        console.log('✅ Token refresh completed (placeholder)');
        return currentToken.token;
      }
      throw new Error('No current token to refresh');
    } catch (error) {
      console.error('❌ Token refresh failed:', error);
      this.clearAuth();
      throw error;
    }
  }

  // Get user profile data
  getUserProfile() {
    try {
      const profile = localStorage.getItem(this.profileKey);
      return profile ? JSON.parse(profile) : null;
    } catch (error) {
      console.error('Error parsing user profile:', error);
      return null;
    }
  }

  // Store user profile data
  storeUserProfile(profile) {
    try {
      localStorage.setItem(this.profileKey, JSON.stringify(profile));
      console.log('✅ User profile stored successfully');
    } catch (error) {
      console.error('❌ Error storing user profile:', error);
    }
  }

  // Check if user is authenticated
  isAuthenticated() {
    const token = this.getStoredToken();
    const profile = this.getUserProfile();
    return !!(token && profile && !this.isExpiringSoon(token));
  }

  // Clear all authentication data
  clearAuth() {
    try {
      localStorage.removeItem(this.tokenKey);
      localStorage.removeItem(this.profileKey);
      localStorage.removeItem(this.refreshKey);
      console.log('✅ Authentication data cleared');
    } catch (error) {
      console.error('❌ Error clearing auth data:', error);
    }
  }

  // Get identity header for API calls (compatible with existing system)
  getIdentityHeader() {
    const profile = this.getUserProfile();
    if (!profile) return null;
    
    const userInfo = profile.userInfo;
    const selectedHub = profile.selectedHub;
    
    if (!userInfo?.email) return null;
    
    return JSON.stringify({
      email: userInfo.email,
      user_metadata: {
        hubId: selectedHub?.id || null,
        full_name: userInfo.name || userInfo.email
      }
    });
  }

  // Validate token and refresh if needed
  async validateToken() {
    if (!this.isAuthenticated()) {
      console.warn('User not authenticated');
      return false;
    }

    try {
      const token = await this.getToken();
      return !!token;
    } catch (error) {
      console.error('Token validation failed:', error);
      return false;
    }
  }

  // Get auth status for debugging
  getAuthStatus() {
    const token = this.getStoredToken();
    const profile = this.getUserProfile();
    
    return {
      hasToken: !!token,
      hasProfile: !!profile,
      isAuthenticated: this.isAuthenticated(),
      tokenExpiry: token?.expiresAt ? new Date(token.expiresAt) : null,
      userEmail: profile?.userInfo?.email || null
    };
  }
}

// Create global auth manager instance
const authManager = new AuthManager();

// Expose for debugging
window.authManager = authManager;

console.log('✅ Auth Manager initialized');

// Export default for ES6 modules
export default AuthManager;