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

    // Add detailed logging for debugging
    console.log('=== OSS STORAGE FUNCTION START ===');
    console.log('HTTP Method:', event.httpMethod);

    // Validate environment variables
    if (!process.env.ACC_CLIENT_ID || !process.env.ACC_CLIENT_SECRET) {
        console.error('❌ Missing environment variables');
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({
                success: false,
                error: 'Server configuration error - missing credentials'
            })
        };
    }

    console.log('✅ Environment variables present');

    try {
        let requestBody;
        try {
            requestBody = JSON.parse(event.body || '{}');
            console.log('📨 Request action:', requestBody.action);
        } catch (parseError) {
            console.error('❌ Invalid JSON in request body:', parseError);
            throw new Error('Invalid JSON in request body');
        }

        const { action, data } = requestBody;

        if (!action) {
            throw new Error('Missing action parameter');
        }

        console.log('🔄 Getting 2-legged token...');

        // Get 2-legged token for OSS access with timeout
        const ossToken = await Promise.race([
            get2LeggedToken(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Token request timeout after 8 seconds')), 8000)
            )
        ]);

        console.log('✅ Token acquired successfully');

        switch (action) {
            case 'save-report':
                console.log('💾 Saving report to OSS...');
                return await saveReportToOSS(ossToken, data);
            case 'load-reports':
                console.log('📂 Loading reports from OSS...');
                return await loadReportsFromOSS(ossToken, data.projectId);
            case 'delete-report':
                console.log('🗑️ Deleting report from OSS...');
                return await deleteReportFromOSS(ossToken, data.bucketKey, data.objectKey);
            case 'load-report':
                console.log('📄 Loading single report from OSS...');
                return await loadSingleReportFromOSS(ossToken, data.bucketKey, data.objectKey);
            default:
                throw new Error(`Invalid action: ${action}`);
        }

    } catch (error) {
        console.error('❌ OSS Storage function error:', error);
        console.error('Error stack:', error.stack);

        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString(),
                debug: {
                    functionTimeout: context.getRemainingTimeInMillis?.() || 'unknown',
                    errorType: error.constructor.name
                }
            })
        };
    }
};

// Get 2-legged OAuth token for OSS access with enhanced error handling
async function get2LeggedToken() {
    try {
        console.log('🔐 Requesting 2-legged token from Autodesk...');

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
                'Accept': 'application/json',
                'User-Agent': 'MetromontCastLink/2.0'
            },
            body: tokenBody
        });

        console.log('📥 Token response status:', response.status, response.statusText);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Token request failed:', response.status, errorText);
            throw new Error(`Failed to get 2-legged token: ${response.status} - ${errorText}`);
        }

        const tokenData = await response.json();
        console.log('✅ Token received successfully');
        console.log('🔍 Granted scopes:', tokenData.scope || 'No scope in response');

        if (!tokenData.access_token) {
            throw new Error('No access token in response');
        }

        return tokenData.access_token;

    } catch (error) {
        console.error('❌ Error in get2LeggedToken:', error);
        throw new Error(`Token acquisition failed: ${error.message}`);
    }
}

// Generate bucket key for project - SIMPLIFIED
function generateBucketKey(projectId) {
    try {
        // Create a simpler, more reliable bucket key
        const projectClean = projectId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().substr(0, 10);
        const timestamp = Date.now().toString().substr(-6);
        const bucketKey = `metromont-${projectClean}-${timestamp}`.toLowerCase();

        console.log('🪣 Generated bucket key:', bucketKey);
        return bucketKey;
    } catch (error) {
        console.error('❌ Error generating bucket key:', error);
        throw new Error(`Bucket key generation failed: ${error.message}`);
    }
}

// Test OSS API access with basic calls
async function testOSSAccess(token) {
    try {
        console.log('🧪 Testing basic OSS API access...');

        // Test 1: List buckets (most basic OSS call)
        const listResponse = await fetch('https://developer.api.autodesk.com/oss/v2/buckets', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'User-Agent': 'MetromontCastLink/2.0'
            }
        });

        console.log('🧪 List buckets test:', listResponse.status);

        if (listResponse.ok) {
            const bucketsList = await listResponse.json();
            console.log('✅ OSS API access confirmed, found', bucketsList.items?.length || 0, 'buckets');
            return true;
        } else {
            const errorText = await listResponse.text();
            console.log('❌ OSS API access failed:', listResponse.status, errorText);
            return false;
        }

    } catch (error) {
        console.error('❌ OSS API test failed:', error);
        return false;
    }
}

