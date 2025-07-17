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

        console.log('Exchanging code for token with enhanced scopes...');
        console.log('Client ID:', process.env.ACC_CLIENT_ID);
        console.log('Redirect URI:', redirect_uri);

        // Enhanced scopes that match the frontend
        const enhancedScopes = [
            'data:read',
            'data:write',
            'data:create',
            'data:search',
            'account:read',
            'user:read',
            'viewables:read'
        ].join(' ');

        console.log('Enhanced scopes requested:', enhancedScopes);

        const tokenRequestBody = new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: redirect_uri,
            client_id: process.env.ACC_CLIENT_ID,
            client_secret: process.env.ACC_CLIENT_SECRET
        });

        console.log('Token request body:', tokenRequestBody.toString());

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
        console.log('Autodesk response:', responseText);

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
            console.log('Token type:', data.token_type);
            console.log('Expires in:', data.expires_in, 'seconds');
            console.log('Scope granted:', data.scope || 'not specified');

            // Verify the granted scopes include the enhanced permissions
            const grantedScopes = data.scope || '';
            const hasDataWrite = grantedScopes.includes('data:write');
            const hasDataCreate = grantedScopes.includes('data:create');

            console.log('Enhanced permissions granted:');
            console.log('- data:write:', hasDataWrite);
            console.log('- data:create:', hasDataCreate);

            // Add scope information to the response
            data.scope_analysis = {
                granted_scopes: grantedScopes,
                has_data_write: hasDataWrite,
                has_data_create: hasDataCreate,
                enhanced_permissions: hasDataWrite && hasDataCreate
            };
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