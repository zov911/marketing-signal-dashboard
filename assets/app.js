import { ga4Daily, searchDaily, searchQueries, conversionPaths, sgtmMetrics, CHANNELS } from './demo-data.js';
import { MODELS, runAll, topPaths } from './attribution.js';

/* ═══════════════ settings & state ═══════════════ */
const LS = 'signal-dashboard:v1';
const DEFAULTS = { mode: 'demo', backendUrl: 'http://localhost:8790', ga4PropertyId: '', gscSiteUrl: '', bingSiteUrl: '', bingApiKey: '', googleSaJson: '', sgtmUrl: '' };
const loadSettings = () => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(LS) || '{}') }; } catch { return { ...DEFAULTS }; } };
const saveSettings = s => { try { localStorage.setItem(LS, JSON.stringify(s)); } catch {} };

const state = { view: 'overview', days: 90, attrBy: 'conversions', qFilter: 'all', qSearch: '', qSort: ['google.clicks', -1], data: null, settings: loadSettings() };
const charts = [];
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n0 = v => Math.round(v).toLocaleString('en-US');
const money = v => '$' + (v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e4 ? (v / 1e3).toFixed(1) + 'k' : n0(v));
const pct = (v, d = 1) => (v * 100).toFixed(d) + '%';
const sum = (a, k) => a.reduce((s, x) => s + (typeof k === 'function' ? k(x) : x[k]), 0);
const deltaHtml = (cur, prev, invert = false) => {
  if (!prev) return '<span class="delta flat">n/a</span>';
  const d = (cur - prev) / prev, good = invert ? d < 0 : d > 0;
  return `<span class="delta ${Math.abs(d) < 0.005 ? 'flat' : good ? 'up' : 'down'}">${d >= 0 ? '▲' : '▼'} ${pct(Math.abs(d))}</span>`;
};

/* ═══════════════ data layer: demo or live backend ═══════════════ */
function credHeaders(s) {
  const h = {};
  if (s.ga4PropertyId) h['x-ga4-property'] = s.ga4PropertyId;
  if (s.gscSiteUrl) h['x-gsc-site'] = s.gscSiteUrl;
  if (s.bingSiteUrl) h['x-bing-site'] = s.bingSiteUrl;
  if (s.bingApiKey) h['x-bing-api-key'] = s.bingApiKey;
  if (s.sgtmUrl) h['x-sgtm-url'] = s.sgtmUrl;
  if (s.googleSaJson) h['x-google-sa'] = btoa(unescape(encodeURIComponent(s.googleSaJson)));
  return h;
}

