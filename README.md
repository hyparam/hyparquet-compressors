# hyparquet decompressors

This package exports a `compressors` object intended to be passed into [hyparquet](https://github.com/hyparam/hyparquet) in order to support all possible Apache Parquet files.

## Usage

```js
import { parquetRead } from 'hyparquet'
import { compressors } from 'hyparquet-compressors'

parquetRead({ file, compressors })
```
