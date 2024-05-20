import { snappyUncompressor } from 'hysnappy'
import pako from 'pako'
import { LZ4, LZ4_RAW } from './lz4.js'

/**
 * @type {import('hyparquet').Compressors}
 */
export const compressors = {
  SNAPPY: snappyUncompressor(),
  GZIP: input => pako.ungzip(input),
  BROTLI: () => new Uint8Array(), // TODO
  ZSTD: () => new Uint8Array(), // TODO
  LZ4,
  LZ4_RAW,
}
