// scripts/error-handler.js
// Global error handling for El Diablo platform

console.log('Error Handler module loaded');

class ErrorHandler {
  constructor() {
    this.setupGlobalHandlers();
    this.errorCount = 0;
    this.maxErrors = 10; // Prevent error spam
  }

  setupGlobalHandlers() {
    // Handle JavaScript errors
    window.addEventListener('error', this.handleError.bind(this));
    
    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', this.handleRejection.bind(this));
    
    // Handle fetch errors globally
    this.interceptFetch();
  }

  handleError = (event) => {
    this.errorCount++;
    if (this.errorCount > this.maxErrors) {
      console.warn('Too many errors, suppressing further error logging');
      return;
    }

    const errorInfo = {
      type: 'javascript_error',
      message: event.error?.message || 'Unknown error',
      stack: event.error?.stack,
      filename: event.filename,
      line: event.lineno,
      column: event.colno,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    console.error('🚨 El Diablo Error:', errorInfo);
    this.logToConsole(errorInfo);
  };

  handleRejection = (event) => {
    this.errorCount++;
    if (this.errorCount > this.maxErrors) return;

    const errorInfo = {
      type: 'unhandled_promise_rejection',
      reason: event.reason,
      timestamp: new Date().toISOString(),
      url: window.location.href
    };

    console.error('🚨 Unhandled Promise Rejection:', errorInfo);
    this.logToConsole(errorInfo);
  };

  interceptFetch() {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      try {
        const response = await originalFetch(...args);
        
        // Log failed requests
        if (!response.ok) {
          console.warn('🚨 API Error:', {
            url: args[0],
            status: response.status,
            statusText: response.statusText,
            timestamp: new Date().toISOString()
          });
        }
        
        return response;
      } catch (error) {
        console.error('🚨 Fetch Error:', {
          url: args[0],
          error: error.message,
          timestamp: new Date().toISOString()
        });
        throw error;
      }
    };
  }

  logToConsole(errorInfo) {
    // Store errors in localStorage for debugging
    try {
      const existingErrors = JSON.parse(localStorage.getItem('elDiablo_errors') || '[]');
      existingErrors.push(errorInfo);
      
      // Keep only last 50 errors
      if (existingErrors.length > 50) {
        existingErrors.splice(0, existingErrors.length - 50);
      }
      
      localStorage.setItem('elDiablo_errors', JSON.stringify(existingErrors));
    } catch (e) {
      console.warn('Failed to store error in localStorage:', e);
    }
  }

  // Method to get stored errors for debugging
  getStoredErrors() {
    try {
      return JSON.parse(localStorage.getItem('elDiablo_errors') || '[]');
    } catch (e) {
      return [];
    }
  }

  // Method to clear stored errors
  clearStoredErrors() {
    localStorage.removeItem('elDiablo_errors');
    this.errorCount = 0;
  }
}

// Initialize global error handler
const errorHandler = new ErrorHandler();

// Expose for debugging
window.errorHandler = errorHandler;

console.log('✅ Error Handler initialized');
