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

        // Get 2-legged token for OSS access
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

// Get 2-legged OAuth token for OSS access
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
                'User-Agent': 'MetromontCastLink/3.0'
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

// Generate bucket key for project
function generateBucketKey(projectId) {
    try {
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

// Test OSS API access
async function testOSSAccess(token) {
    try {
        console.log('🧪 Testing OSS API access...');

        const listResponse = await fetch('https://developer.api.autodesk.com/oss/v2/buckets', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'User-Agent': 'MetromontCastLink/3.0'
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

// Ensure bucket exists
async function ensureBucket(token, bucketKey) {
    try {
        console.log('🔍 Checking if bucket exists:', bucketKey);

        // Check if bucket exists
        const checkResponse = await fetch(`https://developer.api.autodesk.com/oss/v2/buckets/${bucketKey}/details`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'User-Agent': 'MetromontCastLink/3.0'
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
                    'User-Agent': 'MetromontCastLink/3.0'
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

        const errorText = await checkResponse.text();
        throw new Error(`Bucket check failed: ${checkResponse.status} - ${errorText}`);

    } catch (error) {
        console.error('❌ Error in ensureBucket:', error);
        throw new Error(`Bucket management failed: ${error.message}`);
    }
}

// FIXED: Use correct signed S3 upload workflow
async function saveReportToOSS(token, reportData) {
    try {
        console.log('💾 Starting CORRECT signed S3 upload workflow...');

        const { projectId, reportContent } = reportData;

        if (!projectId) {
            throw new Error('Missing projectId in report data');
        }

        if (!reportContent) {
            throw new Error('Missing reportContent in report data');
        }

        // Test OSS access
        const ossAccessOk = await testOSSAccess(token);
        if (!ossAccessOk) {
            throw new Error('Basic OSS API access failed - check token permissions');
        }

        // Generate bucket key and ensure bucket exists
        const bucketKey = generateBucketKey(projectId);
        const bucketResult = await ensureBucket(token, bucketKey);

        // Generate object key
        const reportId = reportContent.reportData?.reportId || 'unknown-report';
        const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const objectKey = `report_${reportId}_${date}.json`;

        console.log('📁 Object key:', objectKey);

        // Add OSS metadata to report content
        const ossReportContent = {
            ...reportContent,
            ossMetadata: {
                bucketKey: bucketKey,
                objectKey: objectKey,
                savedAt: new Date().toISOString(),
                version: '3.0',
                storageType: 'signed-s3-upload',
                bucketPermissions: 'create,read,update,delete'
            }
        };

        const reportJSON = JSON.stringify(ossReportContent, null, 2);
        const fileSize = Buffer.byteLength(reportJSON, 'utf8');
        console.log('📊 Report size:', fileSize, 'bytes');

        // STEP 1: Request signed upload URL
        console.log('🔗 Step 1: Requesting signed upload URL...');
        const signedUrlResponse = await fetch(
            `https://developer.api.autodesk.com/oss/v2/buckets/${bucketKey}/objects/${encodeURIComponent(objectKey)}/signeds3upload?parts=1`,
            {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'User-Agent': 'MetromontCastLink/3.0'
                }
            }
        );

        console.log('📡 Signed URL response status:', signedUrlResponse.status);

        if (!signedUrlResponse.ok) {
            const errorText = await signedUrlResponse.text();
            throw new Error(`Failed to get signed upload URL: ${signedUrlResponse.status} - ${errorText}`);
        }

        const signedUrlData = await signedUrlResponse.json();
        const { urls, uploadKey } = signedUrlData;
        const uploadUrl = urls[0]; // URL for part 1

        console.log('✅ Got signed upload URL and uploadKey');

        // STEP 2: Upload file to S3 signed URL
        console.log('☁️ Step 2: Uploading to S3...');
        const s3UploadResponse = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/octet-stream'
            },
            body: reportJSON
        });

        console.log('📤 S3 upload response status:', s3UploadResponse.status);

        if (!s3UploadResponse.ok) {
            const errorText = await s3UploadResponse.text();
            throw new Error(`S3 upload failed: ${s3UploadResponse.status} - ${errorText}`);
        }

        console.log('✅ File uploaded to S3 successfully');

        // STEP 3: Finalize the upload
        console.log('✔️ Step 3: Finalizing upload...');
        const finalizeResponse = await fetch(
            `https://developer.api.autodesk.com/oss/v2/buckets/${bucketKey}/objects/${encodeURIComponent(objectKey)}/signeds3upload`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'MetromontCastLink/3.0'
                },
                body: JSON.stringify({ uploadKey: uploadKey })
            }
        );

        console.log('🏁 Finalize response status:', finalizeResponse.status);

        if (!finalizeResponse.ok) {
            const errorText = await finalizeResponse.text();
            throw new Error(`Failed to finalize upload: ${finalizeResponse.status} - ${errorText}`);
        }

        let finalizeResult;
        try {
            finalizeResult = await finalizeResponse.json();
        } catch (jsonError) {
            finalizeResult = { status: 'completed', objectKey: objectKey };
        }

        console.log('🎉 Report saved to OSS successfully using signed S3 upload!');

        return {
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({
                success: true,
                bucketKey: bucketKey,
                objectKey: objectKey,
                size: fileSize,
                reportId: reportId,
                uploadResult: finalizeResult,
                method: 'signed-s3-upload',
                bucketPermissions: 'create,read,update,delete',
                endpoint: 'OSS v2 with signed S3 URLs'
            })
        };

    } catch (error) {
        console.error('❌ Error in saveReportToOSS:', error);
        throw new Error(`OSS Save Error: ${error.message}`);
    }
}

