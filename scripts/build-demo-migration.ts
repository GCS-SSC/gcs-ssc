/* eslint-disable jsdoc/require-jsdoc -- Build-tool callbacks are described by Bun's plugin contract. */
import { existsSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import type { BunPlugin } from 'bun'

const repositoryRoot = process.cwd()
const outputPath = path.resolve(process.argv[2] ?? '.output/server/demo-migrations/demo.mjs')
const resolveNuxtRootImport = (importPath: string): string => {
  const unresolvedPath = path.resolve(repositoryRoot, importPath.slice(3))
  const candidates = [unresolvedPath, `${unresolvedPath}.ts`, `${unresolvedPath}.mjs`, `${unresolvedPath}.json`, path.join(unresolvedPath, 'index.ts')]
  const resolvedPath = candidates.find(candidate => existsSync(candidate) && statSync(candidate).isFile())
  if (!resolvedPath) {
    throw new Error(`Could not resolve Nuxt root alias: ${importPath}`)
  }
  return resolvedPath
}

const nuxtAliasesPlugin: BunPlugin = {
  name: 'nuxt-root-aliases',
  setup: (build) => {
    build.onResolve({ filter: /^~~\// }, ({ path: importPath }) => ({
      path: resolveNuxtRootImport(importPath)
    }))
    build.onResolve({ filter: /^#gcs-extensions\/server-registry$/ }, () => ({
      path: path.resolve(repositoryRoot, '.nuxt/gcs-extensions/server-registry.mjs')
    }))
    build.onResolve({ filter: /^kysely-pglite$/ }, () => ({
      path: realpathSync(path.resolve(repositoryRoot, 'node_modules/kysely-pglite/dist/kysely-pglite.js'))
    }))
  }
}

const result = await Bun.build({
  entrypoints: [path.resolve(repositoryRoot, 'server/database/migrations/9999_seed.ts')],
  outdir: path.dirname(outputPath),
  naming: path.basename(outputPath),
  target: 'node',
  format: 'esm',
  plugins: [nuxtAliasesPlugin]
})

if (!result.success) {
  throw new AggregateError(result.logs, 'Failed to bundle the demo migration')
}
