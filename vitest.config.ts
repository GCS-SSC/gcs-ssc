import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import UiActionVitestReporter from './.agents/skills/gcs-ssc/scripts/whole-review/ui-action-vitest-reporter'

export default defineConfig({
  plugins: [vue()],
  ssr: {
    noExternal: ['@nuxt/ui']
  },
  resolve: {
    alias: [
      { find: '~', replacement: fileURLToPath(new URL('./app', import.meta.url)) },
      { find: '~~', replacement: fileURLToPath(new URL('.', import.meta.url)) },
      { find: /^@gcs-ssc\/extensions\/server$/, replacement: fileURLToPath(new URL('./packages/gcs-ssc-extensions/src/server.ts', import.meta.url)) },
      { find: /^@gcs-ssc\/extensions\/ui$/, replacement: fileURLToPath(new URL('./packages/gcs-ssc-extensions/src/ui.ts', import.meta.url)) },
      { find: /^@gcs-ssc\/extensions\/nuxt$/, replacement: fileURLToPath(new URL('./packages/gcs-ssc-extensions/src/nuxt.ts', import.meta.url)) },
      { find: /^@gcs-ssc\/extensions\/testing$/, replacement: fileURLToPath(new URL('./packages/gcs-ssc-extensions/src/testing.ts', import.meta.url)) },
      { find: /^@gcs-ssc\/extensions$/, replacement: fileURLToPath(new URL('./packages/gcs-ssc-extensions/src/index.ts', import.meta.url)) },
      { find: '#build/app.config', replacement: fileURLToPath(new URL('./.nuxt/app.config.mjs', import.meta.url)) },
      { find: /^#build\/ui\/(.+)$/, replacement: `${fileURLToPath(new URL('./.nuxt/ui/', import.meta.url))}$1.ts` },
      { find: '#components', replacement: fileURLToPath(new URL('./tooling/gcs-ssc/tests/fixtures/nuxt-components.ts', import.meta.url)) },
      { find: '#imports', replacement: fileURLToPath(new URL('./tooling/gcs-ssc/tests/fixtures/nuxt-imports.ts', import.meta.url)) },
      { find: '#gcs-extensions/metadata', replacement: fileURLToPath(new URL('./tooling/gcs-ssc/tests/fixtures/empty-gcs-extension-registry.ts', import.meta.url)) },
      { find: '#gcs-extensions/registry', replacement: fileURLToPath(new URL('./tooling/gcs-ssc/tests/fixtures/empty-gcs-extension-registry.ts', import.meta.url)) },
      { find: '#gcs-extensions/server-registry', replacement: fileURLToPath(new URL('./tooling/gcs-ssc/tests/fixtures/empty-gcs-extension-registry.ts', import.meta.url)) }
    ]
  },
  test: {
    reporters: process.env.GCS_UI_ACTION_RESULT_PATH ? ['default', new UiActionVitestReporter()] : ['default'],
    setupFiles: ['./tooling/gcs-ssc/tests/unit/setup.ts'],
    include: ['tooling/gcs-ssc/tests/unit/**/*.test.ts'],
    exclude: ['tooling/gcs-ssc/tests/e2e/**', 'node_modules/**', '.nuxt/**', '.output/**'],
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'coverage/unit',
      excludeAfterRemap: true,
      include: [
        'server/**/*.ts',
        'shared/**/*.ts',
        'app/utils/**/*.ts',
        'app/composables/useUrlTabState.ts'
      ],
      exclude: [
        'app/composables/!(useUrlTabState).ts',
        'app/composables/*/**/*',
        'i18n/**',
        'modules/**',
        'scripts/**',
        'server/tests/**',
        'tests/**',
        'extensions/**/tests/**',
        'extensions/**',
        'server/utils/!(applicant-recipient-auth|authorize|entity-team|entity-team-routes|rbac|team-auth).ts',
        'extensions/**/client/**',
        'extensions/**/extension.config.ts',
        'server/database/migrations/**',
        'server/plugins/**',
        'app/components/**',
        'app/types/**',
        'app/pages/**',
        'app/layouts/**',
        'app/middleware/**',
        'app/app.vue',
        'app/error.vue',
        'app/app.config.ts',
        'shared/types/*.ts',
        'shared/types/index.ts',
        'shared/types/schemas/index.ts',
        'shared/types/schemas/assessment/currentassessment.ts',
        'shared/utils/extensions.ts',
        '**/*.d.ts'
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80
      }
    }
  }
})
