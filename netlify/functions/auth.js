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
        console.log('Client ID:', process.env.ACC_CLIENT_ID);
        console.log('Redirect URI:', redirect_uri);

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
                details: error.message 
            })
        };
    }
};
