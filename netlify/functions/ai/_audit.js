// AI Action Audit Logger
// Records all AI actions for traceability and compliance

import { createOssClient, getBucket } from '../_db-helpers.js';

/**
 * Log an AI action to audit trail
 * @param {Object} event - Netlify function event
 * @param {Object} user - Parsed user object
 * @param {string} action - Action name
 * @param {Object} args - Action arguments
 * @param {Object} result - Action result {ok, error?, data?}
 */
export async function auditAiAction(event, user, action, args, result) {
  try {
    const oss = createOssClient(event);
    const bucket = getBucket();
    const hubId = user.hubId || 'default-hub';
    
    const timestamp = new Date().toISOString();
    const auditId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const auditRecord = {
      id: auditId,
      timestamp,
      user: {
        email: user.email,
        name: user.name,
        hubId: user.hubId
      },
      action,
      args,
      result: {
        success: result.ok || false,
        error: result.error || null,
        data: result.data || null
      },
      metadata: {
        ip: event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown',
        userAgent: event.headers['user-agent'] || 'unknown'
      }
    };
    
    // Store audit log
    const auditKey = `tenants/${hubId}/ai/audit/${timestamp.split('T')[0]}/${auditId}.json`;
    await oss.putJson(bucket, auditKey, auditRecord);
    
    console.log(`✅ Audit logged: ${action} by ${user.email}`);
    
    return auditRecord;
  } catch (error) {
    console.error('❌ Failed to write audit log:', error);
    // Don't throw - audit failures shouldn't block AI actions
    return null;
  }
}

/**
 * Query audit logs for a specific time period or user
 * @param {Object} event - Netlify function event
 * @param {Object} filters - { startDate?, endDate?, userEmail?, action? }
 */
export async function queryAuditLogs(event, filters = {}) {
  try {
    const oss = createOssClient(event);
    const bucket = getBucket();
    const user = filters.user || { hubId: 'default-hub' };
    const hubId = user.hubId || 'default-hub';
    
    // Build prefix based on date filter
    let prefix = `tenants/${hubId}/ai/audit/`;
    if (filters.startDate) {
      prefix += filters.startDate.split('T')[0] + '/';
    }
    
    const objects = await oss.listObjects(bucket, prefix);
    const logs = [];
    
    for (const obj of objects) {
      if (!obj.key.endsWith('.json')) continue;
      
      try {
        const data = await oss.getJson(bucket, obj.key);
        
        // Apply filters
        if (filters.userEmail && data.user.email !== filters.userEmail) continue;
        if (filters.action && data.action !== filters.action) continue;
        if (filters.endDate && data.timestamp > filters.endDate) continue;
        
        logs.push(data);
      } catch (e) {
        console.warn(`Failed to load audit log ${obj.key}:`, e);
      }
    }
    
    // Sort by timestamp descending
    logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    
    return logs;
  } catch (error) {
    console.error('❌ Failed to query audit logs:', error);
    throw error;
  }
}

/**
 * Get audit statistics for a user or time period
 */
export async function getAuditStats(event, filters = {}) {
  const logs = await queryAuditLogs(event, filters);
  
  const stats = {
    total: logs.length,
    success: logs.filter(l => l.result.success).length,
    failed: logs.filter(l => !l.result.success).length,
    byAction: {},
    byUser: {}
  };
  
  logs.forEach(log => {
    // Count by action
    stats.byAction[log.action] = (stats.byAction[log.action] || 0) + 1;
    
    // Count by user
    stats.byUser[log.user.email] = (stats.byUser[log.user.email] || 0) + 1;
  });
  
  return stats;
}

