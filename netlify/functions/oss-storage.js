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
        const projectHash = Buffer.from(projectId).toString('base64')
            .replace(/[^a-zA-Z0-9]/g, '').toLowerCase().substr(0, 8);
        const timestamp = Date.now().toString().substr(-6);
        const bucketKey = `metromont-castlink-${projectHash}-${timestamp}`.toLowerCase();

        console.log('🪣 Generated bucket key:', bucketKey);
        return bucketKey;
    } catch (error) {
        console.error('❌ Error generating bucket key:', error);
        throw new Error(`Bucket key generation failed: ${error.message}`);
    }
}

// Sanitize object key to be OSS-compatible
function sanitizeObjectKey(key) {
    // Replace spaces and special characters with safe alternatives
    return key
        .replace(/\s+/g, '_')           // Replace spaces with underscores
        .replace(/[#&+%]/g, '_')        // Replace problematic characters
        .replace(/[^\w\-_./]/g, '')     // Remove any other special characters
        .replace(/_{2,}/g, '_')         // Replace multiple underscores with single
        .toLowerCase();                 // Convert to lowercase
}

// Ensure bucket exists with enhanced error handling
async function ensureBucket(token, bucketKey) {
    try {
        console.log('🔍 Checking if bucket exists:', bucketKey);

        // Check if bucket exists
        const checkResponse = await fetch(`https://developer.api.autodesk.com/oss/v2/buckets/${bucketKey}/details`, {
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

            console.log('✅ Created new OSS bucket:', bucketKey);
            return { exists: true, bucketKey, created: true };
        }

        throw new Error(`Failed to check bucket: ${checkResponse.status}`);

    } catch (error) {
        console.error('❌ Error in ensureBucket:', error);
        throw new Error(`Bucket management failed: ${error.message}`);
    }
}

// Generate signed URL for upload (NEW - addresses legacy endpoint issue)
async function generateSignedUploadUrl(token, bucketKey, objectKey) {
    try {
        console.log('🔗 Generating signed upload URL for:', objectKey);

        const signedUrlResponse = await fetch(`https://developer.api.autodesk.com/oss/v2/buckets/${bucketKey}/objects/${encodeURIComponent(objectKey)}/signeds3upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'User-Agent': 'MetromontCastLink/2.0'
            },
            body: JSON.stringify({
                minutesExpiration: 60
            })
        });

        console.log('🔗 Signed URL response status:', signedUrlResponse.status);

        if (!signedUrlResponse.ok) {
            const errorText = await signedUrlResponse.text();
            throw new Error(`Failed to generate signed URL: ${signedUrlResponse.status} - ${errorText}`);
        }

        const signedUrlData = await signedUrlResponse.json();
        console.log('✅ Generated signed upload URL successfully');

        return signedUrlData;

    } catch (error) {
        console.error('❌ Error generating signed URL:', error);
        throw error;
    }
}

// Upload using signed URL (NEW - modern approach)
async function uploadWithSignedUrl(signedUrlData, reportJSON) {
    try {
        console.log('⬆️ Uploading using signed URL...');

        const uploadResponse = await fetch(signedUrlData.uploadKey, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/octet-stream',
                'Content-Length': reportJSON.length.toString()
            },
            body: reportJSON
        });

        console.log('📤 Signed URL upload response status:', uploadResponse.status);

        if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            throw new Error(`Signed URL upload failed: ${uploadResponse.status} - ${errorText}`);
        }

        console.log('✅ Upload via signed URL successful');
        return uploadResponse;

    } catch (error) {
        console.error('❌ Error in signed URL upload:', error);
        throw error;
    }
}

// Finalize upload (NEW - required for signed URL uploads)
async function finalizeUpload(token, bucketKey, objectKey, uploadKey) {
    try {
        console.log('🏁 Finalizing upload...');

        const finalizeResponse = await fetch(`https://developer.api.autodesk.com/oss/v2/buckets/${bucketKey}/objects/${encodeURIComponent(objectKey)}/signeds3upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'User-Agent': 'MetromontCastLink/2.0'
            },
            body: JSON.stringify({
                uploadKey: uploadKey
            })
        });

        console.log('🏁 Finalize response status:', finalizeResponse.status);

        if (!finalizeResponse.ok) {
            const errorText = await finalizeResponse.text();
            throw new Error(`Failed to finalize upload: ${finalizeResponse.status} - ${errorText}`);
        }

        const finalizeData = await finalizeResponse.json();
        console.log('✅ Upload finalized successfully');

        return finalizeData;

    } catch (error) {
        console.error('❌ Error finalizing upload:', error);
        throw error;
    }
}

// Save report to OSS with modern signed URL approach (UPDATED)
async function saveReportToOSS(token, reportData) {
    try {
        console.log('💾 Starting report save process...');

        const { projectId, reportContent } = reportData;

        if (!projectId) {
            throw new Error('Missing projectId in report data');
        }

        if (!reportContent) {
            throw new Error('Missing reportContent in report data');
        }

        // Generate bucket key
        const bucketKey = generateBucketKey(projectId);

        // Ensure bucket exists
        await ensureBucket(token, bucketKey);

        // Generate object key with structured path and sanitization
        const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const bedName = reportContent.reportData?.bedName || 'unknown-bed';
        const reportId = reportContent.reportData?.reportId || 'unknown-report';

        // Create sanitized object key
        const rawObjectKey = `reports/${date}/${bedName}/${reportId}.json`;
        const sanitizedObjectKey = sanitizeObjectKey(rawObjectKey);

        console.log('📁 Raw object key:', rawObjectKey);
        console.log('📁 Sanitized object key:', sanitizedObjectKey);

        // Add OSS metadata to report content
        const ossReportContent = {
            ...reportContent,
            ossMetadata: {
                bucketKey: bucketKey,
                objectKey: sanitizedObjectKey,
                originalKey: rawObjectKey,
                savedAt: new Date().toISOString(),
                version: '2.1',
                storageType: 'oss-persistent-signed',
                bucketPermissions: 'create,read,update,delete'
            }
        };

        const reportJSON = JSON.stringify(ossReportContent, null, 2);
        console.log('📊 Report size:', reportJSON.length, 'bytes');

        // Try modern signed URL approach first, then fallback to direct upload
        try {
            console.log('🔄 Method 1: Signed URL upload (recommended)');

            // Generate signed upload URL
            const signedUrlData = await generateSignedUploadUrl(token, bucketKey, sanitizedObjectKey);

            // Upload using signed URL
            await uploadWithSignedUrl(signedUrlData, reportJSON);

            // Finalize the upload
            const finalizeResult = await finalizeUpload(token, bucketKey, sanitizedObjectKey, signedUrlData.uploadKey);

            console.log('✅ Saved report to OSS successfully (Method 1 - Signed URL)');

            return {
                statusCode: 200,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({
                    success: true,
                    bucketKey: bucketKey,
                    objectKey: sanitizedObjectKey,
                    originalKey: rawObjectKey,
                    size: reportJSON.length,
                    reportId: reportId,
                    uploadResult: finalizeResult,
                    method: 'oss-storage-signed-url-v2.1',
                    bucketPermissions: 'create,read,update,delete'
                })
            };

        } catch (signedUrlError) {
            console.log('❌ Signed URL upload failed, trying direct upload fallback...');
            console.log('Signed URL error:', signedUrlError.message);

            // Fallback: Try direct PUT upload with simple key
            const simpleKey = `${reportId}_${date}.json`;
            console.log('🔄 Method 2: Direct PUT upload fallback:', simpleKey);

            try {
                const directUploadResponse = await fetch(`https://developer.api.autodesk.com/oss/v2/buckets/${bucketKey}/objects/${simpleKey}`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/octet-stream',
                        'User-Agent': 'MetromontCastLink/2.0'
                    },
                    body: reportJSON
                });

                console.log('📤 Direct upload response status:', directUploadResponse.status);

                if (directUploadResponse.ok) {
                    const uploadResult = await directUploadResponse.json();
                    console.log('✅ Saved report to OSS successfully (Method 2 - Direct Upload Fallback)');

                    return {
                        statusCode: 200,
                        headers: { 'Access-Control-Allow-Origin': '*' },
                        body: JSON.stringify({
                            success: true,
                            bucketKey: bucketKey,
                            objectKey: simpleKey,
                            originalKey: rawObjectKey,
                            size: reportJSON.length,
                            reportId: reportId,
                            uploadResult: uploadResult,
                            method: 'oss-storage-direct-fallback',
                            bucketPermissions: 'create,read,update,delete',
                            note: 'Used direct upload fallback due to signed URL issue'
                        })
                    };
                } else {
                    const errorText = await directUploadResponse.text();
                    throw new Error(`Direct upload failed: ${directUploadResponse.status} - ${errorText}`);
                }

            } catch (directError) {
                console.log('❌ Direct upload also failed:', directError.message);
                throw new Error(`All upload methods failed. Signed URL error: ${signedUrlError.message}. Direct upload error: ${directError.message}`);
            }
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