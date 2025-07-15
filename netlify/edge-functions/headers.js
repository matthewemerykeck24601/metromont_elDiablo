export default async (request, context) => {
  const response = await context.next();
  response.headers.set("Content-Security-Policy", "frame-ancestors 'self' *.autodesk.com *.autodesk.eu *.aus.autodesk.com");
  response.headers.delete("X-Frame-Options");
  return response;
};

export const config = { path: "/*" };
