/**
 * LZ4 decompression with legacy hadoop support.
 * https://github.com/apache/arrow/blob/apache-arrow-16.1.0/cpp/src/arrow/util/compression_lz4.cc#L475
 *
 * @param {Uint8Array} input
 * @param {number} outputLength
 * @returns {Uint8Array}
 */
export function decompressLz4(input, outputLength) {
  const output = new Uint8Array(outputLength)
  try {
    let i = 0 // input index
    let o = 0 // output index
    while (i < input.length - 8) {
      const expectedOutputLength = input[i++] << 24 | input[i++] << 16 | input[i++] << 8 | input[i++]
      const expectedInputLength = input[i++] << 24 | input[i++] << 16 | input[i++] << 8 | input[i++]
      if (input.length - i < expectedInputLength) throw new Error('lz4 not hadoop')
      if (output.length < expectedOutputLength) throw new Error('lz4 not hadoop')

      // decompress and compare with expected
      const chunk = lz4basic(input.subarray(i, i + expectedInputLength), output, o)
      if (chunk !== expectedOutputLength) throw new Error('lz4 not hadoop')
      i += expectedInputLength
      o += expectedOutputLength

      if (i === input.length) return output
    }
    if (i < input.length) throw new Error('lz4 not hadoop')
  } catch (error) {
    if (error instanceof Error && error.message !== 'lz4 not hadoop') throw error
    // fallback to basic lz4
    lz4basic(input, output, 0)
  }
  return output
}

/**
 * Basic LZ4 block decompression.
 *
 * @param {Uint8Array} input
 * @param {number} outputLength
 * @returns {Uint8Array}
 */
export function decompressLz4Raw(input, outputLength) {
  const output = new Uint8Array(outputLength)
  lz4basic(input, output, 0)
  return output
}

/**
 * @param {Uint8Array} input
 * @param {Uint8Array} output
 * @param {number} outputIndex
 * @returns {number} bytes written
 */
function lz4basic(input, output, outputIndex) {
  let len = outputIndex // output position
  for (let i = 0; i < input.length;) {
    const token = input[i++]

    let literals = token >> 4
    if (literals) {
      // literal length
      let byte = literals + 240
      while (byte === 255) literals += byte = input[i++]
      // copy literals
      output.set(input.subarray(i, i + literals), len)
      len += literals
      i += literals
      if (i >= input.length) return len - outputIndex
    }

    const offset = input[i++] | input[i++] << 8
    if (!offset || offset > len) {
      throw new Error(`lz4 offset out of range ${offset}`)
    }
    // match length
    let matchLength = (token & 0xf) + 4 // minmatch 4
    let byte = matchLength + 240
    while (byte === 255) matchLength += byte = input[i++]
    // copy match
    // TODO: fast path when no overlap
    let pos = len - offset
    const end = len + matchLength
    while (len < end) output[len++] = output[pos++]
  }
  return len - outputIndex
}
