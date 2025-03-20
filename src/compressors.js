import { decompress as decompressZstd } from 'fzstd'
import { snappyUncompressor } from 'hysnappy'
import { decompressBrotli } from './brotli.js'
import { gunzip } from './gzip.js'
import { decompressLz4, decompressLz4Raw } from './lz4.js'

/** @type {import('hyparquet').Compressors} */
export const compressors = {
  SNAPPY: snappyUncompressor(), // loads wasm
  GZIP: (input, length) => gunzip(input, new Uint8Array(length)),
  BROTLI: decompressBrotli,
  ZSTD: input => decompressZstd(input),
  LZ4: decompressLz4,
  LZ4_RAW: decompressLz4Raw,
}
