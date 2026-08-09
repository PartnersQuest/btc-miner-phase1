/**
 * coinbase.js
 *
 * Builds a Bitcoin coinbase transaction: the special first transaction of
 * every block, which has no real input (it creates new coins) and pays
 * the block subsidy + fees to whoever mined the block.
 *
 * SECURITY NOTE: this only ever needs a scriptPubKey derived from a
 * PUBLIC address (see address.js). No private key, seed phrase, or
 * signature is involved anywhere in this file — coinbase inputs are
 * never signed, by protocol design.
 */

import { sha256d } from './sha256d.js';
import { addressToScriptPubKey } from './address.js';

function uint32LE(n) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
}

function uint64LE(n) {
  // n is a BigInt of satoshis
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, n, true);
  return b;
}

function varInt(n) {
  if (n < 0xfd) return new Uint8Array([n]);
  if (n <= 0xffff) {
    const b = new Uint8Array(3);
    b[0] = 0xfd;
    new DataView(b.buffer).setUint16(1, n, true);
    return b;
  }
  throw new Error('varInt > 0xffff not needed for this project scope');
}

function concatBytes(...arrays) {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

/**
 * BIP34: the block height must be pushed as the first item of the
 * coinbase scriptSig, minimally encoded (script-style push of a
 * little-endian integer).
 * @param {number} height
 * @returns {Uint8Array}
 */
function encodeHeightForScriptSig(height) {
  if (height === 0) return new Uint8Array([0x01, 0x00]); // OP_PUSH1 0x00 — genesis-style edge case, unused on mainnet post-BIP34
  const bytes = [];
  let n = height;
  while (n > 0) {
    bytes.push(n & 0xff);
    n = Math.floor(n / 256);
  }
  // if high bit of last byte is set, add a zero byte so it isn't read as negative
  if (bytes[bytes.length - 1] & 0x80) bytes.push(0x00);
  return new Uint8Array([bytes.length, ...bytes]);
}

/**
 * @param {Object} params
 * @param {number} params.blockHeight - BIP34 height to encode in scriptSig
 * @param {bigint} params.rewardSatoshis - block subsidy + fees, in satoshis
 * @param {string} params.payoutAddress - bech32 address (public only)
 * @param {string} [params.extraData] - free-text tag included in scriptSig (like the genesis newspaper headline), ASCII only
 * @param {number} [params.extranonce=0] - extra search space beyond the header's 32-bit nonce
 * @returns {Promise<{ txBytes: Uint8Array, txidInternal: Uint8Array, txidDisplayHex: string }>}
 */
async function buildCoinbaseTransaction({
  blockHeight,
  rewardSatoshis,
  payoutAddress,
  extraData = 'BitcoinMinerPWA/Phase7',
  extranonce = 0
}) {
  const version = uint32LE(1);

  // --- input (the only input, the "coinbase") ---
  const inputCount = varInt(1);
  const prevoutHash = new Uint8Array(32); // all zero — no real previous output
  const prevoutIndex = new Uint8Array([0xff, 0xff, 0xff, 0xff]);

  const heightPush = encodeHeightForScriptSig(blockHeight);
  const extraBytes = new TextEncoder().encode(extraData);
  const extranonceBytes = uint32LE(extranonce >>> 0);

  const scriptSig = concatBytes(
    heightPush,
    new Uint8Array([extraBytes.length]),
    extraBytes,
    new Uint8Array([extranonceBytes.length]),
    extranonceBytes
  );

  if (scriptSig.length > 100) {
    throw new Error(`coinbase scriptSig too long: ${scriptSig.length} bytes (consensus max 100)`);
  }

  const scriptSigLen = varInt(scriptSig.length);
  const sequence = new Uint8Array([0xff, 0xff, 0xff, 0xff]);

  // --- output (pays the miner) ---
  const outputCount = varInt(1);
  const scriptPubKey = addressToScriptPubKey(payoutAddress);
  const scriptPubKeyLen = varInt(scriptPubKey.length);
  const value = uint64LE(rewardSatoshis);

  const locktime = uint32LE(0);

  const txBytes = concatBytes(
    version,
    inputCount,
    prevoutHash,
    prevoutIndex,
    scriptSigLen,
    scriptSig,
    sequence,
    outputCount,
    value,
    scriptPubKeyLen,
    scriptPubKey,
    locktime
  );

  const txidInternal = await sha256d(txBytes);
  const txidDisplayHex = Array.from(txidInternal.slice().reverse())
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return { txBytes, txidInternal, txidDisplayHex, scriptPubKeyHex: Array.from(scriptPubKey).map(b=>b.toString(16).padStart(2,'0')).join('') };
}

export { buildCoinbaseTransaction, encodeHeightForScriptSig };
