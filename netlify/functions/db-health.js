// DB Health Check Endpoint
import { createOssClient, response, errorResponse, parseUser, requireAdmin, getBucket } from './_db-helpers.js';

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

    // Ensure bucket exists (auto-create if needed)
    const bucket = getBucket();
    const oss = createOssClient(event);
    const bucketStatus = await oss.ensureBucket(bucket);

    // Return health status
    return response(200, {
      ok: true,
      bucket,
      bucketStatus,
      region: process.env.APS_REGION || 'US',
      user: {
        email: user.email,
        hubId: user.hubId
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return errorResponse(500, 'Health check failed', error);
  }
}

