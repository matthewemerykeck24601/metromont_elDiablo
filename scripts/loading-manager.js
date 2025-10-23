// scripts/loading-manager.js
// Centralized loading state management for El Diablo platform

console.log('Loading Manager module loaded');

class LoadingManager {
  constructor() {
    this.activeLoaders = new Set();
    this.loaderQueue = [];
    this.overlay = null;
    this.defaultMessage = 'Loading...';
    this.autoHideDelay = 30000; // 30 seconds max
  }

  // Show loading state
  show(id = 'default', message = this.defaultMessage, options = {}) {
    const loader = {
      id,
      message,
      startTime: Date.now(),
      options: {
        showSpinner: true,
        allowCancel: false,
        autoHide: true,
        ...options
      }
    };

    this.activeLoaders.add(id);
    this.loaderQueue.push(loader);
    this.updateDisplay();

    // Auto-hide after delay if enabled
    if (loader.options.autoHide) {
      setTimeout(() => {
        if (this.activeLoaders.has(id)) {
          console.warn(`Auto-hiding loader ${id} after ${this.autoHideDelay}ms`);
          this.hide(id);
        }
      }, this.autoHideDelay);
    }

    console.log(`🔄 Loading started: ${id} - ${message}`);
  }

  // Hide loading state
  hide(id = 'default') {
    this.activeLoaders.delete(id);
    this.loaderQueue = this.loaderQueue.filter(loader => loader.id !== id);
    this.updateDisplay();
    
    console.log(`✅ Loading completed: ${id}`);
  }

  // Update loading display
  updateDisplay() {
    if (this.activeLoaders.size === 0) {
      this.hideOverlay();
      return;
    }

    this.showOverlay();
  }

  // Show loading overlay
  showOverlay() {
    if (!this.overlay) {
      this.createOverlay();
    }

    const currentLoader = this.loaderQueue[this.loaderQueue.length - 1];
    if (currentLoader) {
      this.updateOverlayContent(currentLoader);
    }

    this.overlay.style.display = 'flex';
  }

  // Hide loading overlay
  hideOverlay() {
    if (this.overlay) {
      this.overlay.style.display = 'none';
    }
  }

  // Create loading overlay
  createOverlay() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'loading-overlay';
    this.overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      color: white;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    this.overlay.innerHTML = `
      <div class="loading-content" style="text-align: center;">
        <div class="loading-spinner" style="
          width: 40px;
          height: 40px;
          border: 4px solid rgba(255, 255, 255, 0.3);
          border-top: 4px solid #007bff;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 20px;
        "></div>
        <div class="loading-message" style="
          font-size: 16px;
          margin-bottom: 10px;
          font-weight: 500;
        "></div>
        <div class="loading-details" style="
          font-size: 14px;
          opacity: 0.8;
        "></div>
        <button class="loading-cancel" style="
          margin-top: 20px;
          padding: 8px 16px;
          background: rgba(255, 255, 255, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 4px;
          color: white;
          cursor: pointer;
          display: none;
        ">Cancel</button>
      </div>
    `;

    // Add CSS for animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(this.overlay);
  }

  // Update overlay content
  updateOverlayContent(loader) {
    const messageEl = this.overlay.querySelector('.loading-message');
    const detailsEl = this.overlay.querySelector('.loading-details');
    const cancelBtn = this.overlay.querySelector('.loading-cancel');

    if (messageEl) {
      messageEl.textContent = loader.message;
    }

    if (detailsEl) {
      const duration = Math.round((Date.now() - loader.startTime) / 1000);
      detailsEl.textContent = `Loading for ${duration}s`;
    }

    if (cancelBtn) {
      cancelBtn.style.display = loader.options.allowCancel ? 'block' : 'none';
      cancelBtn.onclick = () => {
        this.hide(loader.id);
        if (loader.options.onCancel) {
          loader.options.onCancel();
        }
      };
    }
  }

  // Show loading for specific operations
  showForOperation(operation, message) {
    this.show(operation, message, {
      allowCancel: true,
      onCancel: () => {
        console.log(`Operation ${operation} cancelled by user`);
      }
    });
  }

  // Show loading for API calls
  showForAPI(url, method = 'GET') {
    const operation = `${method}:${url}`;
    const message = `${method} ${url}`;
    this.show(operation, message);
    return operation;
  }

  // Hide loading for API calls
  hideForAPI(operation) {
    this.hide(operation);
  }

  // Get active loaders (for debugging)
  getActiveLoaders() {
    return Array.from(this.activeLoaders);
  }

  // Clear all loaders
  clearAll() {
    this.activeLoaders.clear();
    this.loaderQueue = [];
    this.hideOverlay();
    console.log('🧹 All loaders cleared');
  }

  // Check if loading
  isLoading(id = null) {
    if (id) {
      return this.activeLoaders.has(id);
    }
    return this.activeLoaders.size > 0;
  }
}

// Create global loading manager instance
const loadingManager = new LoadingManager();

// Expose for debugging
window.loadingManager = loadingManager;

console.log('✅ Loading Manager initialized');
