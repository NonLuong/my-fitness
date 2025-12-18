import { defineConfig } from 'vitest/config';
import tsconfig from './tsconfig.vitest.json';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: false,
  },
  esbuild: {
    tsconfigRaw: tsconfig as unknown as Record<string, unknown>,
  },
});
