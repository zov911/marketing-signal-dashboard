import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAll, markov, MODELS } from '../assets/attribution.js';
import { conversionPaths, searchQueries, ga4Daily } from '../assets/demo-data.js';

const paths = [
  { path: ['Paid Social', 'Email', 'Paid Search'], conversions: 10, nulls: 30, value: 20000 },
  { path: ['Organic Search'], conversions: 5, nulls: 45, value: 9000 },
  { path: ['Paid Social'], conversions: 0, nulls: 80, value: 0 },
];

test('every model distributes exactly the total conversions', () => {
  const total = paths.reduce((s, p) => s + p.conversions, 0);
  for (const [k, credits] of Object.entries(runAll(paths))) {
    const sum = Object.values(credits).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - total) < 1e-6, `${k}: ${sum} != ${total}`);
  }
});

test('last click and first click credit the right touch', () => {
  const r = runAll(paths);
  assert.equal(r.last_click['Paid Search'], 10);
  assert.equal(r.first_click['Paid Social'], 10);
  assert.equal(r.position['Email'], 2); // 20% middle share of 10
});

test('markov: a channel that only appears in converting paths gets credit', () => {
  const m = markov(paths);
  assert.ok(m['Email'] > 0);
  assert.ok(m['Organic Search'] > 0);
});

test('value-based attribution sums to total value', () => {
  const r = MODELS.linear.fn(paths, 'value');
  assert.ok(Math.abs(Object.values(r).reduce((a, b) => a + b, 0) - 29000) < 1e-6);
});

test('demo data is deterministic and well-formed', () => {
  assert.deepEqual(conversionPaths(), conversionPaths());
  const q = searchQueries(90);
  assert.ok(q.every(r => r.google.clicks <= r.google.impressions && r.bing.clicks <= r.bing.impressions));
  assert.equal(ga4Daily(28).daily.length, 28);
});
