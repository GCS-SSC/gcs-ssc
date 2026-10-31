import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createJiti } from 'jiti'
import ts from 'typescript'
import { parse as parseSfc } from '@vue/compiler-sfc'
import { parse, NodeTypes } from '@vue/compiler-dom'
import type { TemplateChildNode } from '@vue/compiler-dom'
import { z } from 'zod'

const catalogSchema = z.object({ en: z.record(z.string(), z.string()), fr: z.record(z.string(), z.string()) })
export type UiTargetTranslatorCatalogs = Record<string, { en: unknown; fr: unknown }>
const loaders = new Map<string, ReturnType<typeof createJiti>>()
const headingOwners = new Set([
  'CommonDetailPage', 'CommonDetailSection', 'CommonDetailSectionHeader',
  'CommonSection', 'CommonSectionHeader', 'CommonResourceLayout',
  'CommonPublicationDetailHero', 'CommonEntityHero', 'UModal',
  'ExtensionModal', 'ExtensionDetailPage', 'ExtensionDetailSection', 'ExtensionSection',
  'ExtensionResourceLayout',
  'AssessmentSchemaPageSection', 'AssessmentSchemaAccordionSection', 'ExtensionAssessmentSchemaAccordionSection'
])

/**
 * Load only the extension catalog actually supplied to its local translator.
 * This is build-time metadata extraction, never a host/runtime message merge.
 * @param root Public application root.
 * @param source Owning Vue source declaration.
 * @param source.filename Source path relative to the root.
 * @param source.source Complete Vue source.
 * @returns Catalogs indexed by the component's local translator names.
 */
export const collectUiTargetSourceTranslations = async (root: string, source: { filename: string; source: string }): Promise<UiTargetTranslatorCatalogs> => {
  if (!source.source.includes('useExtensionI18n')) return {}
  const { descriptor } = parseSfc(source.source, { filename: source.filename })
  const script = [descriptor.script?.content, descriptor.scriptSetup?.content].filter(Boolean).join('\n')
  const tree = ts.createSourceFile(source.filename, script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const imports = new Map<string, { path: string; exported: string }>()
  for (const statement of tree.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    const path = statement.moduleSpecifier.text
    if (!path.startsWith('.')) continue
    const bindings = statement.importClause?.namedBindings
    if (!bindings || !ts.isNamedImports(bindings)) continue
    for (const binding of bindings.elements) imports.set(binding.name.text, { path, exported: binding.propertyName?.text ?? binding.name.text })
  }
  const requests: Array<{ translator: string; path: string; exported: string }> = []
  /**
   * Collect translator bindings from the component script.
   * @param node Current TypeScript declaration.
   */
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && node.initializer && ts.isCallExpression(node.initializer)
      && ts.isIdentifier(node.initializer.expression) && node.initializer.expression.text === 'useExtensionI18n') {
      const argument = node.initializer.arguments[0]
      const imported = argument && ts.isIdentifier(argument) ? imports.get(argument.text) : undefined
      if (imported) {
        for (const binding of node.name.elements) {
          const property = binding.propertyName && ts.isIdentifier(binding.propertyName) ? binding.propertyName.text : ts.isIdentifier(binding.name) ? binding.name.text : undefined
          if (property === 't' && ts.isIdentifier(binding.name)) requests.push({ translator: binding.name.text, ...imported })
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  let loader = loaders.get(root)
  if (!loader) {
    loader = createJiti(pathToFileURL(resolve(root, 'package.json')).href, { interopDefault: false, moduleCache: false })
    loaders.set(root, loader)
  }
  const catalogs: UiTargetTranslatorCatalogs = {}
  for (const request of requests) {
    const filename = resolve(root, dirname(source.filename), request.path)
    const module: unknown = await loader.import(filename)
    if (!module || typeof module !== 'object') throw new Error(`UI target labels: ${filename} has no exported catalog.`)
    const result = catalogSchema.safeParse(Reflect.get(module, request.exported))
    if (!result.success) throw new Error(`UI target labels: ${filename}#${request.exported} is not a bilingual extension catalog.`)
    catalogs[request.translator] = result.data
  }
  return catalogs
}

/**
 * Resolve an exact flat extension key or dotted host key without cross-catalog fallback.
 * @param catalog Owning locale's messages.
 * @param key Literal translation key.
 * @returns The existing message, or undefined for unresolved/dynamic labels.
 */
export const uiTargetMessage = (catalog: unknown, key: string): string | undefined => {
  if (!catalog || typeof catalog !== 'object') return undefined
  if (Object.hasOwn(catalog, key)) {
    const exact: unknown = Reflect.get(catalog, key)
    return typeof exact === 'string' ? exact : undefined
  }
  let current: unknown = catalog
  for (const segment of key.split('.')) {
    if (!current || typeof current !== 'object' || !Object.hasOwn(current, segment)) return undefined
    current = Reflect.get(current, segment)
  }
  return typeof current === 'string' ? current : undefined
}

/**
 * Resolve a static translation expression using its owning translator's catalog.
 * @param expression Bound Vue label/placeholder expression.
 * @param catalogs Available translators for this source only.
 * @returns Both existing language labels; unresolved keys never invent French text.
 */
export const uiTargetTranslationLabel = (expression: string | undefined, catalogs: UiTargetTranslatorCatalogs): { en: string; fr: string } | undefined => {
  const match = expression?.match(/(?:^|[^\w$])([\w$]+)\(\s*['"]([^'"]+)['"]\s*[,)]/)
  const translator = match?.[1]
  const key = match?.[2]
  if (!translator || !key) return undefined
  const catalog = catalogs[translator]
  if (!catalog) return undefined
  const en = uiTargetMessage(catalog.en, key)
  const fr = uiTargetMessage(catalog.fr, key)
  return en && fr ? { en, fr } : undefined
}

/**
 * Reuse a source's actual translated heading as its default registry grouping.
 * @param source Complete owning Vue source.
 * @param catalogs Translators available to this source.
 * @returns The first bilingual page/section heading or accessible region label.
 */
export const inferUiTargetSourceLabel = (source: string, catalogs: UiTargetTranslatorCatalogs): { en: string; fr: string } | undefined => {
  const { descriptor } = parseSfc(source)
  if (!descriptor.template) return undefined
  /**
   * Find the first statically translated heading or region in document order.
   * @param nodes Parsed template children.
   * @returns Existing bilingual heading text.
   */
  const visit = (nodes: TemplateChildNode[]): { en: string; fr: string } | undefined => {
    for (const node of nodes) {
      if (node.type !== NodeTypes.ELEMENT) continue
      for (const name of ['title', 'aria-label']) {
        if (name === 'title' && !headingOwners.has(node.tag)) continue
        if (name === 'aria-label' && !['section', 'main', 'aside', 'nav', 'form'].includes(node.tag)) continue
        const property = node.props.find(prop => prop.type === NodeTypes.DIRECTIVE && prop.name === 'bind' && prop.arg?.type === NodeTypes.SIMPLE_EXPRESSION && prop.arg.content === name)
        if (!property || property.type !== NodeTypes.DIRECTIVE || property.exp?.type !== NodeTypes.SIMPLE_EXPRESSION) continue
        const label = uiTargetTranslationLabel(property.exp.content, catalogs)
        if (label) return label
      }
      const nested = visit(node.children)
      if (nested) return nested
    }
    return undefined
  }
  return visit(parse(descriptor.template.content).children)
}
