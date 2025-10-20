// AI Action Dispatcher
// Routes AI actions to appropriate internal functions

import { response, createOssClient, getBucket, buildKey, parseUser } from '../_db-helpers.js';
import { fetchAccEntitySchema, mapAccSchemaToDb } from './_acc-schema.js';

/**
 * Normalize ID for database keys
 */
function normalizeId(s) {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/**
 * Generate random ID for rows
 */
function generateId() {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Database actions
 */
export const dbActions = {
  /**
   * Create a custom table
   */
  async create_table(event, args, user) {
    const { table, folderId = null, schema } = args;
    
    if (!table || typeof schema !== "object") {
      throw new Error("Invalid create_table args: table and schema required");
    }

    const oss = createOssClient(event);
    const bucket = getBucket();
    const tenantPrefix = `tenants/${user.hubId || "default-hub"}`;
    
    const tableId = normalizeId(table);
    const base = `${tenantPrefix}/tables/${tableId}`;
    
    await oss.putJson(bucket, `${base}/schema.json`, {
      id: tableId,
      name: table,
      folderId,
      schema,
      createdBy: user.email,
      createdAt: new Date().toISOString(),
      createdVia: 'ai-assistant'
    });

    return { tableId, table, message: `Table "${table}" created successfully` };
  },

  /**
   * Ensure canonical table exists (ACC entity)
   */
  async ensure_canonical_table(event, args, user) {
    const { entity } = args;
    
    if (!entity) {
      throw new Error("Invalid ensure_canonical_table args: entity required");
    }

    const accSchema = await fetchAccEntitySchema(entity);
    if (!accSchema) {
      throw new Error(`Unknown ACC entity: ${entity}. Available: assets, issues, forms, rfis, checklists, locations, companies`);
    }

    const oss = createOssClient(event);
    const bucket = getBucket();
    const tenantPrefix = `tenants/${user.hubId || "default-hub"}`;
    
    const { tableName, schema, metadata } = mapAccSchemaToDb(entity, accSchema);
    const tableId = normalizeId(tableName);
    const base = `${tenantPrefix}/tables/${tableId}`;
    
    // Check if already exists
    try {
      await oss.getObject(bucket, `${base}/schema.json`);
      return { tableId, exists: true, message: `Table "${tableName}" already exists` };
    } catch {
      // Doesn't exist, create it
    }
    
    await oss.putJson(bucket, `${base}/schema.json`, {
      id: tableId,
      name: tableName,
      folderId: args.folderId || null,
      schema,
      createdBy: user.email,
      createdAt: new Date().toISOString(),
      createdVia: 'ai-assistant',
      _source: metadata
    });

    return { tableId, exists: false, message: `Canonical table "${tableName}" created successfully` };
  },

  /**
   * Insert rows into a table
   */
  async insert_rows(event, args, user) {
    const { table, rows } = args;
    
    if (!table || !Array.isArray(rows) || rows.length === 0) {
      throw new Error("Invalid insert_rows args: table and rows array required");
    }

    if (rows.length > 200) {
      throw new Error("Row limit exceeded (200 max per request)");
    }

    const oss = createOssClient(event);
    const bucket = getBucket();
    const tenantPrefix = `tenants/${user.hubId || "default-hub"}`;
    const tableId = normalizeId(table);
    
    // Check if table exists, auto-create if it's a known ACC entity
    const entityGuess = ["assets", "issues", "forms", "rfis", "checklists", "locations", "companies"].includes(table.toLowerCase())
      ? table.toLowerCase()
      : null;

    const base = `${tenantPrefix}/tables/${tableId}`;
    
    try {
      await oss.getObject(bucket, `${base}/schema.json`);
    } catch {
      // Table doesn't exist
      if (entityGuess) {
        // Auto-create canonical table
        await dbActions.ensure_canonical_table(event, { entity: entityGuess }, user);
      } else {
        throw new Error(`Table "${table}" does not exist. Create it first or specify an ACC entity.`);
      }
    }

    // Write each row
    let written = 0;
    for (const row of rows) {
      const id = row.id || generateId();
      await oss.putJson(bucket, `${base}/rows/${id}.json`, {
        id,
        ...row,
        _meta: {
          createdBy: user.email,
          createdAt: new Date().toISOString(),
          createdVia: 'ai-assistant'
        }
      });
      written++;
    }

    return { tableId, written, message: `Inserted ${written} row(s) into "${table}"` };
  }
};

/**
 * ACC Import actions (stubs for now - implement in v1.1)
 */
export const accActions = {
  async import_assets(event, args, user) {
    // TODO: Implement ACC Assets API fetch
    throw new Error("ACC import actions not yet implemented - coming in v1.1");
  },
  
  async import_issues(event, args, user) {
    throw new Error("ACC import actions not yet implemented - coming in v1.1");
  },
  
  async import_forms(event, args, user) {
    throw new Error("ACC import actions not yet implemented - coming in v1.1");
  },
  
  async import_rfis(event, args, user) {
    throw new Error("ACC import actions not yet implemented - coming in v1.1");
  },
  
  async import_locations(event, args, user) {
    throw new Error("ACC import actions not yet implemented - coming in v1.1");
  },
  
  async import_companies(event, args, user) {
    throw new Error("ACC import actions not yet implemented - coming in v1.1");
  }
};

/**
 * Admin actions (stubs - implement with admin-roles.js)
 */
export const adminActions = {
  async assign_roles(event, args, user) {
    // TODO: Implement with admin-roles.js
    throw new Error("Admin actions not yet implemented - coming in v1.1");
  },
  
  async enable_module(event, args, user) {
    throw new Error("Admin actions not yet implemented - coming in v1.1");
  },
  
  async disable_module(event, args, user) {
    throw new Error("Admin actions not yet implemented - coming in v1.1");
  }
};

/**
 * Erection Sequencing actions (stubs)
 */
export const erectionActions = {
  async ensure_db_ready(event, args, user) {
    // TODO: Implement erection sequencing table setup
    throw new Error("Erection sequencing actions not yet implemented - coming in v1.1");
  },
  
  async create_sequence(event, args, user) {
    throw new Error("Erection sequencing actions not yet implemented - coming in v1.1");
  },
  
  async attach_schedule(event, args, user) {
    throw new Error("Erection sequencing actions not yet implemented - coming in v1.1");
  }
};

/**
 * QC actions (stubs)
 */
export const qcActions = {
  async upload_bed_report(event, args, user) {
    // TODO: Implement QC bed report upload
    throw new Error("QC actions not yet implemented - coming in v1.1");
  },
  
  async list_reports(event, args, user) {
    throw new Error("QC actions not yet implemented - coming in v1.1");
  }
};

/**
 * Main dispatcher - routes action to appropriate handler
 */
export async function dispatchAction(event, action, args, user) {
  const [category, ...rest] = action.split('.');
  
  switch (category) {
    case 'db':
      const dbAction = rest.join('_');
      if (!dbActions[dbAction]) {
        throw new Error(`Unknown DB action: ${action}`);
      }
      return await dbActions[dbAction](event, args, user);
      
    case 'acc':
      if (rest[0] === 'import') {
        const entity = rest[1];
        const importFn = accActions[`import_${entity}`];
        if (!importFn) {
          throw new Error(`Unknown ACC import entity: ${entity}`);
        }
        return await importFn(event, args, user);
      }
      throw new Error(`Unknown ACC action: ${action}`);
      
    case 'admin':
      if (rest[0] === 'user') {
        return await adminActions.assign_roles(event, args, user);
      }
      if (rest[0] === 'module') {
        const modAction = rest[1];
        if (modAction === 'enable') return await adminActions.enable_module(event, args, user);
        if (modAction === 'disable') return await adminActions.disable_module(event, args, user);
      }
      throw new Error(`Unknown admin action: ${action}`);
      
    case 'erection':
      const erectionAction = rest.join('_');
      if (!erectionActions[erectionAction]) {
        throw new Error(`Unknown erection action: ${action}`);
      }
      return await erectionActions[erectionAction](event, args, user);
      
    case 'qc':
      const qcAction = rest.join('_');
      if (!qcActions[qcAction]) {
        throw new Error(`Unknown QC action: ${action}`);
      }
      return await qcActions[qcAction](event, args, user);
      
    default:
      throw new Error(`Unknown action category: ${category}`);
  }
}

