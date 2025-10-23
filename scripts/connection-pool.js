// scripts/connection-pool.js
// OSS connection pooling for El Diablo platform

console.log('Connection Pool module loaded');

class OSSConnectionPool {
  constructor(options = {}) {
    this.maxConnections = options.maxConnections || 10;
    this.minConnections = options.minConnections || 2;
    this.idleTimeout = options.idleTimeout || 300000; // 5 minutes
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000;
    
    this.connections = [];
    this.activeConnections = new Set();
    this.connectionQueue = [];
    this.connectionStats = {
      created: 0,
      reused: 0,
      failed: 0,
      idle: 0
    };
  }

  // Get a connection from the pool
  async getConnection() {
    // Try to reuse existing idle connection
    const idleConnection = this.findIdleConnection();
    if (idleConnection) {
      this.connectionStats.reused++;
      idleConnection.lastUsed = Date.now();
      idleConnection.status = 'active';
      this.activeConnections.add(idleConnection);
      console.log('🔄 Reusing existing OSS connection');
      return idleConnection;
    }

    // Create new connection if under limit
    if (this.connections.length < this.maxConnections) {
      try {
        const connection = await this.createConnection();
        this.connections.push(connection);
        this.activeConnections.add(connection);
        this.connectionStats.created++;
        console.log('✅ Created new OSS connection');
        return connection;
      } catch (error) {
        this.connectionStats.failed++;
        console.error('❌ Failed to create OSS connection:', error);
        throw error;
      }
    }

    // Wait for connection to become available
    return this.waitForConnection();
  }

  // Find idle connection
  findIdleConnection() {
    return this.connections.find(conn => 
      conn.status === 'idle' && 
      !this.activeConnections.has(conn)
    );
  }

  // Create new OSS connection
  async createConnection() {
    // This would integrate with your existing OSS client creation
    // For now, return a mock connection object
    const connection = {
      id: `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: 'active',
      createdAt: Date.now(),
      lastUsed: Date.now(),
      client: null, // This would be your actual OSS client
      retryCount: 0
    };

    // Simulate connection creation delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return connection;
  }

  // Wait for connection to become available
  async waitForConnection() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection pool timeout'));
      }, 30000); // 30 second timeout

      this.connectionQueue.push({
        resolve: (connection) => {
          clearTimeout(timeout);
          resolve(connection);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });
    });
  }

  // Release connection back to pool
  releaseConnection(connection) {
    if (!connection || !this.activeConnections.has(connection)) {
      return;
    }

    this.activeConnections.delete(connection);
    connection.status = 'idle';
    connection.lastUsed = Date.now();

    // Process queued requests
    if (this.connectionQueue.length > 0) {
      const queued = this.connectionQueue.shift();
      queued.resolve(connection);
    }

    console.log('🔄 Released OSS connection back to pool');
  }

  // Clean up idle connections
  cleanupIdleConnections() {
    const now = Date.now();
    const toRemove = [];

    this.connections.forEach(connection => {
      if (connection.status === 'idle' && 
          now - connection.lastUsed > this.idleTimeout) {
        toRemove.push(connection);
      }
    });

    toRemove.forEach(connection => {
      this.removeConnection(connection);
    });

    if (toRemove.length > 0) {
      console.log(`🧹 Cleaned up ${toRemove.length} idle connections`);
    }
  }

  // Remove connection from pool
  removeConnection(connection) {
    const index = this.connections.indexOf(connection);
    if (index > -1) {
      this.connections.splice(index, 1);
    }
    this.activeConnections.delete(connection);
  }

  // Get pool statistics
  getStats() {
    return {
      total: this.connections.length,
      active: this.activeConnections.size,
      idle: this.connections.filter(c => c.status === 'idle').length,
      queued: this.connectionQueue.length,
      stats: { ...this.connectionStats }
    };
  }

  // Health check
  async healthCheck() {
    const stats = this.getStats();
    const health = {
      status: 'healthy',
      connections: stats,
      timestamp: Date.now()
    };

    // Check for issues
    if (stats.queued > 5) {
      health.status = 'warning';
      health.message = 'High connection queue';
    }

    if (stats.stats.failed > stats.stats.created * 0.5) {
      health.status = 'error';
      health.message = 'High connection failure rate';
    }

    return health;
  }

  // Close all connections
  async close() {
    console.log('🔄 Closing connection pool...');
    
    // Reject all queued requests
    this.connectionQueue.forEach(queued => {
      queued.reject(new Error('Connection pool closed'));
    });
    this.connectionQueue = [];

    // Close all connections
    await Promise.all(
      this.connections.map(connection => this.closeConnection(connection))
    );

    this.connections = [];
    this.activeConnections.clear();
    
    console.log('✅ Connection pool closed');
  }

  // Close individual connection
  async closeConnection(connection) {
    try {
      // Close the actual OSS client if it exists
      if (connection.client && typeof connection.client.close === 'function') {
        await connection.client.close();
      }
    } catch (error) {
      console.error('Error closing connection:', error);
    }
  }

  // Start cleanup interval
  startCleanup() {
    setInterval(() => {
      this.cleanupIdleConnections();
    }, 60000); // Clean up every minute
  }
}

// Create global connection pool
const connectionPool = new OSSConnectionPool({
  maxConnections: 10,
  minConnections: 2,
  idleTimeout: 300000 // 5 minutes
});

// Start cleanup process
connectionPool.startCleanup();

// Expose for debugging
window.connectionPool = connectionPool;

console.log('✅ Connection Pool initialized');
