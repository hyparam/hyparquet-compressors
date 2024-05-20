# hyparquet decompressors

[![npm](https://img.shields.io/npm/v/hyparquet-compressors)](https://www.npmjs.com/package/hyparquet-compressors)
[![workflow status](https://github.com/hyparam/hyparquet-compressors/actions/workflows/ci.yml/badge.svg)](https://github.com/hyparam/hyparquet-compressors/actions)
[![mit license](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
![coverage](https://img.shields.io/badge/Coverage-97-darkred)

This package exports a `compressors` object intended to be passed into [hyparquet](https://github.com/hyparam/hyparquet).

[Apache Parquet](https://parquet.apache.org) is a popular columnar storage format that is widely used in data engineering, data science, and machine learning applications for efficiently storing and processing large datasets. It supports a number of different compression formats, but most parquet files use snappy compression.

The hyparquet library by default only supports `uncompressed` and `snappy` compressed files. The `hyparquet-compressors` package extends support for all legal parquet compression formats.

## Usage

```js
import { parquetRead } from 'hyparquet'
import { compressors } from 'hyparquet-compressors'

await parquetRead({ file, compressors, onComplete: console.log })
```

# Supported compression formats

Parquet compression types supported with `hyparquet-compressors`:
 - [X] Uncompressed
 - [X] Snappy
 - [x] GZip
 - [ ] LZO
 - [X] Brotli
 - [X] LZ4
 - [X] ZSTD
 - [X] LZ4_RAW

# References

 - https://parquet.apache.org/docs/file-format/data-pages/compression/
 - https://en.wikipedia.org/wiki/Gzip
 - https://en.wikipedia.org/wiki/LZ4_(compression_algorithm)
 - https://en.wikipedia.org/wiki/Snappy_(compression)
