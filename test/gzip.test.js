import fs from 'fs'
import { parquetRead, toJson } from 'hyparquet'
import { describe, expect, it } from 'vitest'
import { gunzip } from '../src/gzip.js'
import { compressors } from '../src/index.js'

describe('gzip compressor', () => {
  it('read empty gzip data', () => {
    const input = new Uint8Array(0)
    const output = new Uint8Array(0)
    gunzip(input, output)
  })

  it('read empty gzip block', () => {
    const input = new Uint8Array([31, 139, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    const output = new Uint8Array(0)
    gunzip(input, output)
  })

  it('read gzip block', () => {
    const input = new Uint8Array([31, 139, 8, 0, 77, 204, 77, 102, 0, 3, 227, 230, 22, 83, 4, 0, 117, 18, 225, 170, 4, 0, 0, 0])
    const output = new Uint8Array(4)
    gunzip(input, output)
    expect(output).toEqual(new Uint8Array([11, 11, 22, 33]))
  })

  it('read gzip repeated block', () => {
    const input = new Uint8Array([
      31, 139, 8, 0, 142, 75, 78, 102,
      0, 3, 237, 192, 1, 13, 0, 0,
      0, 194, 160, 62, 246, 15, 104, 143,
      15, 6, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 1, 7, 69, 96, 68,
      21, 16, 39, 0, 0,
    ])
    const output = new Uint8Array(10000)
    gunzip(input, output)
    expect(output).toEqual(new Uint8Array(new Array(10000).fill(42)))
  })

  it('throw error on invalid gzip data', () => {
    const input = new Uint8Array([31, 139, 8, 4, 0, 0, 0, 0, 0, 255, 255, 0, 0, 0, 0, 0, 0])
    const output = new Uint8Array(4)
    expect(() => gunzip(input, output)).toThrow('unexpected EOF')
  })

  it('read gzip compressed parquet file', async () => {
    const buffer = fs.readFileSync('test/files/concatenated_gzip_members.parquet')
    const file = new Uint8Array(buffer).buffer
    const expected = fs.readFileSync('test/files/concatenated_gzip_members.json').toString()

    await parquetRead({ file, compressors, onComplete: data => {
      expect(data.length).toBe(513)
      expect(toJson(data)).toEqual(JSON.parse(expected))
    } })
  })

  it('read gzip with unknown length', () => {
    const input = new Uint8Array([31, 139, 8, 0, 77, 204, 77, 102, 0, 3, 227, 230, 22, 83, 4, 0, 117, 18, 225, 170, 4, 0, 0, 0])
    const resized = gunzip(input)
    expect(resized).toEqual(new Uint8Array([11, 11, 22, 33]))
  })

  it('gzip raw deflate stream (from avro)', () => {
    const input = new Uint8Array([
      13, 200, 193, 13, 130, 48, 20, 0,
      208, 210, 113, 76, 190, 191, 41, 173,
      5, 183, 249, 45, 63, 194, 161, 208,
      180, 128, 113, 19, 227, 213, 33, 188,
      58, 5, 94, 117, 3, 71, 208, 119, 124,
      207, 170, 212, 116, 68, 236, 47, 137,
      115, 162, 76, 17, 134, 192, 158, 243,
      9, 207, 148, 185, 159, 150, 194, 232,
      151, 113, 28, 184, 96, 228, 153, 58,
      154, 9, 169, 177, 173, 171, 217, 128,
      81, 170, 5, 19, 60, 65, 227, 44,
      131, 213, 174, 33, 29, 14, 74, 187,
      14, 162, 218, 211, 154, 167, 45, 9,
      33, 229, 245, 241, 250, 188, 111, 219,
      253, 91, 73, 33, 118, 255, 17, 63,
    ])
    const expected = new Uint8Array([
      192, 1, 115, 51, 97, 58, 47, 47,
      104, 121, 112, 101, 114, 112, 97, 114,
      97, 109, 45, 105, 99, 101, 98, 101,
      114, 103, 47, 119, 97, 114, 101, 104,
      111, 117, 115, 101, 47, 98, 117, 110,
      110, 105, 101, 115, 47, 109, 101, 116,
      97, 100, 97, 116, 97, 47, 97, 56,
      53, 57, 55, 51, 101, 52, 45, 52,
      48, 48, 57, 45, 52, 99, 98, 97,
      45, 56, 55, 53, 101, 45, 53, 50,
      55, 56, 97, 50, 99, 54, 48, 50,
      55, 100, 45, 109, 48, 46, 97, 118,
      114, 111, 214, 112, 0, 0, 2, 2,
      152, 183, 215, 225, 224, 154, 214, 163,
      240, 1, 2, 0, 0, 42, 0, 0,
      2, 0,
    ])

    const output = gunzip(input)
    expect(output).toEqual(expected)
  })
})
