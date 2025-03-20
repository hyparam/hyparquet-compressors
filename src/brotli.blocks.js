import { readSymbol } from './brotli.huffman.js'
import { BrotliBitReader } from './brotli.bitreader.js'
import { kBlockLengthPrefixCode } from './brotli.prefix.js'
import { HUFFMAN_MAX_TABLE_SIZE } from './gzip.huffman.js'

/**
 * @import {HuffmanCode} from './brotli.huffman.js'
 * @param {number} max_block_type
 * @param {HuffmanCode[]} trees
 * @param {number} tree_type
 * @param {number[]} block_types
 * @param {number[]} ringbuffers
 * @param {number[]} indexes
 * @param {BrotliBitReader} br
 */
export function decodeBlockType(max_block_type, trees, tree_type, block_types, ringbuffers, indexes, br) {
  const ringbuffer = tree_type * 2
  const index = tree_type
  const type_code = readSymbol(trees, tree_type * HUFFMAN_MAX_TABLE_SIZE, br)
  let block_type
  if (type_code === 0) {
    block_type = ringbuffers[ringbuffer + (indexes[index] & 1)]
  } else if (type_code === 1) {
    block_type = ringbuffers[ringbuffer + (indexes[index] - 1 & 1)] + 1
  } else {
    block_type = type_code - 2
  }
  if (block_type >= max_block_type) {
    block_type -= max_block_type
  }
  block_types[tree_type] = block_type
  ringbuffers[ringbuffer + (indexes[index] & 1)] = block_type
  indexes[index]++
}

/**
 * @typedef {{ input_end: number, is_metadata: boolean, meta_block_length: number, is_uncompressed: number }} MetaBlockLength
 * @param {BrotliBitReader} br
 * @returns {MetaBlockLength}
 */
export function decodeMetaBlockLength(br) {
  const out = {
    meta_block_length: 0,
    input_end: 0,
    is_uncompressed: 0,
    is_metadata: false,
  }

  out.input_end = br.readBits(1)
  if (out.input_end && br.readBits(1)) {
    return out
  }

  const size_nibbles = br.readBits(2) + 4
  if (size_nibbles === 7) {
    out.is_metadata = true

    if (br.readBits(1) !== 0)
      throw new Error('Invalid reserved bit')

    const size_bytes = br.readBits(2)
    if (size_bytes === 0)
      return out

    for (let i = 0; i < size_bytes; i++) {
      const next_byte = br.readBits(8)
      if (i + 1 === size_bytes && size_bytes > 1 && next_byte === 0)
        throw new Error('Invalid size byte')

      out.meta_block_length |= next_byte << i * 8
    }
  } else {
    for (let i = 0; i < size_nibbles; i++) {
      const next_nibble = br.readBits(4)
      if (i + 1 === size_nibbles && size_nibbles > 4 && next_nibble === 0)
        throw new Error('Invalid size nibble')

      out.meta_block_length |= next_nibble << i * 4
    }
  }

  out.meta_block_length++

  if (!out.input_end && !out.is_metadata) {
    out.is_uncompressed = br.readBits(1)
  }

  return out
}


/**
 * @import {BrotliOutput} from './brotli.streams.js'
 * @param {BrotliOutput} output
 * @param {number} len
 * @param {number} pos
 * @param {Uint8Array} ringbuffer
 * @param {number} ringbuffer_mask
 * @param {BrotliBitReader} br
 */
