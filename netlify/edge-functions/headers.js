export default async (request, context) => {
  const response = await context.next();
  
  // CSP is defined in Netlify `_headers`. Do NOT override here.
  
  // Remove X-Frame-Options to allow framing
  response.headers.delete("X-Frame-Options");
  
  // Set CORS headers for API calls
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  
  return response;
};

export const config = { path: "/*" };
