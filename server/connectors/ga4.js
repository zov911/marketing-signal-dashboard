// GA4 Data API (v1beta runReport) → { daily, prev, channels }
import { googleFetch } from '../google-auth.js';

const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const COLORS = {
  'Organic Search': '#22c55e', 'Paid Search': '#3b82f6', Direct: '#94a3b8', 'Paid Social': '#f472b6', Email: '#f59e0b',
  Referral: '#a78bfa', 'Organic Social': '#fb7185', 'AI Assistants': '#06b6d4', Display: '#eab308', 'Cross-network': '#14b8a6',
  'Organic Video': '#f97316', Unassigned: '#475569',
};
const METRICS = ['sessions', 'totalUsers', 'engagedSessions', 'keyEvents', 'totalRevenue'];

const runReport = (property, sa, body) =>
  googleFetch(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(property)}:runReport`, { sa, scope: SCOPE, body });

const toIso = v => `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
const range = (from, to) => ({ startDate: `${from}daysAgo`, endDate: to === 1 ? 'yesterday' : `${to}daysAgo` });

function dailyRows(report) {
  return (report.rows || []).map(r => {
    const m = r.metricValues.map(x => Number(x.value));
    return { date: toIso(r.dimensionValues[0].value), sessions: m[0], users: m[1], engagedSessions: m[2], conversions: m[3], revenue: m[4] };
  }).sort((a, b) => a.date.localeCompare(b.date));
}

export async function ga4Report({ property, sa, days }) {
  const daily = { dimensions: [{ name: 'date' }], metrics: METRICS.map(name => ({ name })) };
  const channel = { dimensions: [{ name: 'sessionDefaultChannelGroup' }], metrics: ['sessions', 'keyEvents', 'totalRevenue'].map(name => ({ name })) };
  const [cur, prev, chCur, chPrev] = await Promise.all([
    runReport(property, sa, { ...daily, dateRanges: [range(days, 1)] }),
    runReport(property, sa, { ...daily, dateRanges: [range(days * 2, days + 1)] }),
    runReport(property, sa, { ...channel, dateRanges: [range(days, 1)] }),
    runReport(property, sa, { ...channel, dateRanges: [range(days * 2, days + 1)] }),
  ]);
  const prevSessions = Object.fromEntries((chPrev.rows || []).map(r => [r.dimensionValues[0].value, Number(r.metricValues[0].value)]));
  return {
    daily: dailyRows(cur),
    prev: dailyRows(prev),
    channels: (chCur.rows || []).map(r => {
      const name = r.dimensionValues[0].value;
      const [sessions, conversions, revenue] = r.metricValues.map(x => Number(x.value));
      return { channel: name, color: COLORS[name] || '#64748b', sessions, conversions, revenue, prevSessions: prevSessions[name] || 0 };
    }),
  };
}
