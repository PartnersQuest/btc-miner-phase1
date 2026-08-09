/**
 * blocktemplate.js
 *
 * Assembles everything needed to mine a block: coinbase transaction,
 * Merkle root, and header fields ready for the nonce search.
 *
 * IMPORTANT — DATA SOURCE:
 * There is no Bitcoin node relay wired up yet (that's the next piece of
 * infrastructure, tracked separately). So `previousBlockHashHex` and
 * `height` here are TEST/REGTEST-STYLE VALUES you provide — this module
 * does not fabricate a fake connection to mainnet, and nothing produced
 * here is claimed to be minable against the real network until a real
 * relay supplies a real current tip + real mempool transactions.
 * This mirrors exactly what a `getblocktemplate` RPC response would give
 * you, just filled in manually for now instead of over the wire.
 */

import { computeMerkleRoot } from './merkletree.js';
import { buildCoinbaseTransaction } from './coinbase.js';

/**
 * @param {Object} params
 * @param {string} params.previousBlockHashDisplayHex - 64-char hex, DISPLAY order (as shown by any explorer)
 * @param {number} params.height
 * @param {bigint} params.rewardSatoshis
 * @param {string} params.payoutAddress
 * @param {string} params.targetHex - 64-char hex target this template must satisfy
 * @param {number} [params.extranonce=0]
 * @returns {Promise<Object>} template with header fields ready for mining
 */
async function buildBlockTemplate({
  previousBlockHashDisplayHex,
  height,
  rewardSatoshis,
  payoutAddress,
  targetHex,
  extranonce = 0
}) {
  if (!/^[0-9a-f]{64}$/.test(previousBlockHashDisplayHex)) {
    throw new Error('previousBlockHashDisplayHex must be 64 lowercase hex chars');
  }

  // Convert previous-block-hash from display order to internal order for the header.
  const prevHashBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    prevHashBytes[i] = parseInt(previousBlockHashDisplayHex.substr(i * 2, 2), 16);
  }
  const prevBlockHashInternal = prevHashBytes.slice().reverse();

  const coinbase = await buildCoinbaseTransaction({
    blockHeight: height,
    rewardSatoshis,
    payoutAddress,
    extranonce
  });

  // Single-transaction block for now (coinbase only) — Merkle root == coinbase txid.
  const merkleRootInternal = await computeMerkleRoot([coinbase.txidInternal]);

  return {
    version: 1,
    prevBlockHashInternal,
    merkleRootInternal,
    timestamp: Math.floor(Date.now() / 1000),
    targetHex,
    height,
    coinbase,
    transactionCount: 1
  };
}

export { buildBlockTemplate };