export function copyUncompressedBlockToOutput(output, len, pos, ringbuffer, ringbuffer_mask, br) {
  const rb_size = ringbuffer_mask + 1
  let rb_pos = pos & ringbuffer_mask
  let br_pos = br.pos_ & BrotliBitReader.IBUF_MASK

  // For short lengths copy byte-by-byte
  if (len < 8 || br.bit_pos_ + (len << 3) < br.bit_end_pos_) {
    while (len-- > 0) {
      br.readMoreInput()
      ringbuffer[rb_pos++] = br.readBits(8)
      if (rb_pos === rb_size) {
        output.write(ringbuffer, rb_size)
        rb_pos = 0
      }
    }
    return
  }

  if (br.bit_end_pos_ < 32) {
    throw new Error('copyUncompressedBlockToOutput: br.bit_end_pos_ < 32')
  }

  // Copy remaining 0-4 bytes from br.val_ to ringbuffer
  while (br.bit_pos_ < 32) {
    ringbuffer[rb_pos] = br.val_ >>> br.bit_pos_
    br.bit_pos_ += 8
    rb_pos++
    len--
  }

  // Copy remaining bytes from br.buf_ to ringbuffer
  let nbytes = br.bit_end_pos_ - br.bit_pos_ >> 3
  if (br_pos + nbytes > BrotliBitReader.IBUF_MASK) {
    const tail = BrotliBitReader.IBUF_MASK + 1 - br_pos
    for (let x = 0; x < tail; x++)
      ringbuffer[rb_pos + x] = br.buf_[br_pos + x]

    nbytes -= tail
    rb_pos += tail
    len -= tail
    br_pos = 0
  }

  for (let x = 0; x < nbytes; x++)
    ringbuffer[rb_pos + x] = br.buf_[br_pos + x]

  rb_pos += nbytes
  len -= nbytes

  // If we wrote past the logical end of the ringbuffer, copy the tail of the
  // ringbuffer to its beginning and flush the ringbuffer to the output
  if (rb_pos >= rb_size) {
    output.write(ringbuffer, rb_size)
    rb_pos -= rb_size
    for (let x = 0; x < rb_pos; x++)
      ringbuffer[x] = ringbuffer[rb_size + x]
  }

  // If we have more to copy than the remaining size of the ringbuffer, then we
  // first fill the ringbuffer from the input and then flush the ringbuffer
  while (rb_pos + len >= rb_size) {
    nbytes = rb_size - rb_pos
    if (br.input_.read(ringbuffer, rb_pos, nbytes) < nbytes) {
      throw new Error('copyUncompressedBlockToOutput: not enough bytes')
    }
    output.write(ringbuffer, rb_size)
    len -= nbytes
    rb_pos = 0
  }

  // Copy straight from the input onto the ringbuffer
  // Ringbuffer will be flushed to output later
  if (br.input_.read(ringbuffer, rb_pos, len) < len) {
    throw new Error('copyUncompressedBlockToOutput: not enough bytes')
  }

  // Restore the state of the bit reader
  br.reset()
}

/**
 * Decodes a number in the range [0..255], by reading 1 - 11 bits.
 * @param {BrotliBitReader} br
 * @returns {number}
 */
export function decodeVarLenUint8(br) {
  if (br.readBits(1)) {
    const nbits = br.readBits(3)
    if (nbits === 0) {
      return 1
    } else {
      return br.readBits(nbits) + (1 << nbits)
    }
  }
  return 0
}

/**
 * @param {BrotliBitReader} br
 * @returns {number}
 */
export function decodeWindowBits(br) {
  if (br.readBits(1) === 0) return 16

  let n = br.readBits(3)
  if (n > 0) return 17 + n

  n = br.readBits(3)
  if (n > 0) return 8 + n

  return 17
}

/**
 * Advances the bit reader position to the next byte boundary and verifies
 * that any skipped bits are set to zero.
 * @param {BrotliBitReader} br
 * @returns {boolean}
 */
export function jumpToByteBoundary(br) {
  const new_bit_pos = br.bit_pos_ + 7 & ~7
  return !br.readBits(new_bit_pos - br.bit_pos_)
}

/**
 * @param {HuffmanCode[]} table
 * @param {number} index
 * @param {BrotliBitReader} br
 * @returns {number}
 */
export function readBlockLength(table, index, br) {
  const code = readSymbol(table, index, br)
  const { offset, nbits } = kBlockLengthPrefixCode[code]
  return offset + br.readBits(nbits)
}
