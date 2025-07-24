exports.handler = async (event, context) => {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            },
            body: ''
        };
    }

    // Validate environment variables
    if (!process.env.ACC_CLIENT_ID || !process.env.ACC_CLIENT_SECRET) {
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({
                success: false,
                error: 'Server configuration error - missing credentials'
            })
        };
    }

    try {
        const { action, data } = JSON.parse(event.body || '{}');

        // Get 2-legged token for OSS access
        const ossToken = await get2LeggedToken();

        switch (action) {
            case 'save-report':
                return await saveReportToOSS(ossToken, data);
            case 'load-reports':
                return await loadReportsFromOSS(ossToken, data.projectId);
            case 'delete-report':
                return await deleteReportFromOSS(ossToken, data.bucketKey, data.objectKey);
            case 'load-report':
                return await loadSingleReportFromOSS(ossToken, data.bucketKey, data.objectKey);
            default:
                throw new Error('Invalid action specified');
        }

    } catch (error) {
        console.error('OSS Storage function error:', error);
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            })
        };
    }
};

// Get 2-legged OAuth token for OSS access with complete bucket permissions
async function get2LeggedToken() {
    const tokenBody = new URLSearchParams({
        grant_type: 'client_credentials',
        scope: 'bucket:create bucket:read bucket:update bucket:delete data:read data:write data:create',
        client_id: process.env.ACC_CLIENT_ID,
        client_secret: process.env.ACC_CLIENT_SECRET
    });

    const response = await fetch('https://developer.api.autodesk.com/authentication/v2/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
        },
        body: tokenBody
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get 2-legged token: ${response.status} - ${errorText}`);
    }

    const tokenData = await response.json();

    // Log the granted scopes for debugging
    console.log('2-legged token granted scopes:', tokenData.scope || 'No scope in response');

    return tokenData.access_token;
}

// Generate bucket key for project
function generateBucketKey(projectId) {
    const projectHash = Buffer.from(projectId).toString('base64')
        .replace(/[^a-zA-Z0-9]/g, '').toLowerCase().substr(0, 8);
    const timestamp = Date.now().toString().substr(-6);
    return `metromont-castlink-${projectHash}-${timestamp}`.toLowerCase();
}

// Ensure bucket exists
async function ensureBucket(token, bucketKey) {
    // Check if bucket exists
    const checkResponse = await fetch(`https://developer.api.autodesk.com/oss/v2/buckets/${bucketKey}/details`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (checkResponse.ok) {
        return { exists: true, bucketKey };
    }

    if (checkResponse.status === 404) {
        // Create bucket
        const createResponse = await fetch('https://developer.api.autodesk.com/oss/v2/buckets', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                bucketKey: bucketKey,
                policyKey: 'persistent'
            })
        });

        if (!createResponse.ok) {
            const errorText = await createResponse.text();

            // Check if bucket already exists error
            if (errorText.includes('already exists')) {
                return { exists: true, bucketKey };
            }

            throw new Error(`Failed to create bucket: ${createResponse.status} - ${errorText}`);
        }

        console.log(`✓ Created new OSS bucket: ${bucketKey}`);
        return { exists: true, bucketKey, created: true };
    }

    throw new Error(`Failed to check bucket: ${checkResponse.status}`);
}

