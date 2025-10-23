// scripts/performance-utils.js
// Performance utilities and quick wins for El Diablo platform

console.log('Performance Utils module loaded');

class PerformanceUtils {
  constructor() {
    this.debounceTimers = new Map();
    this.throttleTimers = new Map();
    this.performanceMetrics = [];
    this.maxMetrics = 100;
  }

  // Debounce function calls
  debounce(func, wait, immediate = false) {
    const key = func.name || 'anonymous';
    
    return (...args) => {
      const later = () => {
        this.debounceTimers.delete(key);
        if (!immediate) func(...args);
      };
      
      const callNow = immediate && !this.debounceTimers.has(key);
      
      clearTimeout(this.debounceTimers.get(key));
      this.debounceTimers.set(key, setTimeout(later, wait));
      
      if (callNow) func(...args);
    };
  }

  // Throttle function calls
  throttle(func, limit) {
    const key = func.name || 'anonymous';
    
    return (...args) => {
      if (!this.throttleTimers.has(key)) {
        func(...args);
        this.throttleTimers.set(key, setTimeout(() => {
          this.throttleTimers.delete(key);
        }, limit));
      }
    };
  }

  // Measure performance of operations
  measurePerformance(name, operation) {
    const start = performance.now();
    
    try {
      const result = operation();
      
      // Handle async operations
      if (result && typeof result.then === 'function') {
        return result.then(value => {
          const end = performance.now();
          this.recordMetric(name, end - start, true);
          return value;
        }).catch(error => {
          const end = performance.now();
          this.recordMetric(name, end - start, false);
          throw error;
        });
      } else {
        const end = performance.now();
        this.recordMetric(name, end - start, true);
        return result;
      }
    } catch (error) {
      const end = performance.now();
      this.recordMetric(name, end - start, false);
      throw error;
    }
  }

  // Record performance metric
  recordMetric(name, duration, success) {
    const metric = {
      name,
      duration,
      success,
      timestamp: Date.now(),
      url: window.location.href
    };
    
    this.performanceMetrics.push(metric);
    
    // Keep metrics manageable
    if (this.performanceMetrics.length > this.maxMetrics) {
      this.performanceMetrics.shift();
    }
    
    console.log(`📊 Performance: ${name} - ${duration.toFixed(2)}ms (${success ? 'success' : 'failed'})`);
  }

  // Get performance metrics
  getMetrics(filter = null) {
    if (filter) {
      return this.performanceMetrics.filter(metric => 
        metric.name.includes(filter) || metric.url.includes(filter)
      );
    }
    return [...this.performanceMetrics];
  }

  // Clear performance metrics
  clearMetrics() {
    this.performanceMetrics = [];
  }

  // Optimize DOM queries with caching
  createDOMCache() {
    const cache = new Map();
    
    return {
      query: (selector) => {
        if (cache.has(selector)) {
          return cache.get(selector);
        }
        
        const element = document.querySelector(selector);
        cache.set(selector, element);
        return element;
      },
      
      queryAll: (selector) => {
        if (cache.has(selector + '_all')) {
          return cache.get(selector + '_all');
        }
        
        const elements = document.querySelectorAll(selector);
        cache.set(selector + '_all', elements);
        return elements;
      },
      
      clear: () => cache.clear(),
      
      invalidate: (selector) => {
        cache.delete(selector);
        cache.delete(selector + '_all');
      }
    };
  }

  // Lazy load images
  lazyLoadImages() {
    const images = document.querySelectorAll('img[data-src]');
    const imageObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
          imageObserver.unobserve(img);
        }
      });
    });
    
    images.forEach(img => imageObserver.observe(img));
  }

  // Preload critical resources
  preloadResource(href, as = 'script') {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.href = href;
    link.as = as;
    document.head.appendChild(link);
  }

  // Batch DOM updates
  batchDOMUpdates(updates) {
    requestAnimationFrame(() => {
      updates.forEach(update => {
        try {
          update();
        } catch (error) {
          console.error('Error in batched DOM update:', error);
        }
      });
    });
  }

  // Memory usage monitoring
  getMemoryUsage() {
    if (performance.memory) {
      return {
        used: Math.round(performance.memory.usedJSHeapSize / 1048576), // MB
        total: Math.round(performance.memory.totalJSHeapSize / 1048576), // MB
        limit: Math.round(performance.memory.jsHeapSizeLimit / 1048576) // MB
      };
    }
    return null;
  }

  // Cleanup timers and observers
  cleanup() {
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.throttleTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.clear();
    this.throttleTimers.clear();
  }
}

// Create global performance utils instance
const performanceUtils = new PerformanceUtils();

// Expose utility functions globally
window.debounce = performanceUtils.debounce.bind(performanceUtils);
window.throttle = performanceUtils.throttle.bind(performanceUtils);
window.measurePerformance = performanceUtils.measurePerformance.bind(performanceUtils);

// Expose for debugging
window.performanceUtils = performanceUtils;

console.log('✅ Performance Utils initialized');
