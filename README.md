# Marketing Signal Dashboard: GA4 · Search Console · Bing · sGTM · Attribution

**Live demo:** https://zov911.github.io/marketing-signal-dashboard/

One place for the questions growth teams ask every week: *Where do conversions come from? How is organic search trending on Google **and** Bing? Which channels does last-click under-credit? Is our server-side tracking healthy, and how much signal does it recover?*

It ships with realistic sample data, so it works instantly on GitHub Pages. Connect your own GA4, Search Console, Bing Webmaster and server-side GTM through the included zero-dependency Node backend.

## Modules

| Module | What it shows | Data source |
|---|---|---|
| **Overview** | Sessions, conversions, revenue, conversion rate, organic clicks and signal recovery, each with period-over-period deltas. Channel mix and table, including an **AI Assistants** channel (ChatGPT, Perplexity, Copilot, Gemini referrals) | GA4 Data API |
| **Search: Google + Bing** | Combined daily clicks, Bing share of search, CTR and position. A unified query table across both engines (sort, filter, branded vs non-branded). **Striking-distance finder**: queries at positions 4–15 with estimated clicks gained at position 3. Bing CTR outliers | Search Console API + Bing Webmaster API |
| **Attribution** | Six models on the same paths: last click, first click, linear, time decay, position-based (40/20/40) and **data-driven Markov** (removal effect). Biggest over- and under-credited channels, top converting paths, by conversions or value | Conversion paths (demo; live via GA4 BigQuery export is on the roadmap) |
| **Server-side tracking** | Tagging-server health, server vs client events (recovered signal), p95 latency, error rate, Consent Mode v2 states, per-destination delivery (GA4, Google Ads EC, Meta CAPI, LinkedIn CAPI, TikTok, Microsoft Ads) with match quality/EMQ, implementation checklist | sGTM `/healthy` + your logs |
| **Connect data** | Forms for property IDs, site URLs, Bing API key, sGTM URL and service account, plus a connection test | Stored in browser localStorage, sent only to *your* backend |

## Architecture

```
┌──────────── Browser (static, GitHub Pages) ────────────┐
│ index.html + assets/app.js (Chart.js)                  │
│   demo-data.js   → deterministic sample data           │
│   attribution.js → 6 models incl. Markov chain         │
│   Connect data   → settings in localStorage            │
└───────────────┬────────────────────────────────────────┘
                │ fetch /api/* (Live mode)
┌───────────────▼──── server/ (Node 20+, 0 dependencies) ─┐
│ google-auth.js   service-account JWT → OAuth token      │
│ connectors/ga4.js     GA4 Data API runReport            │
│ connectors/search.js  GSC searchAnalytics + Bing API    │
│ connectors/sgtm.js    tagging server /healthy           │
│ 10-min cache · CORS allow-list · static file server     │
└─────────────────────────────────────────────────────────┘
```

Every connector returns the **same shape as the demo generator**, so each module works with demo data, live data, or a mix: a failed source falls back to demo data with a visible warning.

## Run with your data

```bash
cd server
cp .env.example .env      # service account JSON, GA4 property, GSC site, Bing key, sGTM URL
node server.js            # → http://localhost:8790 (dashboard + API)
```

1. **Google service account** (one account covers both APIs): create a JSON key in Google Cloud, enable the *Google Analytics Data API* and *Google Search Console API*, add the service account email as **Viewer** in GA4 and as a **user** in Search Console.
2. **Bing:** Bing Webmaster Tools → Settings → API access → generate an API key.
3. **sGTM:** set `SGTM_URL` to your tagging server's custom domain.
4. Open the dashboard → **Connect data** → enable **Live mode**.

For quick local testing you can type credentials into the Connect form instead and set `ALLOW_CLIENT_CREDENTIALS=true`. Keep it `false` anywhere public.

## Roadmap

- GA4 BigQuery export → path-level live attribution (the Markov model is already implemented)
- sGTM event log ingestion (Cloud Logging / BigQuery) for live destination delivery rates
- Google Ads and Meta spend → CAC/ROAS by model
- Scheduled email/Slack digest

## Tech

Vanilla JS modules · Chart.js · Node.js (`node:http`, `node:crypto`) · `node:test`. No build step.

```bash
npm test   # attribution models + demo data checks
```

---

## Want this dashboard for your business?

I set up server-side tracking (sGTM, Consent Mode v2, Enhanced Conversions, CAPI), connect GA4, Search Console, Bing and ad platforms, and build dashboards and attribution teams actually use.

**Reach out → [zov911.com](https://zov911.com)**

© 2026 zov911. All rights reserved.
