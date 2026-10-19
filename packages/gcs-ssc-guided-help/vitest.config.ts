import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({ plugins: [vue()], test: {
  environment: 'node', include: ['tests/unit/**/*.test.ts'], maxWorkers: 1, setupFiles: ['tests/setup-svg.ts'],
  coverage: { provider: 'v8', reporter: ['text', 'json-summary'], reportsDirectory: 'coverage/unit', include: ['src/**/*.ts', 'src/**/*.vue'], thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 } }
} })
