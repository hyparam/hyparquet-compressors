import fs from 'fs'
import { parquetRead, toJson } from 'hyparquet'
import { describe, expect, it } from 'vitest'
import { compressors } from '../src/index.js'

describe('lz4 compressor', () => {
  it('read lz4 compressed parquet file hadoop_lz4_compressed', async () => {
    const buffer = fs.readFileSync('test/files/hadoop_lz4_compressed.parquet')
    const file = new Uint8Array(buffer).buffer
    const expected = fs.readFileSync('test/files/lz4_compressed.json').toString()

    await parquetRead({ file, compressors, onComplete: data => {
      expect(data.length).toBe(4)
      expect(toJson(data)).toEqual(JSON.parse(expected))
    } })
  })

  it('read lz4 compressed parquet file hadoop_lz4_compressed_larger', async () => {
    const buffer = fs.readFileSync('test/files/hadoop_lz4_compressed_larger.parquet')
    const file = new Uint8Array(buffer).buffer
    const expected = fs.readFileSync('test/files/hadoop_lz4_compressed_larger.json').toString()

    await parquetRead({ file, compressors, onComplete: data => {
      expect(data.length).toBe(10000)
      expect(toJson(data)).toEqual(JSON.parse(expected))
    } })
  })

  it('read lz4 compressed parquet file lz4_raw_compressed', async () => {
    const buffer = fs.readFileSync('test/files/lz4_raw_compressed.parquet')
    const file = new Uint8Array(buffer).buffer
    const expected = fs.readFileSync('test/files/lz4_compressed.json').toString()

    await parquetRead({ file, compressors, onComplete: data => {
      expect(data.length).toBe(4)
      expect(toJson(data)).toEqual(JSON.parse(expected))
    } })
  })

  it('read lz4 compressed parquet file non_hadoop_lz4_compressed', async () => {
    const buffer = fs.readFileSync('test/files/non_hadoop_lz4_compressed.parquet')
    const file = new Uint8Array(buffer).buffer
    const expected = fs.readFileSync('test/files/lz4_compressed.json').toString()

    await parquetRead({ file, compressors, onComplete: data => {
      expect(data.length).toBe(4)
      expect(toJson(data)).toEqual(JSON.parse(expected))
    } })
  })
})
