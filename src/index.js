import { snappyUncompressor } from 'hysnappy'
import lz4 from 'lz4'
import pako from 'pako'

/**
 * @type {import('hyparquet').Compressors}
 */
export const compressors = {
  SNAPPY: snappyUncompressor(),
  GZIP: input => pako.ungzip(input),
  BROTLI: () => new Uint8Array(), // TODO
  ZSTD: () => new Uint8Array(), // TODO
  LZ4: (input, outputLength) => {
    const out = Buffer.alloc(outputLength)
    lz4.decodeBlock(Buffer.from(input), out)
    return out
  },
}
