import { decodeVarLenUint8 } from './brotli.blocks.js'
import { HuffmanCode, readHuffmanCode, readSymbol } from './brotli.huffman.js'
import { HUFFMAN_MAX_TABLE_SIZE } from './gzip.huffman.js'

/**
 * @import {BrotliBitReader} from './brotli.bitreader.js'
 * @param {number} context_map_size
 * @param {BrotliBitReader} br
 * @returns {[number, Uint8Array]} // num_htrees, context_map
 */
export function decodeContextMap(context_map_size, br) {
  let max_run_length_prefix = 0

  br.readMoreInput()
  const num_htrees = decodeVarLenUint8(br) + 1

  const context_map = new Uint8Array(context_map_size)
  if (num_htrees <= 1) {
    return [num_htrees, context_map]
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

  return [num_htrees, context_map]
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
