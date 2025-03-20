
const kDefaultCodeLength = 8

const HUFFMAN_TABLE_BITS = 8
const HUFFMAN_TABLE_MASK = 0xff

const CODE_LENGTH_CODES = 18
const kCodeLengthCodeOrder = new Uint8Array([
  1, 2, 3, 4, 0, 5, 17, 6, 16, 7, 8, 9, 10, 11, 12, 13, 14, 15,
])

const kMaxHuffmanTableSize = new Uint16Array([
  256, 402, 436, 468, 500, 534, 566, 598, 630, 662, 694, 726, 758, 790, 822,
  854, 886, 920, 952, 984, 1016, 1048, 1080,
])

/**
 * @param {number} bits
 * @param {number} value
 */
export function HuffmanCode(bits, value) {
  this.bits = bits // number of bits used for this symbol
  this.value = value // symbol value or table offset
}

const kCodeLengthRepeatCode = 16
const MAX_LENGTH = 15

/**
 * Returns reverse(reverse(key, len) + 1, len), where reverse(key, len) is the
 * bit-wise reversal of the len least significant bits of key.
 * @param {number} key
 * @param {number} len
 * @returns {number}
 */
function getNextKey(key, len) {
  let step = 1 << len - 1
  while (key & step) {
    step >>= 1
  }
  return (key & step - 1) + step
}

/**
 * Stores code in table[0], table[step], table[2*step], ..., table[end]
 * Assumes that end is an integer multiple of step
 * @param {HuffmanCode[]} table
 * @param {number} i
 * @param {number} step
 * @param {number} end
 * @param {HuffmanCode} code
 */
function replicateValue(table, i, step, end, code) {
  do {
    end -= step
    table[i + end] = new HuffmanCode(code.bits, code.value)
  } while (end > 0)
}

/**
 * Returns the table width of the next 2nd level table. count is the histogram
 * of bit lengths for the remaining symbols, len is the code length of the next
 * processed symbol
 * @param {Int32Array} count
 * @param {number} len
 * @param {number} root_bits
 * @returns {number}
 */
function nextTableBitSize(count, len, root_bits) {
  let left = 1 << len - root_bits
  while (len < MAX_LENGTH) {
    left -= count[len]
    if (left <= 0) break
    ++len
    left <<= 1
  }
  return len - root_bits
}

/**
 * @param {HuffmanCode[]} root_table
 * @param {number} table
 * @param {number} root_bits
 * @param {Uint8Array} code_lengths
 * @param {number} code_lengths_size
 * @returns {number}
 */
function buildHuffmanTable(root_table, table, root_bits, code_lengths, code_lengths_size) {
  const start_table = table
  const count = new Int32Array(MAX_LENGTH + 1) // number of codes of each length
  const offset = new Int32Array(MAX_LENGTH + 1) // offsets in sorted table for each length
  const sorted = new Int32Array(code_lengths_size) // symbols sorted by code length

  // build histogram of code lengths
  for (let i = 0; i < code_lengths_size; i++) {
    count[code_lengths[i]]++
  }

  // generate offsets into sorted symbol table by code length
  offset[1] = 0
  for (let i = 1; i < MAX_LENGTH; i++) {
    offset[i + 1] = offset[i] + count[i]
  }

  // sort symbols by length, by symbol order within each length
  for (let i = 0; i < code_lengths_size; i++) {
    if (code_lengths[i] !== 0) {
      sorted[offset[code_lengths[i]]++] = i
    }
  }

  let table_bits = root_bits // key length of current table
  let table_size = 1 << table_bits
  let total_size = table_size // sum of root table size and 2nd level table sizes

  // special case code with only one value
  if (offset[MAX_LENGTH] === 1) {
    for (let key = 0; key < total_size; ++key) {
      root_table[table + key] = new HuffmanCode(0, sorted[0] & 0xffff)
    }

    return total_size
  }

  // fill in root table
  let key = 0 // reversed prefix code
  let symbol = 0 // symbol index in original or sorted table
  for (let len = 1, step = 2; len <= root_bits; ++len, step <<= 1) {
    for (; count[len] > 0; --count[len]) {
      const code = new HuffmanCode(len & 0xff, sorted[symbol++] & 0xffff)
      replicateValue(root_table, table + key, step, table_size, code)
      key = getNextKey(key, len)
    }
  }

  // fill in 2nd level tables and add pointers to root table
  const mask = total_size - 1
  let low = -1 // low bits for current root entry
  for (let len = root_bits + 1, step = 2; len <= MAX_LENGTH; ++len, step <<= 1) {
    for (; count[len] > 0; --count[len]) {
      if ((key & mask) !== low) {
        table += table_size
        table_bits = nextTableBitSize(count, len, root_bits)
        table_size = 1 << table_bits
        total_size += table_size
        low = key & mask
        root_table[start_table + low] = new HuffmanCode(table_bits + root_bits & 0xff, table - start_table - low & 0xffff)
      }
      const code = new HuffmanCode(len - root_bits & 0xff, sorted[symbol++] & 0xffff)
      replicateValue(root_table, table + (key >> root_bits), step, table_size, code)
      key = getNextKey(key, len)
    }
  }

  return total_size
}

