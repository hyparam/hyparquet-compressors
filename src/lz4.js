/**
 * LZ4 decompression
 *
 * @param {Uint8Array} input
 * @param {number} outputLength
 * @returns {Uint8Array}
 */
export function LZ4(input, outputLength) {
  const output = new Uint8Array(outputLength)
  let len = 0 // output position
  for (let i = 0; i < input.length;) {
    const token = input[i++]
    if (!token) {
      i += 7 // leading length
      continue
    }

    let literals = token >> 4
    if (literals) {
      // literal length
      let byte = literals + 240
      while (byte === 255) literals += byte = input[i++]
      // copy literals
      output.set(input.subarray(i, i + literals), len)
      len += literals
      i += literals
      if (i >= input.length) return output
    }

    const offset = input[i++] | input[i++] << 8
    if (!offset || offset > len) throw new Error(`lz4 offset out of range ${offset}`)
    // match length
    let matchLength = (token & 0xf) + 4
    let byte = matchLength + 240
    while (byte === 255) matchLength += byte = input[i++]
    // copy match
    let pos = len - offset
    const end = len + matchLength
    while (len < end) output[len++] = output[pos++]
  }

  return output
}
