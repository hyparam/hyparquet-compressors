import { decompress as ZSTD } from 'fzstd'
import { snappyUncompressor } from 'hysnappy'
import { BROTLI } from './brotli.js'
import { gunzip } from './gzip.js'
import { LZ4, LZ4_RAW } from './lz4.js'

/**
 * @type {import('hyparquet').Compressors}
 */
export const compressors = {
  SNAPPY: snappyUncompressor(),
  GZIP: (input, length) => {
    const out = new Uint8Array(length)
    gunzip(input, out)
    return out
  },
  BROTLI,
  ZSTD: input => ZSTD(input),
  LZ4,
  LZ4_RAW,
}
