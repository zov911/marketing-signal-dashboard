// Google service-account OAuth (JWT bearer flow) with node:crypto. No dependencies.
import { createSign } from 'node:crypto';

const cache = new Map(); // key → { token, exp }
const b64url = s => Buffer.from(s).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

export async function googleAccessToken(serviceAccount, scope) {
  const sa = typeof serviceAccount === 'string' ? JSON.parse(serviceAccount) : serviceAccount;
  if (!sa?.client_email || !sa?.private_key) throw new Error('Invalid service account JSON (client_email / private_key missing)');
  const key = `${sa.client_email}|${scope}`;
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(sa.private_key, 'base64')
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${signature}` }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Google OAuth failed: ${json.error_description || json.error || res.status}`);
  cache.set(key, { token: json.access_token, exp: Date.now() + json.expires_in * 1000 });
  return json.access_token;
}

export async function googleFetch(url, { sa, scope, body }) {
  const token = await googleAccessToken(sa, scope);
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error?.message || `HTTP ${res.status}`);
  return json;
}