/**
 * @import {BrotliBitReader} from './brotli.bitreader.js'
 * @param {number} alphabet_size
 * @param {HuffmanCode[]} tables
 * @param {number} table
 * @param {BrotliBitReader} br
 * @returns {number}
 */
export function readHuffmanCode(alphabet_size, tables, table, br) {
  const code_lengths = new Uint8Array(alphabet_size)

  br.readMoreInput()

  // simple_code_or_skip is used as follows:
  // - 1 for simple code;
  // - 0 for no skipping, 2 skips 2 code lengths, 3 skips 3 code lengths
  const simple_code_or_skip = br.readBits(2)
  if (simple_code_or_skip === 1) {
    // Read symbols, codes & code lengths directly
    let max_bits_counter = alphabet_size - 1
    let max_bits = 0
    const symbols = new Int32Array(4)
    const num_symbols = br.readBits(2) + 1
    while (max_bits_counter) {
      max_bits_counter >>= 1
      max_bits++
    }

    for (let i = 0; i < num_symbols; i++) {
      symbols[i] = br.readBits(max_bits) % alphabet_size
      code_lengths[symbols[i]] = 2
    }
    code_lengths[symbols[0]] = 1
    switch (num_symbols) {
    case 1:
      break
    case 3:
      if (symbols[0] === symbols[1] ||
            symbols[0] === symbols[2] ||
            symbols[1] === symbols[2]) {
        throw new Error('[ReadHuffmanCode] invalid symbols')
      }
      break
    case 2:
      if (symbols[0] === symbols[1]) {
        throw new Error('[ReadHuffmanCode] invalid symbols')
      }

      code_lengths[symbols[1]] = 1
      break
    case 4:
      if (symbols[0] === symbols[1] ||
            symbols[0] === symbols[2] ||
            symbols[0] === symbols[3] ||
            symbols[1] === symbols[2] ||
            symbols[1] === symbols[3] ||
            symbols[2] === symbols[3]) {
        throw new Error('[ReadHuffmanCode] invalid symbols')
      }

      if (br.readBits(1)) {
        code_lengths[symbols[2]] = 3
        code_lengths[symbols[3]] = 3
      } else {
        code_lengths[symbols[0]] = 2
      }
      break
    }
  } else { // Decode Huffman-coded code lengths
    const code_length_code_lengths = new Uint8Array(CODE_LENGTH_CODES)
    let space = 32
    let num_codes = 0
    // Static Huffman code for the code length code lengths
    const huff = [
      new HuffmanCode(2, 0), new HuffmanCode(2, 4), new HuffmanCode(2, 3), new HuffmanCode(3, 2),
      new HuffmanCode(2, 0), new HuffmanCode(2, 4), new HuffmanCode(2, 3), new HuffmanCode(4, 1),
      new HuffmanCode(2, 0), new HuffmanCode(2, 4), new HuffmanCode(2, 3), new HuffmanCode(3, 2),
      new HuffmanCode(2, 0), new HuffmanCode(2, 4), new HuffmanCode(2, 3), new HuffmanCode(4, 5),
    ]
    for (let i = simple_code_or_skip; i < CODE_LENGTH_CODES && space > 0; i++) {
      const code_len_idx = kCodeLengthCodeOrder[i]
      let p = 0
      br.fillBitWindow()
      p += br.val_ >>> br.bit_pos_ & 15
      br.bit_pos_ += huff[p].bits
      const v = huff[p].value
      code_length_code_lengths[code_len_idx] = v
      if (v !== 0) {
        space -= 32 >> v
        num_codes++
      }
    }

    if (!(num_codes === 1 || space === 0))
      throw new Error('[ReadHuffmanCode] invalid num_codes or space')

    readHuffmanCodeLengths(code_length_code_lengths, alphabet_size, code_lengths, br)
  }

  const table_size = buildHuffmanTable(tables, table, HUFFMAN_TABLE_BITS, code_lengths, alphabet_size)
  if (!table_size) throw new Error('brotli BuildHuffmanTable failed')
  return table_size
}

