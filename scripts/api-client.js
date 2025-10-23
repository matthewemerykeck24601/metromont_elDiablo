// scripts/api-client.js
// Centralized API client with request deduplication and timeout handling

console.log('API Client module loaded');

class APIClient {
  constructor() {
    this.pendingRequests = new Map();
    this.defaultTimeout = 10000; // 10 seconds
    this.retryAttempts = 2;
    this.retryDelay = 1000; // 1 second
  }

  // Create a unique key for request deduplication
  createRequestKey(url, options = {}) {
    const method = options.method || 'GET';
    const body = options.body ? JSON.stringify(options.body) : '';
    return `${method}:${url}:${body}`;
  }

  // Main fetch method with deduplication and timeout
  async fetch(url, options = {}) {
    const requestKey = this.createRequestKey(url, options);
    
    // Check if same request is already pending
    if (this.pendingRequests.has(requestKey)) {
      console.log('🔄 Deduplicating request:', url);
      return await this.pendingRequests.get(requestKey);
    }

    // Create the request promise
    const requestPromise = this.executeRequest(url, options);
    
    // Store the promise for deduplication
    this.pendingRequests.set(requestKey, requestPromise);
    
    try {
      const result = await requestPromise;
      return result;
    } finally {
      // Clean up the pending request
      this.pendingRequests.delete(requestKey);
    }
  }

  async executeRequest(url, options = {}) {
    const timeout = options.timeout || this.defaultTimeout;
    
    // Create timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Request timeout after ${timeout}ms`)), timeout);
    });

    // Create fetch promise with retry logic
    const fetchPromise = this.fetchWithRetry(url, options);

    // Race between fetch and timeout
    return await Promise.race([fetchPromise, timeoutPromise]);
  }

  async fetchWithRetry(url, options = {}, attempt = 1) {
    try {
      const response = await window.fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response;
    } catch (error) {
      if (attempt < this.retryAttempts && this.shouldRetry(error)) {
        console.warn(`🔄 Retrying request (attempt ${attempt + 1}/${this.retryAttempts}):`, url);
        await this.delay(this.retryDelay * attempt);
        return this.fetchWithRetry(url, options, attempt + 1);
      }
      throw error;
    }
  }

  shouldRetry(error) {
    // Retry on network errors or 5xx server errors
    return error.message.includes('timeout') || 
           error.message.includes('Failed to fetch') ||
           error.message.includes('HTTP 5');
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Helper method for GET requests
  async get(url, options = {}) {
    return this.fetch(url, { ...options, method: 'GET' });
  }

  // Helper method for POST requests
  async post(url, data, options = {}) {
    return this.fetch(url, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  // Helper method for PUT requests
  async put(url, data, options = {}) {
    return this.fetch(url, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  // Helper method for DELETE requests
  async delete(url, options = {}) {
    return this.fetch(url, { ...options, method: 'DELETE' });
  }

  // Get pending requests count (for debugging)
  getPendingRequestsCount() {
    return this.pendingRequests.size;
  }

  // Clear all pending requests (for cleanup)
  clearPendingRequests() {
    this.pendingRequests.clear();
  }
}

// Create global API client instance
const apiClient = new APIClient();

// Expose for debugging
window.apiClient = apiClient;

console.log('✅ API Client initialized');
