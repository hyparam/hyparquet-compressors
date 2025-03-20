# hyparquet decompressors

![hyparquet parakeets](hyparquet-compressors.jpg)

[![npm](https://img.shields.io/npm/v/hyparquet-compressors)](https://www.npmjs.com/package/hyparquet-compressors)
[![minzipped](https://img.shields.io/bundlephobia/minzip/hyparquet-compressors)](https://www.npmjs.com/package/hyparquet-compressors)
[![workflow status](https://github.com/hyparam/hyparquet-compressors/actions/workflows/ci.yml/badge.svg)](https://github.com/hyparam/hyparquet-compressors/actions)
[![mit license](https://img.shields.io/badge/License-MIT-orange.svg)](https://opensource.org/licenses/MIT)
![coverage](https://img.shields.io/badge/Coverage-86-darkred)

This package provides decompressors for various compression codecs.
It is designed to be used with [hyparquet](https://github.com/hyparam/hyparquet) in order to provide full support for all parquet compression formats.

## Introduction

[Apache Parquet](https://parquet.apache.org) is a popular columnar storage format that is widely used in data engineering, data science, and machine learning applications for efficiently storing and processing large datasets. It supports a number of different compression formats, but most parquet files use snappy compression.

[Hyparquet](https://github.com/hyparam/hyparquet) is a fast and lightweight parquet reader that is designed to work in both node.js and the browser.

By default, hyparquet only supports `uncompressed` and `snappy` compressed files (the most common parquet compression codecs). The `hyparquet-compressors` package extends support for all legal parquet compression formats.

`hyparquet-compressors` works in both node.js and the browser. Uses js and wasm packages, no system dependencies.

## Hyparquet

To use `hyparquet-compressors` with `hyparquet`, simply pass the `compressors` object to the `parquetReadObjects` function.

```js
import { parquetReadObjects } from 'hyparquet'
import { compressors } from 'hyparquet-compressors'

const data = await parquetReadObjects({ file, compressors })
```

See [hyparquet](https://github.com/hyparam/hyparquet) repo for more info.

## Compression formats

Parquet compression types supported with `hyparquet-compressors`:
 - [X] Uncompressed
 - [X] Snappy
 - [x] Gzip
 - [ ] LZO
 - [X] Brotli
 - [X] LZ4
 - [X] ZSTD
 - [X] LZ4_RAW

### Snappy

Snappy compression uses [hysnappy](https://github.com/hyparam/hysnappy) for fast snappy decompression using a minimal [WASM](https://en.wikipedia.org/wiki/WebAssembly) module.

We load the wasm module _synchronously_ from base64 in the js file. This avoids a network request, and greatly simplifies bundling and serving wasm.

### Gzip

New gzip implementation adapted from [fflate](https://github.com/101arrowz/fflate).
Includes modifications to handle repeated back-to-back gzip streams that sometimes occur in parquet files (but are not supported by fflate).

For gzip, the `output` buffer argument is optional:
 - If `output` is defined, the decompressor will write to `output` until it is full.
 - If `output` is undefined, the decompressor will allocate a new buffer, and expand it as needed to fit the uncompressed gzip data. Importantly, the caller should use the _returned_ buffer.

### Brotli

Includes a minimal port of [brotli.js](https://github.com/foliojs/brotli.js).
Our implementation uses gzip to pre-compress the brotli dictionary, in order to  minimize the bundle size.

### LZ4

New LZ4 implementation includes support for legacy hadoop LZ4 frame format used on some old parquet files.

### Zstd

Uses [fzstd](https://github.com/101arrowz/fzstd) for Zstandard decompression.

## Bundle size

| File | Size |
| --- | --- |
| hyparquet-compressors.min.js | 116.4kb |
| hyparquet-compressors.min.js.gz | 75.2kb |

## References

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
