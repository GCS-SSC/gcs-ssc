import { readdir, readFile } from 'node:fs/promises'
import { resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkVueContracts } from '@gcs-ssc/guided-help/checker'
import { guidedHelpLedger } from '../shared/guided-help/catalog'

const root = fileURLToPath(new URL('../', import.meta.url))
/**
 * Reads application-owned Vue declarations for the static contract boundary.
 * @param directory - Directory containing application source.
 * @returns Vue filenames and their source contents.
 */
const collectSources = async (directory: string): Promise<Array<{ filename: string, source: string }>> => {
  const entries = await readdir(directory, { withFileTypes: true })
  const groups = await Promise.all(entries.map(async entry => {
    const filename = resolve(directory, entry.name)
    if (entry.isDirectory()) return collectSources(filename)
    return entry.isFile() && entry.name.endsWith('.vue')
      ? [{ filename: relative(root, filename), source: await readFile(filename, 'utf8') }]
      : []
  }))
  return groups.flat()
}

/**
 * Checks approved help targets against actual host Vue declarations.
 * @returns Structural compatibility diagnostics.
 */
export const checkHostGuidedHelpContracts = async () => checkVueContracts({
  ledger: guidedHelpLedger,
  sources: await collectSources(resolve(root, 'app')),
  componentKinds: { USwitch: 'checkbox' },
  forwardedTargets: [
    { component: 'CommonResourceCrud', prop: 'helpAddTarget', kind: 'button', filename: 'app/components/Common/TableToolbar.vue', via: [
      { filename: 'app/components/Common/ResourceCrud.vue', component: 'CommonResourceLayoutCard' },
      { filename: 'app/components/Common/ResourceLayoutCard.vue', component: 'CommonTableToolbar' }
    ] },
    { component: 'CommonResourceCrud', prop: 'helpSaveTarget', kind: 'button', filename: 'app/components/Common/ResourceCrud.vue' }
  ]
})

if (import.meta.main) {
  const diagnostics = await checkHostGuidedHelpContracts()
  for (const diagnostic of diagnostics) console.error(`${diagnostic.code}: ${diagnostic.message}`)
  if (diagnostics.length) process.exitCode = 1
  else console.info('Guided-help view and field contracts are compatible.')
}
