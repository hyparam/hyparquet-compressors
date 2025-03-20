// Adapted from https://github.com/101arrowz/fflate Copyright (c) 2023 Arjun Barrett
// https://tools.ietf.org/html/rfc1951

import { fixedDistance, fixedDistanceExtraBits, fixedDistanceMap, fixedLength, fixedLengthExtraBits, fixedLengthMap, huffMap } from './gzip.huffman.js'

const codeLengthIndexMap = new Uint8Array([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15])

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
  // if missing gzip header, assume raw deflate stream
  if (input[i++] !== 31 || input[i++] !== 139 || input[i++] !== 8) return 0
  const flag = input[i++]
  i += 6 // skip header
  if (flag & 4) i += (input[i + 10] | input[i + 11] << 8) + 2 // skip extra
  // skip name and comment
  for (let zs = (flag >> 3 & 1) + (flag >> 4 & 1); zs > 0; zs -= Number(!input[i++]));
  return i + (flag & 2)
}

/**
 * GZip decompression
 * @param {Uint8Array} input
 * @param {Uint8Array} [output]
 * @param {number} [inputIndex]
 * @param {number} [outputIndex]
 * @returns {Uint8Array}
 */
export function gunzip(input, output, inputIndex = 0, outputIndex = 0) {
  let out = output ?? new Uint8Array(1024) // initial size
  if (!(input.length - inputIndex)) return out
  const payloadStart = gzipStart(input, inputIndex)
  if (payloadStart === input.length - 8) return out
  if (payloadStart > input.length - 8) throw new Error('unexpected EOF')
  let pos = payloadStart * 8 // position in bits
  let final = 0 // last chunk?
  let lengthBits = 0
  let distBits = 0
  let lengthMap
  let distMap
  const totalBits = input.length * 8

  /** @param {number} length */
  function ensureSize(length) {
    if (!output && length > out.length) {
      const old = out
      out = new Uint8Array(Math.max(old.length * 2, length))
      out.set(old)
    }
  }

  do {
    if (!lengthMap) {
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
        ensureSize(outputIndex + l)
        out.set(input.subarray(s, t), outputIndex)
        outputIndex += l
        pos = t * 8
        continue
      } else if (type === 1) {
        // fixed huffman
        lengthMap = fixedLengthMap
        distMap = fixedDistanceMap
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
        const codeLengthBits = Math.max(...codeLengthTree)
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
        // max length/dist bits
        lengthBits = Math.max(...lengthTree)
        distBits = Math.max(...distanceTree)
        lengthMap = huffMap(lengthTree, lengthBits, 1)
        distMap = huffMap(distanceTree, distBits, 1)
      } else throw new Error('invalid block type')
      if (pos > totalBits) throw new Error('unexpected EOF')
    }

    ensureSize(outputIndex + 131072) // max chunk size?
    const lms = (1 << lengthBits) - 1
    const dms = (1 << distBits) - 1
    let lpos = pos
    for (;; lpos = pos) {
      // bits read, code
      const code = lengthMap[bits16(input, pos) & lms]
      const sym = code >> 4
      pos += code & 15
      if (pos > totalBits) throw new Error('unexpected EOF')
      if (!code) throw new Error('invalid length/literal')
      if (sym < 256) out[outputIndex++] = sym
      else if (sym === 256) {
        lpos = pos
        lengthMap = undefined
        break
      } else {
        let add = sym - 254
        // no extra bits needed if less
        if (sym > 264) {
          const index = sym - 257
          const b = fixedLengthExtraBits[index]
          add = bits(input, pos, (1 << b) - 1) + fixedLength[index]
          pos += b
        }
        // dist
        if (!distMap) throw new Error('invalid distance map')
        const d = distMap[bits16(input, pos) & dms]
        const dsym = d >> 4
        if (!d) throw new Error('invalid distance')
        pos += d & 15
        let dt = fixedDistance[dsym]
        if (dsym > 3) {
          const b = fixedDistanceExtraBits[dsym]
          dt += bits16(input, pos) & (1 << b) - 1
          pos += b
        }
        if (pos > totalBits) throw new Error('unexpected EOF')
        const end = outputIndex + add
        if (outputIndex < dt) throw new Error('unexpected dictionary case')
        ensureSize(end)
        for (; outputIndex < end; outputIndex++) out[outputIndex] = out[outputIndex - dt]
      }
    }
    pos = lpos
    if (lengthMap) final = 1
  } while (!final)

  if (outputIndex < out.length) {
    // multiple gzip blocks
    const nextBlock = Math.ceil(pos / 8) + 8 // 8 byte gzip footer
    gunzip(input, out, nextBlock, outputIndex)
  }

  if (!output) return out.subarray(0, outputIndex)
  return out
}
