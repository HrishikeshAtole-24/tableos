import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup-env.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['src/modules/**/*.ts', 'src/lib/**/*.ts'],
      thresholds: { lines: 80 },
    },
  },
});