// Save report to OSS
async function saveReportToOSS(token, reportData) {
    try {
        const { projectId, reportContent } = reportData;

        // Generate bucket key
        const bucketKey = generateBucketKey(projectId);

        // Ensure bucket exists
        await ensureBucket(token, bucketKey);

        // Generate object key with structured path
        const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const bedName = reportContent.reportData.bedName || 'unknown-bed';
        const reportId = reportContent.reportData.reportId || 'unknown-report';
        const objectKey = `reports/${date}/${bedName}/${reportId}.json`;

        // Add OSS metadata to report content
        const ossReportContent = {
            ...reportContent,
            ossMetadata: {
                bucketKey: bucketKey,
                objectKey: objectKey,
                savedAt: new Date().toISOString(),
                version: '2.0',
                storageType: 'oss-persistent',
                bucketPermissions: 'create,read,update,delete'
            }
        };

        // Upload to OSS
        const uploadResponse = await fetch(`https://developer.api.autodesk.com/oss/v2/buckets/${bucketKey}/objects/${encodeURIComponent(objectKey)}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Content-Length': JSON.stringify(ossReportContent).length.toString()
            },
            body: JSON.stringify(ossReportContent, null, 2)
        });

        if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            throw new Error(`Failed to upload to OSS: ${uploadResponse.status} - ${errorText}`);
        }

        const uploadResult = await uploadResponse.json();

        console.log(`✓ Saved report to OSS: ${objectKey} (${JSON.stringify(ossReportContent).length} bytes)`);

        return {
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({
                success: true,
                bucketKey: bucketKey,
                objectKey: objectKey,
                size: JSON.stringify(ossReportContent).length,
                reportId: reportId,
                uploadResult: uploadResult,
                method: 'oss-storage',
                bucketPermissions: 'create,read,update,delete'
            })
        };

    } catch (error) {
        throw new Error(`OSS Save Error: ${error.message}`);
    }
}

// Load reports from OSS
async function loadReportsFromOSS(token, projectId) {
    try {
        const bucketKey = generateBucketKey(projectId);

        // Try to get bucket contents
        const listResponse = await fetch(`https://developer.api.autodesk.com/oss/v2/buckets/${bucketKey}/objects`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!listResponse.ok) {
            if (listResponse.status === 404) {
                // No bucket exists yet
                return {
                    statusCode: 200,
                    headers: { 'Access-Control-Allow-Origin': '*' },
                    body: JSON.stringify({
                        success: true,
                        reports: [],
                        message: 'No reports found - bucket does not exist yet'
                    })
                };
            }
            throw new Error(`Failed to list objects: ${listResponse.status}`);
        }

        const objectsList = await listResponse.json();
        const reports = [];

        // Filter and format report objects
        for (const item of objectsList.items || []) {
            if (item.objectKey.endsWith('.json') && item.objectKey.includes('reports/')) {
                const pathParts = item.objectKey.split('/');
                const fileName = pathParts[pathParts.length - 1].replace('.json', '');

                reports.push({
                    bucketKey: bucketKey,
                    objectKey: item.objectKey,
                    displayName: fileName,
                    size: item.size,
                    lastModified: item.dateModified,
                    source: 'oss',
                    needsDownload: true,
                    bucketPermissions: 'create,read,update,delete'
                });
            }
        }

        console.log(`✓ Loaded ${reports.length} reports from OSS bucket: ${bucketKey}`);

        return {
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({
                success: true,
                reports: reports,
                bucketKey: bucketKey,
                bucketPermissions: 'create,read,update,delete'
            })
        };

    } catch (error) {
        throw new Error(`OSS Load Error: ${error.message}`);
    }
}

// Load single report from OSS
async function loadSingleReportFromOSS(token, bucketKey, objectKey) {
    try {
        const downloadResponse = await fetch(`https://developer.api.autodesk.com/oss/v2/buckets/${bucketKey}/objects/${encodeURIComponent(objectKey)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!downloadResponse.ok) {
            throw new Error(`Failed to download report: ${downloadResponse.status}`);
        }

        const reportContent = await downloadResponse.json();

        console.log(`✓ Downloaded report from OSS: ${objectKey}`);

        return {
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({
                success: true,
                reportContent: reportContent,
                bucketPermissions: 'create,read,update,delete'
            })
        };

    } catch (error) {
        throw new Error(`OSS Download Error: ${error.message}`);
    }
}

// Delete report from OSS
async function deleteReportFromOSS(token, bucketKey, objectKey) {
    try {
        const deleteResponse = await fetch(`https://developer.api.autodesk.com/oss/v2/buckets/${bucketKey}/objects/${encodeURIComponent(objectKey)}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!deleteResponse.ok && deleteResponse.status !== 404) {
            throw new Error(`Failed to delete report: ${deleteResponse.status}`);
        }

        console.log(`✓ Deleted report from OSS: ${objectKey}`);

        return {
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({
                success: true,
                message: 'Report deleted successfully',
                bucketPermissions: 'create,read,update,delete'
            })
        };

    } catch (error) {
        throw new Error(`OSS Delete Error: ${error.message}`);
    }
}