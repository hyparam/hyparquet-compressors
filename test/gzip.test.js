import fs from 'fs'
import { parquetRead, toJson } from 'hyparquet'
import { describe, expect, it } from 'vitest'
import { compressors } from '../src/index.js'

describe('gzip compressor', () => {
  it('should read gzip compressed file', async () => {
    const buffer = fs.readFileSync('test/files/concatenated_gzip_members.parquet')
    const file = new Uint8Array(buffer).buffer
    const expected = fs.readFileSync('test/files/concatenated_gzip_members.json').toString()

    await parquetRead({ file, compressors, onComplete: data => {
      expect(data.length).toBe(513)
      expect(toJson(data)).toEqual(JSON.parse(expected))
    } })
  })
})
