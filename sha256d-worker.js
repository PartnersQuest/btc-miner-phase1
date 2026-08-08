/**
 * sha256d-worker.js
 *
 * Runs in a dedicated Web Worker thread. This is what actually performs
 * the SHA256d calls during the benchmark, off the main UI thread.
 *
 * iOS Safari note (see README section "Limitations iOS" for the full
 * explanation): Web Workers ARE supported in Safari on iOS and DO run on
 * a separate thread, so spawning one worker per CPU core is a real,
 * measurable way to use more of the device's compute. What Safari does
 * NOT allow is a worker continuing to run once the tab is backgrounded,
 * the screen is locked, or the app is fully closed — even as a PWA added
 * to the home screen. The moment Safari suspends the tab, the worker's
 * execution is paused by the OS/browser, not by this code.
 */

import { sha256d, toHex } from './sha256d.js';

let running = false;

self.onmessage = async (event) => {
  const { type } = event.data;

  if (type === 'start') {
    running = true;
    await runLoop(event.data.workerId);
  } else if (type === 'stop') {
    running = false;
  }
};

async function runLoop(workerId) {
  let counter = 0n; // BigInt, so it never wraps during a realistic benchmark run
  let hashCount = 0;
  let bestHashHex = null;
  let bestHashValue = null; // first 8 bytes as BigInt, smaller = "better" for display purposes only
  let lastReportTime = performance.now();

  const REPORT_INTERVAL_MS = 500; // how often we post progress back to the main thread

  while (running) {
    // Build a varying 80-byte-like input so every hash call is on genuinely
    // different data (mirrors how the real header nonce field will vary).
    const buffer = new Uint8Array(80);
    const counterBytes = new DataView(buffer.buffer);
    counterBytes.setBigUint64(0, counter, true);
    counterBytes.setUint32(72, workerId, true);

    const digest = await sha256d(buffer);
    hashCount++;
    counter++;

    // Track "best" hash purely as a UI/motivational stat — this is NOT a
    // real difficulty/target comparison yet, that's Phase 3.
    const leading8 = new DataView(digest.buffer).getBigUint64(0, false);
    if (bestHashValue === null || leading8 < bestHashValue) {
      bestHashValue = leading8;
      bestHashHex = toHex(digest);
    }

    const now = performance.now();
    if (now - lastReportTime >= REPORT_INTERVAL_MS) {
      self.postMessage({
        type: 'progress',
        workerId,
        hashCount,
        bestHashHex
      });
      lastReportTime = now;
    }
  }

  // final report on stop
  self.postMessage({
    type: 'progress',
    workerId,
    hashCount,
    bestHashHex
  });
}
