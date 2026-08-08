/**
 * blockheader.js
 *
 * The Bitcoin block header is exactly 80 bytes, laid out as:
 *
 *   offset  size  field              endianness
 *   0       4     version            little-endian uint32
 *   4       32    prev block hash    stored internal (already reversed from display order)
 *   36      32    merkle root        stored internal (already reversed from display order)
 *   68      4     timestamp          little-endian uint32
 *   72      4     bits (nBits)       little-endian uint32
 *   76      4     nonce              little-endian uint32
 *
 * WHERE BITCOIN USES LITTLE-ENDIAN, EXPLICITLY:
 * - version, timestamp, bits, and nonce are all serialized little-endian
 *   (least significant byte first) — this is standard Bitcoin protocol
 *   serialization for all fixed-width integers.
 * - prev block hash and merkle root are stored in "internal" byte order,
 *   which is the raw output of SHA256d. What you see printed as a block
 *   hash on any explorer (e.g. starting with lots of zeros) is the
 *   *reverse* of this internal order — display order is a human-readable
 *   convention, not what's actually inside the header bytes.
 *
 * This module only handles serialization/parsing of the 80 bytes. It does
 * NOT hash anything (see sha256d.js) and does NOT do target comparison
 * (see target.js) — kept separate on purpose per the project's
 * architecture requirement.
 */

const HEADER_SIZE = 80;

/**
 * @typedef {Object} BlockHeaderFields
 * @property {number} version
 * @property {Uint8Array} prevBlockHashInternal - 32 bytes, internal order
 * @property {Uint8Array} merkleRootInternal - 32 bytes, internal order
 * @property {number} timestamp - unix seconds
 * @property {number} bits - nBits, packed difficulty representation
 * @property {number} nonce
 */

/**
 * Parses a raw 80-byte header into its fields.
 * @param {Uint8Array} bytes
 * @returns {BlockHeaderFields}
 */
function parseHeader(bytes) {
  if (bytes.length !== HEADER_SIZE) {
    throw new Error(`Block header must be exactly ${HEADER_SIZE} bytes, got ${bytes.length}`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  return {
    version: view.getUint32(0, true),
    prevBlockHashInternal: bytes.slice(4, 36),
    merkleRootInternal: bytes.slice(36, 68),
    timestamp: view.getUint32(68, true),
    bits: view.getUint32(72, true),
    nonce: view.getUint32(76, true)
  };
}

/**
 * Serializes fields back into the raw 80-byte header.
 * @param {BlockHeaderFields} fields
 * @returns {Uint8Array}
 */
function serializeHeader(fields) {
  if (fields.prevBlockHashInternal.length !== 32) {
    throw new Error('prevBlockHashInternal must be 32 bytes');
  }
  if (fields.merkleRootInternal.length !== 32) {
    throw new Error('merkleRootInternal must be 32 bytes');
  }

  const bytes = new Uint8Array(HEADER_SIZE);
  const view = new DataView(bytes.buffer);

  view.setUint32(0, fields.version, true);
  bytes.set(fields.prevBlockHashInternal, 4);
  bytes.set(fields.merkleRootInternal, 36);
  view.setUint32(68, fields.timestamp, true);
  view.setUint32(72, fields.bits, true);
  view.setUint32(76, fields.nonce, true);

  return bytes;
}

/**
 * Convenience: produce a new header byte array with only the nonce changed.
 * Used heavily by the mining loop — avoids rebuilding the whole 80 bytes
 * from scratch on every iteration when only 4 bytes actually change.
 * @param {Uint8Array} headerBytes - existing 80-byte header
 * @param {number} nonce - new nonce value (uint32)
 * @returns {Uint8Array} new 80-byte array, original is not mutated
 */
function withNonce(headerBytes, nonce) {
  const copy = headerBytes.slice();
  const view = new DataView(copy.buffer);
  view.setUint32(76, nonce, true);
  return copy;
}

export { parseHeader, serializeHeader, withNonce, HEADER_SIZE };
