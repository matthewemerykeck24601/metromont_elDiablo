// DB Rows Endpoint
// Manage table rows (data) with foreign key enforcement
import { createOssClient, response, errorResponse, parseUser, requireAdmin, getBucket, buildKey, uuid } from './_db-helpers.js';

/**
 * Load table schema
 */
async function loadTableSchema(oss, bucket, tenantPrefix, tableId) {
  try {
    const schema = await oss.getJson(bucket, `${tenantPrefix}/tables/${tableId}/schema.json`);
    return schema;
  } catch (error) {
    throw new Error(`Table "${tableId}" not found`);
  }
}

/**
 * Check if a foreign key value exists in referenced table
 */
async function checkForeignKey(oss, bucket, tenantPrefix, refSpec, value) {
  if (value == null) return true; // nulls are allowed unless field is required
  
  const [refTable, refField] = refSpec.split('.');
  if (!refTable || !refField) {
    throw new Error(`Invalid reference spec: ${refSpec}`);
  }

  // List all rows in referenced table
  const prefix = `${tenantPrefix}/tables/${refTable}/rows/`;
  const objects = await oss.listObjects(bucket, prefix);
  
  for (const obj of objects.filter(o => o.key.endsWith('.json'))) {
    try {
      const row = await oss.getJson(bucket, obj.key);
      if (row && row[refField] === value) {
        return true; // Found matching value
      }
    } catch (e) {
      console.warn(`Failed to load row ${obj.key}:`, e);
    }
  }
  
  return false; // Value not found
}

/**
 * Validate all foreign key relationships for a row
 */
async function validateRelationships(oss, bucket, tenantPrefix, tableId, row) {
  const tableSchema = await loadTableSchema(oss, bucket, tenantPrefix, tableId);
  const rels = tableSchema.relationships || {};
  
  for (const [field, cfg] of Object.entries(rels)) {
    if (row[field] == null) continue; // allow nulls
    
    const exists = await checkForeignKey(oss, bucket, tenantPrefix, cfg.references, row[field]);
    if (!exists) {
      throw new Error(`Foreign key violation: ${tableId}.${field} -> ${cfg.references} value '${row[field]}' not found`);
    }
  }
}

/**
 * Find all child tables that reference this table.field
 */
async function findChildRefs(oss, bucket, tenantPrefix, parentTable, parentField, parentValue) {
  const prefix = `${tenantPrefix}/tables/`;
  const objects = await oss.listObjects(bucket, prefix);
  const matches = [];
  
  for (const obj of objects.filter(o => o.key.endsWith('/schema.json'))) {
    try {
      const tableSchema = await oss.getJson(bucket, obj.key);
      const rels = tableSchema.relationships || {};
      
      for (const [field, cfg] of Object.entries(rels)) {
        if (cfg.references === `${parentTable}.${parentField}`) {
          matches.push({ 
            tableId: tableSchema.id, 
            field, 
            onDelete: cfg.onDelete || 'restrict' 
          });
        }
      }
    } catch (e) {
      console.warn(`Failed to load schema ${obj.key}:`, e);
    }
  }
  
  return matches;
}

/**
 * Find rows in a table that reference a specific value
 */
async function findReferencingRows(oss, bucket, tenantPrefix, tableId, field, value) {
  const prefix = `${tenantPrefix}/tables/${tableId}/rows/`;
  const objects = await oss.listObjects(bucket, prefix);
  const matching = [];
  
  for (const obj of objects.filter(o => o.key.endsWith('.json'))) {
    try {
      const row = await oss.getJson(bucket, obj.key);
      if (row && row[field] === value) {
        matching.push({ row, key: obj.key });
      }
    } catch (e) {
      console.warn(`Failed to load row ${obj.key}:`, e);
    }
  }
  
  return matching;
}

