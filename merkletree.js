/**
 * merkletree.js
 *
 * Builds a Bitcoin-style Merkle root from a list of transaction hashes
 * (txids), all in internal byte order (i.e. raw SHA256d output, same
 * order used inside the coinbase/block header — NOT the reversed
 * "display" order shown by explorers).
 *
 * Bitcoin's odd-count rule: if a level has an odd number of nodes, the
 * last node is duplicated before pairing. This is the real consensus
 * rule (also the source of the historical CVE-2012-2459 duplicate-tx
 * malleability issue) — implemented here exactly as Bitcoin Core does it,
 * not "fixed", because a locally-computed merkle root must match what
 * the network actually considers valid.
 */

import { sha256d } from './sha256d.js';

/**
 * @param {Uint8Array[]} txHashesInternal - list of txids, internal order, at least 1 element
 * @returns {Promise<Uint8Array>} 32-byte merkle root, internal order
 */
async function computeMerkleRoot(txHashesInternal) {
  if (txHashesInternal.length === 0) {
    throw new Error('Cannot compute a Merkle root over zero transactions');
  }

  let level = txHashesInternal.slice();

  while (level.length > 1) {
    if (level.length % 2 === 1) {
      level.push(level[level.length - 1]); // duplicate last node — real Bitcoin rule
    }
    const nextLevel = [];
    for (let i = 0; i < level.length; i += 2) {
      const combined = new Uint8Array(64);
      combined.set(level[i], 0);
      combined.set(level[i + 1], 32);
      nextLevel.push(await sha256d(combined));
    }
    level = nextLevel;
  }

  return level[0];
}

export { computeMerkleRoot };
