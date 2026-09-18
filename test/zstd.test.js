import fs from 'fs'
import { zstdCompressSync } from 'node:zlib'
import { parquetRead, toJson } from 'hyparquet'
import { describe, expect, it } from 'vitest'
import { compressors, decompressZstd } from '../src/index.js'

describe('zstd compressor', () => {
  it('decompresses with an optional output buffer', () => {
    const expected = new Uint8Array([1, 2, 3, 4, 5])
    const compressed = zstdCompressSync(expected)
    expect(decompressZstd(compressed)).toEqual(expected)
    const output = new Uint8Array(expected.length)
    expect(decompressZstd(compressed, output)).toBe(output)
    expect(output).toEqual(expected)
  })

  it('read zstd compressed parquet file wiki_1k', async () => {
    const buffer = fs.readFileSync('test/files/wiki_1k.zstd.parquet')
    const file = new Uint8Array(buffer).buffer
    const expected = fs.readFileSync('test/files/wiki_1k.zstd.json').toString()

    await parquetRead({ file, compressors, onComplete: data => {
      expect(data.length).toBe(1024)
      expect(toJson(data)).toEqual(JSON.parse(expected))
    } })
  })
})
