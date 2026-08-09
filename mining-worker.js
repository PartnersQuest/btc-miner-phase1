/**
 * mining-worker.js
 *
 * The actual Proof-of-Work search loop. Each worker instance is given a
 * disjoint nonce range so multiple workers never duplicate work. This is
 * real SHA256d + real target comparison on every single iteration — no
 * shortcuts, no simulated "found" state.
 */

import { sha256d } from './sha256d.js';
import { serializeHeader, withNonce } from './blockheader.js';
import { hashMeetsTarget } from './target.js';

let stopRequested = false;

self.onmessage = async (event) => {
  const { type } = event.data;
  if (type === 'start') {
    stopRequested = false;
    await mine(event.data);
  } else if (type === 'stop') {
    stopRequested = true;
  }
};

async function mine({ workerId, headerFields, targetHex, nonceStart, nonceEnd }) {
  const baseHeader = serializeHeader(headerFields);
  let hashCount = 0;
  let nonce = nonceStart;
  let lastReport = performance.now();
  const REPORT_INTERVAL_MS = 300;

  while (!stopRequested && nonce <= nonceEnd) {
    const headerWithNonce = withNonce(baseHeader, nonce >>> 0);
    const digest = await sha256d(headerWithNonce);

    hashCount++;

    if (hashMeetsTarget(digest, targetHex)) {
      // Real hit — report it and stop this worker. The main thread is
      // responsible for independently re-verifying before declaring
      // "BLOCK FOUND" (see block-validator.js) — this worker does not
      // get to make that call unilaterally.
      self.postMessage({
        type: 'found',
        workerId,
        nonce: nonce >>> 0,
        headerHex: Array.from(headerWithNonce).map((b) => b.toString(16).padStart(2, '0')).join(''),
        digestHex: Array.from(digest).map((b) => b.toString(16).padStart(2, '0')).join(''),
        hashCount
      });
      return;
    }

    nonce++;

    const now = performance.now();
    if (now - lastReport >= REPORT_INTERVAL_MS) {
      self.postMessage({ type: 'progress', workerId, hashCount });
      lastReport = now;
    }
  }

  self.postMessage({ type: 'exhausted', workerId, hashCount });
}
