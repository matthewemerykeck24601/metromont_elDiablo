export default async (request, context) => {
  const response = await context.next();
  
  // Set comprehensive CSP for ACC embedding
  response.headers.set("Content-Security-Policy", 
    "frame-ancestors 'self' *.autodesk.com *.autodesk.eu *.aus.autodesk.com *.autodeskbim360.com *.acc.autodesk.com; " +
    "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: https://developer.api.autodesk.com https://*.netlify.app; " +
    "connect-src 'self' https://developer.api.autodesk.com https://*.netlify.app"
  );
  
  // Remove X-Frame-Options to allow framing
  response.headers.delete("X-Frame-Options");
  
  // Set CORS headers for API calls
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  
  return response;
};

export const config = { path: "/*" };
