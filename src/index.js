import { decompress as decompressZstd } from 'fzstd'
import { snappyUncompress as decompressSnappy } from 'hysnappy'
import { decompressBrotli } from './brotli.js'
import { gunzip } from './gzip.js'
import { decompressLz4, decompressLz4Raw } from './lz4.js'

export { compressors } from './compressors.js'

/**
 * @param {Uint8Array} input
 * @param {number} outputLength
 * @returns {Uint8Array}
 */
function decompressGzip(input, outputLength) {
  return gunzip(input, new Uint8Array(outputLength))
}

export {
  decompressBrotli,
  decompressGzip,
  decompressLz4,
  decompressLz4Raw,
  decompressSnappy,
  decompressZstd,
  gunzip,
}
