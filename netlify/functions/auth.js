exports.handler = async (event, context) => {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
            },
            body: ''
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: {
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ error: 'Method Not Allowed' })
        };
    }

    try {
        const { code, redirect_uri } = JSON.parse(event.body);

        // Check for required environment variables
        if (!process.env.ACC_CLIENT_ID || !process.env.ACC_CLIENT_SECRET) {
            console.error('Missing environment variables');
            return {
                statusCode: 500,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                },
                body: JSON.stringify({
                    error: 'Server configuration error',
                    details: 'Missing CLIENT_ID or CLIENT_SECRET'
                })
            };
        }

        console.log('Exchanging code for token...');

        // Enhanced scopes that match the frontend including bucket permissions
        const enhancedScopes = [
            'data:read',
            'data:write',
            'data:create',
            'data:search',
            'account:read',
            'user:read',
            'viewables:read',
            'bucket:create',
            'bucket:read',
            'bucket:update',
            'bucket:delete'
        ].join(' ');

        const tokenRequestBody = new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: redirect_uri,
            client_id: process.env.ACC_CLIENT_ID,
            client_secret: process.env.ACC_CLIENT_SECRET
        });

        const response = await fetch('https://developer.api.autodesk.com/authentication/v2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            body: tokenRequestBody
        });

        const responseText = await response.text();
        console.log('Autodesk response status:', response.status);

        let data;
        try {
            data = JSON.parse(responseText);
        } catch (e) {
            console.error('Failed to parse response as JSON:', responseText);
            return {
                statusCode: 500,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                },
                body: JSON.stringify({
                    error: 'Invalid response from Autodesk',
                    details: responseText
                })
            };
        }

        // Log successful token exchange with scope information
        if (response.ok && data.access_token) {
            console.log('✓ Token exchange successful');

            // Verify the granted scopes include the enhanced permissions including bucket scopes
            const grantedScopes = data.scope || '';
            const hasDataWrite = grantedScopes.includes('data:write');
            const hasDataCreate = grantedScopes.includes('data:create');
            const hasBucketCreate = grantedScopes.includes('bucket:create');
            const hasBucketRead = grantedScopes.includes('bucket:read');
            const hasBucketUpdate = grantedScopes.includes('bucket:update');
            const hasBucketDelete = grantedScopes.includes('bucket:delete');

            // Add scope information to the response
            data.scope_analysis = {
                granted_scopes: grantedScopes,
                has_data_write: hasDataWrite,
                has_data_create: hasDataCreate,
                has_bucket_create: hasBucketCreate,
                has_bucket_read: hasBucketRead,
                has_bucket_update: hasBucketUpdate,
                has_bucket_delete: hasBucketDelete,
                enhanced_permissions: hasDataWrite && hasDataCreate,
                bucket_permissions: hasBucketCreate && hasBucketRead && hasBucketUpdate && hasBucketDelete,
                requested_scopes: enhancedScopes
            };

            console.log('=== SCOPE ANALYSIS ===');
            console.log('Requested scopes:', enhancedScopes);
            console.log('Granted scopes:', grantedScopes);
            console.log('Data permissions:', { hasDataWrite, hasDataCreate });
            console.log('Bucket permissions:', { hasBucketCreate, hasBucketRead, hasBucketUpdate, hasBucketDelete });
            console.log('Full bucket permissions granted:', data.scope_analysis.bucket_permissions);
            console.log('======================');
        }

        return {
            statusCode: response.ok ? 200 : response.status,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        };

    } catch (error) {
        console.error('Auth function error:', error);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({
                error: 'Internal server error',
                details: error.message,
                timestamp: new Date().toISOString()
            })
        };
    }
};