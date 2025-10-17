// APS Object Storage Service (OSS) Wrapper
// Provides simple helpers for reading/writing JSON to OSS buckets

/**
 * Create an OSS client for interacting with APS Object Storage
 * @param {Object} options - Configuration options
 * @param {string} options.region - APS region (US, EMEA, etc.)
 * @param {Function} options.getToken - Async function that returns a 2LO token
 * @returns {Object} OSS client with CRUD methods
 */
export function makeOssClient({ region = "US", getToken }) {
  const host = "developer.api.autodesk.com";

  async function _headers() {
    const token = await getToken();
    return { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  return {
    /**
     * Ensure bucket exists, create if missing
     * @param {string} bucketKey - Bucket identifier
     * @returns {Promise<Object>} { exists: true, created?: true }
     */
    async ensureBucket(bucketKey) {
      const headers = await _headers();
      
      // Check if bucket exists
      const checkUrl = `https://${host}/oss/v2/buckets/${encodeURIComponent(bucketKey)}/details`;
      const checkResponse = await fetch(checkUrl, { headers });
      
      if (checkResponse.ok) {
        console.log(`✅ Bucket ${bucketKey} already exists`);
        return { exists: true };
      }
      
      if (checkResponse.status === 404) {
        console.log(`🏗️ Creating bucket ${bucketKey}...`);
        
        // Create bucket
        const createResponse = await fetch(`https://${host}/oss/v2/buckets`, {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            bucketKey: bucketKey,
            policyKey: 'persistent'
          })
        });
        
        if (!createResponse.ok) {
          const errorText = await createResponse.text();
          
          // Handle race condition where bucket was created between check and create
          if (errorText.includes('already exists')) {
            console.log('ℹ️ Bucket already exists (race condition)');
            return { exists: true };
          }
          
          throw new Error(`Failed to create bucket: ${createResponse.status} ${errorText}`);
        }
        
        console.log(`✅ Created bucket ${bucketKey}`);
        return { exists: true, created: true };
      }
      
      const errorText = await checkResponse.text();
      throw new Error(`Bucket check failed: ${checkResponse.status} ${errorText}`);
    },

    /**
     * List objects in a bucket with optional prefix filter
     * @param {string} bucketKey - Bucket identifier
     * @param {string} prefix - Object key prefix to filter by
     * @returns {Promise<Array>} Array of { key, size } objects
     */
    async listObjects(bucketKey, prefix = "") {
      const headers = await _headers();
      const url = `https://${host}/oss/v2/buckets/${encodeURIComponent(bucketKey)}/objects?limit=100&beginsWith=${encodeURIComponent(prefix)}`;
      
      const response = await fetch(url, { headers });
      
      if (!response.ok) {
        // Bucket doesn't exist yet → return empty list instead of error
        if (response.status === 404) {
          console.log(`ℹ️ Bucket ${bucketKey} not found - returning empty list`);
          return [];
        }
        const errorText = await response.text();
        throw new Error(`OSS list failed: ${response.status} ${errorText}`);
      }
      
      const data = await response.json();
      return (data.items || []).map(it => ({ 
        key: it.objectKey, 
        size: it.size,
        lastModified: it.lastModified 
      }));
    },

    /**
     * Get an object from the bucket as a Buffer (using signed S3 download)
     * @param {string} bucketKey - Bucket identifier
     * @param {string} objectKey - Object key/path
     * @returns {Promise<Buffer>} Object contents as Buffer
     */
    async getObject(bucketKey, objectKey) {
      const headers = await _headers();
      
      // Step 1: Get signed S3 download URL
      const signUrl = `https://${host}/oss/v2/buckets/${encodeURIComponent(bucketKey)}/objects/${encodeURIComponent(objectKey)}/signeds3download`;
      const signResponse = await fetch(signUrl, { headers });
      
      if (!signResponse.ok) {
        if (signResponse.status === 404) {
          throw new Error(`Object not found: ${objectKey}`);
        }
        const errorText = await signResponse.text();
        throw new Error(`OSS get failed: ${signResponse.status} ${errorText}`);
      }
      
      const { url: s3Url } = await signResponse.json();
      
      // Step 2: Download from S3
      const s3Response = await fetch(s3Url);
      if (!s3Response.ok) {
        const errorText = await s3Response.text();
        throw new Error(`S3 download failed: ${s3Response.status} ${errorText}`);
      }
      
      const arrayBuffer = await s3Response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    },

    /**
     * Get an object and parse as JSON
     * @param {string} bucketKey - Bucket identifier
     * @param {string} objectKey - Object key/path
     * @returns {Promise<Object>} Parsed JSON object
     */
    async getJson(bucketKey, objectKey) {
      try {
        const buffer = await this.getObject(bucketKey, objectKey);
        const text = buffer.toString("utf8");
        return JSON.parse(text || "{}");
      } catch (error) {
        if (error.message.includes('not found')) {
          return {}; // Return empty object for missing files
        }
        throw error;
      }
    },

    /**
     * Put an object in the bucket (using signed S3 upload)
     * @param {string} bucketKey - Bucket identifier
     * @param {string} objectKey - Object key/path
     * @param {Buffer|string} bufferOrString - Content to upload
     * @param {string} contentType - MIME type
     * @returns {Promise<boolean>} Success indicator
     */
    async putObject(bucketKey, objectKey, bufferOrString, contentType = "application/octet-stream") {
      const headers = await _headers();
      
      // Step 1: Request signed S3 upload URL (single part)
      const signUrl = `https://${host}/oss/v2/buckets/${encodeURIComponent(bucketKey)}/objects/${encodeURIComponent(objectKey)}/signeds3upload?parts=1`;
      const signResponse = await fetch(signUrl, { headers });
      
      if (!signResponse.ok) {
        const errorText = await signResponse.text();
        throw new Error(`Failed to get signed upload URL: ${signResponse.status} ${errorText}`);
      }
      
      const { urls, uploadKey } = await signResponse.json();
      const uploadUrl = urls[0]; // URL for part 1
      
      // Step 2: Upload to S3
      const body = typeof bufferOrString === "string" ? bufferOrString : bufferOrString;
      const s3Response = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body
      });
      
      if (!s3Response.ok) {
        const errorText = await s3Response.text();
        throw new Error(`S3 upload failed: ${s3Response.status} ${errorText}`);
      }
      
      // Step 3: Finalize upload
      const finalizeUrl = `https://${host}/oss/v2/buckets/${encodeURIComponent(bucketKey)}/objects/${encodeURIComponent(objectKey)}/signeds3upload`;
      const finalizeResponse = await fetch(finalizeUrl, {
        method: "POST",
        headers: { 
          ...headers,
          "Content-Type": "application/json" 
        },
        body: JSON.stringify({ uploadKey })
      });
      
      if (!finalizeResponse.ok) {
        const errorText = await finalizeResponse.text();
        throw new Error(`Failed to finalize upload: ${finalizeResponse.status} ${errorText}`);
      }
      
      return true;
    },

    /**
     * Put a JSON object in the bucket
     * @param {string} bucketKey - Bucket identifier
     * @param {string} objectKey - Object key/path
     * @param {Object} json - Object to serialize and upload
     * @returns {Promise<boolean>} Success indicator
     */
    async putJson(bucketKey, objectKey, json) {
      return this.putObject(bucketKey, objectKey, JSON.stringify(json, null, 2), "application/json");
    },

    /**
     * Delete an object from the bucket
     * @param {string} bucketKey - Bucket identifier
     * @param {string} objectKey - Object key/path
     * @returns {Promise<boolean>} Success indicator
     */
    async deleteObject(bucketKey, objectKey) {
      const headers = await _headers();
      const url = `https://${host}/oss/v2/buckets/${encodeURIComponent(bucketKey)}/objects/${encodeURIComponent(objectKey)}`;
      
      const response = await fetch(url, { 
        method: "DELETE", 
        headers 
      });
      
      if (response.status !== 200 && response.status !== 204 && response.status !== 404) {
        const errorText = await response.text();
        throw new Error(`OSS delete failed: ${response.status} ${errorText}`);
      }
      
      return true;
    },

    /**
     * Check if an object exists
     * @param {string} bucketKey - Bucket identifier
     * @param {string} objectKey - Object key/path
     * @returns {Promise<boolean>} True if exists
     */
    async exists(bucketKey, objectKey) {
      try {
        await this.getObject(bucketKey, objectKey);
        return true;
      } catch (error) {
        if (error.message.includes('not found')) {
          return false;
        }
        throw error;
      }
    }
  };
}

/**
 * Get a 2-legged OAuth token for OSS access
 * @param {string} clientId - APS Client ID
 * @param {string} clientSecret - APS Client Secret
 * @param {string} scope - OAuth scope (default: data:read data:write)
 * @returns {Promise<string>} Access token
 */
export async function getOssToken(clientId, clientSecret, scope = "data:read data:create data:write bucket:create bucket:read bucket:update bucket:delete") {
  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope
  });

  const response = await fetch("https://developer.api.autodesk.com/authentication/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`2LO Token error: ${response.status} ${errorText}`);
  }

  const { access_token } = await response.json();
  console.log('✅ 2LO token acquired for OSS operations');
  return access_token;
}