// Ensure bucket exists with enhanced error handling
async function ensureBucket(token, bucketKey) {
    try {
        console.log('🔍 Checking if bucket exists:', bucketKey);

        // Check if bucket exists
        const checkResponse = await fetch(`https://developer.api.autodesk.com/oss/v2/buckets/${bucketKey}/details`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'User-Agent': 'MetromontCastLink/2.0'
            }
        });

        console.log('📊 Bucket check response:', checkResponse.status);

        if (checkResponse.ok) {
            console.log('✅ Bucket already exists');
            return { exists: true, bucketKey };
        }

        if (checkResponse.status === 404) {
            console.log('🏗️ Creating new bucket...');

            // Create bucket
            const createResponse = await fetch('https://developer.api.autodesk.com/oss/v2/buckets', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'MetromontCastLink/2.0'
                },
                body: JSON.stringify({
                    bucketKey: bucketKey,
                    policyKey: 'persistent'
                })
            });

            console.log('🏭 Bucket creation response:', createResponse.status);

            if (!createResponse.ok) {
                const errorText = await createResponse.text();
                console.error('❌ Bucket creation failed:', errorText);

                // Check if bucket already exists error
                if (errorText.includes('already exists')) {
                    console.log('ℹ️ Bucket already exists (race condition)');
                    return { exists: true, bucketKey };
                }

                throw new Error(`Failed to create bucket: ${createResponse.status} - ${errorText}`);
            }

            const createResult = await createResponse.json();
            console.log('✅ Created new OSS bucket:', bucketKey);
            return { exists: true, bucketKey, created: true, result: createResult };
        }

        // Handle other errors
        const errorText = await checkResponse.text();
        throw new Error(`Bucket check failed: ${checkResponse.status} - ${errorText}`);

    } catch (error) {
        console.error('❌ Error in ensureBucket:', error);
        throw new Error(`Bucket management failed: ${error.message}`);
    }
}

// SIMPLIFIED Save approach - Basic file creation only
async function saveReportToOSS(token, reportData) {
    try {
        console.log('💾 Starting simplified report save process...');

        const { projectId, reportContent } = reportData;

        if (!projectId) {
            throw new Error('Missing projectId in report data');
        }

        if (!reportContent) {
            throw new Error('Missing reportContent in report data');
        }

        // First, test basic OSS access
        const ossAccessOk = await testOSSAccess(token);
        if (!ossAccessOk) {
            throw new Error('Basic OSS API access failed - check token permissions');
        }

        // Generate bucket key
        const bucketKey = generateBucketKey(projectId);

        // Ensure bucket exists
        const bucketResult = await ensureBucket(token, bucketKey);

        // Generate simple object key (avoid special characters completely)
        const reportId = reportContent.reportData?.reportId || 'unknown-report';
        const date = new Date().toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD
        const simpleObjectKey = `report_${reportId}_${date}.json`;

        console.log('📁 Object key:', simpleObjectKey);

        // Add OSS metadata to report content
        const ossReportContent = {
            ...reportContent,
            ossMetadata: {
                bucketKey: bucketKey,
                objectKey: simpleObjectKey,
                savedAt: new Date().toISOString(),
                version: '2.3',
                storageType: 'oss-basic',
                bucketPermissions: 'create,read,update,delete'
            }
        };

        const reportJSON = JSON.stringify(ossReportContent, null, 2);
        const fileSize = Buffer.byteLength(reportJSON, 'utf8');
        console.log('📊 Report size:', fileSize, 'bytes');

        console.log('🔄 Attempting basic file upload using multipart form...');

        // Try multipart form upload (most compatible approach)
        const formData = new FormData();
        formData.append('key', simpleObjectKey);
        formData.append('content-type', 'application/json');
        formData.append('file', new Blob([reportJSON], { type: 'application/json' }), simpleObjectKey);

        const uploadResponse = await fetch(`https://developer.api.autodesk.com/oss/v2/buckets/${bucketKey}/objects`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'User-Agent': 'MetromontCastLink/2.0'
            },
            body: formData
        });

        console.log('📤 Upload response status:', uploadResponse.status);

        if (uploadResponse.ok) {
            const uploadResult = await uploadResponse.json();
            console.log('✅ Saved report to OSS successfully (Multipart Form Upload)');

            return {
                statusCode: 200,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({
                    success: true,
                    bucketKey: bucketKey,
                    objectKey: simpleObjectKey,
                    size: fileSize,
                    reportId: reportId,
                    uploadResult: uploadResult,
                    method: 'oss-storage-multipart-v2.3',
                    bucketPermissions: 'create,read,update,delete'
                })
            };
        } else {
            const errorText = await uploadResponse.text();
            console.log('❌ Multipart upload failed:', uploadResponse.status, errorText);

            // If multipart fails, this indicates a fundamental OSS API issue
            throw new Error(`OSS upload failed: ${uploadResponse.status} - ${errorText}. This may indicate OSS API is not available or misconfigured.`);
        }

    } catch (error) {
        console.error('❌ Error in saveReportToOSS:', error);
        throw new Error(`OSS Save Error: ${error.message}`);
    }
}

