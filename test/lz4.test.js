import fs from 'fs'
import { parquetRead, toJson } from 'hyparquet'
import { describe, expect, it } from 'vitest'
import { compressors } from '../src/index.js'

describe('lz4 compressor', () => {
  it('should read lz4 compressed parquet file', async () => {
    const buffer = fs.readFileSync('test/files/non_hadoop_lz4_compressed.parquet')
    const file = new Uint8Array(buffer).buffer
    const expected = fs.readFileSync('test/files/non_hadoop_lz4_compressed.json').toString()

    await parquetRead({ file, compressors, onComplete: data => {
      expect(data.length).toBe(4)
      expect(toJson(data)).toEqual(JSON.parse(expected))
    } })
  })
})