// Load reports from OSS
async function loadReportsFromOSS(token, projectId) {
    try {
        console.log('📂 Loading reports for project:', projectId);

        if (!projectId) {
            throw new Error('Missing projectId');
        }

        const bucketKey = generateBucketKey(projectId);

        console.log('📋 Listing bucket contents...');
        const listResponse = await fetch(`https://developer.api.autodesk.com/oss/v2/buckets/${bucketKey}/objects`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'User-Agent': 'MetromontCastLink/3.0'
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

// Load single report from OSS using signed download URL
async function loadSingleReportFromOSS(token, bucketKey, objectKey) {
    try {
        console.log('📄 Loading single report using signed download URL:', objectKey);

        // Get signed download URL
        const signedDownloadResponse = await fetch(
            `https://developer.api.autodesk.com/oss/v2/buckets/${bucketKey}/objects/${encodeURIComponent(objectKey)}/signeds3download`,
            {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'User-Agent': 'MetromontCastLink/3.0'
                }
            }
        );

        console.log('📥 Signed download URL response status:', signedDownloadResponse.status);

        if (!signedDownloadResponse.ok) {
            const errorText = await signedDownloadResponse.text();
            throw new Error(`Failed to get signed download URL: ${signedDownloadResponse.status} - ${errorText}`);
        }

        const downloadUrlData = await signedDownloadResponse.json();
        const downloadUrl = downloadUrlData.url;

        console.log('✅ Got signed download URL');

        // Download file from S3
        const fileResponse = await fetch(downloadUrl, {
            method: 'GET'
        });

        console.log('📥 File download response status:', fileResponse.status);

        if (!fileResponse.ok) {
            const errorText = await fileResponse.text();
            throw new Error(`Failed to download file: ${fileResponse.status} - ${errorText}`);
        }

        const reportContent = await fileResponse.json();
        console.log('✅ Downloaded report successfully');

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

// Delete report from OSS
async function deleteReportFromOSS(token, bucketKey, objectKey) {
    try {
        console.log('🗑️ Deleting report:', objectKey);

        const deleteResponse = await fetch(`https://developer.api.autodesk.com/oss/v2/buckets/${bucketKey}/objects/${encodeURIComponent(objectKey)}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'User-Agent': 'MetromontCastLink/3.0'
            }
        });

        console.log('🗑️ Delete response status:', deleteResponse.status);

        if (!deleteResponse.ok && deleteResponse.status !== 404) {
            const errorText = await deleteResponse.text();
            throw new Error(`Failed to delete report: ${deleteResponse.status} - ${errorText}`);
        }

        console.log('✅ Deleted report successfully');

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