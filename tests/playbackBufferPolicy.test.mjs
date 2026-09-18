import assert from "node:assert/strict";
import test from "node:test";

import {
  BUFFER_INITIAL_SECONDS_DEFAULT,
  BUFFER_WAIT_TIMEOUT_SECONDS_DEFAULT,
  bufferedAheadSeconds,
  normalizeBufferSeconds,
  normalizeBufferWaitTimeoutSeconds,
  rebufferBufferTargetSeconds,
  shouldHoldPlaybackForBuffer,
  startupBufferTargetSeconds,
  waitForPlaybackBuffer
} from "../js/core/player/playbackBufferPolicy.js";

test("buffer targets stay off until the custom switch is on", () => {
  assert.equal(startupBufferTargetSeconds({ customBufferEnabled: false }), 0);
  assert.equal(rebufferBufferTargetSeconds({ customBufferEnabled: false }), 0);
  assert.equal(
    startupBufferTargetSeconds({ customBufferEnabled: true, bufferInitialSeconds: 8 }),
    8
  );
  assert.equal(
    rebufferBufferTargetSeconds({ customBufferEnabled: true, bufferAfterRebufferSeconds: 4 }),
    4
  );
});

test("seconds are clamped to the fork's 0-20 range", () => {
  assert.equal(normalizeBufferSeconds(99), 20);
  assert.equal(normalizeBufferSeconds(-5), 0);
  assert.equal(normalizeBufferSeconds("3"), 3);
  assert.equal(normalizeBufferSeconds(undefined), BUFFER_INITIAL_SECONDS_DEFAULT);
  assert.equal(normalizeBufferWaitTimeoutSeconds(600), 60);
  assert.equal(normalizeBufferWaitTimeoutSeconds(1), 5);
  assert.equal(normalizeBufferWaitTimeoutSeconds(undefined), BUFFER_WAIT_TIMEOUT_SECONDS_DEFAULT);
});

test("bufferedAheadSeconds counts contiguous media from the playhead", () => {
  // Two ranges with a gap: only the covering range counts.
  assert.equal(bufferedAheadSeconds([[0, 30], [60, 90]], 10), 20);
  assert.equal(bufferedAheadSeconds([[0, 30]], 35), 0);
  // A TimeRanges-like object is accepted as well.
  const ranges = { length: 1, start: () => 0, end: () => 12 };
  assert.equal(bufferedAheadSeconds(ranges, 2), 10);
  assert.equal(bufferedAheadSeconds(null, 2), 0);
  assert.equal(bufferedAheadSeconds([[0, 30]], Number.NaN), 0);
});

test("shouldHoldPlaybackForBuffer only holds below the target", () => {
  assert.equal(shouldHoldPlaybackForBuffer({ targetSeconds: 5, bufferedAhead: 1 }), true);
  assert.equal(shouldHoldPlaybackForBuffer({ targetSeconds: 5, bufferedAhead: 5 }), false);
  assert.equal(shouldHoldPlaybackForBuffer({ targetSeconds: 0, bufferedAhead: 0 }), false);
});

test("waitForPlaybackBuffer returns ready once the target is buffered", async () => {
  let buffered = 0;
  const outcome = await waitForPlaybackBuffer({
    targetSeconds: 3,
    readBufferedAhead: () => buffered,
    timeoutSeconds: 10,
    sleep: async () => {
      buffered += 2;
    }
  });
  assert.equal(outcome, "ready");
});

test("waitForPlaybackBuffer gives up at the wait limit", async () => {
  let elapsedMs = 0;
  const outcome = await waitForPlaybackBuffer({
    targetSeconds: 5,
    readBufferedAhead: () => 0.5,
    timeoutSeconds: 2,
    now: () => elapsedMs,
    sleep: async () => {
      elapsedMs += 500;
    }
  });
  assert.equal(outcome, "timeout");
});

test("waitForPlaybackBuffer is skipped when the feature is off", async () => {
  assert.equal(
    await waitForPlaybackBuffer({ targetSeconds: 0, readBufferedAhead: () => 0 }),
    "disabled"
  );
  assert.equal(await waitForPlaybackBuffer({ targetSeconds: 5 }), "disabled");
});

test("waitForPlaybackBuffer stops when playback is cancelled", async () => {
  let cancelled = false;
  const outcome = await waitForPlaybackBuffer({
    targetSeconds: 5,
    readBufferedAhead: () => 0,
    timeoutSeconds: 60,
    isCancelled: () => cancelled,
    sleep: async () => {
      cancelled = true;
    }
  });
  assert.equal(outcome, "cancelled");
});
