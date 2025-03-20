/* Adapted from https://github.com/foliojs/brotli.js
 * Copyright 2015 Devon Govett, MIT License
 * Copyright 2013 Google Inc, Apache License 2.0
 */

import BrotliBitReader from './brotli.bitreader.js'
import { lookup, lookupOffsets } from './brotli.context.js'
import { HuffmanCode, readHuffmanCode, readSymbol } from './brotli.huffman.js'
import { kBlockLengthPrefixCode, kCopyLengthPrefixCode, kCopyRangeLut, kInsertLengthPrefixCode, kInsertRangeLut } from './brotli.prefix.js'
import { BrotliInput, BrotliOutput } from './brotli.streams.js'
import { kNumTransforms, transformDictionaryWord } from './brotli.transform.js'

const kNumLiteralCodes = 256
const kNumInsertAndCopyCodes = 704
const kNumBlockLengthCodes = 26
const kLiteralContextBits = 6
const kDistanceContextBits = 2

/* Maximum possible Huffman table size for an alphabet size of 704, max code
 * length 15 and root table bits 8. */
const HUFFMAN_MAX_TABLE_SIZE = 1080

const NUM_DISTANCE_SHORT_CODES = 16
const kDistanceShortCodeIndexOffset = new Uint8Array([
  3, 2, 1, 0, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2,
])

const kDistanceShortCodeValueOffset = new Int8Array([
  0, 0, 0, 0, -1, 1, -2, 2, -3, 3, -1, 1, -2, 2, -3, 3,
])

const kMaxHuffmanTableSize = new Uint16Array([
  256, 402, 436, 468, 500, 534, 566, 598, 630, 662, 694, 726, 758, 790, 822,
  854, 886, 920, 952, 984, 1016, 1048, 1080,
])

// Brotli dictionary
const offsetsByLength = new Uint32Array([
  0, 0, 0, 0, 0, 4096, 9216, 21504, 35840, 44032,
  53248, 63488, 74752, 87040, 93696, 100864, 104704, 106752, 108928, 113536,
  115968, 118528, 119872, 121280, 122016,
])

const sizeBitsByLength = new Uint8Array([
  0, 0, 0, 0, 10, 10, 11, 11, 10, 10,
  10, 10, 10, 9, 9, 8, 7, 7, 8, 7,
  7, 6, 6, 5, 5,
])

const minDictionaryWordLength = 4
const maxDictionaryWordLength = 24

/**
 * @param {Uint8Array} input
 * @param {number} outputLength
 * @returns {Uint8Array}
 */
export function BROTLI(input, outputLength) {
  const output = new Uint8Array(outputLength)
  const brotliInput = new BrotliInput(input)
  const brotliOutput = new BrotliOutput(output)
  brotli(brotliInput, brotliOutput)
  return output
}

/**
 * @param {BrotliInput} input
 * @param {BrotliOutput} output
 */
