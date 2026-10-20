import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    // Let palette.test.ts read tokens.css?raw (Vitest blanks CSS by default).
    css: { include: [/tokens\.css/] },
    // Shared, RAM-tight machine: keep the worker pool small.
    maxWorkers: 2,
  },
});
