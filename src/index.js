import BROTLI from 'brotli/decompress.js'
import { decompress as ZSTD } from 'fzstd'
import { snappyUncompressor } from 'hysnappy'
import pako from 'pako'
import { LZ4, LZ4_RAW } from './lz4.js'

/**
 * @type {import('hyparquet').Compressors}
 */
export const compressors = {
  SNAPPY: snappyUncompressor(),
  GZIP: input => pako.ungzip(input),
  // @ts-expect-error brotli expects Buffer but Uint8Array works
  BROTLI,
  ZSTD: input => ZSTD(input),
  LZ4,
  LZ4_RAW,
}
