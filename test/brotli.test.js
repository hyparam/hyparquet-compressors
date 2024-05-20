import fs from 'fs'
import { parquetRead, toJson } from 'hyparquet'
import { describe, expect, it } from 'vitest'
import { compressors } from '../src/index.js'

describe('brotli compressor', () => {
  it('read brotli compressed parquet file brotli_compressed', async () => {
    const buffer = fs.readFileSync('test/files/brotli_compressed.parquet')
    const file = new Uint8Array(buffer).buffer
    const expected = fs.readFileSync('test/files/brotli_compressed.json').toString()

    await parquetRead({ file, compressors, onComplete: data => {
      expect(data.length).toBe(4)
      expect(toJson(data)).toEqual(JSON.parse(expected))
    } })
  })
})
