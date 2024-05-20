export type CompressionCodec =
  'UNCOMPRESSED' |
  'SNAPPY' |
  'GZIP' |
  'LZO' |
  'BROTLI' |
  'LZ4' |
  'ZSTD' |
  'LZ4_RAW'

export type Compressors = {
  [K in CompressionCodec]?: (input: Uint8Array, outputLength: number) => Uint8Array
}

export const compressors: Compressors