function brotli(input, output) {
  let pos = 0
  let input_end = 0
  let window_bits = 0
  let max_distance = 0
  /* This ring buffer holds a few past copy distances that will be used by */
  /* some special distance codes. */
  const dist_rb = [ 16, 15, 11, 4 ]
  let dist_rb_idx = 0
  /* The previous 2 bytes used for context */
  let prev_byte1 = 0
  let prev_byte2 = 0
  const hgroup = [new HuffmanTreeGroup(0, 0), new HuffmanTreeGroup(0, 0), new HuffmanTreeGroup(0, 0)]

  /* We need the slack region for the following reasons:
       - always doing two 8-byte copies for fast backward copying
       - transforms
       - flushing the input ringbuffer when decoding uncompressed blocks */
  const kRingBufferWriteAheadSlack = 128 + BrotliBitReader.READ_SIZE

  const br = new BrotliBitReader(input)

  /* Decode window size. */
  window_bits = decodeWindowBits(br)
  const max_backward_distance = (1 << window_bits) - 16

  const ringbuffer_size = 1 << window_bits
  const ringbuffer_mask = ringbuffer_size - 1
  const ringbuffer = new Uint8Array(ringbuffer_size + kRingBufferWriteAheadSlack + maxDictionaryWordLength)
  const ringbuffer_end = ringbuffer_size

  const block_type_trees = []
  const block_len_trees = []
  for (let x = 0; x < 3 * HUFFMAN_MAX_TABLE_SIZE; x++) {
    block_type_trees[x] = new HuffmanCode(0, 0)
    block_len_trees[x] = new HuffmanCode(0, 0)
  }

  while (!input_end) {
    let meta_block_remaining_len = 0
    const block_length = [ 1 << 28, 1 << 28, 1 << 28 ]
    const block_type = [ 0 ]
    const num_block_types = [ 1, 1, 1 ]
    const block_type_rb = [ 0, 1, 0, 1, 0, 1 ]
    const block_type_rb_index = [ 0 ]
    let context_offset = 0

    for (let i = 0; i < 3; i++) {
      hgroup[i].codes = []
      hgroup[i].htrees = new Uint32Array()
    }

    br.readMoreInput()

    const _out = DecodeMetaBlockLength(br)
    meta_block_remaining_len = _out.meta_block_length
    if (pos + meta_block_remaining_len > output.buffer.length) {
      /* We need to grow the output buffer to fit the additional data. */
      const tmp = new Uint8Array( pos + meta_block_remaining_len )
      tmp.set( output.buffer )
      output.buffer = tmp
    }
    input_end = _out.input_end

    if (_out.is_metadata) {
      jumpToByteBoundary(br)

      for (; meta_block_remaining_len > 0; --meta_block_remaining_len) {
        br.readMoreInput()
        /* Read one byte and ignore it. */
        br.readBits(8)
      }

      continue
    }

    if (meta_block_remaining_len === 0) continue

    if (_out.is_uncompressed) {
      br.bit_pos_ = br.bit_pos_ + 7 & ~7
      copyUncompressedBlockToOutput(output, meta_block_remaining_len, pos, ringbuffer, ringbuffer_mask, br)
      pos += meta_block_remaining_len
      continue
    }

    for (let i = 0; i < 3; i++) {
      num_block_types[i] = decodeVarLenUint8(br) + 1
      if (num_block_types[i] >= 2) {
        readHuffmanCode(num_block_types[i] + 2, block_type_trees, i * HUFFMAN_MAX_TABLE_SIZE, br)
        readHuffmanCode(kNumBlockLengthCodes, block_len_trees, i * HUFFMAN_MAX_TABLE_SIZE, br)
        block_length[i] = readBlockLength(block_len_trees, i * HUFFMAN_MAX_TABLE_SIZE, br)
        block_type_rb_index[i] = 1
      }
    }

    br.readMoreInput()

    const distance_postfix_bits = br.readBits(2)
    const num_direct_distance_codes = NUM_DISTANCE_SHORT_CODES + (br.readBits(4) << distance_postfix_bits)
    const distance_postfix_mask = (1 << distance_postfix_bits) - 1
    const num_distance_codes = num_direct_distance_codes + (48 << distance_postfix_bits)
    const context_modes = new Uint8Array(num_block_types[0])

    for (let i = 0; i < num_block_types[0]; i++) {
      br.readMoreInput()
      context_modes[i] = br.readBits(2) << 1
    }

    const _o1 = DecodeContextMap(num_block_types[0] << kLiteralContextBits, br)
    const num_literal_htrees = _o1.num_htrees
    const { context_map } = _o1

    const _o2 = DecodeContextMap(num_block_types[2] << kDistanceContextBits, br)
    const num_dist_htrees = _o2.num_htrees
    const dist_context_map = _o2.context_map

    hgroup[0] = new HuffmanTreeGroup(kNumLiteralCodes, num_literal_htrees)
    hgroup[1] = new HuffmanTreeGroup(kNumInsertAndCopyCodes, num_block_types[1])
    hgroup[2] = new HuffmanTreeGroup(num_distance_codes, num_dist_htrees)

    for (let i = 0; i < 3; ++i) {
      hgroup[i].decode(br)
    }

    let context_map_slice = 0
    let dist_context_map_slice = 0
    let context_mode = context_modes[block_type[0]]
    let context_lookup_offset1 = lookupOffsets[context_mode]
    let context_lookup_offset2 = lookupOffsets[context_mode + 1]
    let htree_command = hgroup[1].htrees[0]

    while (meta_block_remaining_len > 0) {
      let distance_code

      br.readMoreInput()

      if (block_length[1] === 0) {
        decodeBlockType(num_block_types[1],
          block_type_trees, 1, block_type, block_type_rb,
          block_type_rb_index, br)
        block_length[1] = readBlockLength(block_len_trees, HUFFMAN_MAX_TABLE_SIZE, br)
        htree_command = hgroup[1].htrees[block_type[1]]
      }
      block_length[1]--
      const cmd_code = readSymbol(hgroup[1].codes, htree_command, br)
      let range_idx = cmd_code >> 6
      if (range_idx >= 2) {
        range_idx -= 2
        distance_code = -1
      } else {
        distance_code = 0
      }
      const insert_code = kInsertRangeLut[range_idx] + (cmd_code >> 3 & 7)
      const copy_code = kCopyRangeLut[range_idx] + (cmd_code & 7)
      const insert_length = kInsertLengthPrefixCode[insert_code].offset +
          br.readBits(kInsertLengthPrefixCode[insert_code].nbits)
      const copy_length = kCopyLengthPrefixCode[copy_code].offset +
          br.readBits(kCopyLengthPrefixCode[copy_code].nbits)
      prev_byte1 = ringbuffer[pos - 1 & ringbuffer_mask]
      prev_byte2 = ringbuffer[pos - 2 & ringbuffer_mask]
      for (let j = 0; j < insert_length; j++) {
        br.readMoreInput()

        if (block_length[0] === 0) {
          decodeBlockType(num_block_types[0],
            block_type_trees, 0, block_type, block_type_rb,
            block_type_rb_index, br)
          block_length[0] = readBlockLength(block_len_trees, 0, br)
          context_offset = block_type[0] << kLiteralContextBits
          context_map_slice = context_offset
          context_mode = context_modes[block_type[0]]
          context_lookup_offset1 = lookupOffsets[context_mode]
          context_lookup_offset2 = lookupOffsets[context_mode + 1]
        }
        const context = lookup[context_lookup_offset1 + prev_byte1] |
                   lookup[context_lookup_offset2 + prev_byte2]
        const literal_htree_index = context_map[context_map_slice + context]
        block_length[0]--
        prev_byte2 = prev_byte1
        prev_byte1 = readSymbol(hgroup[0].codes, hgroup[0].htrees[literal_htree_index], br)
        ringbuffer[pos & ringbuffer_mask] = prev_byte1
        if ((pos & ringbuffer_mask) === ringbuffer_mask) {
          output.write(ringbuffer, ringbuffer_size)
        }
        pos++
      }
      meta_block_remaining_len -= insert_length
      if (meta_block_remaining_len <= 0) break

      if (distance_code < 0) {
        br.readMoreInput()
        if (block_length[2] === 0) {
          decodeBlockType(num_block_types[2],
            block_type_trees, 2, block_type, block_type_rb,
            block_type_rb_index, br)
          block_length[2] = readBlockLength(block_len_trees, 2 * HUFFMAN_MAX_TABLE_SIZE, br)
          dist_context_map_slice = block_type[2] << kDistanceContextBits
        }
        block_length[2]--
        const context = (copy_length > 4 ? 3 : copy_length - 2) & 0xff
        const dist_htree_index = dist_context_map[dist_context_map_slice + context]
        distance_code = readSymbol(hgroup[2].codes, hgroup[2].htrees[dist_htree_index], br)
        if (distance_code >= num_direct_distance_codes) {
          distance_code -= num_direct_distance_codes
          const postfix = distance_code & distance_postfix_mask
          distance_code >>= distance_postfix_bits
          const nbits = (distance_code >> 1) + 1
          const offset = (2 + (distance_code & 1) << nbits) - 4
          distance_code = num_direct_distance_codes +
              (offset + br.readBits(nbits) <<
               distance_postfix_bits) + postfix
        }
      }

      /* Convert the distance code to the actual distance by possibly looking */
      /* up past distnaces from the ringbuffer. */
      const distance = translateShortCodes(distance_code, dist_rb, dist_rb_idx)
      if (distance < 0) throw new Error('[BrotliDecompress] invalid distance')

      if (pos < max_backward_distance && max_distance !== max_backward_distance) {
        max_distance = pos
      } else {
        max_distance = max_backward_distance
      }

      let copy_dst = pos & ringbuffer_mask

      if (distance > max_distance) {
        if (copy_length >= minDictionaryWordLength && copy_length <= maxDictionaryWordLength) {
          let offset = offsetsByLength[copy_length]
          const word_id = distance - max_distance - 1
          const shift = sizeBitsByLength[copy_length]
          const mask = (1 << shift) - 1
          const word_idx = word_id & mask
          const transform_idx = word_id >> shift
          offset += word_idx * copy_length
          if (transform_idx < kNumTransforms) {
            const len = transformDictionaryWord(ringbuffer, copy_dst, offset, copy_length, transform_idx)
            copy_dst += len
            pos += len
            meta_block_remaining_len -= len
            if (copy_dst >= ringbuffer_end) {
              output.write(ringbuffer, ringbuffer_size)

              for (let _x = 0; _x < copy_dst - ringbuffer_end; _x++)
                ringbuffer[_x] = ringbuffer[ringbuffer_end + _x]
            }
          } else {
            throw new Error('Invalid backward reference')
          }
        } else {
          throw new Error('Invalid backward reference')
        }
      } else {
        if (distance_code > 0) {
          dist_rb[dist_rb_idx & 3] = distance
          dist_rb_idx++
        }

        if (copy_length > meta_block_remaining_len) {
          throw new Error('Invalid backward reference')
        }

        for (let j = 0; j < copy_length; j++) {
          ringbuffer[pos & ringbuffer_mask] = ringbuffer[pos - distance & ringbuffer_mask]
          if ((pos & ringbuffer_mask) === ringbuffer_mask) {
            output.write(ringbuffer, ringbuffer_size)
          }
          pos++
          meta_block_remaining_len--
        }
      }

      /* When we get here, we must have inserted at least one literal and */
      /* made a copy of at least length two, therefore accessing the last 2 */
      /* bytes is valid. */
      prev_byte1 = ringbuffer[pos - 1 & ringbuffer_mask]
      prev_byte2 = ringbuffer[pos - 2 & ringbuffer_mask]
    }

    /* Protect pos from overflow, wrap it around at every GB of input data */
    pos &= 0x3fffffff
  }

  output.write(ringbuffer, pos & ringbuffer_mask)
}

