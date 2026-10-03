// Server-side GTM: tagging servers expose GET /healthy, which returns 200 "ok" when serving.
export async function sgtmHealth(baseUrl) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/healthy`, { signal: AbortSignal.timeout(8000) });
    return { health: { ok: res.ok, status: res.status, latencyMs: Date.now() - t0, region: new URL(baseUrl).hostname } };
  } catch (err) {
    return { health: { ok: false, error: err.message, latencyMs: Date.now() - t0, region: baseUrl } };
  }
}
