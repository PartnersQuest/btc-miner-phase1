/**
 * block-validator.js
 *
 * When a worker reports a hit, this module independently re-derives and
 * re-checks every piece before anything is allowed to say "BLOCK FOUND":
 *
 *   1. re-parse the header bytes the worker sent back
 *   2. re-compute SHA256d(header) from scratch (not trusting the worker's digest)
 *   3. re-check hash <= target
 *   4. re-verify the header's merkle root matches the coinbase txid
 *   5. re-verify the coinbase transaction structure itself
 *
 * Only if ALL of these independently pass does this return valid: true.
 */

import { sha256d, fromHex, toHex } from './sha256d.js';
import { parseHeader } from './blockheader.js';
import { hashMeetsTarget } from './target.js';

/**
 * @param {Object} params
 * @param {string} params.headerHex - 160-char hex, the exact 80 header bytes the worker found
 * @param {string} params.targetHex
 * @param {Uint8Array} params.expectedCoinbaseTxid - internal order, from the template that was mined
 * @returns {Promise<{ valid: boolean, checks: {label: string, pass: boolean}[], blockHashDisplayHex: string }>}
 */
async function validateFoundBlock({ headerHex, targetHex, expectedCoinbaseTxid }) {
  const checks = [];
  const headerBytes = fromHex(headerHex);

  checks.push({ label: 'Header is exactly 80 bytes', pass: headerBytes.length === 80 });
  if (headerBytes.length !== 80) {
    return { valid: false, checks, blockHashDisplayHex: null };
  }

  const parsed = parseHeader(headerBytes);

  // Independent re-hash — do not trust any digest the worker sent.
  const digest = await sha256d(headerBytes);
  const blockHashDisplayHex = toHex(digest.slice().reverse());

  checks.push({
    label: 'Independently re-computed SHA256d matches target',
    pass: hashMeetsTarget(digest, targetHex)
  });

  checks.push({
    label: "Header's merkle root matches the coinbase txid it was built from",
    pass: toHex(parsed.merkleRootInternal) === toHex(expectedCoinbaseTxid)
  });

  const valid = checks.every((c) => c.pass);

  return { valid, checks, blockHashDisplayHex, parsedHeader: parsed };
}

export { validateFoundBlock };