/**
 * @param {BrotliBitReader} br
 * @returns {number}
 */
function decodeWindowBits(br) {
  if (br.readBits(1) === 0) return 16

  let n = br.readBits(3)
  if (n > 0) return 17 + n

  n = br.readBits(3)
  if (n > 0) return 8 + n

  return 17
}

/**
 * @param {number} max_block_type
 * @param {HuffmanCode[]} trees
 * @param {number} tree_type
 * @param {number[]} block_types
 * @param {number[]} ringbuffers
 * @param {number[]} indexes
 * @param {BrotliBitReader} br
 */
function decodeBlockType(max_block_type, trees, tree_type, block_types, ringbuffers, indexes, br) {
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
  ++indexes[index]
}

/**
 * Contains a collection of huffman trees with the same alphabet size.
 *
 * @param {number} alphabet_size
 * @param {number} num_htrees
 */
function HuffmanTreeGroup(alphabet_size, num_htrees) {
  this.alphabet_size = alphabet_size
  this.num_htrees = num_htrees
  this.codes = new Array(num_htrees + num_htrees * kMaxHuffmanTableSize[alphabet_size + 31 >>> 5])
  this.htrees = new Uint32Array(num_htrees)
}

/**
 * @param {BrotliBitReader} br
 */
HuffmanTreeGroup.prototype.decode = function(br) {
  let next = 0
  for (let i = 0; i < this.num_htrees; i++) {
    this.htrees[i] = next
    next += readHuffmanCode(this.alphabet_size, this.codes, next, br)
  }
}

