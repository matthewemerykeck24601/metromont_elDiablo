// DB Objects Listing Endpoint
// Lists raw OSS objects with optional prefix filter
import { createOssClient, response, errorResponse, parseUser, requireAdmin, getBucket } from './_db-helpers.js';

export async function handler(event) {
  try {
    // Handle preflight
    if (event.httpMethod === 'OPTIONS') {
      return response(200, {});
    }

    // Only GET allowed
    if (event.httpMethod !== 'GET') {
      return errorResponse(405, 'Method not allowed');
    }

    // Parse user and check admin
    const user = parseUser(event);
    const authError = requireAdmin(user);
    if (authError) return authError;

    // Get prefix from query (normalize empty string to undefined)
    const params = event.queryStringParameters || {};
    const raw = params.prefix ?? '';
    const prefix = raw && raw.trim().length ? raw : undefined;

    // List objects from OSS
    const oss = createOssClient(event);
    const bucket = getBucket();
    const objects = await oss.listObjects(bucket, prefix);

    return response(200, {
      prefix,
      bucket,
      count: objects.length,
      objects
    });

  } catch (error) {
    return errorResponse(500, 'Failed to list objects', error);
  }
}

