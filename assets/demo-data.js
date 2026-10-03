// Realistic, deterministic sample data for the demo (fictional B2B SaaS "Northwind").
// Every generator returns the same shape the live backend returns, so the UI is source-agnostic.

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = d => d.toISOString().slice(0, 10);

export function dateRange(days, end = new Date()) {
  const out = [];
  const e = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  for (let i = days - 1; i >= 0; i--) out.push(iso(new Date(e.getTime() - i * 864e5)));
  return out;
}

export const CHANNELS = [
  { id: 'Organic Search', color: '#22c55e', share: 0.31, cr: 0.021, aov: 1900 },
  { id: 'Paid Search',    color: '#3b82f6', share: 0.19, cr: 0.026, aov: 1700 },
  { id: 'Direct',         color: '#94a3b8', share: 0.16, cr: 0.024, aov: 2100 },
  { id: 'Paid Social',    color: '#f472b6', share: 0.12, cr: 0.009, aov: 1400 },
  { id: 'Email',          color: '#f59e0b', share: 0.08, cr: 0.034, aov: 2300 },
  { id: 'Referral',       color: '#a78bfa', share: 0.06, cr: 0.019, aov: 2000 },
  { id: 'AI Assistants',  color: '#06b6d4', share: 0.045, cr: 0.031, aov: 2400 }, // chatgpt.com, perplexity.ai, copilot, gemini
  { id: 'Organic Social', color: '#fb7185', share: 0.035, cr: 0.007, aov: 1300 },
];

/** GA4-like daily series + channel table. */
export function ga4Daily(days = 90, seed = 7) {
  const rnd = mulberry32(seed);
  const dates = dateRange(days);
  const daily = dates.map((date, i) => {
    const dow = new Date(date).getUTCDay();
    const weekly = dow === 0 || dow === 6 ? 0.62 : 1 + (dow === 2 || dow === 3 ? 0.06 : 0);
    const trend = 1 + (i / days) * 0.22;
    const noise = 0.9 + rnd() * 0.2;
    const sessions = Math.round(2400 * weekly * trend * noise);
    const conversions = Math.round(sessions * (0.019 + rnd() * 0.004));
    const revenue = Math.round(conversions * (1700 + rnd() * 600));
    return { date, sessions, users: Math.round(sessions * 0.78), engagedSessions: Math.round(sessions * (0.56 + rnd() * 0.06)), conversions, revenue };
  });
  const totalSessions = daily.reduce((s, d) => s + d.sessions, 0);
  const channels = CHANNELS.map(c => {
    // AI Assistants grows fastest through the period
    const growth = c.id === 'AI Assistants' ? 1.35 : 1;
    const sessions = Math.round(totalSessions * c.share * growth * (0.92 + rnd() * 0.16));
    const conversions = Math.round(sessions * c.cr * (0.9 + rnd() * 0.2));
    return { channel: c.id, color: c.color, sessions, conversions, revenue: conversions * c.aov, prevSessions: Math.round(sessions / (c.id === 'AI Assistants' ? 1.9 : 1 + (rnd() * 0.3 - 0.08))) };
  });
  return { daily, channels };
}

