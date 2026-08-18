import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/adapters/redux-toolkit/index.ts',
    'src/adapters/zustand/index.ts',
  ],
  format: ['esm', 'cjs'],
  platform: 'neutral',
  target: 'es2020',
  dts: true,
  sourcemap: true,
  publint: true,
  attw: { profile: 'node16' },
  failOnWarn: true,
});
