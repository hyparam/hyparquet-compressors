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

export function decompressBrotli(input: Uint8Array, outputLength: number): Uint8Array
export function decompressGzip(input: Uint8Array, outputLength: number): Uint8Array
export function decompressLz4(input: Uint8Array, outputLength: number): Uint8Array
export function decompressLz4Raw(input: Uint8Array, outputLength: number): Uint8Array
export function decompressSnappy(input: Uint8Array, outputLength: number): Uint8Array
export function decompressZstd(input: Uint8Array, outputLength: number): Uint8Array
export function gunzip(input: Uint8Array, output?: Uint8Array): Uint8Array
