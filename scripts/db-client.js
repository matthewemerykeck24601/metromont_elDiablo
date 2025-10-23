// scripts/db-client.js
// Database client for user management - replaces localStorage ACL

export async function dbListUsers(identityHeader) {
  const r = await fetch('/api/db/rows/users', {
    headers: { 'x-netlify-identity': identityHeader }
  });
  if (!r.ok) throw new Error('Failed to list users');
  return r.json(); // array of rows
}

export async function dbGetUserById(rowId, identityHeader) {
  const r = await fetch(`/api/db/rows/users/${rowId}`, {
    headers: { 'x-netlify-identity': identityHeader }
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('Failed to get user');
  return r.json();
}

export async function dbUpsertUser(row, identityHeader) {
  const id = normalizeId(row.email); // same normalize rule as server
  const payload = { data: { ...row, id } };
  // Try update; if 404, create
  let r = await fetch(`/api/db/rows/users/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-netlify-identity': identityHeader },
    body: JSON.stringify(payload)
  });
  if (r.status === 404) {
    r = await fetch('/api/db/rows/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-netlify-identity': identityHeader },
      body: JSON.stringify(payload)
    });
  }
  if (!r.ok) throw new Error('Failed to upsert user');
  return r.json();
}

export async function dbDeleteUserByEmail(email, identityHeader) {
  const id = normalizeId(email);
  const r = await fetch(`/api/db/rows/users/${id}`, {
    method: 'DELETE',
    headers: { 'x-netlify-identity': identityHeader }
  });
  if (r.status !== 200 && r.status !== 204 && r.status !== 404) {
    throw new Error('Failed to delete user');
  }
  return true;
}

function normalizeId(s) {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// Helper to get identity header from current user session
export function getIdentityHeader() {
  // Get user profile data from localStorage
  const profileStore = localStorage.getItem('user_profile_data');
  if (!profileStore) return null;
  
  const profile = JSON.parse(profileStore);
  const userInfo = profile.userInfo;
  const selectedHub = profile.selectedHub;
  
  if (!userInfo?.email) return null;
  
  // Create identity header similar to what Netlify Identity would provide
  return JSON.stringify({
    email: userInfo.email,
    user_metadata: {
      hubId: selectedHub?.id || null,
      full_name: userInfo.name || userInfo.email
    }
  });
}
