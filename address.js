/**
 * address.js
 *
 * Decodes a Bitcoin SegWit address (bech32, BIP-173) into its witness
 * version and witness program, then builds the corresponding
 * scriptPubKey. This is a READ-ONLY, one-way operation on a PUBLIC
 * address — it never touches, derives, or needs a private key.
 *
 * Algorithm implemented exactly per BIP-173 (bech32) — reference values
 * cross-checked against Python's `bech32` reference library before
 * being wired into this project (see conversation).
 */

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values) {
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((top >>> i) & 1) {
        chk ^= GENERATOR[i];
      }
    }
  }
  return chk >>> 0;
}

function hrpExpand(hrp) {
  const result = [];
  for (const c of hrp) result.push(c.charCodeAt(0) >>> 5);
  result.push(0);
  for (const c of hrp) result.push(c.charCodeAt(0) & 31);
  return result;
}

function verifyChecksum(hrp, data) {
  const combined = hrpExpand(hrp).concat(data);
  const checksum = polymod(combined);
  // bech32 const = 1, bech32m const = 0x2bc830a3 (BIP-350)
  if (checksum === 1) return 'bech32';
  if (checksum === 0x2bc830a3) return 'bech32m';
  return null;
}

/**
 * @param {string} address - e.g. "bc1qtqukcc9jhqcug77k4pd52dmkn30y08jgmvzjnl"
 * @returns {{ hrp: string, witnessVersion: number, witnessProgram: Uint8Array, encoding: string }}
 */
function decodeSegwitAddress(address) {
  const lower = address.toLowerCase();
  if (address !== lower && address !== address.toUpperCase()) {
    throw new Error('Mixed-case bech32 address is invalid');
  }

  const sepIndex = lower.lastIndexOf('1');
  if (sepIndex < 1 || sepIndex + 7 > lower.length) {
    throw new Error('Invalid bech32 address format');
  }

  const hrp = lower.slice(0, sepIndex);
  const dataPart = lower.slice(sepIndex + 1);

  const data = [];
  for (const c of dataPart) {
    const idx = CHARSET.indexOf(c);
    if (idx === -1) throw new Error(`Invalid bech32 character: ${c}`);
    data.push(idx);
  }

  const encoding = verifyChecksum(hrp, data);
  if (!encoding) throw new Error('Invalid bech32 checksum');

  const witnessVersion = data[0];
  const programWords = data.slice(1, data.length - 6); // strip version + 6-word checksum

  // Expected encoding per BIP-350: v0 = bech32, v1+ = bech32m
  if (witnessVersion === 0 && encoding !== 'bech32') {
    throw new Error('Witness v0 address must use bech32, not bech32m');
  }
  if (witnessVersion !== 0 && encoding !== 'bech32m') {
    throw new Error('Witness v1+ address must use bech32m, not bech32');
  }

  const witnessProgram = convertBits(programWords, 5, 8, false);
  if (!witnessProgram) throw new Error('Failed to convert witness program bits');
  if (witnessVersion === 0 && witnessProgram.length !== 20 && witnessProgram.length !== 32) {
    throw new Error('Witness v0 program must be 20 bytes (P2WPKH) or 32 bytes (P2WSH)');
  }

  return { hrp, witnessVersion, witnessProgram: new Uint8Array(witnessProgram), encoding };
}

/**
 * Converts an array of words from one bit-width to another (used to go
 * from 5-bit bech32 words to 8-bit bytes).
 */
function convertBits(data, fromBits, toBits, pad) {
  let acc = 0;
  let bits = 0;
  const result = [];
  const maxv = (1 << toBits) - 1;
  for (const value of data) {
    if (value < 0 || value >>> fromBits !== 0) return null;
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      result.push((acc >>> bits) & maxv);
    }
  }
  if (pad) {
    if (bits > 0) result.push((acc << (toBits - bits)) & maxv);
  } else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv) !== 0) {
    return null;
  }
  return result;
}

/**
 * Builds the scriptPubKey bytes for a decoded SegWit address.
 * v0, 20-byte program (P2WPKH): OP_0 <20 bytes>  ->  0x00 0x14 <program>
 * v0, 32-byte program (P2WSH):  OP_0 <32 bytes>  ->  0x00 0x20 <program>
 * v1, 32-byte program (P2TR):   OP_1 <32 bytes>  ->  0x51 0x20 <program>
 *
 * @param {string} address
 * @returns {Uint8Array} scriptPubKey
 */
function addressToScriptPubKey(address) {
  const { witnessVersion, witnessProgram } = decodeSegwitAddress(address);
  const opcode = witnessVersion === 0 ? 0x00 : 0x50 + witnessVersion; // OP_0=0x00, OP_1=0x51, etc.
  const script = new Uint8Array(2 + witnessProgram.length);
  script[0] = opcode;
  script[1] = witnessProgram.length;
  script.set(witnessProgram, 2);
  return script;
}

export { decodeSegwitAddress, addressToScriptPubKey, convertBits };
