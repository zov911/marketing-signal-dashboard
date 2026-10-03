// Signal dashboard backend: serves the dashboard and proxies GA4, Search Console, Bing and sGTM.
// Zero dependencies (Node 20+). Run: node server.js
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ga4Report } from './connectors/ga4.js';
import { searchReport } from './connectors/search.js';
import { sgtmHealth } from './connectors/sgtm.js';

const here = dirname(fileURLToPath(import.meta.url));
if (existsSync(join(here, '.env'))) process.loadEnvFile(join(here, '.env'));
const env = k => (process.env[k] || '').trim();

const PORT = Number(env('PORT') || 8790);
const ROOT = join(here, '..');
const ALLOWED = (env('ALLOWED_ORIGINS') || 'http://localhost:8790,https://zov911.github.io').split(',').map(s => s.trim());
// Lets the browser "Connect data" form pass credentials via headers. Keep false in production.
const CLIENT_CREDS = env('ALLOW_CLIENT_CREDENTIALS') === 'true';
const TTL = 10 * 60 * 1000;
const cache = new Map();

function creds(req) {
  const h = k => (CLIENT_CREDS ? String(req.headers[k] || '').trim() : '');
  const saHeader = h('x-google-sa');
  return {
    sa: env('GOOGLE_SERVICE_ACCOUNT_JSON') || (saHeader ? Buffer.from(saHeader, 'base64').toString('utf8') : ''),
    ga4Property: env('GA4_PROPERTY_ID') || h('x-ga4-property'),
    gscSite: env('GSC_SITE_URL') || h('x-gsc-site'),
    bingSite: env('BING_SITE_URL') || h('x-bing-site'),
    bingKey: env('BING_API_KEY') || h('x-bing-api-key'),
    sgtmUrl: env('SGTM_URL') || h('x-sgtm-url'),
    brandTerms: env('BRAND_TERMS').split(',').filter(Boolean),
  };
}

async function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.value;
  const value = await fn();
  cache.set(key, { value, exp: Date.now() + TTL });
  return value;
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

function send(res, status, data, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(data));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const origin = req.headers.origin;
  const cors = origin && ALLOWED.includes(origin) ? {
    'access-control-allow-origin': origin, vary: 'Origin',
    'access-control-allow-headers': 'content-type, x-ga4-property, x-gsc-site, x-bing-site, x-bing-api-key, x-sgtm-url, x-google-sa',
    'access-control-allow-private-network': 'true',
  } : {};

  try {
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }

    if (url.pathname.startsWith('/api/')) {
      const c = creds(req);
      const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '90', 10) || 90, 7), 480);

      if (url.pathname === '/api/health') {
        return send(res, 200, { ok: true, clientCredentials: CLIENT_CREDS, connectors: {
          ga4: !!(c.sa && c.ga4Property), gsc: !!(c.sa && c.gscSite), bing: !!(c.bingSite && c.bingKey), sgtm: !!c.sgtmUrl,
        } }, cors);
      }
      if (url.pathname === '/api/ga4') {
        if (!c.sa || !c.ga4Property) return send(res, 400, { error: 'GA4 not configured (service account + property ID)' }, cors);
        return send(res, 200, await cached(`ga4:${c.ga4Property}:${days}`, () => ga4Report({ property: c.ga4Property, sa: c.sa, days })), cors);
      }
      if (url.pathname === '/api/search') {
        const gsc = c.sa && c.gscSite ? { site: c.gscSite, sa: c.sa } : null;
        const bingCfg = c.bingSite && c.bingKey ? { site: c.bingSite, apiKey: c.bingKey } : null;
        if (!gsc && !bingCfg) return send(res, 400, { error: 'Neither Search Console nor Bing is configured' }, cors);
        return send(res, 200, await cached(`search:${c.gscSite}:${c.bingSite}:${days}`, () => searchReport({ gsc, bingCfg, days, brandTerms: c.brandTerms })), cors);
      }
      if (url.pathname === '/api/sgtm') {
        if (!c.sgtmUrl) return send(res, 400, { error: 'SGTM_URL not configured' }, cors);
        return send(res, 200, await sgtmHealth(c.sgtmUrl), cors);
      }
      return send(res, 404, { error: 'Unknown endpoint' }, cors);
    }

    // Static dashboard files
    const rel = normalize(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^(\.\.[/\\])+/, '');
    if (!/^[/\\](index\.html|assets[/\\][\w.-]+)$/.test(rel)) return send(res, 404, { error: 'Not found' });
    const body = await readFile(join(ROOT, rel));
    res.writeHead(200, { 'content-type': MIME[extname(rel)] || 'application/octet-stream' });
    res.end(body);
  } catch (err) {
    if (res.headersSent) return res.end();
    send(res, err.code === 'ENOENT' ? 404 : 502, { error: err.message }, cors);
  }
});

server.listen(PORT, () => {
  console.log(`Signal dashboard on http://localhost:${PORT}`);
  if (CLIENT_CREDS) console.warn('  ⚠ ALLOW_CLIENT_CREDENTIALS=true: browser-supplied keys accepted. Use only locally.');
});
