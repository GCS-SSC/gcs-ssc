import { defineConfig } from 'vitest/config'
import base from './vitest.config'

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['tooling/gcs-ssc/tests/unit/diagrams/**/*.test.ts'],
    coverage: {
      ...base.test?.coverage,
      include: ['packages/gcs-ssc-diagrams/src/**/*.{ts,vue}'],
      reportsDirectory: 'coverage/diagrams'
    }
  }
})
