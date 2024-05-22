// Adapted from https://github.com/101arrowz/fflate Copyright (c) 2023 Arjun Barrett
// https://tools.ietf.org/html/rfc1951

// fixed length extra bits
const fixedLengthExtraBits = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0, /* unused */ 0, 0, /* impossible */ 0])
const fixedDistanceExtraBits = new Uint8Array([0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, /* unused */ 0, 0])
const codeLengthIndexMap = new Uint8Array([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15])

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

const { base: fl, rev: revfl } = freb(fixedLengthExtraBits, 2)
// we can ignore the fact that the other numbers are wrong; they never happen anyway
fl[28] = 258
revfl[258] = 28
const { base: fd } = freb(fixedDistanceExtraBits, 0)

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
function huffMap(cd, maxBits, r) {
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
const fixedLengthMap = /*#__PURE__*/ huffMap(fixedLengthTree, 9, 1)
const fixedDistanceMap = /*#__PURE__*/ huffMap(fixedDistanceTree, 5, 1)

/**
 * find max of array
 * @param {Uint8Array | number[]} a
 * @returns {number}
 */
function max(a) {
  let m = a[0]
  for (let i = 1; i < a.length; i++) {
    if (a[i] > m) m = a[i]
  }
  return m
}

/**
 * read d, starting at bit p and mask with m
 * @param {Uint8Array} input
 * @param {number} pos
 * @param {number} mask
 * @returns {number}
 */
function bits(input, pos, mask) {
  const o = pos / 8 | 0
  return (input[o] | input[o + 1] << 8) >> (pos & 7) & mask
}

/**
 * read d, starting at bit p continuing for at least 16 bits
 * @param {Uint8Array} d
 * @param {number} p
 * @returns {number}
 */
function bits16(d, p) {
  const o = p / 8 | 0
  return (d[o] | d[o + 1] << 8 | d[o + 2] << 16) >> (p & 7)
}

/**
 * get end of byte
 * @param {number} p
 * @returns {number}
 */
function shft(p) {
  return (p + 7) / 8 | 0
}

/**
 * return start of gzip payload index
 * @param {Uint8Array} input
 * @param {number} i inputIndex
 * @returns {number}
 */
function gzipStart(input, i) {
  if (input[i++] !== 31 || input[i++] !== 139 || input[i++] !== 8) throw new Error('invalid gzip data')
  const flag = input[i++]
  i += 6
  if (flag & 4) i += (input[i + 10] | input[i + 11] << 8) + 2
  for (let zs = (flag >> 3 & 1) + (flag >> 4 & 1); zs > 0; zs -= Number(!input[i++]));
  return i + (flag & 2)
}

/**
 * GZip decompression
 * @param {Uint8Array} input
 * @param {Uint8Array} out
 * @param {number} [inputIndex]
 * @param {number} [outputIndex]
 */
export function gunzip(input, out, inputIndex = 0, outputIndex = 0) {
  if (!(input.length - inputIndex)) return
  const payloadStart = gzipStart(input, inputIndex)
  if (payloadStart === input.length - 8) return
  if (payloadStart > input.length - 8) throw new Error('unexpected EOF')
  let pos = payloadStart * 8 // position in bits
  let final = 0 // last chunk?
  let lengthBits = 0
  let distBits = 0
  let lmap
  let dmap
  const totalBits = input.length * 8
  do {
    if (!lmap) {
      // final chunk is next?
      final = bits(input, pos, 1)
      const type = bits(input, pos + 1, 3)
      pos += 3
      if (!type) {
        // no compression
        // go to end of byte boundary
        const s = shft(pos) + 4
        const l = input[s - 4] | input[s - 3] << 8
        const t = s + l
        if (t > input.length) throw new Error('unexpected EOF')
        // copy uncompressed data
        out.set(input.subarray(s, t), outputIndex)
        outputIndex += l
        pos = t * 8
        continue
      } else if (type === 1) {
        // fixed huffman
        lmap = fixedLengthMap
        dmap = fixedDistanceMap
        lengthBits = 9
        distBits = 5
      } else if (type === 2) {
        // dynamic huffman
        const hLiteral = bits(input, pos, 31) + 257
        const hcLengths = bits(input, pos + 10, 15) + 4
        const tl = hLiteral + bits(input, pos + 5, 31) + 1
        pos += 14
        // length+distance tree
        const lengthDistanceTree = new Uint8Array(tl)
        const codeLengthTree = new Uint8Array(19)
        for (let i = 0; i < hcLengths; ++i) {
          // use index map to get real code
          codeLengthTree[codeLengthIndexMap[i]] = bits(input, pos + i * 3, 7)
        }
        pos += hcLengths * 3
        const codeLengthBits = max(codeLengthTree)
        const clbMask = (1 << codeLengthBits) - 1
        const codeLengthMap = huffMap(codeLengthTree, codeLengthBits, 1)
        for (let i = 0; i < tl;) {
          const r = codeLengthMap[bits(input, pos, clbMask)]
          // bits read
          pos += r & 15
          const symbol = r >> 4
          // code length to copy
          if (symbol < 16) {
            lengthDistanceTree[i++] = symbol
          } else {
            let copy = 0
            let n = 0 // count
            if (symbol === 16) {
              n = 3 + bits(input, pos, 3)
              pos += 2
              copy = lengthDistanceTree[i - 1]
            } else if (symbol === 17) {
              n = 3 + bits(input, pos, 7)
              pos += 3
            } else if (symbol === 18) {
              n = 11 + bits(input, pos, 127)
              pos += 7
            }
            while (n--) lengthDistanceTree[i++] = copy
          }
        }
        const lengthTree = lengthDistanceTree.subarray(0, hLiteral)
        const distanceTree = lengthDistanceTree.subarray(hLiteral)
        // max length bits
        lengthBits = max(lengthTree)
        // max dist bits
        distBits = max(distanceTree)
        lmap = huffMap(lengthTree, lengthBits, 1)
        dmap = huffMap(distanceTree, distBits, 1)
      } else throw new Error('invalid block type')
      if (pos > totalBits) throw new Error('unexpected EOF')
    }
    const lms = (1 << lengthBits) - 1
    const dms = (1 << distBits) - 1
    let lpos = pos
    for (;; lpos = pos) {
      // bits read, code
      const code = lmap[bits16(input, pos) & lms]
      const sym = code >> 4
      pos += code & 15
      if (pos > totalBits) throw new Error('unexpected EOF')
      if (!code) throw new Error('invalid length/literal')
      if (sym < 256) out[outputIndex++] = sym
      else if (sym === 256) {
        lpos = pos
        lmap = undefined
        break
      } else {
        let add = sym - 254
        // no extra bits needed if less
        if (sym > 264) {
          const index = sym - 257
          const b = fixedLengthExtraBits[index]
          add = bits(input, pos, (1 << b) - 1) + fl[index]
          pos += b
        }
        // dist
        if (!dmap) throw new Error('invalid distance map')
        const d = dmap[bits16(input, pos) & dms]
        const dsym = d >> 4
        if (!d) throw new Error('invalid distance')
        pos += d & 15
        let dt = fd[dsym]
        if (dsym > 3) {
          const b = fixedDistanceExtraBits[dsym]
          dt += bits16(input, pos) & (1 << b) - 1
          pos += b
        }
        if (pos > totalBits) throw new Error('unexpected EOF')
        const end = outputIndex + add
        if (outputIndex < dt) throw new Error('unexpected dictionary case')
        for (; outputIndex < end; outputIndex++) out[outputIndex] = out[outputIndex - dt]
      }
    }
    pos = lpos
    if (lmap) final = 1
  } while (!final)

  if (outputIndex < out.length) {
    // multiple gzip blocks
    const nextBlock = Math.ceil(pos / 8) + 8 // 8 byte gzip footer
    gunzip(input, out, nextBlock, outputIndex)
  }
}
