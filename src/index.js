import { snappyUncompressor } from 'hysnappy'
import pako from 'pako'

/**
 * @typedef {import('hyparquet').Compressors} Compressors
 */
export const compressors = {
  SNAPPY: snappyUncompressor(),
  GZIP: (/** @type {Uint8Array} */ input) => pako.ungzip(input),
  BROTLI: () => new Uint8Array(), // TODO
  ZSTD: () => new Uint8Array(), // TODO
}
