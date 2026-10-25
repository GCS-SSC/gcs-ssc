/* eslint-disable jsdoc/require-jsdoc -- Build-tool callbacks are described by Bun's plugin contract. */
import { readFile } from 'node:fs/promises'
import { buildUiTargetCatalog, collectUiTargetSources } from '../modules/ui-targets/source'
import { guidedHelpLedger } from '../shared/guided-help/catalog'
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
    build.onResolve({ filter: /^#ui-targets$/ }, () => ({ path: '#ui-targets', namespace: 'ui-targets' }))
    build.onLoad({ filter: /.*/, namespace: 'ui-targets' }, async () => {
      const locales = {
        en: JSON.parse(await readFile(path.resolve(repositoryRoot, 'i18n/locales/en.json'), 'utf8')),
        fr: JSON.parse(await readFile(path.resolve(repositoryRoot, 'i18n/locales/fr.json'), 'utf8'))
      }
      const catalog = buildUiTargetCatalog({ sources: await collectUiTargetSources(repositoryRoot), locales, ledger: guidedHelpLedger })
      if (catalog.diagnostics.length) throw new Error(catalog.diagnostics.map(item => `${item.filename}:${item.line}: ${item.message}`).join('\n'))
      return { contents: `export const uiTargetRegistry = ${JSON.stringify(catalog.uiTargetRegistry)}; export const guidedHelpLedger = ${JSON.stringify(catalog.guidedHelpLedger)};`, loader: 'js' }
    })
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
  entrypoints: [path.resolve(repositoryRoot, 'server/database/demo-migrations-bundle.ts')],
  outdir: path.dirname(outputPath),
  naming: path.basename(outputPath),
  target: 'node',
  format: 'esm',
  plugins: [nuxtAliasesPlugin]
})

if (!result.success) {
  throw new AggregateError(result.logs, 'Failed to bundle the demo migration')
}
