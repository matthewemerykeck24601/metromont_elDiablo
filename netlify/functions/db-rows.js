// DB Rows Endpoint
// Manage table rows (data)
import { createOssClient, response, errorResponse, parseUser, requireAdmin, getBucket, buildKey, uuid } from './_db-helpers.js';

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

    const oss = createOssClient();
    const bucket = getBucket();

    // Extract tableId from path
    const pathMatch = event.path.match(/\/db-rows\/([^\/]+)(?:\/([^\/]+))?/);
    if (!pathMatch) {
      return errorResponse(400, 'Invalid path - tableId required');
    }

    const tableId = pathMatch[1];
    const rowId = pathMatch[2]; // May be undefined for GET all / POST

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

      if (!data) {
        return errorResponse(400, 'Row data is required');
      }

      const newRowId = uuid();
      const key = buildKey(user, 'tables', tableId, 'rows', `${newRowId}.json`);

      // TODO: Validate against schema
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

      if (!data) {
        return errorResponse(400, 'Row data is required');
      }

      const key = buildKey(user, 'tables', tableId, 'rows', `${rowId}.json`);

      // Get existing row
      let existing = {};
      try {
        existing = await oss.getJson(bucket, key);
      } catch (e) {
        // Row doesn't exist, we'll create it
      }

      // Merge data
      const row = {
        ...existing,
        ...data,
        id: rowId,
        _meta: {
          ...(existing._meta || {}),
          updatedBy: user.email,
          updatedAt: new Date().toISOString()
        }
      };

      await oss.putJson(bucket, key, row);

      return response(200, row);
    }

    // DELETE - Delete row
    if (event.httpMethod === 'DELETE' && rowId) {
      const key = buildKey(user, 'tables', tableId, 'rows', `${rowId}.json`);
      
      await oss.deleteObject(bucket, key);

      return response(204, '');
    }

    return errorResponse(405, 'Method not allowed');

  } catch (error) {
    return errorResponse(500, 'Row operation failed', error);
  }
}

