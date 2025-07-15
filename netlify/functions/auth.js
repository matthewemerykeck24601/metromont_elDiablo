exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const { code, redirect_uri } = JSON.parse(event.body);
    
    const response = await fetch('https://developer.api.autodesk.com/authentication/v2/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: redirect_uri,
            client_id: process.env.ACC_CLIENT_ID,
            client_secret: process.env.ACC_CLIENT_SECRET
        })
    });

    const data = await response.json();
    
    return {
        statusCode: response.ok ? 200 : 400,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
        body: JSON.stringify(data)
    };
};
