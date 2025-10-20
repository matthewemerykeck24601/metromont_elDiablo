export default async (request, context) => {
  try {
    const response = await context.next();
    
    // CSP is defined in Netlify `_headers`. Do NOT override here.
    
    // Remove X-Frame-Options to allow framing
    response.headers.delete("X-Frame-Options");
    
    // Set CORS headers for API calls
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, x-netlify-identity");
    
    return response;
  } catch (err) {
    // Return JSON error instead of letting edge function crash
    console.error('Edge function error:', err);
    return new Response(
      JSON.stringify({ 
        error: 'Edge function error',
        details: String(err.message || err)
      }),
      { 
        status: 500, 
        headers: { 
          'content-type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        } 
      }
    );
  }
};

export const config = { path: "/*" };
