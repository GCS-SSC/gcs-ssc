import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { addTemplate, addVitePlugin, addTypeTemplate, defineNuxtModule, updateTemplates } from '@nuxt/kit'
import { guidedHelpLedger as approvedLedger } from '../shared/guided-help/catalog.ts'
import { buildUiTargetCatalog, collectUiTargetSources, scanUiTargetSource } from './ui-targets/source.ts'

/** The build and the browser use identities derived from the same public declarations. */
export default defineNuxtModule({
  meta: { name: 'gcs-ui-targets' },
  /**
   *
   * @param _options Unused module configuration.
   * @param nuxt The Nuxt application being configured.
   */
  setup: async (_options, nuxt) => {
    const root = nuxt.options.rootDir
    const loadLocales = async () => ({
      en: JSON.parse(await readFile(resolve(root, 'i18n/locales/en.json'), 'utf8')),
      fr: JSON.parse(await readFile(resolve(root, 'i18n/locales/fr.json'), 'utf8'))
    })
    let locales = await loadLocales()
    let sources = await collectUiTargetSources(root)
    /**
     *
     * @returns The validated source-backed runtime catalog.
     */
    const build = () => {
      const catalog = buildUiTargetCatalog({ sources, locales, ledger: approvedLedger })
      if (catalog.diagnostics.length) throw new Error(catalog.diagnostics.map(item => `${item.filename}:${item.line} [${item.code}] ${item.message}`).join('\n'))
      return catalog
    }
    let catalog = build()
    const template = addTemplate({
      filename: 'ui-targets/catalog.mjs',
      write: true,
      /**
       *
       * @returns Generated runtime JavaScript.
       */
      getContents: () => `/** @type {import(${JSON.stringify(resolve(root, 'shared/ui-targets/types'))}).UiTargetRegistry} */
export const uiTargetRegistry = ${JSON.stringify(catalog.uiTargetRegistry)}
/** @type {import('@gcs-ssc/guided-help/contracts').TargetLedger} */
export const guidedHelpLedger = ${JSON.stringify(catalog.guidedHelpLedger)}
`
    })
    addTypeTemplate({
      filename: 'types/ui-targets.d.ts',
      getContents: () => `declare module '#ui-targets' {
  export const uiTargetRegistry: import(${JSON.stringify(resolve(root, 'shared/ui-targets/types'))}).UiTargetRegistry
  export const guidedHelpLedger: import('@gcs-ssc/guided-help/contracts').TargetLedger
}`
    }, { nuxt: true, nitro: true })
    nuxt.options.alias['#ui-targets'] = template.dst
    nuxt.hook('nitro:config', config => {
      config.alias = { ...config.alias, '#ui-targets': template.dst }
      config.devServer ??= {}
      config.devServer.watch = [...(config.devServer.watch ?? []), template.dst]
    })
    nuxt.hook('builder:watch', async (_event, path) => {
      if (!/\.(vue|json|ts)$/.test(path) || /(?:node_modules|\.nuxt|\.output)\//.test(path)) return
      locales = await loadLocales()
      sources = await collectUiTargetSources(root)
      catalog = build()
      await updateTemplates({ filter: item => item.filename === template.filename })
    })
    addVitePlugin({
      name: 'gcs-ui-target-identities',
      enforce: 'pre',
      /**
       * @param code The original Vue source.
       * @param id The compiler source filename.
       * @returns Generated runtime JavaScript.
       */
      transform: (code, id) => {
        if (!id.endsWith('.vue') || id.includes('/node_modules/')) return null
        const source = sources.find(item => resolve(root, item.filename) === id)
        if (!source) return null
        const transformed = scanUiTargetSource({ source: { ...source, source: code }, locales }).code
        return transformed === code ? null : { code: transformed, map: null }
      }
    })
  }
})
