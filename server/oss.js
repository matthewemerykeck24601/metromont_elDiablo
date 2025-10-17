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
     * Get an object from the bucket as a Buffer
     * @param {string} bucketKey - Bucket identifier
     * @param {string} objectKey - Object key/path
     * @returns {Promise<Buffer>} Object contents as Buffer
     */
    async getObject(bucketKey, objectKey) {
      const headers = await _headers();
      const url = `https://${host}/oss/v2/buckets/${encodeURIComponent(bucketKey)}/objects/${encodeURIComponent(objectKey)}`;
      
      const response = await fetch(url, { headers });
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Object not found: ${objectKey}`);
        }
        const errorText = await response.text();
        throw new Error(`OSS get failed: ${response.status} ${errorText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
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
     * Put an object in the bucket
     * @param {string} bucketKey - Bucket identifier
     * @param {string} objectKey - Object key/path
     * @param {Buffer|string} bufferOrString - Content to upload
     * @param {string} contentType - MIME type
     * @returns {Promise<boolean>} Success indicator
     */
    async putObject(bucketKey, objectKey, bufferOrString, contentType = "application/octet-stream") {
      const headers = await _headers();
      headers["Content-Type"] = contentType;
      
      const url = `https://${host}/oss/v2/buckets/${encodeURIComponent(bucketKey)}/objects/${encodeURIComponent(objectKey)}`;
      const body = typeof bufferOrString === "string" ? bufferOrString : bufferOrString;
      
      const response = await fetch(url, { 
        method: "PUT", 
        headers, 
        body 
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OSS put failed: ${response.status} ${errorText}`);
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
export async function getOssToken(clientId, clientSecret, scope = "data:read data:create data:write bucket:create bucket:read") {
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
    throw new Error(`Token error: ${response.status} ${errorText}`);
  }

  const { access_token } = await response.json();
  return access_token;
}

