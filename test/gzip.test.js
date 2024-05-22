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
})
