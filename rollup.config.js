import resolve from '@rollup/plugin-node-resolve'
import terser from '@rollup/plugin-terser'

export default {
  input: 'src/index.js',
  output: {
    file: 'dist/bundle.min.js',
    format: 'esm',
    sourcemap: true,
  },
  plugins: [
    resolve(), // resolve node dependencies
    terser(), // minify
  ],
}
