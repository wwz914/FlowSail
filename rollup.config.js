import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import typescript from 'rollup-plugin-typescript2';
import postcss from 'rollup-plugin-postcss';

export default {
  input: 'packages/react/src/index.ts', // 入口文件可根据实际调整
  output: {
    dir: 'dist',
    format: 'esm',
    sourcemap: true,
  },
  plugins: [
    resolve(),
    commonjs(),
    typescript(),
    postcss({
      extract: true,
      modules: true,
    }),
  ],
  external: ['react', 'react-dom'],
};