// Load reports from OSS with enhanced error handling
async function loadReportsFromOSS(token, projectId) {
    try {
        console.log('📂 Loading reports for project:', projectId);

        if (!projectId) {
            throw new Error('Missing projectId');
        }

        const bucketKey = generateBucketKey(projectId);

        // Try to get bucket contents
        console.log('📋 Listing bucket contents...');
        const listResponse = await fetch(`https://developer.api.autodesk.com/oss/v2/buckets/${bucketKey}/objects`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'User-Agent': 'MetromontCastLink/2.0'
            }
        });

        console.log('📊 List response status:', listResponse.status);

        if (!listResponse.ok) {
            if (listResponse.status === 404) {
                console.log('ℹ️ No bucket exists yet');
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
            const errorText = await listResponse.text();
            throw new Error(`Failed to list objects: ${listResponse.status} - ${errorText}`);
        }

        const objectsList = await listResponse.json();
        const reports = [];

        console.log('📊 Found', objectsList.items?.length || 0, 'objects in bucket');

        // Filter and format report objects
        for (const item of objectsList.items || []) {
            if (item.objectKey.endsWith('.json')) {
                const fileName = item.objectKey.replace('.json', '');

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

        console.log('✅ Processed', reports.length, 'reports from OSS bucket');

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
        console.error('❌ Error in loadReportsFromOSS:', error);
        throw new Error(`OSS Load Error: ${error.message}`);
    }
}

// Load single report from OSS with enhanced error handling
async function loadSingleReportFromOSS(token, bucketKey, objectKey) {
    try {
        console.log('📄 Loading single report:', objectKey);

        const downloadResponse = await fetch(`https://developer.api.autodesk.com/oss/v2/buckets/${bucketKey}/objects/${encodeURIComponent(objectKey)}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'User-Agent': 'MetromontCastLink/2.0'
            }
        });

        console.log('📥 Download response status:', downloadResponse.status);

        if (!downloadResponse.ok) {
            const errorText = await downloadResponse.text();
            throw new Error(`Failed to download report: ${downloadResponse.status} - ${errorText}`);
        }

        const reportContent = await downloadResponse.json();
        console.log('✅ Downloaded report from OSS successfully');

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
        console.error('❌ Error in loadSingleReportFromOSS:', error);
        throw new Error(`OSS Download Error: ${error.message}`);
    }
}

// Delete report from OSS with enhanced error handling
async function deleteReportFromOSS(token, bucketKey, objectKey) {
    try {
        console.log('🗑️ Deleting report:', objectKey);

        const deleteResponse = await fetch(`https://developer.api.autodesk.com/oss/v2/buckets/${bucketKey}/objects/${encodeURIComponent(objectKey)}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'User-Agent': 'MetromontCastLink/2.0'
            }
        });

        console.log('🗑️ Delete response status:', deleteResponse.status);

        if (!deleteResponse.ok && deleteResponse.status !== 404) {
            const errorText = await deleteResponse.text();
            throw new Error(`Failed to delete report: ${deleteResponse.status} - ${errorText}`);
        }

        console.log('✅ Deleted report from OSS successfully');

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
        console.error('❌ Error in deleteReportFromOSS:', error);
        throw new Error(`OSS Delete Error: ${error.message}`);
    }
}