import fs from 'fs'
import { parquetRead, toJson } from 'hyparquet'
import { describe, expect, it } from 'vitest'
import { compressors } from '../src/index.js'
import { decompressLz4, decompressLz4Raw } from '../src/lz4.js'

describe('lz4 compressor', () => {
  it('decodes the extended match from issue #1', () => {
    const block = Uint8Array.from([0x1f, 0, 1, 0, 7, 0x50, 0, 0, 0, 0, 0])
    expect(decompressLz4Raw(block, 32)).toEqual(new Uint8Array(32))
  })

  it.each([
    { matchLength: 15, token: 0x1b, extension: [] },
    { matchLength: 18, token: 0x1e, extension: [] },
    { matchLength: 19, token: 0x1f, extension: [0] },
    { matchLength: 26, token: 0x1f, extension: [7] },
    { matchLength: 274, token: 0x1f, extension: [255, 0] },
    { matchLength: 529, token: 0x1f, extension: [255, 255, 0] },
  ])('decodes a $matchLength-byte match', ({ matchLength, token, extension }) => {
    // One literal, an overlapping match at offset 1, then five final literals.
    const block = Uint8Array.from([token, 65, 1, 0, ...extension, 0x50, 66, 67, 68, 69, 70])
    const expected = new Uint8Array(matchLength + 6).fill(65)
    expected.set([66, 67, 68, 69, 70], matchLength + 1)

    expect(decompressLz4Raw(block, expected.length)).toEqual(expected)
    expect(decompressLz4(block, expected.length)).toEqual(expected)

    const framed = new Uint8Array(block.length + 8)
    const header = new DataView(framed.buffer)
    header.setUint32(0, expected.length)
    header.setUint32(4, block.length)
    framed.set(block, 8)
    expect(decompressLz4(framed, expected.length)).toEqual(expected)
  })

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