/**
 * Decodes the next Huffman code from bit-stream.
 * @param {HuffmanCode[]} table
 * @param {number} index
 * @param {BrotliBitReader} br
 * @returns {number}

 */
export function readSymbol(table, index, br) {
  br.fillBitWindow()
  index += br.val_ >>> br.bit_pos_ & HUFFMAN_TABLE_MASK
  const nbits = table[index].bits - HUFFMAN_TABLE_BITS
  if (nbits > 0) {
    br.bit_pos_ += HUFFMAN_TABLE_BITS
    index += table[index].value
    index += br.val_ >>> br.bit_pos_ & (1 << nbits) - 1
  }
  br.bit_pos_ += table[index].bits
  return table[index].value
}

/**
 * @param {Uint8Array} code_length_code_lengths
 * @param {number} num_symbols
 * @param {Uint8Array} code_lengths
 * @param {BrotliBitReader} br
 */
function readHuffmanCodeLengths(code_length_code_lengths, num_symbols, code_lengths, br) {
  let symbol = 0
  let prev_code_len = kDefaultCodeLength
  let repeat = 0
  let repeat_code_len = 0
  let space = 32768

  const table = []
  for (let i = 0; i < 32; i++)
    table.push(new HuffmanCode(0, 0))

  buildHuffmanTable(table, 0, 5, code_length_code_lengths, CODE_LENGTH_CODES)

  while (symbol < num_symbols && space > 0) {
    let p = 0

    br.readMoreInput()
    br.fillBitWindow()
    p += br.val_ >>> br.bit_pos_ & 31
    br.bit_pos_ += table[p].bits
    const code_len = table[p].value & 0xff
    if (code_len < kCodeLengthRepeatCode) {
      repeat = 0
      code_lengths[symbol++] = code_len
      if (code_len !== 0) {
        prev_code_len = code_len
        space -= 32768 >> code_len
      }
    } else {
      const extra_bits = code_len - 14
      let new_len = 0
      if (code_len === kCodeLengthRepeatCode) {
        new_len = prev_code_len
      }
      if (repeat_code_len !== new_len) {
        repeat = 0
        repeat_code_len = new_len
      }
      const old_repeat = repeat
      if (repeat > 0) {
        repeat -= 2
        repeat <<= extra_bits
      }
      repeat += br.readBits(extra_bits) + 3
      const repeat_delta = repeat - old_repeat
      if (symbol + repeat_delta > num_symbols) {
        throw new Error('[ReadHuffmanCodeLengths] symbol + repeat_delta > num_symbols')
      }

      for (let x = 0; x < repeat_delta; x++)
        code_lengths[symbol + x] = repeat_code_len

      symbol += repeat_delta

      if (repeat_code_len !== 0) {
        space -= repeat_delta << 15 - repeat_code_len
      }
    }
  }
  if (space !== 0) {
    throw new Error('[ReadHuffmanCodeLengths] space = ' + space)
  }

  for (; symbol < num_symbols; symbol++)
    code_lengths[symbol] = 0
}


/**
 * Contains a collection of huffman trees with the same alphabet size.
 *
 * @param {number} alphabet_size
 * @param {number} num_htrees
 */
export function HuffmanTreeGroup(alphabet_size, num_htrees) {
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
