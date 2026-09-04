import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'

const systemChromiumPaths = ['/usr/bin/chromium', '/usr/bin/chromium-browser']
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH
  || systemChromiumPaths.find(path => existsSync(path))
const uiActionReporterPath = process.env.GCS_UI_ACTION_REPORTER_PATH
  || fileURLToPath(new URL('./.agents/skills/gcs-ssc/scripts/whole-review/ui-action-playwright-reporter.ts', import.meta.url))

/**
 * Resolves the number of parallel workers for Playwright tests.
 * Supports literal numbers (as strings) and percentage strings (e.g., '50%').
 * Falls back to a default value if the input is invalid or not provided.
 *
 * @param {string | undefined} value - The worker configuration string (usually from process.env).
 * @param {number} fallback - The default number of workers to use.
 * @returns {number | string} The resolved worker count or percentage string.
 */
const toWorkers = (value: string | undefined, fallback: number): number | string => {
  if (!value) {
    return fallback
  }

  if (/^\d+%$/.test(value)) {
    return value
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export default defineConfig({
  reporter: process.env.GCS_UI_ACTION_RESULT_PATH
    ? [['list'], [uiActionReporterPath]]
    : 'list',
  testDir: './tooling/gcs-ssc/tests/e2e',
  testIgnore: process.env.E2E_REVIEW_SCRATCH === '1' ? [] : ['**/*.tmp.spec.ts'],
  // Constrain local resource usage by default; can be overridden per run.
  workers: toWorkers(process.env.PLAYWRIGHT_WORKERS, 1),
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    browserName: 'chromium',
    executablePath: chromiumExecutablePath,
    channel: chromiumExecutablePath
      ? undefined
      : process.env.PLAYWRIGHT_CHANNEL || 'chrome',
    headless: true,
    trace: 'off',
    video: 'off',
    screenshot: 'only-on-failure'
  }
})
