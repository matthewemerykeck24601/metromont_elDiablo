// DB Health Check Endpoint
import { response, errorResponse, parseUser, requireAdmin, getBucket } from './_db-helpers.js';

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

    // Return health status
    return response(200, {
      ok: true,
      bucket: getBucket(),
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

