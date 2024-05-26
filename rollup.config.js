import commonjs from '@rollup/plugin-commonjs'
import resolve from '@rollup/plugin-node-resolve'
import terser from '@rollup/plugin-terser'

export default {
  input: 'src/index.js',
  output: {
    file: 'dist/hyparquet-compressors.min.js',
    format: 'esm',
    sourcemap: true,
  },
  plugins: [
    resolve(), // resolve node dependencies
    commonjs(), // convert commonjs to es6
    terser(), // minify
  ],
}