/**
 * @param {HuffmanCode[]} table
 * @param {number} index
 * @param {BrotliBitReader} br
 * @returns {number}
 */
function readBlockLength(table, index, br) {
  const code = readSymbol(table, index, br)
  const { nbits } = kBlockLengthPrefixCode[code]
  return kBlockLengthPrefixCode[code].offset + br.readBits(nbits)
}

/**
 * @param {number} code
 * @param {number[]} ringbuffer
 * @param {number} index
 * @returns {number}
 */
function translateShortCodes(code, ringbuffer, index) {
  if (code < NUM_DISTANCE_SHORT_CODES) {
    index += kDistanceShortCodeIndexOffset[code]
    index &= 3
    return ringbuffer[index] + kDistanceShortCodeValueOffset[code]
  } else {
    return code - NUM_DISTANCE_SHORT_CODES + 1
  }
}

/**
 * @param {*} output
 * @param {number} len
 * @param {number} pos
 * @param {Uint8Array} ringbuffer
 * @param {number} ringbuffer_mask
 * @param {BrotliBitReader} br
 */
function copyUncompressedBlockToOutput(output, len, pos, ringbuffer, ringbuffer_mask, br) {
  const rb_size = ringbuffer_mask + 1
  let rb_pos = pos & ringbuffer_mask
  let br_pos = br.pos_ & BrotliBitReader.IBUF_MASK

  /* For short lengths copy byte-by-byte */
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
    throw new Error('[CopyUncompressedBlockToOutput] br.bit_end_pos_ < 32')
  }

  /* Copy remaining 0-4 bytes from br.val_ to ringbuffer. */
  while (br.bit_pos_ < 32) {
    ringbuffer[rb_pos] = br.val_ >>> br.bit_pos_
    br.bit_pos_ += 8
    rb_pos++
    len--
  }

  /* Copy remaining bytes from br.buf_ to ringbuffer. */
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

  /* If we wrote past the logical end of the ringbuffer, copy the tail of the
     ringbuffer to its beginning and flush the ringbuffer to the output. */
  if (rb_pos >= rb_size) {
    output.write(ringbuffer, rb_size)
    rb_pos -= rb_size
    for (let x = 0; x < rb_pos; x++)
      ringbuffer[x] = ringbuffer[rb_size + x]
  }

  /* If we have more to copy than the remaining size of the ringbuffer, then we
     first fill the ringbuffer from the input and then flush the ringbuffer to
     the output */
  while (rb_pos + len >= rb_size) {
    nbytes = rb_size - rb_pos
    if (br.input_.read(ringbuffer, rb_pos, nbytes) < nbytes) {
      throw new Error('[CopyUncompressedBlockToOutput] not enough bytes')
    }
    output.write(ringbuffer, rb_size)
    len -= nbytes
    rb_pos = 0
  }

  /* Copy straight from the input onto the ringbuffer. The ringbuffer will be
     flushed to the output at a later time. */
  if (br.input_.read(ringbuffer, rb_pos, len) < len) {
    throw new Error('[CopyUncompressedBlockToOutput] not enough bytes')
  }

  /* Restore the state of the bit reader. */
  br.reset()
}

