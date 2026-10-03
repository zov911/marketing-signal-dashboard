// Attribution models over conversion paths: [{ path: ['Paid Social','Email',...], conversions, nulls, value }]
// Returns { channel: credit } where credits sum to total conversions (or value when by='value').

const add = (o, k, v) => { o[k] = (o[k] || 0) + v; };

function positional(paths, weightsFor, by) {
  const out = {};
  for (const p of paths) {
    const total = by === 'value' ? p.value : p.conversions;
    if (!total) continue;
    const w = weightsFor(p.path.length);
    p.path.forEach((ch, i) => add(out, ch, total * w[i]));
  }
  return out;
}

export const MODELS = {
  last_click:  { label: 'Last click',      fn: (paths, by) => positional(paths, n => Array.from({ length: n }, (_, i) => (i === n - 1 ? 1 : 0)), by) },
  first_click: { label: 'First click',     fn: (paths, by) => positional(paths, n => Array.from({ length: n }, (_, i) => (i === 0 ? 1 : 0)), by) },
  linear:      { label: 'Linear',          fn: (paths, by) => positional(paths, n => Array(n).fill(1 / n), by) },
  time_decay:  { label: 'Time decay',      fn: (paths, by) => positional(paths, n => {
    const w = Array.from({ length: n }, (_, i) => Math.pow(2, -(n - 1 - i))); // half-life = 1 touch
    const s = w.reduce((a, b) => a + b, 0); return w.map(x => x / s);
  }, by) },
  position:    { label: 'Position-based (40/20/40)', fn: (paths, by) => positional(paths, n => {
    if (n === 1) return [1];
    if (n === 2) return [0.5, 0.5];
    const mid = 0.2 / (n - 2);
    return Array.from({ length: n }, (_, i) => (i === 0 || i === n - 1 ? 0.4 : mid));
  }, by) },
  markov:      { label: 'Data-driven (Markov)', fn: (paths, by) => markov(paths, by) },
};

/**
 * First-order Markov chain attribution with removal effects.
 * P(conversion) is computed by value iteration over the absorbing chain;
 * removing a channel redirects its traffic to "null".
 */
export function markov(paths, by = 'conversions') {
  const trans = new Map();          // from -> Map(to -> count)
  const inc = (a, b, c) => { if (!c) return; const m = trans.get(a) || new Map(); m.set(b, (m.get(b) || 0) + c); trans.set(a, m); };
  const channels = new Set();
  for (const p of paths) {
    const seq = ['(start)', ...p.path];
    p.path.forEach(c => channels.add(c));
    for (let i = 0; i < seq.length - 1; i++) inc(seq[i], seq[i + 1], p.conversions + p.nulls);
    inc(seq[seq.length - 1], '(conversion)', p.conversions);
    inc(seq[seq.length - 1], '(null)', p.nulls);
  }
  const probs = new Map();
  for (const [from, m] of trans) {
    const tot = [...m.values()].reduce((a, b) => a + b, 0);
    probs.set(from, [...m].map(([to, c]) => [to, c / tot]));
  }
  const pConv = removed => {
    const v = new Map([['(conversion)', 1], ['(null)', 0]]);
    for (let iter = 0; iter < 200; iter++) {
      let delta = 0;
      for (const [from, edges] of probs) {
        if (from === removed) continue;
        let s = 0;
        for (const [to, p] of edges) s += p * (to === removed ? 0 : (v.get(to) ?? 0));
        delta = Math.max(delta, Math.abs(s - (v.get(from) ?? 0)));
        v.set(from, s);
      }
      if (delta < 1e-10) break;
    }
    return v.get('(start)') ?? 0;
  };
  const base = pConv(null);
  const removal = {};
  for (const ch of channels) removal[ch] = base > 0 ? Math.max(0, 1 - pConv(ch) / base) : 0;
  const sumRE = Object.values(removal).reduce((a, b) => a + b, 0) || 1;
  const total = paths.reduce((s, p) => s + (by === 'value' ? p.value : p.conversions), 0);
  return Object.fromEntries(Object.entries(removal).map(([ch, re]) => [ch, total * re / sumRE]));
}

export function runAll(paths, by = 'conversions') {
  return Object.fromEntries(Object.entries(MODELS).map(([k, m]) => [k, m.fn(paths, by)]));
}

export function topPaths(paths, n = 8) {
  return [...paths].filter(p => p.conversions).sort((a, b) => b.conversions - a.conversions).slice(0, n);
}
