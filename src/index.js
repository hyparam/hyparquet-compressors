import BROTLI from 'brotli/decompress.js'
import { decompress as ZSTD } from 'fzstd'
import { snappyUncompressor } from 'hysnappy'
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
  // @ts-expect-error brotli expects Buffer but Uint8Array works
  BROTLI,
  ZSTD: input => ZSTD(input),
  LZ4,
  LZ4_RAW,
}
