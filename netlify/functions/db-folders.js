// DB Folders Endpoint
// Manage folder metadata
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

    const oss = createOssClient(event);
    const bucket = getBucket();

    // GET - List folders
    if (event.httpMethod === 'GET') {
      const prefix = buildKey(user, 'folders');
      const objects = await oss.listObjects(bucket, prefix);
      
      const folders = [];
      for (const obj of objects.filter(o => o.key.endsWith('/meta.json'))) {
        try {
          const json = await oss.getJson(bucket, obj.key);
          folders.push(json);
        } catch (e) {
          console.warn(`Failed to load folder ${obj.key}:`, e);
        }
      }

      return response(200, folders);
    }

    // POST - Create folder
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { name, description = '' } = body;

      if (!name) {
        return errorResponse(400, 'Folder name is required');
      }

      // Generate folder ID from name
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const key = buildKey(user, 'folders', id, 'meta.json');

      // Check if exists
      const exists = await oss.exists(bucket, key);
      if (exists) {
        return errorResponse(409, 'Folder already exists');
      }

      const folderMeta = {
        id,
        name,
        description,
        createdBy: user.email,
        createdAt: new Date().toISOString()
      };

      await oss.putJson(bucket, key, folderMeta);

      return response(201, folderMeta);
    }

    return errorResponse(405, 'Method not allowed');

  } catch (error) {
    return errorResponse(500, 'Folder operation failed', error);
  }
}