async function live(path, days) {
  const s = state.settings;
  const res = await fetch(`${s.backendUrl.replace(/\/$/, '')}${path}?days=${days}`, { headers: credHeaders(s), signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${(await res.json().catch(() => ({}))).error || ''}`);
  return res.json();
}

async function loadData() {
  const d = state.days;
  const g = ga4Daily(d * 2), sd = searchDaily(d * 2);
  const data = {
    ga4: { daily: g.daily.slice(d), prev: g.daily.slice(0, d), channels: g.channels.map(c => ({ ...c, sessions: Math.round(c.sessions / 2), conversions: Math.round(c.conversions / 2), revenue: Math.round(c.revenue / 2), prevSessions: Math.round(c.prevSessions / 2) })) },
    search: { daily: sd.slice(d), prev: sd.slice(0, d), queries: searchQueries(d) },
    paths: conversionPaths(),
    sgtm: sgtmMetrics(Math.min(d, 30)),
    source: { ga4: 'demo', search: 'demo', sgtm: 'demo', attribution: 'demo' },
    errors: [],
  };
  if (state.settings.mode === 'live') {
    const tasks = [
      ['ga4', '/api/ga4', v => { data.ga4 = v; }],
      ['search', '/api/search', v => { data.search = v; }],
      ['sgtm', '/api/sgtm', v => { data.sgtm = { ...data.sgtm, ...v }; }],
    ];
    await Promise.all(tasks.map(async ([key, path, set]) => {
      try { set(await live(path, d)); data.source[key] = 'live'; }
      catch (err) { data.errors.push(`${key.toUpperCase()}: ${err.message}. Showing demo data.`); }
    }));
  }
  state.data = data;
  renderSource();
}

function renderSource() {
  const src = state.data.source;
  const liveCount = Object.values(src).filter(v => v === 'live').length;
  $('srcBadge').innerHTML = state.settings.mode === 'live'
    ? `<b>● Live mode</b><br>${liveCount}/4 sources connected`
    : `<b>● Demo data</b><br>Connect your APIs in <a href="#connect" data-goto="connect">Connect data</a>`;
}

/* ═══════════════ charts ═══════════════ */
Chart.defaults.color = '#8a99ae';
Chart.defaults.borderColor = '#1f2a3a';
Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
Chart.defaults.plugins.legend.labels.boxWidth = 10;
Chart.defaults.plugins.legend.labels.boxHeight = 10;
Chart.defaults.animation.duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 500;

function chart(id, config) { const el = $(id); if (!el) return; charts.push(new Chart(el, config)); }
const shortDate = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const lineDs = (label, data, color, extra = {}) => ({ label, data, borderColor: color, backgroundColor: color + '22', borderWidth: 2, pointRadius: 0, tension: 0.35, fill: false, ...extra });

/* ═══════════════ views ═══════════════ */
const VIEWS = {
  overview: { title: 'Overview', sub: 'GA4 sessions, conversions and revenue by channel, with server-side recovery', render: renderOverview },
  search: { title: 'Search: Google + Bing', sub: 'Search Console and Bing Webmaster Tools in one view, plus ranking opportunities', render: renderSearch },
  attribution: { title: 'Attribution', sub: 'Six models compared on the same conversion paths, from last click to data-driven Markov', render: renderAttribution },
  sgtm: { title: 'Server-side tracking', sub: 'sGTM health, signal recovery, destination delivery, consent and match quality', render: renderSgtm },
  connect: { title: 'Connect data', sub: 'Add your API keys and IDs. Stored only in this browser, used by your own backend', render: renderConnect },
};

function render() {
  charts.splice(0).forEach(c => c.destroy());
  const v = VIEWS[state.view];
  $('title').textContent = v.title;
  $('subtitle').textContent = v.sub;
  document.querySelectorAll('#nav button').forEach(b => b.setAttribute('aria-current', b.dataset.view === state.view ? 'page' : 'false'));
  $('range').style.visibility = state.view === 'connect' ? 'hidden' : 'visible';
  $('btnCsv').style.visibility = state.view === 'connect' ? 'hidden' : 'visible';
  const errs = state.data.errors.length && state.view !== 'connect'
    ? `<div class="callout c-amber" style="margin-bottom:14px"><b>Some live sources failed</b>${state.data.errors.map(esc).join('<br>')}</div>` : '';
  $('view').innerHTML = errs + v.render() + (state.view !== 'connect' ? ctaHtml() : '');
  v.after?.();
}

const ctaHtml = () => `<aside class="cta"><div><h2>Want this dashboard for your business?</h2><p>I set up server-side tracking, connect GA4, Search Console, Bing and your ad platforms, and build dashboards and attribution your team can actually act on.</p></div><a href="https://zov911.com" target="_blank" rel="noopener">Reach out → zov911.com</a></aside>`;
const badge = key => state.data.source[key] === 'live' ? '<small style="color:var(--green)">● live</small>' : '<small>demo data</small>';

/* ── Overview ── */
function renderOverview() {
  const { ga4, search, sgtm } = state.data;
  const cur = ga4.daily, prev = ga4.prev || [];
  const S = sum(cur, 'sessions'), C = sum(cur, 'conversions'), R = sum(cur, 'revenue');
  const pS = sum(prev, 'sessions'), pC = sum(prev, 'conversions'), pR = sum(prev, 'revenue');
  const org = sum(search.daily, d => d.googleClicks + d.bingClicks), pOrg = sum(search.prev || [], d => d.googleClicks + d.bingClicks);
  const rec = sum(sgtm.daily, 'serverEvents') / sum(sgtm.daily, 'clientEvents') - 1;
  const channels = [...ga4.channels].sort((a, b) => b.sessions - a.sessions);
  const fastest = [...channels].filter(c => c.prevSessions).sort((a, b) => b.sessions / b.prevSessions - a.sessions / a.prevSessions)[0];

  VIEWS.overview.after = () => {
    chart('cTrend', { type: 'line', data: { labels: cur.map(d => shortDate(d.date)), datasets: [
      lineDs('Sessions', cur.map(d => d.sessions), '#0ea5e9', { fill: true, yAxisID: 'y' }),
      lineDs('Conversions', cur.map(d => d.conversions), '#22c55e', { yAxisID: 'y1' }),
    ] }, options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { x: { ticks: { maxTicksLimit: 8 }, grid: { display: false } }, y: { position: 'left' }, y1: { position: 'right', grid: { drawOnChartArea: false } } } } });
    chart('cMix', { type: 'doughnut', data: { labels: channels.map(c => c.channel), datasets: [{ data: channels.map(c => c.conversions), backgroundColor: channels.map(c => c.color || '#64748b'), borderWidth: 0 }] }, options: { maintainAspectRatio: false, cutout: '68%', plugins: { legend: { position: 'right' } } } });
  };

  return `
  <div class="grid g6">
    ${kpi('Sessions', n0(S), deltaHtml(S, pS), 'GA4')}
    ${kpi('Conversions', n0(C), deltaHtml(C, pC), 'key events')}
    ${kpi('Revenue', money(R), deltaHtml(R, pR), 'GA4 purchase/lead value')}
    ${kpi('Conv. rate', pct(C / S, 2), deltaHtml(C / S, pC / pS), 'conversions / sessions')}
    ${kpi('Organic clicks', n0(org), deltaHtml(org, pOrg), 'Google + Bing')}
    ${kpi('Signal recovery', '+' + pct(rec), '<span class="delta up">sGTM</span>', 'server vs client events')}
  </div>
  <div class="grid g21 mt">
    <div class="card"><h2>Sessions & conversions ${badge('ga4')}</h2><div class="chart"><canvas id="cTrend"></canvas></div></div>
    <div class="card"><h2>Conversions by channel ${badge('ga4')}</h2><div class="chart"><canvas id="cMix"></canvas></div></div>
  </div>
  ${fastest ? `<div class="callout c-blue mt"><b>📈 ${esc(fastest.channel)} is your fastest-growing channel (${deltaHtml(fastest.sessions, fastest.prevSessions)} sessions)</b>${fastest.channel === 'AI Assistants' ? 'Referrals from ChatGPT, Perplexity, Copilot and Gemini convert above site average. Track them as their own GA4 channel group and optimize content for AI answers (AEO).' : 'Shift budget and content effort toward it while efficiency holds.'}</div>` : ''}
  <div class="card mt"><h2>Channel performance ${badge('ga4')}</h2><div class="tbl-wrap"><table>
    <thead><tr><th>Channel</th><th class="num">Sessions</th><th class="num">vs prev.</th><th class="num">Conversions</th><th class="num">Conv. rate</th><th class="num">Revenue</th><th>Share of conversions</th></tr></thead>
    <tbody>${channels.map(c => `<tr><td><span class="dot" style="background:${c.color || '#64748b'}"></span>${esc(c.channel)}</td><td class="num">${n0(c.sessions)}</td><td class="num">${deltaHtml(c.sessions, c.prevSessions)}</td><td class="num">${n0(c.conversions)}</td><td class="num">${pct(c.conversions / (c.sessions || 1), 2)}</td><td class="num">${money(c.revenue)}</td><td><div class="mini-bar"><i style="width:${c.conversions / sum(channels, 'conversions') * 100}%;background:${c.color || '#64748b'}"></i></div></td></tr>`).join('')}</tbody>
  </table></div></div>`;
}

const kpi = (l, v, d, s) => `<div class="card kpi"><div class="l">${l}</div><div class="v">${v}</div>${d} <span class="s">${s}</span></div>`;

/* ── Search ── */
const ctrCurve = pos => Math.max(0.004, 0.32 * Math.exp(-0.33 * (pos - 1)));
function renderSearch() {
  const { search } = state.data;
  const D = search.daily, P = search.prev || [];
  const gC = sum(D, 'googleClicks'), bC = sum(D, 'bingClicks'), gI = sum(D, 'googleImpressions'), bI = sum(D, 'bingImpressions');
  const pg = sum(P, 'googleClicks'), pb = sum(P, 'bingClicks');
  const Q = search.queries;
  const avgPos = sum(Q, q => q.google.position * q.google.impressions) / (sum(Q, q => q.google.impressions) || 1);

  // Striking distance: non-brand, Google position 4–15, sizeable impressions → clicks gained at position 3
  const opps = Q.filter(q => !q.branded && q.google.position >= 4 && q.google.position <= 15 && q.google.impressions > 2000)
    .map(q => ({ ...q, gain: Math.max(0, Math.round(q.google.impressions * (ctrCurve(3) - q.google.ctr))) }))
    .sort((a, b) => b.gain - a.gain).slice(0, 6);
  const bingWins = Q.filter(q => q.bing.impressions > 300 && q.bing.ctr > q.google.ctr * 1.2).slice(0, 4);

  VIEWS.search.after = () => {
    chart('cSearch', { type: 'line', data: { labels: D.map(d => shortDate(d.date)), datasets: [
      lineDs('Google clicks', D.map(d => d.googleClicks), '#4285f4', { fill: true }),
      lineDs('Bing clicks', D.map(d => d.bingClicks), '#00a4ef', { fill: true, borderDash: [4, 3] }),
    ] }, options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { x: { ticks: { maxTicksLimit: 8 }, grid: { display: false } } } } });
    chart('cShare', { type: 'doughnut', data: { labels: ['Google', 'Bing'], datasets: [{ data: [gC, bC], backgroundColor: ['#4285f4', '#00a4ef'], borderWidth: 0 }] }, options: { maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'bottom' } } } });
    bindQueryTable();
  };

  return `
  <div class="grid g5">
    ${kpi('Google clicks', n0(gC), deltaHtml(gC, pg), 'Search Console')}
    ${kpi('Bing clicks', n0(bC), deltaHtml(bC, pb), 'Bing Webmaster')}
    ${kpi('Bing share', pct(bC / (gC + bC)), '', 'of organic search clicks')}
    ${kpi('Google CTR', pct(gC / gI, 2), '', `Bing ${pct(bC / bI, 2)}`)}
    ${kpi('Avg. position', avgPos.toFixed(1), '', 'Google, impression-weighted')}
  </div>
  <div class="grid g21 mt">
    <div class="card"><h2>Daily clicks: Google vs Bing ${badge('search')}</h2><div class="chart"><canvas id="cSearch"></canvas></div></div>
    <div class="card"><h2>Search click share ${badge('search')}</h2><div class="chart"><canvas id="cShare"></canvas></div></div>
  </div>
  <div class="grid g2 mt">
    <div class="card"><h2>🎯 Striking-distance opportunities <small>position 4–15 → est. clicks at position 3</small></h2>
      <table><thead><tr><th>Query</th><th class="num">Impr.</th><th class="num">Pos.</th><th class="num">CTR</th><th class="num">+Clicks</th></tr></thead>
      <tbody>${opps.map(o => `<tr><td>${esc(o.query)}</td><td class="num">${n0(o.google.impressions)}</td><td class="num">${o.google.position}</td><td class="num">${pct(o.google.ctr)}</td><td class="num" style="color:var(--green);font-weight:700">+${n0(o.gain)}</td></tr>`).join('')}</tbody></table>
    </div>
    <div class="card"><h2>Bing insights</h2>
      <div class="callout c-blue"><b>Bing also feeds Copilot and ChatGPT search</b>Bing's index powers Microsoft Copilot answers and has been a source for ChatGPT search. Submitting URLs via IndexNow and keeping Bing Webmaster data clean now affects AI-assistant visibility, not just Bing clicks.</div>
      ${bingWins.length ? `<p class="muted mt" style="font-size:13px">Queries where Bing CTR beats Google by 20%+ (test your Bing Ads budget here):</p>
      <table class="mt"><tbody>${bingWins.map(q => `<tr><td>${esc(q.query)}</td><td class="num">Bing ${pct(q.bing.ctr)}</td><td class="num muted">Google ${pct(q.google.ctr)}</td></tr>`).join('')}</tbody></table>` : ''}
    </div>
  </div>
  <div class="card mt"><h2>Queries: both engines ${badge('search')}</h2>
    <div class="toolbar">
      <div class="seg" id="qFilter"><button data-f="all">All</button><button data-f="non">Non-branded</button><button data-f="brand">Branded</button></div>
      <input id="qSearch" type="search" placeholder="Filter queries…" value="${esc(state.qSearch)}" aria-label="Filter queries">
    </div>
    <div class="tbl-wrap" id="qTable"></div>
  </div>`;
}

function bindQueryTable() {
  const draw = () => {
    const [key, dir] = state.qSort;
    const get = (o, k) => k.split('.').reduce((v, p) => v?.[p], o);
    const rows = state.data.search.queries
      .filter(q => state.qFilter === 'all' || (state.qFilter === 'brand') === q.branded)
      .filter(q => !state.qSearch || q.query.includes(state.qSearch.toLowerCase()))
      .sort((a, b) => (get(a, key) > get(b, key) ? 1 : -1) * dir);
    const posCls = p => p <= 3 ? 'pos-good' : p <= 10 ? 'pos-mid' : 'pos-low';
    const th = (k, l) => `<th class="num sortable" data-k="${k}">${l}${state.qSort[0] === k ? (dir < 0 ? ' ↓' : ' ↑') : ''}</th>`;
    $('qTable').innerHTML = `<table><thead><tr><th>Query</th>${th('google.clicks', 'G clicks')}${th('google.impressions', 'G impr.')}${th('google.ctr', 'G CTR')}${th('google.position', 'G pos.')}${th('bing.clicks', 'B clicks')}${th('bing.impressions', 'B impr.')}${th('bing.position', 'B pos.')}</tr></thead>
      <tbody>${rows.map(q => `<tr><td>${esc(q.query)} ${q.branded ? '<span class="tag t-brand">BRAND</span>' : ''}</td><td class="num">${n0(q.google.clicks)}</td><td class="num">${n0(q.google.impressions)}</td><td class="num">${pct(q.google.ctr)}</td><td class="num ${posCls(q.google.position)}">${q.google.position}</td><td class="num">${n0(q.bing.clicks)}</td><td class="num">${n0(q.bing.impressions)}</td><td class="num ${posCls(q.bing.position)}">${q.bing.position}</td></tr>`).join('')}</tbody></table>`;
    $('qTable').querySelectorAll('th.sortable').forEach(t => t.addEventListener('click', () => {
      state.qSort = [t.dataset.k, state.qSort[0] === t.dataset.k ? -state.qSort[1] : -1]; draw();
    }));
    document.querySelectorAll('#qFilter button').forEach(b => b.setAttribute('aria-pressed', b.dataset.f === state.qFilter));
  };
  document.querySelectorAll('#qFilter button').forEach(b => b.addEventListener('click', () => { state.qFilter = b.dataset.f; draw(); }));
  $('qSearch').addEventListener('input', e => { state.qSearch = e.target.value; draw(); });
  draw();
}

/* ── Attribution ── */
function renderAttribution() {
  const paths = state.data.paths;
  const res = runAll(paths, state.attrBy);
  const keys = Object.keys(MODELS);
  const chans = CHANNELS.map(c => c.id).filter(id => keys.some(k => res[k][id]));
  const total = sum(paths, p => state.attrBy === 'value' ? p.value : p.conversions);
  const fmtV = v => state.attrBy === 'value' ? money(v) : n0(v);
  const palette = ['#64748b', '#94a3b8', '#0ea5e9', '#22c55e', '#f59e0b', '#a78bfa'];
  const shift = chans.map(c => ({ c, d: (res.markov[c] || 0) - (res.last_click[c] || 0) })).sort((a, b) => b.d - a.d);
  const convPaths = paths.filter(p => p.conversions);
  const avgLen = sum(convPaths, p => p.path.length * p.conversions) / (sum(convPaths, 'conversions') || 1);

  VIEWS.attribution.after = () => {
    chart('cAttr', { type: 'bar', data: { labels: chans, datasets: keys.map((k, i) => ({ label: MODELS[k].label, data: chans.map(c => Math.round(res[k][c] || 0)), backgroundColor: palette[i], borderRadius: 3 })) },
      options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { x: { grid: { display: false } } } } });
    document.querySelectorAll('#attrBy button').forEach(b => b.addEventListener('click', () => { state.attrBy = b.dataset.by; render(); }));
  };

  return `
  <div class="grid g4">
    ${kpi('Converting paths', n0(convPaths.length), '', 'unique channel sequences')}
    ${kpi('Total ' + (state.attrBy === 'value' ? 'value' : 'conversions'), fmtV(total), '', 'credited across models')}
    ${kpi('Avg. touches', avgLen.toFixed(2), '', 'per conversion')}
    ${kpi('Biggest undervalued', esc(shift[0]?.c || '-'), `<span class="delta up">+${fmtV(shift[0]?.d || 0)}</span>`, 'data-driven vs last click')}
  </div>
  <div class="card mt"><h2>Credit by channel and model ${badge('attribution')}
    <span class="seg" id="attrBy"><button data-by="conversions" aria-pressed="${state.attrBy === 'conversions'}">Conversions</button><button data-by="value" aria-pressed="${state.attrBy === 'value'}">Value</button></span></h2>
    <div class="chart lg"><canvas id="cAttr"></canvas></div></div>
  <div class="grid g21 mt">
    <div class="card"><h2>Model comparison <small>Δ = data-driven minus last click</small></h2><div class="tbl-wrap"><table>
      <thead><tr><th>Channel</th>${keys.map(k => `<th class="num">${MODELS[k].label}</th>`).join('')}<th class="num">Δ</th></tr></thead>
      <tbody>${chans.map(c => { const d = (res.markov[c] || 0) - (res.last_click[c] || 0); return `<tr><td>${esc(c)}</td>${keys.map(k => `<td class="num">${fmtV(res[k][c] || 0)}</td>`).join('')}<td class="num ${d >= 0 ? 'up' : 'down'}" style="font-weight:700">${d >= 0 ? '+' : ''}${fmtV(d)}</td></tr>`; }).join('')}</tbody>
    </table></div></div>
    <div class="card"><h2>Top converting paths</h2>
      ${topPaths(paths, 8).map(p => `<div class="check"><span class="tag t-ok">${n0(p.conversions)}</span><span style="font-size:12.5px">${p.path.map(esc).join(' <span class="muted">→</span> ')}<small>${pct(p.conversions / (p.conversions + p.nulls))} conversion rate</small></span></div>`).join('')}
    </div>
  </div>
  <div class="callout c-blue mt"><b>How to read this</b>Last click over-credits closing channels (Paid Search, Direct). First click over-credits discovery (Paid Social). The <b>data-driven Markov model</b> measures each channel's <i>removal effect</i>: how many conversions would be lost if the channel disappeared from every path. Use it to rebalance budget, and validate with incrementality tests. Live attribution needs path-level data (GA4 BigQuery export), on the roadmap for the backend.</div>`;
}

/* ── Server-side tracking ── */
function renderSgtm() {
  const s = state.data.sgtm;
  const C = sum(s.daily, 'clientEvents'), S = sum(s.daily, 'serverEvents');
  const p95 = Math.round(sum(s.daily, 'p95LatencyMs') / s.daily.length);
  const err = sum(s.daily, 'errorRate') / s.daily.length;
  const h = s.health || {};

  VIEWS.sgtm.after = () => {
    chart('cEvents', { type: 'line', data: { labels: s.daily.map(d => shortDate(d.date)), datasets: [
      lineDs('Server events (sGTM)', s.daily.map(d => d.serverEvents), '#22c55e', { fill: true }),
      lineDs('Client events (browser tags)', s.daily.map(d => d.clientEvents), '#94a3b8', { borderDash: [5, 4] }),
    ] }, options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { x: { ticks: { maxTicksLimit: 8 }, grid: { display: false } } } } });
    chart('cConsent', { type: 'doughnut', data: { labels: ['Granted', 'Partial', 'Denied'], datasets: [{ data: [s.consent.granted, s.consent.partial, s.consent.denied].map(v => Math.round(v * 100)), backgroundColor: ['#22c55e', '#f59e0b', '#ef4444'], borderWidth: 0 }] }, options: { maintainAspectRatio: false, cutout: '68%', plugins: { legend: { position: 'bottom' } } } });
  };

  return `
  <div class="grid g5">
    <div class="card kpi"><div class="l">Tagging server</div><div class="health mt"><span class="pulse ${h.ok === false ? 'bad' : ''}"></span>${h.ok === false ? 'Unreachable' : 'Healthy'}</div><span class="s">${esc(h.region || '')} · ${h.latencyMs ?? '-'} ms ${state.data.source.sgtm === 'live' ? '· live check' : ''}</span></div>
    ${kpi('Signal recovery', '+' + pct(S / C - 1), '', 'server events vs client')}
    ${kpi('Server events', n0(S), '', `client: ${n0(C)}`)}
    ${kpi('p95 latency', p95 + ' ms', '', 'sGTM response time')}
    ${kpi('Error rate', pct(err, 2), '', '4xx/5xx to vendors')}
  </div>
  <div class="grid g21 mt">
    <div class="card"><h2>Events: server vs client ${badge('sgtm')}</h2><div class="chart"><canvas id="cEvents"></canvas></div></div>
    <div class="card"><h2>Consent Mode v2 state <small>share of events</small></h2><div class="chart"><canvas id="cConsent"></canvas></div></div>
  </div>
  <div class="grid g2 mt">
    <div class="card"><h2>Destinations</h2><table>
      <thead><tr><th>Destination</th><th class="num">Delivery</th><th class="num">Match quality</th></tr></thead>
      <tbody>${s.destinations.map(d => `<tr><td>${esc(d.name)}</td><td class="num">${pct(d.success)}</td><td class="num">${d.emq ? `EMQ ${d.emq}/10` : d.matchRate ? `${pct(d.matchRate, 0)} match` : '<span class="muted">n/a</span>'}</td></tr>`).join('')}</tbody></table></div>
    <div class="card"><h2>Implementation checks</h2>
      ${s.checks.map(c => `<div class="check"><span class="tag t-${c.status === 'pass' ? 'ok' : c.status}">${c.status.toUpperCase()}</span><span>${esc(c.label)}<small>${esc(c.detail)}</small></span></div>`).join('')}
    </div>
  </div>
  <div class="callout c-green mt"><b>Why server-side tagging pays off</b>Ad blockers, Safari ITP and consent banners silently drop browser tags. Routing events through a first-party sGTM endpoint typically recovers 10–30% of signal, extends cookie lifetimes, and sends hashed first-party data to Meta CAPI, Google Enhanced Conversions and LinkedIn CAPI, which lifts match rates and ad-platform optimization.</div>`;
}

/* ── Connect data ── */
function renderConnect() {
  const s = state.settings;
  const f = (k, label, ph, type = 'text') => `<div class="field"><label for="f_${k}">${label}</label><input id="f_${k}" data-k="${k}" type="${type}" placeholder="${esc(ph)}" value="${esc(s[k])}" autocomplete="off"></div>`;
  VIEWS.connect.after = bindConnect;
  return `
  <div class="card"><h2>Data mode</h2>
    <label class="switch"><input type="checkbox" id="liveToggle" ${s.mode === 'live' ? 'checked' : ''}> Use live data from my backend</label>
    <p class="muted mt" style="font-size:13px">Browsers can't call the GA4 and Search Console APIs securely on their own, because they need OAuth or service-account credentials. Run the included Node backend (<code>server/</code>) on your machine or a server, put credentials in its <code>.env</code> (recommended), or enter them below. They're stored only in this browser's localStorage and sent only to <i>your</i> backend URL.</p>
    <div class="grid g2 mt">
      ${f('backendUrl', 'Backend URL', 'http://localhost:8790')}
      <div class="field"><label>&nbsp;</label><div style="display:flex;gap:8px;align-items:center"><button class="btn" id="btnTest" type="button">Test connection</button><span class="status" id="testStatus"></span></div></div>
    </div>
  </div>
  <div class="grid g2 mt">
    <div class="card conn"><h3>📊 Google Analytics 4</h3><p>Data API (runReport): sessions, conversions, revenue by channel.</p>
      ${f('ga4PropertyId', 'GA4 property ID', '123456789')}
      <p class="mono" style="font-size:11px">Grant the service account "Viewer" on the property.</p></div>
    <div class="card conn"><h3>🔍 Google Search Console</h3><p>Search Analytics API: queries, clicks, impressions, CTR, position.</p>
      ${f('gscSiteUrl', 'Property', 'sc-domain:example.com or https://www.example.com/')}
      <p class="mono" style="font-size:11px">Add the service account email as a user in Search Console.</p></div>
    <div class="card conn"><h3>🅱️ Bing Webmaster Tools</h3><p>Bing Webmaster API: query stats, traffic and crawl.</p>
      ${f('bingSiteUrl', 'Site URL', 'https://www.example.com/')}
      ${f('bingApiKey', 'API key', 'Settings → API access in Bing Webmaster', 'password')}</div>
    <div class="card conn"><h3>⚙️ Server-side GTM</h3><p>Tagging server health check, plus event counts if you log to the backend.</p>
      ${f('sgtmUrl', 'Tagging server URL', 'https://metrics.example.com')}</div>
  </div>
  <div class="card conn mt"><h3>🔑 Google service account (optional, if not set in backend .env)</h3>
    <p>One service account covers GA4 and Search Console. Create it in Google Cloud, enable the <i>Google Analytics Data API</i> and <i>Search Console API</i>, and paste the JSON key. For production, keep it in the backend <code>.env</code> as <code>GOOGLE_SERVICE_ACCOUNT_JSON</code> instead.</p>
    <div class="field"><label for="f_googleSaJson">Service account JSON</label><textarea id="f_googleSaJson" data-k="googleSaJson" placeholder='{"type":"service_account","client_email":"…","private_key":"…"}'>${esc(s.googleSaJson)}</textarea></div>
    <div style="display:flex;gap:8px"><button class="btn" id="btnSave" type="button">Save settings</button><button class="btn ghost" id="btnClear" type="button">Clear stored keys</button><span class="status" id="saveStatus" style="align-self:center"></span></div>
  </div>
  <div class="card mt"><h2>Run the backend</h2><pre>cd server
cp .env.example .env     # add credentials (recommended) or enable client credentials for local use
node server.js           # → http://localhost:8790  (Node 20+, zero dependencies)</pre></div>`;
}

function bindConnect() {
  const collect = () => { document.querySelectorAll('[data-k]').forEach(el => { state.settings[el.dataset.k] = el.value.trim(); }); };
  $('btnSave').addEventListener('click', async () => { collect(); saveSettings(state.settings); $('saveStatus').textContent = '✓ Saved'; await loadData(); });
  $('btnClear').addEventListener('click', async () => { state.settings = { ...DEFAULTS }; saveSettings(state.settings); await loadData(); render(); });
  $('liveToggle').addEventListener('change', async e => { collect(); state.settings.mode = e.target.checked ? 'live' : 'demo'; saveSettings(state.settings); await loadData(); });
  $('btnTest').addEventListener('click', async () => {
    collect(); const st = $('testStatus'); st.textContent = 'Testing…'; st.style.color = 'var(--muted)';
    try {
      const r = await fetch(state.settings.backendUrl.replace(/\/$/, '') + '/api/health', { headers: credHeaders(state.settings), signal: AbortSignal.timeout(8000) });
      const j = await r.json();
      st.innerHTML = Object.entries(j.connectors || {}).map(([k, v]) => `${k}: ${v ? '<span class="up">✓</span>' : '<span class="muted">–</span>'}`).join(' · ') || 'Connected';
      st.style.color = 'var(--text)';
    } catch (err) { st.textContent = `✗ ${err.message}. Is the backend running?`; st.style.color = 'var(--red)'; }
  });
}

/* ═══════════════ CSV export ═══════════════ */
function exportCsv() {
  const d = state.data; let rows;
  if (state.view === 'search') rows = [['query', 'branded', 'google_clicks', 'google_impressions', 'google_ctr', 'google_position', 'bing_clicks', 'bing_impressions', 'bing_ctr', 'bing_position'], ...d.search.queries.map(q => [q.query, q.branded, q.google.clicks, q.google.impressions, q.google.ctr.toFixed(4), q.google.position, q.bing.clicks, q.bing.impressions, q.bing.ctr.toFixed(4), q.bing.position])];
  else if (state.view === 'attribution') { const r = runAll(d.paths, state.attrBy); const ks = Object.keys(MODELS); rows = [['channel', ...ks], ...CHANNELS.map(c => [c.id, ...ks.map(k => (r[k][c.id] || 0).toFixed(1))])]; }
  else if (state.view === 'sgtm') rows = [['date', 'client_events', 'server_events', 'p95_latency_ms', 'error_rate'], ...d.sgtm.daily.map(x => [x.date, x.clientEvents, x.serverEvents, x.p95LatencyMs, x.errorRate])];
  else rows = [['date', 'sessions', 'users', 'conversions', 'revenue'], ...d.ga4.daily.map(x => [x.date, x.sessions, x.users, x.conversions, x.revenue])];
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })), download: `signal-${state.view}-${state.days}d.csv` });
  document.body.appendChild(a); a.click(); a.remove();
}

/* ═══════════════ boot ═══════════════ */
function go(view) { state.view = VIEWS[view] ? view : 'overview'; history.replaceState(null, '', '#' + state.view); render(); window.scrollTo({ top: 0 }); }

document.addEventListener('click', e => {
  const nav = e.target.closest('#nav button, [data-goto]');
  if (nav) { e.preventDefault(); go(nav.dataset.view || nav.dataset.goto); }
});
$('range').addEventListener('click', async e => {
  const b = e.target.closest('[data-days]'); if (!b) return;
  state.days = +b.dataset.days;
  document.querySelectorAll('#range button').forEach(x => x.setAttribute('aria-pressed', x === b));
  await loadData(); render();
});
$('btnCsv').addEventListener('click', exportCsv);
window.addEventListener('hashchange', () => { const v = location.hash.slice(1); if (v !== state.view && VIEWS[v]) go(v); });
$('yr').textContent = new Date().getFullYear();

await loadData();
go(location.hash.slice(1) || 'overview');
