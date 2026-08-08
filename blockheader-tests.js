import { parseHeader, serializeHeader } from './blockheader.js';
import { bitsToTarget, hashMeetsTarget } from './target.js';
import { sha256d, toHex, fromHex } from './sha256d.js';

/**
 * Real Bitcoin genesis block (height 0) — NOT a synthetic vector.
 * Field values cross-verified against 6+ independent public sources
 * (learnmeabitcoin, Blockstream docs, bitcoin.it wiki, Binance Academy),
 * then reconstructed byte-by-byte in Python (hashlib) and confirmed to
 * reproduce the well-known genesis block hash before being copied here.
 */
export const GENESIS_BLOCK = {
  headerHex: '0100000000000000000000000000000000000000000000000000000000000000000000003ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a29ab5f49ffff001d1dac2b7c',
  version: 1,
  prevBlockHashHex: '00'.repeat(32),
  merkleRootInternalHex: '3ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a',
  timestamp: 1231006505,
  bits: 0x1d00ffff,
  nonce: 2083236893,
  blockHashDisplayHex: '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f'
};

export async function runBlockHeaderTests() {
  const results = [];

  // Test 1: parse the raw genesis header hex into fields
  const parsed = parseHeader(fromHex(GENESIS_BLOCK.headerHex));
  results.push({
    label: 'Parse genesis header — version',
    pass: parsed.version === GENESIS_BLOCK.version
  });
  results.push({
    label: 'Parse genesis header — timestamp',
    pass: parsed.timestamp === GENESIS_BLOCK.timestamp
  });
  results.push({
    label: 'Parse genesis header — bits',
    pass: parsed.bits === GENESIS_BLOCK.bits
  });
  results.push({
    label: 'Parse genesis header — nonce',
    pass: parsed.nonce === GENESIS_BLOCK.nonce
  });
  results.push({
    label: 'Parse genesis header — merkle root',
    pass: toHex(parsed.merkleRootInternal) === GENESIS_BLOCK.merkleRootInternalHex
  });

  // Test 2: re-serialize the parsed fields and confirm byte-for-byte match
  const reserialized = serializeHeader(parsed);
  results.push({
    label: 'Re-serialize header matches original bytes',
    pass: toHex(reserialized) === GENESIS_BLOCK.headerHex
  });

  // Test 3: SHA256d of the real genesis header must equal the known genesis block hash
  const digest = await sha256d(fromHex(GENESIS_BLOCK.headerHex));
  const displayHash = toHex(digest.slice().reverse());
  results.push({
    label: 'SHA256d(genesis header) == known genesis block hash',
    pass: displayHash === GENESIS_BLOCK.blockHashDisplayHex
  });

  // Test 4: nBits -> target conversion for genesis difficulty (0x1d00ffff)
  const target = bitsToTarget(GENESIS_BLOCK.bits);
  results.push({
    label: 'bitsToTarget(0x1d00ffff) has correct leading zero bytes',
    pass: target.startsWith('00000000ffff0000')
  });

  // Test 5: the real genesis hash must satisfy hash <= target (it was a valid block)
  results.push({
    label: 'Genesis block hash satisfies its own target',
    pass: hashMeetsTarget(digest, target)
  });

  // Test 6: a hash of all 0xff bytes must NOT satisfy any realistic target
  const impossibleHash = new Uint8Array(32).fill(0xff);
  results.push({
    label: 'All-0xFF hash correctly fails target check',
    pass: !hashMeetsTarget(impossibleHash, target)
  });

  return results;
}
