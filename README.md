# hyparquet decompressors

![hyparquet parakeets](hyparquet-compressors.jpg)

[![npm](https://img.shields.io/npm/v/hyparquet-compressors)](https://www.npmjs.com/package/hyparquet-compressors)
[![workflow status](https://github.com/hyparam/hyparquet-compressors/actions/workflows/ci.yml/badge.svg)](https://github.com/hyparam/hyparquet-compressors/actions)
[![mit license](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
![coverage](https://img.shields.io/badge/Coverage-86-darkred)

This package exports a `compressors` object intended to be passed into [hyparquet](https://github.com/hyparam/hyparquet).

[Apache Parquet](https://parquet.apache.org) is a popular columnar storage format that is widely used in data engineering, data science, and machine learning applications for efficiently storing and processing large datasets. It supports a number of different compression formats, but most parquet files use snappy compression.

The hyparquet library by default only supports `uncompressed` and `snappy` compressed files. The `hyparquet-compressors` package extends support for all legal parquet compression formats.

The `hyparquet-compressors` package works in both node.js and the browser. Uses js and wasm packages, no system dependencies.

## Usage

```js
import { parquetRead } from 'hyparquet'
import { compressors } from 'hyparquet-compressors'

await parquetRead({ file, compressors, onComplete: console.log })
```

See [hyparquet](https://github.com/hyparam/hyparquet) repo for further info.

# Compression formats

Parquet compression types supported with `hyparquet-compressors`:
 - [X] Uncompressed
 - [X] Snappy
 - [x] Gzip
 - [ ] LZO
 - [X] Brotli
 - [X] LZ4
 - [X] ZSTD
 - [X] LZ4_RAW

## Snappy

Snappy compression uses [hysnappy](https://github.com/hyparam/hysnappy) for fast snappy decompression using minimal wasm.

## Gzip

New gzip implementation adapted from [fflate](https://github.com/101arrowz/fflate).
Includes modifications to handle repeated back-to-back gzip streams that sometimes occur in parquet files (but was not supported by fflate).

## Brotli

Includes a minimal port of [brotli.js](https://github.com/foliojs/brotli.js) which pre-compresses the brotli dictionary using gzip to minimize the distribution bundle size.

## LZ4

New LZ4 implementation includes support for legacy hadoop LZ4 frame format used on some old parquet files.

## Zstd

Uses [fzstd](https://github.com/101arrowz/fzstd) for Zstandard decompression.

# Bundle size

| File | Size |
| --- | --- |
| hyparquet-compressors.min.js | 116.1kb |
| hyparquet-compressors.min.js.gz | 75.2kb |

# References

 - https://parquet.apache.org/docs/file-format/data-pages/compression/
 - https://en.wikipedia.org/wiki/Brotli
 - https://en.wikipedia.org/wiki/Gzip
 - https://en.wikipedia.org/wiki/LZ4_(compression_algorithm)
 - https://en.wikipedia.org/wiki/Snappy_(compression)
 - https://en.wikipedia.org/wiki/Zstd
 - https://github.com/101arrowz/fflate
 - https://github.com/101arrowz/fzstd
 - https://github.com/foliojs/brotli.js
 - https://github.com/hyparam/hysnappy
