// scripts/state-manager.js
// Centralized state management for El Diablo platform

console.log('State Manager module loaded');

class StateManager {
  constructor() {
    this.state = {
      // User state
      currentUser: null,
      userPermissions: null,
      isAuthenticated: false,
      
      // Hub and project state
      selectedHub: null,
      availableHubs: [],
      projects: [],
      
      // Database state
      allTables: [],
      currentTable: null,
      currentRows: [],
      
      // UI state
      loading: false,
      activeModule: null,
      notifications: []
    };
    
    this.listeners = new Map();
    this.history = [];
    this.maxHistorySize = 50;
  }

  // Subscribe to state changes
  subscribe(key, callback) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key).add(callback);
    
    // Return unsubscribe function
    return () => {
      if (this.listeners.has(key)) {
        this.listeners.get(key).delete(callback);
      }
    };
  }

  // Set state and notify listeners
  setState(key, value, silent = false) {
    const oldValue = this.state[key];
    this.state[key] = value;
    
    // Add to history for debugging
    this.addToHistory(key, value, oldValue);
    
    // Notify listeners
    if (!silent && this.listeners.has(key)) {
      this.listeners.get(key).forEach(callback => {
        try {
          callback(value, oldValue, key);
        } catch (error) {
          console.error(`Error in state listener for ${key}:`, error);
        }
      });
    }
    
    console.log(`🔄 State updated: ${key}`, { oldValue, newValue: value });
  }

  // Get state value
  getState(key) {
    return this.state[key];
  }

  // Get entire state (for debugging)
  getFullState() {
    return { ...this.state };
  }

  // Batch state updates
  batchUpdate(updates) {
    Object.keys(updates).forEach(key => {
      this.setState(key, updates[key], true);
    });
    
    // Notify all affected listeners
    Object.keys(updates).forEach(key => {
      if (this.listeners.has(key)) {
        this.listeners.get(key).forEach(callback => {
          try {
            callback(updates[key], this.state[key], key);
          } catch (error) {
            console.error(`Error in batch state listener for ${key}:`, error);
          }
        });
      }
    });
  }

  // Add to history for debugging
  addToHistory(key, newValue, oldValue) {
    this.history.push({
      timestamp: Date.now(),
      key,
      oldValue,
      newValue,
      action: 'setState'
    });
    
    // Keep history size manageable
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
  }

  // Get state history (for debugging)
  getHistory() {
    return [...this.history];
  }

  // Clear state history
  clearHistory() {
    this.history = [];
  }

  // Reset state to initial values
  reset() {
    this.state = {
      currentUser: null,
      userPermissions: null,
      isAuthenticated: false,
      selectedHub: null,
      availableHubs: [],
      projects: [],
      allTables: [],
      currentTable: null,
      currentRows: [],
      loading: false,
      activeModule: null,
      notifications: []
    };
    
    // Notify all listeners of reset
    this.listeners.forEach((callbacks, key) => {
      callbacks.forEach(callback => {
        try {
          callback(this.state[key], null, key);
        } catch (error) {
          console.error(`Error in reset listener for ${key}:`, error);
        }
      });
    });
    
    console.log('🔄 State reset to initial values');
  }

  // Migration helpers for existing global variables
  migrateFromGlobals() {
    // Migrate existing global variables to state
    if (window.__allTables) {
      this.setState('allTables', window.__allTables);
    }
    
    if (window.__currentTable) {
      this.setState('currentTable', window.__currentTable);
    }
    
    if (window.currentUserPermissions) {
      this.setState('userPermissions', window.currentUserPermissions);
    }
    
    console.log('✅ Migrated existing globals to state manager');
  }

  // Backward compatibility - expose state as globals
  exposeAsGlobals() {
    // Keep existing globals in sync for backward compatibility
    window.__allTables = this.state.allTables;
    window.__currentTable = this.state.currentTable;
    window.currentUserPermissions = this.state.userPermissions;
  }

  // Update globals when state changes
  syncWithGlobals() {
    this.exposeAsGlobals();
  }
}

// Create global state manager instance
const stateManager = new StateManager();

// Expose for debugging
window.stateManager = stateManager;

// Auto-sync with globals on state changes
stateManager.subscribe('allTables', () => stateManager.syncWithGlobals());
stateManager.subscribe('currentTable', () => stateManager.syncWithGlobals());
stateManager.subscribe('userPermissions', () => stateManager.syncWithGlobals());

console.log('✅ State Manager initialized');
