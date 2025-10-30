// server/aps-auth.js
export async function getTwoLeggedToken(scopes = "account:read") {
  const clientId = process.env.ACC_CLIENT_ID;
  const clientSecret = process.env.ACC_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing ACC_CLIENT_ID or ACC_CLIENT_SECRET");
  }

  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: scopes
  });

  const r = await fetch("https://developer.api.autodesk.com/authentication/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });

  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`2LO token failed: ${r.status} ${txt}`);
  }

  const { access_token } = await r.json();
  return access_token;
}


