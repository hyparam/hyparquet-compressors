/* Adapted from https://github.com/foliojs/brotli.js
 * Copyright 2015 Devon Govett, MIT License
 * Copyright 2013 Google Inc, Apache License 2.0
 */

import { BrotliBitReader } from './brotli.bitreader.js'
import { copyUncompressedBlockToOutput, decodeBlockType, decodeMetaBlockLength, decodeVarLenUint8, decodeWindowBits, jumpToByteBoundary, readBlockLength } from './brotli.blocks.js'
import { lookup, lookupOffsets } from './brotli.context.js'
import { decodeContextMap } from './brotli.contextmap.js'
import { HuffmanCode, HuffmanTreeGroup, readHuffmanCode, readSymbol } from './brotli.huffman.js'
import { kCopyLengthPrefixCode, kCopyRangeLut, kInsertLengthPrefixCode, kInsertRangeLut } from './brotli.prefix.js'
import { BrotliInput, BrotliOutput } from './brotli.streams.js'
import { kNumTransforms, transformDictionaryWord } from './brotli.transform.js'
import { HUFFMAN_MAX_TABLE_SIZE } from './gzip.huffman.js'

const kNumLiteralCodes = 256
const kNumInsertAndCopyCodes = 704
const kNumBlockLengthCodes = 26
const kLiteralContextBits = 6
const kDistanceContextBits = 2

const NUM_DISTANCE_SHORT_CODES = 16
const kDistanceShortCodeIndexOffset = new Uint8Array([
  3, 2, 1, 0, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2,
])

const kDistanceShortCodeValueOffset = new Int8Array([
  0, 0, 0, 0, -1, 1, -2, 2, -3, 3, -1, 1, -2, 2, -3, 3,
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
export function decompressBrotli(input, outputLength) {
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
  // This ring buffer holds a few past copy distances that will be used by special distance codes
  const dist_rb = [ 16, 15, 11, 4 ]
  let dist_rb_idx = 0
  /* The previous 2 bytes used for context */
  let prev_byte1 = 0
  let prev_byte2 = 0
  const hgroup = [new HuffmanTreeGroup(0, 0), new HuffmanTreeGroup(0, 0), new HuffmanTreeGroup(0, 0)]

  // We need the slack region for the following reasons:
  //   - always doing two 8-byte copies for fast backward copying
  //   - transforms
  //   - flushing the input ringbuffer when decoding uncompressed blocks
  const kRingBufferWriteAheadSlack = 128 + BrotliBitReader.READ_SIZE

  const br = new BrotliBitReader(input)

  // Decode window size
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

    const _out = decodeMetaBlockLength(br)
    meta_block_remaining_len = _out.meta_block_length
    if (pos + meta_block_remaining_len > output.buffer.length) {
      // We need to grow the output buffer to fit the additional data
      const tmp = new Uint8Array( pos + meta_block_remaining_len )
      tmp.set( output.buffer )
      output.buffer = tmp
    }
    input_end = _out.input_end

    if (_out.is_metadata) {
      jumpToByteBoundary(br)

      for (; meta_block_remaining_len > 0; --meta_block_remaining_len) {
        br.readMoreInput()
        // Read one byte and ignore it
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

    const [num_literal_htrees, context_map] = decodeContextMap(num_block_types[0] << kLiteralContextBits, br)
    const [num_dist_htrees, dist_context_map] = decodeContextMap(num_block_types[2] << kDistanceContextBits, br)

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
      const insertIndex = kInsertRangeLut[range_idx] + (cmd_code >> 3 & 7)
      const insertPrefix = kInsertLengthPrefixCode[insertIndex]
      const insertLength = insertPrefix.offset + br.readBits(insertPrefix.nbits)
      const copyIndex = kCopyRangeLut[range_idx] + (cmd_code & 7)
      const copyCode = kCopyLengthPrefixCode[copyIndex]
      const copyLength = copyCode.offset + br.readBits(copyCode.nbits)
      prev_byte1 = ringbuffer[pos - 1 & ringbuffer_mask]
      prev_byte2 = ringbuffer[pos - 2 & ringbuffer_mask]
      for (let j = 0; j < insertLength; j++) {
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
      meta_block_remaining_len -= insertLength
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
        const context = (copyLength > 4 ? 3 : copyLength - 2) & 0xff
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

      // Convert distance code to actual distance by possibly looking up past distnaces from the ringbuffer
      const distance = translateShortCodes(distance_code, dist_rb, dist_rb_idx)
      if (distance < 0) throw new Error('[BrotliDecompress] invalid distance')

      if (pos < max_backward_distance && max_distance !== max_backward_distance) {
        max_distance = pos
      } else {
        max_distance = max_backward_distance
      }

      let copy_dst = pos & ringbuffer_mask

      if (distance > max_distance) {
        if (copyLength >= minDictionaryWordLength && copyLength <= maxDictionaryWordLength) {
          let offset = offsetsByLength[copyLength]
          const word_id = distance - max_distance - 1
          const shift = sizeBitsByLength[copyLength]
          const mask = (1 << shift) - 1
          const word_idx = word_id & mask
          const transform_idx = word_id >> shift
          offset += word_idx * copyLength
          if (transform_idx < kNumTransforms) {
            const len = transformDictionaryWord(ringbuffer, copy_dst, offset, copyLength, transform_idx)
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

        if (copyLength > meta_block_remaining_len) {
          throw new Error('Invalid backward reference')
        }

        for (let j = 0; j < copyLength; j++) {
          ringbuffer[pos & ringbuffer_mask] = ringbuffer[pos - distance & ringbuffer_mask]
          if ((pos & ringbuffer_mask) === ringbuffer_mask) {
            output.write(ringbuffer, ringbuffer_size)
          }
          pos++
          meta_block_remaining_len--
        }
      }

      // When we get here, we must have inserted at least one literal and
      // made a copy of at least length two, therefore accessing the last 2
      // bytes is valid
      prev_byte1 = ringbuffer[pos - 1 & ringbuffer_mask]
      prev_byte2 = ringbuffer[pos - 2 & ringbuffer_mask]
    }

    // Protect pos from overflow, wrap it around at every GB of input data
    pos &= 0x3fffffff
  }

  output.write(ringbuffer, pos & ringbuffer_mask)
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
