// Fork custom playback buffer (ysosrs123/NuvioTV-Fork: PlayerSettingsDataStore
// .BufferSettings). Android's ExoPlayer exposes bufferForPlaybackMs and
// bufferForPlaybackAfterRebufferMs; the TV runtimes here have no such API, so
// the same preference is honoured the way the fork's webOS port did it: hold
// playback until the media element has buffered the configured amount of
// seconds ahead of the playhead, with a bounded wait so a slow source still
// starts instead of sitting on a black screen.
//
// This module is pure on purpose (no PlayerSettingsStore, no media element), so
// the numbers and the wait loop can be reasoned about and tested on their own.

export const BUFFER_SECONDS_MIN = 0;
export const BUFFER_SECONDS_MAX = 20;
export const BUFFER_INITIAL_SECONDS_DEFAULT = 5;
export const BUFFER_AFTER_REBUFFER_SECONDS_DEFAULT = 3;
export const BUFFER_WAIT_TIMEOUT_SECONDS_MIN = 5;
export const BUFFER_WAIT_TIMEOUT_SECONDS_MAX = 60;
export const BUFFER_WAIT_TIMEOUT_SECONDS_DEFAULT = 20;
export const BUFFER_GATE_POLL_INTERVAL_MS = 150;
// A source that returns one block at a time never grows the buffered range in
// the middle of a poll; require a small tolerance before resuming.
const BUFFER_READY_EPSILON_SECONDS = 0.05;

export function normalizeBufferSeconds(value, fallback = BUFFER_INITIAL_SECONDS_DEFAULT) {
  const seconds = Math.round(Number(value));
  if (!Number.isFinite(seconds)) {
    return fallback;
  }
  return Math.min(BUFFER_SECONDS_MAX, Math.max(BUFFER_SECONDS_MIN, seconds));
}

export function normalizeBufferWaitTimeoutSeconds(
  value,
  fallback = BUFFER_WAIT_TIMEOUT_SECONDS_DEFAULT
) {
  const seconds = Math.round(Number(value));
  if (!Number.isFinite(seconds)) {
    return fallback;
  }
  return Math.min(
    BUFFER_WAIT_TIMEOUT_SECONDS_MAX,
    Math.max(BUFFER_WAIT_TIMEOUT_SECONDS_MIN, seconds)
  );
}

// Seconds to load before playback begins. Zero means "leave the runtime alone",
// which is the Android behaviour when the custom switch is off.
export function startupBufferTargetSeconds(settings = {}) {
  if (!settings?.customBufferEnabled) {
    return 0;
  }
  return normalizeBufferSeconds(settings.bufferInitialSeconds, BUFFER_INITIAL_SECONDS_DEFAULT);
}

// Seconds to hold after a stall before resuming.
export function rebufferBufferTargetSeconds(settings = {}) {
  if (!settings?.customBufferEnabled) {
    return 0;
  }
  return normalizeBufferSeconds(
    settings.bufferAfterRebufferSeconds,
    BUFFER_AFTER_REBUFFER_SECONDS_DEFAULT
  );
}

export function bufferWaitTimeoutSeconds(settings = {}) {
  return normalizeBufferWaitTimeoutSeconds(settings?.bufferWaitTimeoutSeconds);
}

// TimeRanges from the media element, or plain [start, end] pairs in tests.
export function bufferedRanges(ranges) {
  const list = [];
  const length = Number.isFinite(ranges?.length) ? Number(ranges.length) : 0;
  const hasMethods = typeof ranges?.start === "function" && typeof ranges?.end === "function";
  for (let index = 0; index < length; index++) {
    const pair = ranges?.[index];
    const paired = Boolean(pair) && typeof pair.length === "number";
    const start = Number(paired ? pair[0] : hasMethods ? ranges.start(index) : NaN);
    const end = Number(paired ? pair[1] : hasMethods ? ranges.end(index) : NaN);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      list.push({ start, end });
    }
  }
  return list;
}

// Seconds of contiguous media already loaded from the current position. A gap
// stops the count, which is what "buffer" means for the viewer.
export function bufferedAheadSeconds(ranges, position) {
  if (!Number.isFinite(Number(position))) {
    return 0;
  }
  const currentPosition = Number(position);
  const covering = bufferedRanges(ranges).find(
    (range) =>
      range.start <= currentPosition + BUFFER_READY_EPSILON_SECONDS && range.end > currentPosition
  );
  return covering ? Math.max(0, covering.end - currentPosition) : 0;
}

export function shouldHoldPlaybackForBuffer({ targetSeconds = 0, bufferedAhead = 0 } = {}) {
  const target = Number(targetSeconds);
  if (!Number.isFinite(target) || target <= 0) {
    return false;
  }
  return Number(bufferedAhead) + BUFFER_READY_EPSILON_SECONDS < target;
}

const defaultSleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, Number(ms) || 0));
  });

/**
 * Polls the buffer until the target is reached or the wait budget expires.
 * Never throws: 'timeout' is a normal outcome and means playback proceeds with
 * whatever the source managed to buffer.
 */
export async function waitForPlaybackBuffer({
  targetSeconds = 0,
  readBufferedAhead,
  timeoutSeconds = BUFFER_WAIT_TIMEOUT_SECONDS_DEFAULT,
  pollIntervalMs = BUFFER_GATE_POLL_INTERVAL_MS,
  isCancelled = null,
  now = () => Date.now(),
  sleep = defaultSleep
} = {}) {
  const target = Number(targetSeconds);
  if (!Number.isFinite(target) || target <= 0) {
    return "disabled";
  }
  if (typeof readBufferedAhead !== "function") {
    return "disabled";
  }
  const deadline = now() + Math.max(0, Number(timeoutSeconds) || 0) * 1000;
  for (;;) {
    if (typeof isCancelled === "function" && isCancelled()) {
      return "cancelled";
    }
    const bufferedAhead = Number(readBufferedAhead()) || 0;
    if (!shouldHoldPlaybackForBuffer({ targetSeconds: target, bufferedAhead })) {
      return "ready";
    }
    if (now() >= deadline) {
      return "timeout";
    }
    await sleep(pollIntervalMs);
  }
}
