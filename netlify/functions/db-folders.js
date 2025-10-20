// DB Folders Endpoint
// Manage folder metadata
import { createOssClient, response, errorResponse, parseUser, requireAdmin, getBucket, buildKey } from './_db-helpers.js';

function normalizeId(s) {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function extractIdFromPath(path) {
  // Handles /.netlify/functions/db-folders and redirects mapping from /api/db/folders/:id
  // After redirect, path usually ends with '/db-folders/:id'
  const parts = (path || '').split('/');
  return parts[parts.length - 1] || null;
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
    const tenantPrefix = `tenants/${user.hubId}`;

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
      const { name, description = '', parentId = null } = body;

      if (!name) {
        return errorResponse(400, 'Folder name is required');
      }

      // Ensure bucket exists before writing
      await oss.ensureBucket(bucket);

      // Generate folder ID from name
      const id = normalizeId(name);
      const key = buildKey(user, 'folders', id, 'meta.json');

      // Check if exists
      const exists = await oss.exists(bucket, key);
      if (exists) {
        return errorResponse(409, 'Folder already exists');
      }

      const now = new Date().toISOString();
      const folderMeta = {
        id,
        name,
        description,
        parentId,
        createdBy: user.email,
        createdAt: now,
        updatedAt: now,
        updatedBy: user.email
      };

      await oss.putJson(bucket, key, folderMeta);

      return response(201, folderMeta);
    }

    // PUT - Rename folder
    if (event.httpMethod === 'PUT') {
      const folderId = extractIdFromPath(event.path);
      if (!folderId) {
        return errorResponse(400, 'Missing folder id in path');
      }

      const body = JSON.parse(event.body || '{}');
      const newName = (body.name || '').trim();
      if (!newName) {
        return errorResponse(400, 'Missing new folder name');
      }

      const base = `${tenantPrefix}/folders/${folderId}`;
      
      // Read existing meta
      let meta;
      try {
        const buf = await oss.getObject(bucket, `${base}/meta.json`);
        meta = JSON.parse(Buffer.from(buf).toString('utf8'));
      } catch {
        return errorResponse(404, 'Folder not found');
      }

      meta.name = newName;
      meta.updatedAt = new Date().toISOString();
      meta.updatedBy = user.email;

      await oss.putJson(bucket, `${base}/meta.json`, meta);
      
      return response(200, meta);
    }

    return errorResponse(405, 'Method not allowed');

  } catch (error) {
    return errorResponse(500, 'Folder operation failed', error);
  }
}

