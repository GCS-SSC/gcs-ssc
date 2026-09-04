import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const repositoryRoot = resolve(import.meta.dir, '..')
/**
 * Resolves a worker import to its source file during the standalone build.
 * @param path - Candidate import path.
 * @returns The first matching source file, or the original path.
 */
const resolveSource = (path: string) => {
  const candidates = [path, `${path}.ts`, `${path}.mjs`, `${path}.js`, resolve(path, 'index.ts')]
  const match = candidates.find(candidate => existsSync(candidate) && statSync(candidate).isFile())
  return match ?? path
}

const result = await Bun.build({
  entrypoints: [resolve(repositoryRoot, 'server/workers/storage-cleanup-drain.ts')],
  define: {
    'import.meta.dev': 'false',
    'process.env.NODE_ENV': JSON.stringify('production')
  },
  external: ['@electric-sql/*', 'kysely', 'kysely-pglite'],
  format: 'esm',
  outdir: resolve(repositoryRoot, '.output/server'),
  naming: 'storage-cleanup-drain.mjs',
  plugins: [{
    name: 'nuxt-worker-aliases',
    /**
     * Registers aliases that Nuxt normally supplies at runtime.
     * @param build - Bun plugin builder.
     */
    setup: build => {
      build.onResolve({ filter: /^~~\// }, args => ({
        path: resolveSource(resolve(repositoryRoot, args.path.slice(3)))
      }))
      build.onResolve({ filter: /^#gcs-extensions\/server-registry$/ }, () => ({
        path: resolve(repositoryRoot, '.nuxt/gcs-extensions/server-registry.mjs')
      }))
    }
  }],
  target: 'node'
})

if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exitCode = 1
}
