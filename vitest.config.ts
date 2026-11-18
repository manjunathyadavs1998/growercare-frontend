import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// SPEC-FE-01 D9: one test run for every app and package; line coverage >= 80 % (generated code and entry points excluded).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['apps/*/src/**/*.test.{ts,tsx}', 'packages/*/src/**/*.test.{ts,tsx}'],
    setupFiles: ['packages/test-utils/src/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['apps/*/src/**/*.{ts,tsx}', 'packages/*/src/**/*.{ts,tsx}'],
      exclude: ['**/generated/**', '**/*.test.{ts,tsx}', '**/main.tsx', 'packages/test-utils/**', '**/*.d.ts', '**/index.ts'],
      reporter: ['text-summary', 'json-summary', 'html'],
      thresholds: { lines: 80 },
    },
  },
});