const QUERIES = [
  ['northwind', 'brand', 1.3, 98000], ['northwind pricing', 'brand', 1.6, 12000], ['northwind login', 'brand', 1.1, 9000],
  ['northwind vs hubspot attribution', 'brand', 2.4, 3100], ['marketing attribution software', 'non', 7.8, 41000],
  ['b2b attribution tool', 'non', 5.2, 18000], ['multi touch attribution', 'non', 9.4, 52000], ['lead scoring software', 'non', 11.2, 36000],
  ['predictive lead scoring', 'non', 6.4, 14000], ['revenue intelligence platform', 'non', 13.8, 22000], ['hubspot attribution reporting', 'non', 4.1, 15000],
  ['salesforce attribution', 'non', 8.7, 19000], ['server side tracking', 'non', 12.5, 27000], ['ga4 server side tagging', 'non', 6.9, 16000],
  ['consent mode v2 tracking loss', 'non', 5.6, 8400], ['how to measure pipeline from linkedin ads', 'non', 3.8, 4200],
  ['marketing mix modeling vs attribution', 'non', 9.9, 7600], ['first touch vs last touch attribution', 'non', 4.6, 11000],
  ['markov chain attribution', 'non', 3.2, 5100], ['b2b marketing dashboard template', 'non', 14.6, 9800],
  ['what is a good mql to sql conversion rate', 'non', 2.9, 6200], ['ai lead qualification', 'non', 10.4, 12000],
  ['enhanced conversions setup', 'non', 15.3, 13000], ['bing webmaster tools api', 'non', 18.2, 2600], ['utm tracking best practices', 'non', 7.3, 9300],
];

/** GSC + Bing query rows for the selected period. */
export function searchQueries(days = 90, seed = 11) {
  const rnd = mulberry32(seed);
  const scale = days / 90;
  const ctrFor = pos => Math.max(0.004, 0.32 * Math.exp(-0.33 * (pos - 1)));
  const rows = QUERIES.map(([query, type, pos, impr]) => {
    const gImpr = Math.round(impr * scale * (0.85 + rnd() * 0.3));
    const gPos = +(pos * (0.9 + rnd() * 0.2)).toFixed(1);
    const gCtr = ctrFor(gPos) * (type === 'brand' ? 1.6 : 1) * (0.8 + rnd() * 0.4);
    const bImpr = Math.round(gImpr * (0.08 + rnd() * 0.07));
    const bPos = +Math.max(1, gPos * (0.75 + rnd() * 0.5)).toFixed(1);
    const bCtr = ctrFor(bPos) * (type === 'brand' ? 1.5 : 1) * (0.8 + rnd() * 0.4);
    return {
      query, branded: type === 'brand',
      google: { clicks: Math.round(gImpr * Math.min(gCtr, 0.7)), impressions: gImpr, position: gPos },
      bing: { clicks: Math.round(bImpr * Math.min(bCtr, 0.7)), impressions: bImpr, position: bPos },
    };
  });
  rows.forEach(r => ['google', 'bing'].forEach(e => { r[e].ctr = r[e].impressions ? r[e].clicks / r[e].impressions : 0; }));
  return rows;
}

export function searchDaily(days = 90, seed = 13) {
  const rnd = mulberry32(seed);
  return dateRange(days).map((date, i) => {
    const dow = new Date(date).getUTCDay();
    const weekly = dow === 0 || dow === 6 ? 0.55 : 1;
    const trend = 1 + (i / days) * 0.18;
    const gImpr = Math.round(5200 * weekly * trend * (0.9 + rnd() * 0.2));
    const gClicks = Math.round(gImpr * (0.052 + rnd() * 0.01));
    return { date, googleImpressions: gImpr, googleClicks: gClicks, bingImpressions: Math.round(gImpr * (0.11 + rnd() * 0.03)), bingClicks: Math.round(gClicks * (0.12 + rnd() * 0.04)) };
  });
}

