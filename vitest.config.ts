import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Covered by e2e tests instead: main.ts (the @ts-nocheck legacy script until step 2.9) and the
      // test hooks, which only run in a browser.
      exclude: ['src/main.ts', 'src/testing/**'],
      reporter: ['text', 'html', 'lcov'],
      // Pure modules must stay ≥ 90 % covered (docs/refactor-plan.md). Add new pure folders here.
      thresholds: {
        'src/config/**': { lines: 90, functions: 90, branches: 90, statements: 90 },
        'src/world/colors.ts': { lines: 90, functions: 90, branches: 90, statements: 90 },
      },
    },
  },
});
