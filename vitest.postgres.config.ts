import { defineConfig } from 'vitest/config'
import unitConfig from './vitest.config'

export default defineConfig({
  ...unitConfig,
  test: {
    ...unitConfig.test,
    environment: 'node',
    fileParallelism: false,
    hookTimeout: 30_000,
    include: ['tooling/gcs-ssc/tests/integration/**/*.test.ts'],
    testTimeout: 30_000
  }
})
