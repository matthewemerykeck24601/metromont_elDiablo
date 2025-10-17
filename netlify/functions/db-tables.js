// DB Tables Endpoint
// Manage table schemas
import { createOssClient, response, errorResponse, parseUser, requireAdmin, getBucket, buildKey } from './_db-helpers.js';

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

    // GET - List tables
    if (event.httpMethod === 'GET') {
      const prefix = buildKey(user, 'tables');
      const objects = await oss.listObjects(bucket, prefix);
      
      const tables = [];
      for (const obj of objects.filter(o => o.key.endsWith('/schema.json'))) {
        try {
          const json = await oss.getJson(bucket, obj.key);
          tables.push(json);
        } catch (e) {
          console.warn(`Failed to load table ${obj.key}:`, e);
        }
      }

      return response(200, tables);
    }

    // POST - Create table
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { name, folderId, schema } = body;

      if (!name) {
        return errorResponse(400, 'Table name is required');
      }

      if (!schema || !schema.properties) {
        return errorResponse(400, 'Valid JSON schema is required');
      }

      // Generate table ID from name
      const tableId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const key = buildKey(user, 'tables', tableId, 'schema.json');

      // Check if exists
      const exists = await oss.exists(bucket, key);
      if (exists) {
        return errorResponse(409, 'Table already exists');
      }

      const tableMeta = {
        id: tableId,
        name,
        folderId: folderId || null,
        schema,
        createdBy: user.email,
        createdAt: new Date().toISOString()
      };

      await oss.putJson(bucket, key, tableMeta);

      return response(201, tableMeta);
    }

    return errorResponse(405, 'Method not allowed');

  } catch (error) {
    return errorResponse(500, 'Table operation failed', error);
  }
}

