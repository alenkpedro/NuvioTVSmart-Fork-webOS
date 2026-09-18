// Port of ysosrs123/NuvioTV-Fork core/network/StreamSpeedTester.kt (45e0984).
//
// The fork measures the real source through the same transport the player uses:
// a ranged request on the media URL, a warm-up slice the clock ignores (TCP slow
// start is not the link's speed), then a bounded measurement window. The
// connection-count sweep of StreamSweepEngine has no equivalent here: a TV app
// cannot open parallel sockets for the media element, so one window per source is
// what the budget allows.
//
// The measurement is information only. It never reorders the list and never
// changes what auto-play picks.

export const SPEED_BUDGET = Object.freeze({
  warmupBytes: 256 * 1024,
  measureBytes: 2 * 1024 * 1024,
  minMs: 800,
  maxMs: 4000,
  subWindowMs: 400,
  timeoutMs: 8000,
  maxSources: 4,
  maxConcurrent: 2
});

export function speedRequestHeaders(budget = SPEED_BUDGET) {
  const limit = Math.max(1, Number(budget.warmupBytes) + Number(budget.measureBytes)) - 1;
  return { Range: `bytes=0-${limit}`, "Cache-Control": "no-store" };
}

// StreamSpeedTester's clock starts after the warm-up bytes and stops at the byte
// budget or the window, whichever comes first.
export function mbpsFrom(bytes, ms) {
  const byteCount = Number(bytes);
  const elapsed = Number(ms);
  if (!Number.isFinite(byteCount) || !Number.isFinite(elapsed) || byteCount <= 0 || elapsed <= 0) {
    return 0;
  }
  return (byteCount * 8) / elapsed / 1000;
}

// Per-sub-window rates behind the headline: a burst that only lasts a moment
// should not look like a stable link.
export function subWindowRates(samples, windowMs) {
  if (!Array.isArray(samples) || samples.length < 2 || !(Number(windowMs) > 0)) {
    return [];
  }
  const first = Number(samples[0]?.at) || 0;
  const buckets = [];
  samples.forEach((sample) => {
    const at = Number(sample?.at) || 0;
    const bytes = Number(sample?.bytes) || 0;
    const index = Math.floor((at - first) / windowMs);
    if (index < 0) {
      return;
    }
    buckets[index] ||= { at: first + index * windowMs, bytes: 0 };
    buckets[index].bytes = Math.max(buckets[index].bytes, bytes);
  });
  const rates = [];
  for (let index = 1; index < buckets.length; index++) {
    const previous = buckets[index - 1];
    const current = buckets[index];
    if (!previous || !current) {
      continue;
    }
    const rate = mbpsFrom(Math.max(0, current.bytes - previous.bytes), current.at - previous.at);
    if (rate > 0) {
      rates.push(rate);
    }
  }
  return rates;
}

export function isMeasurableUrl(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}

const failureResult = (reason, latencyMs = null) => ({
  ok: false,
  failure: reason,
  bytes: 0,
  ms: 0,
  mbps: 0,
  latencyMs,
  subWindows: [],
  approximate: false
});

/**
 * Measures one source. `request` defaults to the platform fetch, so the caller can
 * pass the same transport the player uses (the local companion proxy on webOS).
 * Never throws for a bad source: a failure comes back as a result with `ok: false`.
 */
export async function measureStreamSpeed(
  url,
  { request = fetch, signal, budget = SPEED_BUDGET, now = () => Date.now() } = {}
) {
  if (!isMeasurableUrl(url)) {
    return failureResult("not-http");
  }
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  const stop = setTimeout(() => controller.abort(), Math.max(1, Number(budget.timeoutMs) || 8000));
  const started = now();
  try {
    const response = await request(url, {
      headers: speedRequestHeaders(budget),
      signal: controller.signal,
      cache: "no-store"
    });
    const latencyMs = now() - started;
    if (!response || typeof response !== "object") {
      return failureResult("network", latencyMs);
    }
    if (response.status && (response.status < 200 || response.status >= 300)) {
      return failureResult(`http-${response.status}`, latencyMs);
    }
    const reader = response.body?.getReader?.();
    if (!reader) {
      return failureResult("no-body", latencyMs);
    }
    const samples = [];
    let read = 0;
    let measured = 0;
    let measureStart = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      read += value?.byteLength ?? value?.length ?? 0;
      if (read <= budget.warmupBytes) {
        continue;
      }
      if (!measureStart) {
        measureStart = now();
        samples.push({ at: measureStart, bytes: 0 });
      }
      measured = read - budget.warmupBytes;
      samples.push({ at: now(), bytes: measured });
      if (measured >= budget.measureBytes) {
        break;
      }
      if (now() - measureStart >= budget.maxMs && now() - measureStart >= budget.minMs) {
        break;
      }
    }
    try {
      await reader.cancel();
    } catch (_) {
      // The media element owns the socket, not this measurement.
    }
    if (!measured) {
      return failureResult("empty", latencyMs);
    }
    // A body that arrives in one block leaves no window of its own, so the rate is
    // taken over the whole request (latency included) and flagged as approximate.
    const windowMs = Math.max(0, now() - measureStart);
    const approximate = !(windowMs > 0);
    const ms = approximate ? Math.max(1, now() - started) : windowMs;
    return {
      ok: true,
      failure: null,
      bytes: measured,
      ms,
      mbps: mbpsFrom(measured, ms),
      latencyMs,
      subWindows: subWindowRates(samples, budget.subWindowMs),
      approximate
    };
  } catch (error) {
    if (signal?.aborted) {
      throw new DOMException("Cancelado", "AbortError");
    }
    return failureResult(error?.name === "AbortError" ? "timeout" : "network", null);
  } finally {
    clearTimeout(stop);
    signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Measures the given sources with a small bounded pool. Each entry carries its own
 * outcome, so one dead link never hides the others.
 */
export async function measureStreamSpeeds(
  entries,
  {
    request = fetch,
    signal,
    budget = SPEED_BUDGET,
    concurrency = budget.maxConcurrent,
    onResult
  } = {}
) {
  const list = (Array.isArray(entries) ? entries : []).slice(0, budget.maxSources);
  const results = new Map();
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(Number(concurrency) || 1, list.length));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < list.length && !signal?.aborted) {
        const entry = list[cursor++];
        const result = await measureStreamSpeed(entry.url, { request, signal, budget });
        results.set(entry.key, result);
        onResult?.(entry.key, result);
      }
    })
  );
  return results;
}
