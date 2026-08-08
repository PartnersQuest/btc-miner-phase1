/**
 * target.js
 *
 * Converts Bitcoin's compact "nBits" difficulty representation into a full
 * 256-bit target, and compares candidate hashes against it. This is the
 * actual Proof of Work check: a block is valid only if
 *
 *   SHA256d(header) <= target
 *
 * when both are interpreted as big numbers.
 *
 * nBits encoding: a 4-byte "compact" float-like format.
 *   byte 0       = exponent
 *   bytes 1-3    = mantissa (big-endian within the 3 bytes)
 *
 *   if exponent <= 3:
 *     target = mantissa >> (8 * (3 - exponent))
 *   else:
 *     target = mantissa << (8 * (exponent - 3))
 *
 * This mirrors Bitcoin Core's arith_uint256::SetCompact exactly (aside
 * from Core's additional sign-bit / overflow guards, which don't apply to
 * any real-world nBits value found on mainnet).
 */

/**
 * @param {number} bits - nBits as a uint32
 * @returns {string} target as a 64-character lowercase hex string (32 bytes, big-endian / display order)
 */
function bitsToTarget(bits) {
  const exponent = bits >>> 24;
  const mantissa = bits & 0x007fffff; // Core masks off the sign bit (bit 23); real nBits never sets it
  const signBit = (bits & 0x00800000) !== 0;

  if (signBit) {
    // Would represent a negative number — never valid for a real target.
    throw new Error('Invalid nBits: sign bit set');
  }

  let target = BigInt(mantissa);
  if (exponent <= 3) {
    target = target >> BigInt(8 * (3 - exponent));
  } else {
    target = target << BigInt(8 * (exponent - 3));
  }

  return target.toString(16).padStart(64, '0');
}

/**
 * @param {Uint8Array} digest - 32-byte SHA256d output, INTERNAL byte order
 *   (i.e. straight out of sha256d.js, not yet reversed for display)
 * @param {string} targetHex - 64-char hex target (big-endian / display order,
 *   as returned by bitsToTarget)
 * @returns {boolean} true if the hash satisfies the target (hash <= target)
 */
function hashMeetsTarget(digest, targetHex) {
  // The digest is internal order; the conventional "block hash" used for
  // comparison against the target is the reversed (display order) form.
  const displayBytes = digest.slice().reverse();
  let hashValue = 0n;
  for (const byte of displayBytes) {
    hashValue = (hashValue << 8n) | BigInt(byte);
  }
  const targetValue = BigInt('0x' + targetHex);
  return hashValue <= targetValue;
}

/**
 * @param {number} bits - nBits
 * @returns {number} approximate difficulty relative to the minimum-difficulty target (genesis, 0x1d00ffff)
 */
function bitsToDifficulty(bits) {
  const maxTargetHex = bitsToTarget(0x1d00ffff);
  const currentTargetHex = bitsToTarget(bits);
  const maxTarget = BigInt('0x' + maxTargetHex);
  const currentTarget = BigInt('0x' + currentTargetHex);
  // Difficulty as a float — fine for display purposes, not used in any
  // consensus-critical comparison (hashMeetsTarget above is exact BigInt math).
  return Number(maxTarget / currentTarget) + Number(maxTarget % currentTarget) / Number(currentTarget);
}

export { bitsToTarget, hashMeetsTarget, bitsToDifficulty };
