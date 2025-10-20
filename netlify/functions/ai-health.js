// AI System Health Check Endpoint
// Provides status and configuration information for the AI system

import { response } from './_db-helpers.js';
import { getAvailableAccEntities } from './ai/_acc-schema.js';

// Action registry (keep in sync with ai-router.js)
const ACTION_REGISTRY = [
  // Database actions
  'db.create_table',
  'db.insert_rows',
  'db.ensure_canonical_table',
  
  // ACC import actions
  'acc.import.assets',
  'acc.import.issues',
  'acc.import.forms',
  'acc.import.rfis',
  'acc.import.checklists',
  'acc.import.locations',
  'acc.import.companies',
  
  // Admin actions
  'admin.user.assign_roles',
  'admin.module.enable',
  'admin.module.disable',
  
  // Erection sequencing actions
  'erection.ensure_db_ready',
  'erection.create_sequence',
  'erection.attach_schedule',
  
  // QC actions
  'qc.upload_bed_report',
  'qc.list_reports',
  
  // Meta actions
  'clarify'
];

export async function handler(event) {
  try {
    // Handle preflight
    if (event.httpMethod === "OPTIONS") {
      return response(200, {});
    }

    // Only GET allowed
    if (event.httpMethod !== "GET") {
      return response(405, { error: "Method not allowed" });
    }

    // Check environment variables
    const checks = {
      openaiKey: !!process.env.OPENAI_API_KEY,
      apsClientId: !!process.env.APS_CLIENT_ID,
      apsClientSecret: !!process.env.APS_CLIENT_SECRET,
      pseudoDbBucket: !!process.env.PSEUDO_DB_BUCKET,
      adminEmails: !!process.env.ADMIN_EMAILS
    };

    const allConfigured = Object.values(checks).every(v => v);

    // Get admin email list
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

    // Get available ACC entities
    const accEntities = getAvailableAccEntities();

    // Build health response
    const health = {
      status: allConfigured ? 'healthy' : 'degraded',
      version: '1.0',
      timestamp: new Date().toISOString(),
      
      configuration: {
        openaiConfigured: checks.openaiKey,
        apsConfigured: checks.apsClientId && checks.apsClientSecret,
        databaseConfigured: checks.pseudoDbBucket,
        adminEmailsConfigured: checks.adminEmails,
        adminCount: adminEmails.length
      },
      
      features: {
        actionRegistry: ACTION_REGISTRY.length,
        accEntities: accEntities.length,
        directMode: true,
        auditLogging: true
      },
      
      actions: {
        total: ACTION_REGISTRY.length,
        byCategory: {
          database: ACTION_REGISTRY.filter(a => a.startsWith('db.')).length,
          acc: ACTION_REGISTRY.filter(a => a.startsWith('acc.')).length,
          admin: ACTION_REGISTRY.filter(a => a.startsWith('admin.')).length,
          erection: ACTION_REGISTRY.filter(a => a.startsWith('erection.')).length,
          qc: ACTION_REGISTRY.filter(a => a.startsWith('qc.')).length,
          meta: ACTION_REGISTRY.filter(a => a === 'clarify').length
        },
        available: ACTION_REGISTRY
      },
      
      accEntities: {
        count: accEntities.length,
        available: accEntities
      },
      
      endpoints: {
        aiRouter: '/api/ai',
        aiHealth: '/api/ai/health',
        adminRoles: '/api/admin/roles',
        dbHealth: '/api/db/health',
        dbFolders: '/api/db/folders',
        dbTables: '/api/db/tables',
        dbRows: '/api/db/rows/:tableId'
      }
    };

    return response(200, health);

  } catch (err) {
    console.error('❌ AI health check error:', err);
    return response(500, { 
      status: 'error',
      error: 'Health check failed', 
      details: String(err.message || err) 
    });
  }
}

