import { resolve } from 'node:path'

/**
 * Resolves local SDK source aliases for host and extension tooling.
 *
 * @param rootDir - Repository root directory.
 * @returns Alias map keyed by SDK import specifier.
 */
export const sdkAliases = (rootDir: string): Record<string, string> => ({
  '@gcs-ssc/extensions/server': resolve(rootDir, 'packages/gcs-ssc-extensions/src/server.ts'),
  '@gcs-ssc/extensions/ui': resolve(rootDir, 'packages/gcs-ssc-extensions/src/ui.ts'),
  '@gcs-ssc/extensions/nuxt': resolve(rootDir, 'packages/gcs-ssc-extensions/src/nuxt.ts'),
  '@gcs-ssc/extensions/testing': resolve(rootDir, 'packages/gcs-ssc-extensions/src/testing.ts'),
  '@gcs-ssc/extensions': resolve(rootDir, 'packages/gcs-ssc-extensions/src/index.ts')
})
