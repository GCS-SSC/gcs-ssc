import { readdir, readFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { parse as parseSfc } from '@vue/compiler-sfc'
import { parse, NodeTypes } from '@vue/compiler-dom'
import type { ElementNode, TemplateChildNode } from '@vue/compiler-dom'
import type { TargetKind, TargetLedger } from '@gcs-ssc/guided-help/contracts'
import { collectUiTargetSourceTranslations, inferUiTargetSourceLabel, uiTargetTranslationLabel } from './labels.ts'
import type { UiTargetTranslatorCatalogs } from './labels.ts'
import { collectSchemaFieldSources, extractSchemaFieldSources } from './schema-fields.ts'
import { resolveUiFieldTargetKey } from '../../shared/ui-targets/identity.ts'
import type { UiTarget, UiTargetCatalog, UiTargetLabel, UiTargetOwner } from '../../shared/ui-targets/types.ts'

export interface UiTargetSource { filename: string; source: string; owner: UiTargetOwner; translations?: UiTargetTranslatorCatalogs }
export interface UiTargetDiagnostic { filename: string; line: number; code: string; message: string }
interface SourceOptions { source: UiTargetSource; locales: { en: unknown; fr: unknown } }
interface SourceResult { targets: UiTarget[]; diagnostics: UiTargetDiagnostic[]; code: string }
const fieldTags = new Set(['UFormField', 'FormField', 'UInput', 'UInputNumber', 'UInputDate', 'UInputTime', 'UInputMenu', 'UInputTags', 'UTextarea', 'USelect', 'USelectMenu', 'URadioGroup', 'UCheckbox', 'UCheckboxGroup', 'USwitch', 'UFileUpload', 'USlider', 'input', 'textarea', 'select', 'CommonCurrencyInput', 'CommonDatePicker', 'CommonEnumSelect', 'CommonServerLookupSelect', 'CommonBilingualSelectMenu', 'CommonBilingualMultiSelectMenu', 'CommonTextarea', 'CommonStatusSelect', 'CommonAssignedListViewSelect', 'CommonLucideIconPicker', 'AssessmentSchemaHelperFieldSelect', 'AdminCommonLookupField', 'UColorPicker', 'ExtensionFormField', 'ExtensionInput', 'ExtensionInputNumber', 'ExtensionInputTags', 'ExtensionTextarea', 'ExtensionRawTextarea', 'ExtensionSelect', 'ExtensionSelectMenu', 'ExtensionCheckbox', 'ExtensionCheckboxGroup', 'ExtensionSwitch', 'ExtensionRadioGroup', 'ExtensionDatePicker', 'ExtensionCurrencyInput'])
const wrapperTags = new Set(['UFormField', 'FormField', 'ExtensionFormField', 'AdminCommonLookupField'])
const isFieldControl = (node: ElementNode): boolean => fieldTags.has(node.tag) || node.props.some(prop =>
  (prop.type === NodeTypes.DIRECTIVE && prop.name === 'model' && !prop.arg)
  || (prop.type === NodeTypes.DIRECTIVE && prop.name === 'bind' && prop.arg?.type === NodeTypes.SIMPLE_EXPRESSION && prop.arg.content === 'model-value'))

/**
 *
 * @param nodes Template children to inspect.
 * @returns The first owned leaf control, excluding nested field wrappers.
 */
const findControl = (nodes: TemplateChildNode[]): ElementNode | undefined => {
  for (const node of nodes) {
    if (node.type !== NodeTypes.ELEMENT) continue
    if (wrapperTags.has(node.tag)) continue
    if (isFieldControl(node)) return node
    const child = findControl(node.children)
    if (child) return child
  }
  return undefined
}

const attr = (node: ElementNode, name: string): string | undefined => {
  const prop = node.props.find(item => item.type === NodeTypes.ATTRIBUTE && item.name === name)
  return prop?.type === NodeTypes.ATTRIBUTE ? prop.value?.content : undefined
}
const expression = (node: ElementNode, name: string): string | undefined => {
  const prop = node.props.find(item => item.type === NodeTypes.DIRECTIVE && item.name === 'bind' && item.arg?.type === NodeTypes.SIMPLE_EXPRESSION && item.arg.content === name)
  return prop?.type === NodeTypes.DIRECTIVE && prop.exp?.type === NodeTypes.SIMPLE_EXPRESSION ? prop.exp.content : undefined
}
/**
 *
 * @param value The source value to resolve.
 * @returns The quoted literal value, or undefined for runtime expressions.
 */
const literal = (value: string | undefined): string | undefined => {
  if (!value) return undefined
  const match = value.match(/^\s*(['"])(.*?)\1\s*$/)
  return match?.[2]
}
const fieldName = (node: ElementNode): string | undefined => {
  const bound = expression(node, 'name')
  return attr(node, 'name') ?? literal(bound) ?? bound?.match(/^\s*field\(\s*['"]([^'"]+)['"]\s*\)\s*$/)?.[1]
}
const readable = (value: string): string => value.replace(/^egcs_[a-z]+_/, '').replace(/[._-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
/**
 *
 * @param node The Vue element declaration.
 * @param fallback The stable field identity used when no label is declared.
 * @param locales English and French message catalogs.
 * @param prefix The attribute family containing bilingual labels.
 * @param translations The catalogs belonging to this source translator.
 * @returns The bilingual field or grouping label.
 */
const labelFor = (node: ElementNode, fallback: string, locales: SourceOptions['locales'], prefix = 'field', translations: UiTargetTranslatorCatalogs = { t: locales, $t: locales }): UiTargetLabel => {
  const en = attr(node, `data-${prefix}-label-en`)
  const fr = attr(node, `data-${prefix}-label-fr`)
  if (en && fr) return { en, fr }
  const label = attr(node, 'label')
  if (label) return { en: label, fr: label }
  const labelNode = (expression(node, 'label') ?? attr(node, 'label')) ? node : findControl(node.children) ?? node
  const translated = uiTargetTranslationLabel(expression(labelNode, 'label') ?? expression(labelNode, 'aria-label') ?? expression(labelNode, 'placeholder'), translations)
  return translated ?? { en: readable(fallback), fr: readable(fallback) }
}
/**
 *
 * @param node The Vue element declaration.
 * @returns The semantic guided-help control kind.
 */
const kindFor = (node: ElementNode): TargetKind => {
  const tag = node.tag.toLowerCase()
  if (/checkbox|switch/.test(tag) || ['checkbox', 'radio'].includes(attr(node, 'type') ?? '')) return 'checkbox'
  if (/select|radiogroup/.test(tag) || node.tag === 'AdminCommonLookupField') return 'select'
  return 'text'
}
/**
 *
 * @param text The complete template source.
 * @param start The opening element offset.
 * @returns The offset immediately before the opening tag closes.
 */
const openingEnd = (text: string, start: number): number => {
  let quote = ''
  for (let index = start; index < text.length; index++) {
    const character = text[index]
    if (quote) {
      if (character === quote) quote = ''
      continue
    }
    if (character === '"' || character === '\'') {
      quote = character
      continue
    }
    if (character === '>') return text[index - 1] === '/' ? index - 1 : index
  }
  return start
}

/**
 * Parses actual Vue declarations and annotates the same source the browser will render.
 * @param root0 Source catalog inputs.
 * @param root0.source The owning Vue source and its public identity.
 * @param root0.locales English and French message catalogs.
 * @returns Discovered targets, identity diagnostics and annotated Vue source.
 */
export const scanUiTargetSource = ({ source, locales }: SourceOptions): SourceResult => {
  const targets: UiTarget[] = []
  const diagnostics: UiTargetDiagnostic[] = []
  const { descriptor } = parseSfc(source.source, { filename: source.filename })
  if (!descriptor.template) return { targets, diagnostics, code: source.source }
  const template = descriptor.template
  const tree = parse(template.content)
  const translations = source.translations ?? { t: locales, $t: locales }
  const sourceLabel = inferUiTargetSourceLabel(source.source, translations)
  let needsTooltipWrapper = false
  const edits: Array<{ offset: number; value: string; remove?: number }> = []
  const addAttribute = (node: ElementNode, name: string, value: string) => {
    edits.push({ offset: template.loc.start.offset + openingEnd(template.content, node.loc.start.offset), value: ` ${name}="${value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"` })
  }
  /**
   *
   * @param nodes Template children to inspect.
   * @param context The inherited template identity context.
   * @param context.scope The explicit permanent form scope.
   * @param context.view The inherited catalog grouping.
   * @param context.viewLabel The inherited bilingual grouping label.
   * @param context.runtimeView The explicitly declared walkthrough view.
   * @param context.tooltipContext The explicitly declared operational Agreement or Intake context.
   * @param context.tooltipUnavailable Why the field has no agency-owned tooltip context.
   * @param context.wrapped Whether a parent field already owns this control.
   * @param context.excluded Whether an ancestor excludes its internal controls.
   */
  const visit = (nodes: TemplateChildNode[], context: { scope?: string; view?: string; viewLabel?: UiTargetLabel; runtimeView?: string; tooltipContext?: string; tooltipUnavailable?: string; wrapped?: boolean; excluded?: boolean }) => {
    for (const node of nodes) {
      if (node.type !== NodeTypes.ELEMENT) continue
      const scope = attr(node, 'data-field-scope') ?? context.scope
      const declaredView = attr(node, 'data-help-view')
      const runtimeView = declaredView ?? context.runtimeView
      const declaredTooltipContext = attr(node, 'data-field-tooltip-context')
      if (declaredTooltipContext && !['agreement', 'intake', 'agreement-or-intake'].includes(declaredTooltipContext)) {
        diagnostics.push({ filename: source.filename, line: template.loc.start.line + node.loc.start.line - 1, code: 'tooltip-context', message: 'Tooltip fields require an operational agreement, intake, or agreement-or-intake context.' })
      }
      const tooltipContext = declaredTooltipContext ?? context.tooltipContext
      const tooltipUnavailable = attr(node, 'data-field-tooltip-unavailable') ?? context.tooltipUnavailable
      let view = declaredView ?? context.view ?? scope
      const excluded = Boolean(attr(node, 'data-field-exclude')) || Boolean(attr(node, 'data-field-forward')) || Boolean(attr(node, 'data-field-schema-source')) || attr(node, 'data-field-schema') === 'admin-common' || context.excluded
      const scopeLabelEn = attr(node, 'data-scope-label-en')
      const scopeLabelFr = attr(node, 'data-scope-label-fr')
      const scopeLabel = scopeLabelEn && scopeLabelFr ? { en: scopeLabelEn, fr: scopeLabelFr } : undefined
      const viewLabel = attr(node, 'data-field-scope')
        ? scopeLabel ?? uiTargetTranslationLabel(expression(node, 'title') ?? expression(node, 'aria-label'), translations) ?? sourceLabel ?? { en: scope ?? '', fr: scope ?? '' }
        : context.viewLabel
      // Field grouping never declares a runtime walkthrough view.
      const wrapped = wrapperTags.has(node.tag)
      const eligible = !attr(node, 'data-field-container') && isFieldControl(node) && (!context.wrapped || wrapped) && attr(node, 'type') !== 'hidden'
      if (eligible && !excluded) {
        const innerTarget = wrapped ? findControl(node.children) : undefined
        const childTarget = innerTarget?.type === NodeTypes.ELEMENT ? attr(innerTarget, 'data-help-target') : undefined
        const explicitTarget = attr(node, 'data-help-target') ?? attr(node, 'data-ui-target') ?? childTarget
        const key = resolveUiFieldTargetKey({ scope, name: fieldName(node), explicitTarget })
        view ??= key?.split('.').slice(0, -1).join('.')
        if (!key || !view || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(key)) {
          diagnostics.push({ filename: source.filename, line: template.loc.start.line + node.loc.start.line - 1, code: 'field-identity', message: `${node.tag} needs a static data-field-scope + name, a data-ui-target, or a reasoned data-field-exclude.` })
        } else {
          const control = wrapped ? findControl(node.children) : node
          const kind = control?.type === NodeTypes.ELEMENT ? kindFor(control) : kindFor(node)
          targets.push({ key, viewKey: view, label: labelFor(node, fieldName(node) ?? key, locales, 'field', translations), viewLabel: viewLabel ?? sourceLabel ?? { en: view, fr: view }, kind, owner: source.owner, tooltip: Boolean(tooltipContext && ['agreement', 'intake', 'agreement-or-intake'].includes(tooltipContext) && !tooltipUnavailable), guidedHelp: Boolean(runtimeView) })
          if (!attr(node, 'data-help-target') && !childTarget) addAttribute(node, 'data-help-target', key)
          if (childTarget && !attr(node, 'data-ui-target')) addAttribute(node, 'data-ui-target', key)
          if (!wrapped) {
            needsTooltipWrapper = true
            const structural = node.props.filter(prop => (prop.type === NodeTypes.DIRECTIVE && ['if', 'else-if', 'else', 'for'].includes(prop.name))
              || (prop.type === NodeTypes.ATTRIBUTE && prop.name === 'key')
              || (prop.type === NodeTypes.DIRECTIVE && prop.name === 'bind' && prop.arg?.type === NodeTypes.SIMPLE_EXPRESSION && prop.arg.content === 'key'))
            const directives = structural.map(prop => prop.loc.source).join(' ')
            for (const prop of structural) edits.push({ offset: template.loc.start.offset + prop.loc.start.offset, remove: prop.loc.end.offset - prop.loc.start.offset, value: '' })
            edits.push({ offset: template.loc.start.offset + node.loc.start.offset, value: `<FieldHelpTarget target-key="${key}" ${directives}>` })
            edits.push({ offset: template.loc.start.offset + node.loc.end.offset, value: '</FieldHelpTarget>' })
          }
        }
      }
      visit(node.children, { scope, view, viewLabel, runtimeView, tooltipContext, tooltipUnavailable, wrapped: context.wrapped || wrapped, excluded })
    }
  }
  visit(tree.children, {})
  if (needsTooltipWrapper) {
    if (descriptor.scriptSetup) edits.push({ offset: descriptor.scriptSetup.loc.start.offset, value: '\nimport { FieldHelpTarget } from \'#components\'\n' })
    else edits.push({ offset: 0, value: '<script setup>\nimport { FieldHelpTarget } from \'#components\'\n</script>\n' })
  }
  let code = source.source
  for (const edit of edits.sort((left, right) => right.offset - left.offset)) code = code.slice(0, edit.offset) + edit.value + code.slice(edit.offset + (edit.remove ?? 0))
  return { targets, diagnostics, code }
}

/**
 *
 * @param root0 Source catalog inputs.
 * @param root0.sources Public Vue and schema-derived declarations.
 * @param root0.locales English and French message catalogs.
 * @param root0.ledger Approved guided-help completion and choice metadata.
 * @returns The source-backed target registry and compatible guided-help ledger.
 */
export const buildUiTargetCatalog = ({ sources, locales, ledger }: {
  sources: UiTargetSource[]; locales: SourceOptions['locales']; ledger: TargetLedger
}): UiTargetCatalog & { diagnostics: UiTargetDiagnostic[] } => {
  const diagnostics: UiTargetDiagnostic[] = []
  const targets = new Map<string, UiTarget>()
  const guidedHelpLedger: TargetLedger = { ...structuredClone(ledger), views: ledger.views.map(view => ({ ...view, targets: [] })) }
  const declaredKeys = new Set<string>()
  for (const source of sources) {
    for (const match of source.source.matchAll(/(?:data-help-target|help-[a-z-]*target)\s*=\s*(["'])(.*?)\1/g)) {
      if (match[2]) declaredKeys.add(match[2])
    }
  }
  for (const view of ledger.views) {
    const destination = guidedHelpLedger.views.find(item => item.key === view.key)
    for (const target of view.targets) {
      if (!declaredKeys.has(target.key) || !destination) continue
      destination.targets.push(structuredClone(target))
      targets.set(target.key, { key: target.key, viewKey: view.key, label: target.label, viewLabel: view.label, kind: target.kind, owner: { kind: 'host' }, tooltip: false, guidedHelp: true })
    }
  }
  const declarations = new Map<string, string>()
  for (const source of sources) {
    const scanned = scanUiTargetSource({ source, locales })
    diagnostics.push(...scanned.diagnostics)
    for (const target of scanned.targets) {
      const previous = declarations.get(target.key)
      if (previous) diagnostics.push({ filename: source.filename, line: 1, code: 'duplicate-target', message: `${target.key} is also declared in ${previous}. Give distinct business fields distinct identities.` })
      declarations.set(target.key, source.filename)
      const approved = targets.get(target.key)
      targets.set(target.key, approved ? { ...target, viewKey: approved.viewKey, label: approved.label, viewLabel: target.tooltip ? target.viewLabel : approved.viewLabel } : target)
      if (approved || !target.guidedHelp) continue
      let view = guidedHelpLedger.views.find(item => item.key === target.viewKey)
      if (!view) {
        view = { key: target.viewKey, label: target.viewLabel, discoverable: false, targets: [] }
        guidedHelpLedger.views.push(view)
      }
      view.targets.push({ key: target.key, label: target.label, kind: target.kind })
    }
  }
  return { uiTargetRegistry: { formatVersion: 1, targets: [...targets.values()].sort((left, right) => left.key.localeCompare(right.key)) }, guidedHelpLedger, diagnostics }
}

/**
 *
 * @param root The public application root.
 * @returns Public application, extension and schema-derived source declarations.
 */
export const collectUiTargetSources = async (root: string): Promise<UiTargetSource[]> => {
  /**
   *
   * @param directory The source directory to inspect.
   * @param owner The host or extension that owns these declarations.
   * @returns Vue source declarations below this directory.
   */
  const walk = async (directory: string, owner: UiTargetOwner): Promise<UiTargetSource[]> => {
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      return []
    }
    const groups = await Promise.all(entries.filter(entry => !['node_modules', '.nuxt', '.output', '.git', 'tests', 'dist'].includes(entry.name)).map(async entry => {
      const filename = resolve(directory, entry.name)
      if (entry.isDirectory()) return walk(filename, owner)
      return entry.isFile() && entry.name.endsWith('.vue') ? [{ filename: relative(root, filename), source: await readFile(filename, 'utf8'), owner }] : []
    }))
    return groups.flat()
  }
  const host = await walk(resolve(root, 'app'), { kind: 'host' })
  const extensions = await readdir(resolve(root, 'extensions'), { withFileTypes: true }).catch(() => [])
  const extensionSources = await Promise.all(extensions.filter(entry => entry.isDirectory()).map(entry => walk(resolve(root, 'extensions', entry.name), { kind: 'extension', extensionId: entry.name })))
  const sources = await Promise.all([...host, ...extensionSources.flat()].map(async source => source.owner.kind === 'extension' ? { ...source, translations: await collectUiTargetSourceTranslations(root, source) } : source))
  return [...sources, ...sources.flatMap(extractSchemaFieldSources), ...await collectSchemaFieldSources(root, sources)]
}
