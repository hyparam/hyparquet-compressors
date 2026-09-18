export class BrotliInput {
  /**
   * @param {Uint8Array} buffer
   */
  constructor(buffer) {
    this.buffer = buffer
    this.pos = 0
  }

  /**
   * @param {Uint8Array} buf
   * @param {number} i
   * @param {number} count
   * @returns {number}
   */
  read(buf, i, count) {
    if (this.pos + count > this.buffer.length) {
      count = this.buffer.length - this.pos
    }

    for (let p = 0; p < count; p++)
      buf[i + p] = this.buffer[this.pos + p]

    this.pos += count
    return count
  }
}

export class BrotliOutput {
  /**
   * @param {Uint8Array} buf
   */
  constructor(buf) {
    this.buffer = buf
    this.pos = 0
  }

  /**
   * @param {Uint8Array} buf
   * @param {number} count
   * @returns {number}
   */
  write(buf, count) {
    if (this.pos + count > this.buffer.length) throw new Error('brotli output buffer is not large enough')

    this.buffer.set(buf.subarray(0, count), this.pos)
    this.pos += count
    return count
  }
}
