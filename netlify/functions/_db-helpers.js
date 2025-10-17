// Shared DB helpers for Netlify Functions
import { makeOssClient, getOssToken } from '../../server/oss.js';

// Configuration (load from environment)
const APS_CLIENT_ID = process.env.APS_CLIENT_ID;
const APS_CLIENT_SECRET = process.env.APS_CLIENT_SECRET;
const BUCKET = process.env.PSEUDO_DB_BUCKET || "metromont-el-diablo-db-dev";
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "mkeck@metromont.com").split(',').map(e => e.trim());

let tokenCache = null;
let tokenExpiry = 0;

/**
 * Get cached OSS token or fetch new one
 */
async function getCachedToken() {
  const now = Date.now();
  if (tokenCache && now < tokenExpiry) {
    return tokenCache;
  }
  
  tokenCache = await getOssToken(APS_CLIENT_ID, APS_CLIENT_SECRET);
  tokenExpiry = now + (3500 * 1000); // Token valid for ~1 hour, refresh after 58min
  
  return tokenCache;
}

/**
 * Create OSS client instance
 */
export function createOssClient() {
  return makeOssClient({
    region: process.env.APS_REGION || "US",
    getToken: getCachedToken
  });
}

/**
 * Check if user is admin
 */
export function isAdmin(user) {
  return user && user.email && ADMIN_EMAILS.includes(user.email);
}

/**
 * Parse user from Netlify Identity (or custom auth)
 */
export function parseUser(event) {
  // Try Netlify Identity first
  const identityHeader = event.headers['x-netlify-identity'] || event.headers['X-Netlify-Identity'];
  
  if (identityHeader) {
    try {
      const identity = JSON.parse(identityHeader);
      const user = {
        email: identity.email,
        name: identity.user_metadata?.full_name || identity.email,
        hubId: identity.user_metadata?.hubId || 'default-hub'
      };
      console.log('✓ Parsed user identity:', user.email, `(hub: ${user.hubId})`);
      return user;
    } catch (e) {
      console.error('Failed to parse x-netlify-identity header:', e);
      console.error('Header value:', identityHeader);
    }
  } else {
    console.warn('⚠️ No x-netlify-identity header found in request');
    console.log('Available headers:', Object.keys(event.headers));
  }

  // Fallback for development (remove in production)
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production') {
    console.log('⚠️ Using development fallback user');
    return {
      email: 'mkeck@metromont.com',
      name: 'Matthew Keck',
      hubId: 'metromont-dev-hub'
    };
  }

  console.error('❌ No user identity available and not in development mode');
  return null;
}

/**
 * Standard response helper
 */
export function response(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, x-netlify-identity, authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      ...headers
    },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  };
}

/**
 * Error response helper
 */
export function errorResponse(statusCode, message, error = null) {
  console.error(`Error ${statusCode}:`, message, error);
  return response(statusCode, { 
    error: message,
    details: error?.message 
  });
}

/**
 * Auth guard middleware
 */
export function requireAdmin(user) {
  if (!user) {
    console.error('❌ Auth failed: No user object');
    return errorResponse(401, 'Unauthorized - No user found');
  }
  
  if (!isAdmin(user)) {
    console.error(`❌ Auth failed: ${user.email} is not in admin list`);
    console.log('Admin emails:', ADMIN_EMAILS);
    return errorResponse(403, `Forbidden - Admin access required. User ${user.email} is not authorized.`);
  }
  
  console.log(`✓ Admin access granted for ${user.email}`);
  return null; // No error, user is admin
}

/**
 * Get bucket key for tenant
 */
export function getBucket() {
  return BUCKET;
}

/**
 * Build object key path
 */
export function buildKey(user, ...parts) {
  return `tenants/${user.hubId}/${parts.join('/')}`;
}

/**
 * Generate UUID (simple version)
 */
export function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