/** Conversion paths (incl. non-converting) for attribution models. */
export function conversionPaths(seed = 21, n = 6000) {
  const rnd = mulberry32(seed);
  const ids = CHANNELS.map(c => c.id);
  const weights = CHANNELS.map(c => c.share);
  const pick = () => { let r = rnd() * weights.reduce((a, b) => a + b, 0); for (let i = 0; i < ids.length; i++) { r -= weights[i]; if (r <= 0) return ids[i]; } return ids[0]; };
  const lift = { 'Email': 0.06, 'Paid Search': 0.05, 'AI Assistants': 0.06, 'Referral': 0.03, 'Organic Search': 0.035, 'Direct': 0.03, 'Paid Social': 0.008, 'Organic Social': 0.005 };
  const map = new Map();
  for (let i = 0; i < n; i++) {
    const len = 1 + Math.floor(Math.pow(rnd(), 1.8) * 6);
    const path = [];
    for (let j = 0; j < len; j++) {
      // early touches skew to awareness channels, late touches to intent channels
      let ch = pick();
      if (j === 0 && rnd() < 0.35) ch = rnd() < 0.5 ? 'Paid Social' : 'Organic Social';
      if (j === len - 1 && rnd() < 0.3) ch = rnd() < 0.5 ? 'Paid Search' : 'Direct';
      if (path[path.length - 1] !== ch) path.push(ch);
    }
    const p = Math.min(0.6, path.reduce((s, c) => s + lift[c], 0.01) * (0.6 + 0.25 * path.length));
    const converted = rnd() < p;
    const key = path.join(' > ') + (converted ? '|1' : '|0');
    const cur = map.get(key) || { path, conversions: 0, nulls: 0, value: 0 };
    if (converted) { cur.conversions++; cur.value += 1500 + Math.round(rnd() * 1500); } else cur.nulls++;
    map.set(key, cur);
  }
  // merge converting / non-converting variants of the same path
  const merged = new Map();
  for (const v of map.values()) {
    const k = v.path.join(' > ');
    const m = merged.get(k) || { path: v.path, conversions: 0, nulls: 0, value: 0 };
    m.conversions += v.conversions; m.nulls += v.nulls; m.value += v.value;
    merged.set(k, m);
  }
  return [...merged.values()];
}

/** Server-side tagging (sGTM) metrics. */
export function sgtmMetrics(days = 30, seed = 31) {
  const rnd = mulberry32(seed);
  const daily = dateRange(days).map(date => {
    const client = Math.round(18000 * (0.85 + rnd() * 0.3));
    const server = Math.round(client * (1.16 + rnd() * 0.1));  // ad-blocker / ITP recovery
    return { date, clientEvents: client, serverEvents: server, p95LatencyMs: Math.round(120 + rnd() * 90), errorRate: +(0.002 + rnd() * 0.006).toFixed(4) };
  });
  const destinations = [
    { name: 'GA4', sent: 0.99, success: 0.998, note: 'Measurement Protocol via sGTM GA4 client' },
    { name: 'Google Ads (Enhanced Conversions)', sent: 0.31, success: 0.991, matchRate: 0.74 },
    { name: 'Meta Conversions API', sent: 0.31, success: 0.987, emq: 7.9 },
    { name: 'LinkedIn Conversions API', sent: 0.12, success: 0.982, matchRate: 0.58 },
    { name: 'TikTok Events API', sent: 0.08, success: 0.976, emq: 6.4 },
    { name: 'Microsoft Ads (UET CAPI)', sent: 0.09, success: 0.984, matchRate: 0.61 },
  ];
  const consent = { granted: 0.62, partial: 0.11, denied: 0.27 };
  const checks = [
    { status: 'pass', label: 'Custom tagging domain (first-party, same-site)', detail: 'metrics.example.com → sGTM on Cloud Run' },
    { status: 'pass', label: 'Consent Mode v2 signals forwarded', detail: 'ad_user_data + ad_personalization present on 100% of events' },
    { status: 'pass', label: 'Event deduplication (event_id) for CAPI', detail: 'Browser + server events share event_id' },
    { status: 'warn', label: 'PII hashing before forwarding', detail: 'Phone not normalized to E.164 before SHA-256 on 4% of leads' },
    { status: 'warn', label: 'Cookie lifetime (FPID)', detail: 'Set to 13 months. Confirm with your privacy policy' },
    { status: 'fail', label: 'Minimum instance count', detail: 'Cloud Run min-instances = 0, so cold starts add latency at night' },
  ];
  return { daily, destinations, consent, checks, health: { ok: true, latencyMs: 87, version: 'sGTM 2.x', region: 'us-central1' } };
}