/**
 * Decodes a number in the range [0..255], by reading 1 - 11 bits.
 * @param {BrotliBitReader} br
 * @returns {number}
 */
function decodeVarLenUint8(br) {
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

function MetaBlockLength() {
  this.meta_block_length = 0
  this.input_end = 0
  this.is_uncompressed = 0
  this.is_metadata = false
}

/**
 * @param {BrotliBitReader} br
 * @returns {MetaBlockLength}
 */
function DecodeMetaBlockLength(br) {
  const out = new MetaBlockLength

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
 * @param {number} context_map_size
 * @param {BrotliBitReader} br
 * @returns {{ num_htrees: number, context_map: Uint8Array }}
 */
function DecodeContextMap(context_map_size, br) {
  let max_run_length_prefix = 0

  br.readMoreInput()
  const num_htrees = decodeVarLenUint8(br) + 1

  const context_map = new Uint8Array(context_map_size)
  if (num_htrees <= 1) {
    return { num_htrees, context_map }
  }

  const use_rle_for_zeros = br.readBits(1)
  if (use_rle_for_zeros) {
    max_run_length_prefix = br.readBits(4) + 1
  }

  const table = []
  for (let i = 0; i < HUFFMAN_MAX_TABLE_SIZE; i++) {
    table[i] = new HuffmanCode(0, 0)
  }

  readHuffmanCode(num_htrees + max_run_length_prefix, table, 0, br)

  for (let i = 0; i < context_map_size;) {
    br.readMoreInput()
    const code = readSymbol(table, 0, br)
    if (code === 0) {
      context_map[i] = 0
      i++
    } else if (code <= max_run_length_prefix) {
      let reps = 1 + (1 << code) + br.readBits(code)
      while (--reps) {
        if (i >= context_map_size) {
          throw new Error('[DecodeContextMap] i >= context_map_size')
        }
        context_map[i] = 0
        i++
      }
    } else {
      context_map[i] = code - max_run_length_prefix
      i++
    }
  }
  if (br.readBits(1)) {
    inverseMoveToFrontTransform(context_map, context_map_size)
  }

  return { num_htrees, context_map }
}

/**
 * @param {Uint8Array} v
 * @param {number} index
 */
function moveToFront(v, index) {
  const value = v[index]
  for (let i = index; i; i--) v[i] = v[i - 1]
  v[0] = value
}

/**
 * @param {Uint8Array} v
 * @param {number} v_len
 */
function inverseMoveToFrontTransform(v, v_len) {
  const mtf = new Uint8Array(256)
  for (let i = 0; i < 256; i++) {
    mtf[i] = i
  }
  for (let i = 0; i < v_len; i++) {
    const index = v[i]
    v[i] = mtf[index]
    if (index) moveToFront(mtf, index)
  }
}

/**
 * Advances the bit reader position to the next byte boundary and verifies
 * that any skipped bits are set to zero.
 * @param {BrotliBitReader} br
 * @returns {boolean}
 */
function jumpToByteBoundary(br) {
  const new_bit_pos = br.bit_pos_ + 7 & ~7
  return !br.readBits(new_bit_pos - br.bit_pos_)
}
