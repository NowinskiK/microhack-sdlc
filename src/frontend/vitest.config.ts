import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Playwright specs live in tests/e2e and must only run under `playwright test`.
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
});
