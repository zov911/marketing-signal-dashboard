// Google Search Console (Search Analytics API) + Bing Webmaster Tools API → one combined shape.
import { googleFetch } from '../google-auth.js';

const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const ymd = d => d.toISOString().slice(0, 10);
const daysAgo = n => new Date(Date.now() - n * 864e5);

async function gscQuery(site, sa, body) {
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`;
  return (await googleFetch(url, { sa, scope: GSC_SCOPE, body })).rows || [];
}

/** GSC data lags ~2-3 days, so periods end 3 days ago. */
async function google({ site, sa, days }) {
  const end = 3;
  const [daily, prev, queries] = await Promise.all([
    gscQuery(site, sa, { startDate: ymd(daysAgo(days + end - 1)), endDate: ymd(daysAgo(end)), dimensions: ['date'], rowLimit: 1000 }),
    gscQuery(site, sa, { startDate: ymd(daysAgo(days * 2 + end - 1)), endDate: ymd(daysAgo(days + end)), dimensions: ['date'], rowLimit: 1000 }),
    gscQuery(site, sa, { startDate: ymd(daysAgo(days + end - 1)), endDate: ymd(daysAgo(end)), dimensions: ['query'], rowLimit: 250 }),
  ]);
  const map = rows => rows.map(r => ({ date: r.keys[0], clicks: r.clicks, impressions: r.impressions }));
  return { daily: map(daily), prev: map(prev), queries: queries.map(r => ({ query: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: +r.position.toFixed(1) })) };
}

// Bing returns dates as "/Date(1700000000000)/" (or with a timezone offset suffix).
const bingDate = s => ymd(new Date(Number(String(s).match(/\d+/)?.[0] || 0)));

async function bingGet(method, site, apiKey) {
  const url = `https://ssl.bing.com/webmaster/api.svc/json/${method}?siteUrl=${encodeURIComponent(site)}&apikey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.Message || `Bing HTTP ${res.status}`);
  return json.d || [];
}

async function bing({ site, apiKey, days }) {
  const [traffic, queries] = await Promise.all([bingGet('GetRankAndTrafficStats', site, apiKey), bingGet('GetQueryStats', site, apiKey)]);
  const cutoff = ymd(daysAgo(days)), prevCutoff = ymd(daysAgo(days * 2));
  const daily = traffic.map(r => ({ date: bingDate(r.Date), clicks: r.Clicks, impressions: r.Impressions }));
  const agg = new Map();
  for (const q of queries) {
    if (bingDate(q.Date) < cutoff) continue;
    const a = agg.get(q.Query) || { query: q.Query, clicks: 0, impressions: 0, posSum: 0 };
    a.clicks += q.Clicks; a.impressions += q.Impressions; a.posSum += (q.AvgImpressionPosition || 0) * q.Impressions;
    agg.set(q.Query, a);
  }
  return {
    daily: daily.filter(d => d.date >= cutoff),
    prev: daily.filter(d => d.date >= prevCutoff && d.date < cutoff),
    queries: [...agg.values()].map(a => ({ query: a.query, clicks: a.clicks, impressions: a.impressions, ctr: a.impressions ? a.clicks / a.impressions : 0, position: a.impressions ? +(a.posSum / a.impressions).toFixed(1) : 0 })),
  };
}

const empty = { daily: [], prev: [], queries: [] };

export async function searchReport({ gsc, bingCfg, days, brandTerms = [] }) {
  const [g, b] = await Promise.all([gsc ? google({ ...gsc, days }) : empty, bingCfg ? bing({ ...bingCfg, days }) : empty]);
  const byDate = (gRows, bRows) => {
    const m = new Map();
    for (const r of gRows) m.set(r.date, { date: r.date, googleClicks: r.clicks, googleImpressions: r.impressions, bingClicks: 0, bingImpressions: 0 });
    for (const r of bRows) { const x = m.get(r.date) || { date: r.date, googleClicks: 0, googleImpressions: 0, bingClicks: 0, bingImpressions: 0 }; x.bingClicks = r.clicks; x.bingImpressions = r.impressions; m.set(r.date, x); }
    return [...m.values()].sort((a, c) => a.date.localeCompare(c.date));
  };
  const zero = { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  const q = new Map();
  for (const r of g.queries) q.set(r.query.toLowerCase(), { query: r.query.toLowerCase(), google: r, bing: zero });
  for (const r of b.queries) { const k = r.query.toLowerCase(); const x = q.get(k) || { query: k, google: zero, bing: zero }; x.bing = r; q.set(k, x); }
  const brand = brandTerms.map(t => t.toLowerCase()).filter(Boolean);
  return {
    daily: byDate(g.daily, b.daily),
    prev: byDate(g.prev, b.prev),
    queries: [...q.values()].map(x => ({ ...x, branded: brand.some(t => x.query.includes(t)) })).sort((a, c) => c.google.clicks - a.google.clicks).slice(0, 300),
  };
}
