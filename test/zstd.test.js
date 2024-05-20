import fs from 'fs'
import { parquetRead, toJson } from 'hyparquet'
import { describe, expect, it } from 'vitest'
import { compressors } from '../src/index.js'

describe('zstd compressor', () => {
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
