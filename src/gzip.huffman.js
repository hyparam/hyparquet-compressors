// Adapted from https://github.com/101arrowz/fflate Copyright (c) 2023 Arjun Barrett
// https://tools.ietf.org/html/rfc1951

/* Maximum possible Huffman table size for an alphabet size of 704, max code
 * length 15 and root table bits 8. */
export const HUFFMAN_MAX_TABLE_SIZE = 1080

// fixed length extra bits
export const fixedLengthExtraBits = new Uint8Array([
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0, /* unused */ 0, 0, /* impossible */ 0,
])
export const fixedDistanceExtraBits = new Uint8Array([
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, /* unused */ 0, 0,
])

/**
 * get base, reverse index map from extra bits
 * @param {Uint8Array} eb
 * @param {number} start
 * @returns {{base: Uint16Array, rev: Int32Array}}
 */
function freb(eb, start) {
  const base = new Uint16Array(31)
  for (let i = 0; i < 31; i++) {
    base[i] = start += 1 << eb[i - 1]
  }
  // numbers here are max 18 bits
  const rev = new Int32Array(base[30])
  for (let i = 1; i < 30; i++) {
    for (let j = base[i]; j < base[i + 1]; ++j) {
      rev[j] = j - base[i] << 5 | i
    }
  }
  return { base, rev }
}

const { base: fixedLength, rev: revfl } = freb(fixedLengthExtraBits, 2)
// we can ignore the fact that the other numbers are wrong; they never happen anyway
fixedLength[28] = 258
revfl[258] = 28
const { base: fixedDistance } = freb(fixedDistanceExtraBits, 0)

// map of value to reverse (assuming 16 bits)
const rev = new Uint16Array(32768)
for (let i = 0; i < 32768; i++) {
  // reverse table algorithm from SO
  let x = (i & 0xAAAA) >> 1 | (i & 0x5555) << 1
  x = (x & 0xCCCC) >> 2 | (x & 0x3333) << 2
  x = (x & 0xF0F0) >> 4 | (x & 0x0F0F) << 4
  rev[i] = ((x & 0xFF00) >> 8 | (x & 0x00FF) << 8) >> 1
}

/**
 * create huffman tree from Uint8Array "map": index -> code length for code index
 * maxBits must be at most 15
 * @param {Uint8Array} cd
 * @param {number} maxBits
 * @param {0 | 1} r
 * @returns {Uint16Array}
 */
export function huffMap(cd, maxBits, r) {
  // u16 "map": index -> # of codes with bit length = index
  const l = new Uint16Array(maxBits)
  // length of cd must be 288 (total # of codes)
  for (let i = 0; i < cd.length; i++) {
    if (cd[i]) ++l[cd[i] - 1]
  }
  // u16 "map": index -> minimum code for bit length = index
  const le = new Uint16Array(maxBits)
  for (let i = 1; i < maxBits; i++) {
    le[i] = le[i - 1] + l[i - 1] << 1
  }
  let co
  if (r) {
    // u16 "map": index -> number of actual bits, symbol for code
    co = new Uint16Array(1 << maxBits)
    // bits to remove for reverser
    const rvb = 15 - maxBits
    for (let i = 0; i < cd.length; i++) {
      // ignore 0 lengths
      if (cd[i]) {
        // num encoding both symbol and bits read
        const sv = i << 4 | cd[i]
        const freeBits = maxBits - cd[i]
        let startValue = le[cd[i] - 1]++ << freeBits
        for (const endValue = startValue | (1 << freeBits) - 1; startValue <= endValue; startValue++) {
          // every 16 bit value starting with the code yields the same result
          co[rev[startValue] >> rvb] = sv
        }
      }
    }
  } else {
    co = new Uint16Array(cd.length)
    for (let i = 0; i < cd.length; i++) {
      if (cd[i]) {
        co[i] = rev[le[cd[i] - 1]++] >> 15 - cd[i]
      }
    }
  }
  return co
}

// construct huffman trees
const fixedLengthTree = new Uint8Array(288)
for (let i = 0; i < 144; i++) fixedLengthTree[i] = 8
for (let i = 144; i < 256; i++) fixedLengthTree[i] = 9
for (let i = 256; i < 280; i++) fixedLengthTree[i] = 7
for (let i = 280; i < 288; i++) fixedLengthTree[i] = 8
const fixedDistanceTree = new Uint8Array(32)
for (let i = 0; i < 32; i++) fixedDistanceTree[i] = 5

export const fixedLengthMap = /*#__PURE__*/ huffMap(fixedLengthTree, 9, 1)
export const fixedDistanceMap = /*#__PURE__*/ huffMap(fixedDistanceTree, 5, 1)
export { fixedLength, fixedDistance }
