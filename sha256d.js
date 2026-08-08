/**
 * sha256d.js
 *
 * SHA256d = SHA256(SHA256(data)), exactly as used throughout the Bitcoin
 * protocol (block header hashing, txid, Merkle tree).
 *
 * This module is intentionally standalone and has zero dependency on the UI
 * or the benchmark logic, so it can be reused unchanged later for the real
 * mining loop (header construction, nonce search, target comparison).
 *
 * Uses the native Web Crypto API (crypto.subtle), which is:
 * - available in Safari on iOS (since iOS 11)
 * - hardware-backed where the platform supports it
 * - the correct, real SHA-256 implementation (not a hand-rolled JS one)
 *
 * It is asynchronous by nature (Promise-based) because Web Crypto never
 * exposes a synchronous API — this is a real constraint of the browser
 * platform, not a design choice.
 */

/**
 * @param {Uint8Array} bytes
 * @returns {Promise<Uint8Array>} 32-byte SHA256d digest, natural byte order
 */
async function sha256d(bytes) {
  const first = await crypto.subtle.digest('SHA-256', bytes);
  const second = await crypto.subtle.digest('SHA-256', first);
  return new Uint8Array(second);
}

/**
 * @param {Uint8Array} bytes
 * @returns {string} lowercase hex string
 */
function toHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * @param {string} hex
 * @returns {Uint8Array}
 */
function fromHex(hex) {
  if (hex.length % 2 !== 0) throw new Error('hex string must have even length');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

// Exposed both as ES module exports (for the worker, which uses type: module)
// and as globals (for plain <script> usage in index.html without a bundler).
export { sha256d, toHex, fromHex };
