import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/field-types/index.ts'
  ],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'es2020',
  platform: 'node',
  exports: true,
  deps: {
    neverBundle: [
      '@graphql-codegen/plugin-helpers',
      'graphql'
    ]
  }
});