export async function handler(event) {
  try {
    // Handle preflight
    if (event.httpMethod === 'OPTIONS') {
      return response(200, {});
    }

    // Parse user and check admin
    const user = parseUser(event);
    const authError = requireAdmin(user);
    if (authError) return authError;

    const oss = createOssClient(event);
    const bucket = getBucket();

    // Extract tableId / rowId from either pretty URL (/api/db/rows/:tableId/:rowId)
    // or legacy function URL (/.netlify/functions/db-rows/:tableId/:rowId)
    let tableId, rowId;
    try {
      const url = new URL(event.rawUrl || `http://internal${event.path || ''}`);
      const parts = url.pathname.split('/').filter(Boolean);
      // .../api/db/rows/:tableId/[:rowId]
      const rowsIdx = parts.indexOf('rows');
      if (rowsIdx !== -1) {
        tableId = parts[rowsIdx + 1];
        rowId = parts[rowsIdx + 2];
      }
    } catch (_) {}
    if (!tableId) {
      // Fallback: legacy function path
      const m = (event.path || '').match(/\/db-rows\/([^\/]+)(?:\/([^\/]+))?/);
      if (m) { tableId = m[1]; rowId = m[2]; }
    }
    if (!tableId) {
      return errorResponse(400, 'Invalid path - tableId required');
    }

    // GET - List all rows in table
    if (event.httpMethod === 'GET' && !rowId) {
      const prefix = buildKey(user, 'tables', tableId, 'rows');
      const objects = await oss.listObjects(bucket, prefix);
      
      const rows = [];
      for (const obj of objects.filter(o => o.key.endsWith('.json'))) {
        try {
          const json = await oss.getJson(bucket, obj.key);
          rows.push(json);
        } catch (e) {
          console.warn(`Failed to load row ${obj.key}:`, e);
        }
      }

      return response(200, rows);
    }

    // GET - Get specific row
    if (event.httpMethod === 'GET' && rowId) {
      const key = buildKey(user, 'tables', tableId, 'rows', `${rowId}.json`);
      const row = await oss.getJson(bucket, key);
      
      if (!row || !row.id) {
        return errorResponse(404, 'Row not found');
      }

      return response(200, row);
    }

    // POST - Create row
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { data } = body;

      if (!data || typeof data !== 'object') {
        return errorResponse(400, 'Row data is required');
      }

      // Ensure bucket exists before writing
      await oss.ensureBucket(bucket);

      const tenantPrefix = `tenants/${user.hubId || 'default-hub'}`;
      
      // Validate foreign keys before inserting
      try {
        await validateRelationships(oss, bucket, tenantPrefix, tableId, data);
      } catch (fkError) {
        return errorResponse(400, fkError.message);
      }

      const newRowId = uuid();
      const key = buildKey(user, 'tables', tableId, 'rows', `${newRowId}.json`);

      const row = {
        id: newRowId,
        ...data,
        _meta: {
          createdBy: user.email,
          createdAt: new Date().toISOString()
        }
      };

      await oss.putJson(bucket, key, row);

      return response(201, row);
    }

    // PUT - Update row
    if (event.httpMethod === 'PUT' && rowId) {
      const body = JSON.parse(event.body || '{}');
      const { data } = body;

      if (!data || typeof data !== 'object') {
        return errorResponse(400, 'Row data is required');
      }

      // Ensure bucket exists before writing
      await oss.ensureBucket(bucket);

      const key = buildKey(user, 'tables', tableId, 'rows', `${rowId}.json`);
      const tenantPrefix = `tenants/${user.hubId || 'default-hub'}`;

      // Get existing row
      let existing = {};
      try {
        existing = await oss.getJson(bucket, key);
      } catch (e) {
        // Row doesn't exist, we'll create it
      }

      // Merge data
      const updatedData = {
        ...existing,
        ...data,
        id: rowId
      };

      // Validate foreign keys before updating
      try {
        await validateRelationships(oss, bucket, tenantPrefix, tableId, updatedData);
      } catch (fkError) {
        return errorResponse(400, fkError.message);
      }

      const row = {
        ...updatedData,
        _meta: {
          ...(existing._meta || {}),
          updatedBy: user.email,
          updatedAt: new Date().toISOString()
        }
      };

      await oss.putJson(bucket, key, row);

      return response(200, row);
    }

    // DELETE - Delete row with referential integrity enforcement
    if (event.httpMethod === 'DELETE' && rowId) {
      const key = buildKey(user, 'tables', tableId, 'rows', `${rowId}.json`);
      const tenantPrefix = `tenants/${user.hubId || 'default-hub'}`;
      
      // Load the row to get its values
      let row;
      try {
        row = await oss.getJson(bucket, key);
      } catch (e) {
        return errorResponse(404, 'Row not found');
      }

      // Find any child tables that reference this row
      const childRefs = await findChildRefs(oss, bucket, tenantPrefix, tableId, 'id', row.id);
      
      // Process each reference based on onDelete policy
      for (const { tableId: childTable, field, onDelete } of childRefs) {
        const referencingRows = await findReferencingRows(oss, bucket, tenantPrefix, childTable, field, row.id);
        
        if (referencingRows.length === 0) continue; // No references, safe to proceed
        
        console.log(`Found ${referencingRows.length} ${childTable} rows referencing ${tableId}.id = ${row.id}`);
        
        if (onDelete === 'restrict') {
          return errorResponse(409, `Cannot delete: ${referencingRows.length} ${childTable} row(s) reference this ${tableId}. Remove references first or change onDelete policy.`);
        }
        
        if (onDelete === 'setNull') {
          console.log(`Setting ${childTable}.${field} to null for ${referencingRows.length} rows`);
          for (const { row: childRow, key: childKey } of referencingRows) {
            childRow[field] = null;
            childRow._meta = childRow._meta || {};
            childRow._meta.updatedBy = user.email;
            childRow._meta.updatedAt = new Date().toISOString();
            childRow._meta.cascadeReason = `Parent ${tableId}.id deleted`;
            await oss.putJson(bucket, childKey, childRow);
          }
        }
        
        if (onDelete === 'cascade') {
          console.log(`Cascading delete of ${referencingRows.length} ${childTable} rows`);
          for (const { key: childKey } of referencingRows) {
            await oss.deleteObject(bucket, childKey);
          }
        }
      }

      // Delete the parent row
      await oss.deleteObject(bucket, key);

      return response(200, { 
        ok: true, 
        message: 'Row deleted successfully',
        cascaded: childRefs.length > 0 
      });
    }

    return errorResponse(405, 'Method not allowed');

  } catch (error) {
    return errorResponse(500, 'Row operation failed', error);
  }
}

