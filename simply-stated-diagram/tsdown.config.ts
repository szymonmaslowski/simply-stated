import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/bin.ts'],
  format: ['esm', 'cjs'],
  platform: 'node',
  target: 'es2022',
  dts: true,
  outExtensions: ({ format }) => ({
    js: format === 'es' ? '.js' : '.cjs',
    dts: format === 'es' ? '.d.ts' : '.d.cts',
  }),
  sourcemap: true,
  publint: true,
  attw: { profile: 'node16' },
  failOnWarn: true,
});
