import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/field-types/index.ts'
  ],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  target: 'es2020',
  platform: 'node',
  external: [
    '@graphql-codegen/plugin-helpers',
    'graphql'
  ]
});

