import { resolve } from 'node:path'

type LocaleTree = Record<string, unknown>

const repoRoot = resolve(import.meta.dir, '..')
const en = await Bun.file(resolve(repoRoot, 'i18n/locales/en.json')).json() as LocaleTree
const fr = await Bun.file(resolve(repoRoot, 'i18n/locales/fr.json')).json() as LocaleTree

/**
 * Flattens a nested locale object into dot-delimited leaf keys.
 *
 * @param tree - Locale subtree to flatten.
 * @param prefix - Parent key path accumulated during recursion.
 * @returns Leaf translation values keyed by their complete dot path.
 */
const flatten = (tree: LocaleTree, prefix = ''): Map<string, string> => {
  const result = new Map<string, string>()
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') result.set(path, value)
    else if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [nestedKey, nestedValue] of flatten(value as LocaleTree, path)) result.set(nestedKey, nestedValue)
    }
  }
  return result
}

const placeholders = (value: string): string[] => Array.from(
  new Set(Array.from(value.matchAll(/\{([^{}]+)\}/g), match => match[1]).filter(Boolean))
).sort()

const enKeys = flatten(en)
const frKeys = flatten(fr)
const sourcePaths: string[] = []
// Extension workspaces own their locale contracts and verification. The root audit covers only
// host production sources so an installed extension cannot make the main application's gate fail.
for (const root of ['app', 'server', 'shared', 'modules']) {
  for (const extension of ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs', 'vue']) {
    const glob = new Bun.Glob(`${root}/**/*.${extension}`)
    for await (const path of glob.scan({ cwd: repoRoot, onlyFiles: true })) {
      if (!path.includes('/tests/') && !path.endsWith('.test.ts')) sourcePaths.push(path)
    }
  }
}
sourcePaths.sort()

const sourceByPath = new Map<string, string>()
for (const path of sourcePaths) sourceByPath.set(path, await Bun.file(resolve(repoRoot, path)).text())
const combinedSource = Array.from(sourceByPath.values()).join('\n')
// Stable validation/API contracts must be discoverable even if an entire locale
// namespace is accidentally removed. Other namespaces are used for orphan leads.
const stableContractPattern = /['"\x60]((?:apiErrors|validation)\.[A-Za-z0-9_.-]+)['"\x60]/g
const topLevelNamespaces = Array.from(new Set([...Object.keys(en), ...Object.keys(fr)]))
  .map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|')
const localeLiteralPattern = new RegExp(`['"\\x60]((?:${topLevelNamespaces})\\.[A-Za-z0-9_.-]+)['"\\x60]`, 'g')
const literalReferences = new Map<string, Set<string>>()
const runtimeTranslationReferences = new Map<string, Set<string>>()
for (const [path, source] of sourceByPath) {
  const matches = [...source.matchAll(localeLiteralPattern), ...source.matchAll(stableContractPattern)]
  for (const match of matches) {
    const key = match[1]
    if (!key) continue
    const paths = literalReferences.get(key) ?? new Set<string>()
    paths.add(path)
    literalReferences.set(key, paths)
  }
  const runtimeMatches = [
    ...source.matchAll(new RegExp(`\\bt\\(\\s*['"\\x60]((?:${topLevelNamespaces})\\.[A-Za-z0-9_.-]+)['"\\x60]`, 'g')),
    ...source.matchAll(new RegExp(`\\b(?:headerKey|labelKey)\\s*:\\s*['"\\x60]((?:${topLevelNamespaces})\\.[A-Za-z0-9_.-]+)['"\\x60]`, 'g')),
    ...source.matchAll(stableContractPattern)
  ]
  for (const match of runtimeMatches) {
    const key = match[1]
    if (!key) continue
    const paths = runtimeTranslationReferences.get(key) ?? new Set<string>()
    paths.add(path)
    runtimeTranslationReferences.set(key, paths)
  }
}

const enOnly = [...enKeys.keys()].filter(key => !frKeys.has(key)).sort()
const frOnly = [...frKeys.keys()].filter(key => !enKeys.has(key)).sort()
const placeholderMismatches = [...enKeys.keys()].filter(key => frKeys.has(key))
  .filter(key => placeholders(enKeys.get(key)!).join('|') !== placeholders(frKeys.get(key)!).join('|'))
  .sort()
const missingLiteralReferences = [...runtimeTranslationReferences.entries()]
  .filter(([key]) => key !== 'validation.key')
  .filter(([key]) => !enKeys.has(key) || !frKeys.has(key))
  .sort(([left], [right]) => left.localeCompare(right))
const orphanLeads = [...enKeys.keys()].filter(key => frKeys.has(key))
  .filter(key => !combinedSource.includes(`'${key}'`)
    && !combinedSource.includes(`"${key}"`)
    && !combinedSource.includes(`\`${key}\``))
  .sort()

console.log(`Checked bilingual runtime contracts with ${missingLiteralReferences.length} missing references and ${orphanLeads.length} orphan leads.`)

if (enOnly.length || frOnly.length || placeholderMismatches.length || missingLiteralReferences.length) process.exitCode = 1
