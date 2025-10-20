// Admin Roles & Permissions Management
// Server-side role/permission storage using OSS

import { response, parseUser, requireAdmin, createOssClient, getBucket, ensureBucket } from './_db-helpers.js';

function normalizeId(s) {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export async function handler(event) {
  try {
    // Handle preflight
    if (event.httpMethod === "OPTIONS") {
      return response(200, {});
    }

    // Parse user and check admin
    const user = parseUser(event);
    const adminCheck = requireAdmin(user);
    if (adminCheck) return adminCheck;

    const oss = createOssClient(event);
    const bucket = getBucket();
    await ensureBucket(oss, bucket);
    
    const tenantPrefix = `tenants/${user.hubId || "default-hub"}`;
    const rolesPath = `${tenantPrefix}/admin/roles`;

    // GET - List all roles
    if (event.httpMethod === "GET") {
      try {
        const objects = await oss.listObjects(bucket, rolesPath);
        const roles = [];
        
        for (const obj of objects.filter(o => o.key.endsWith('.json'))) {
          try {
            const data = await oss.getJson(bucket, obj.key);
            roles.push(data);
          } catch (e) {
            console.warn(`Failed to load role ${obj.key}:`, e);
          }
        }
        
        return response(200, {
          roles,
          count: roles.length
        });
      } catch (error) {
        console.error('Failed to list roles:', error);
        return response(200, { roles: [], count: 0 }); // Return empty if no roles yet
      }
    }

    // POST - Assign roles to user
    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const { userEmail, roles = [], modules = [] } = body;
      
      if (!userEmail) {
        return response(400, { error: "userEmail is required" });
      }
      
      const userIdNormalized = normalizeId(userEmail);
      const roleKey = `${rolesPath}/${userIdNormalized}.json`;
      
      // Build role document
      const roleDoc = {
        id: userIdNormalized,
        email: userEmail,
        roles,
        modules: Array.isArray(modules) ? modules : [],
        updatedBy: user.email,
        updatedAt: new Date().toISOString(),
        createdBy: user.email,
        createdAt: new Date().toISOString()
      };
      
      // Check if already exists
      try {
        const existing = await oss.getJson(bucket, roleKey);
        roleDoc.createdBy = existing.createdBy;
        roleDoc.createdAt = existing.createdAt;
      } catch {
        // Doesn't exist, use new creation info
      }
      
      await oss.putJson(bucket, roleKey, roleDoc);
      
      return response(200, {
        ok: true,
        message: `Roles assigned to ${userEmail}`,
        role: roleDoc
      });
    }

    // DELETE - Remove user roles
    if (event.httpMethod === "DELETE") {
      const userEmail = new URLSearchParams(event.queryStringParameters || {}).get('userEmail');
      
      if (!userEmail) {
        return response(400, { error: "userEmail parameter is required" });
      }
      
      const userIdNormalized = normalizeId(userEmail);
      const roleKey = `${rolesPath}/${userIdNormalized}.json`;
      
      try {
        await oss.deleteObject(bucket, roleKey);
        return response(200, {
          ok: true,
          message: `Roles removed for ${userEmail}`
        });
      } catch (error) {
        console.error('Failed to delete role:', error);
        return response(404, { error: "Role not found" });
      }
    }

    return response(405, { error: "Method not allowed" });

  } catch (error) {
    console.error('Admin roles operation failed:', error);
    return response(500, { error: "Admin roles operation failed", details: String(error.message || error) });
  }
}

