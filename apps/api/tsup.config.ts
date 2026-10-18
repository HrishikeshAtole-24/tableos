import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  clean: true,
  // Bundle workspace packages (they ship TypeScript source).
  noExternal: [/^@tableos\//],
  // Bundled CommonJS code (Prisma's generated client) calls require(); give ESM output a real one.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
