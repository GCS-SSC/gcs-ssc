import { parse } from '@vue/compiler-sfc'
import { parse as parseTemplate, NodeTypes } from '@vue/compiler-dom'
import type { ElementNode, RootNode, TemplateChildNode } from '@vue/compiler-dom'
import type { ContractDiagnostic, TargetKind, TargetLedger } from './contracts'

export type VueContractSource = { filename: string; source: string }
export type ForwardedTarget = { component: string; prop: string; kind: TargetKind; filename: string; via?: { filename: string; component: string }[] }
export type VueContractOptions = { ledger: TargetLedger; sources: VueContractSource[]; componentKinds?: Record<string, TargetKind>; forwardedTargets?: ForwardedTarget[] }
const defaults: Record<string, TargetKind> = {
  textarea: 'textarea', select: 'select', button: 'button', a: 'navigation', section: 'section',
  UInput: 'text', UTextarea: 'textarea', USelect: 'select', USelectMenu: 'select', UCheckbox: 'checkbox', UButton: 'button',
  CommonCurrencyInput: 'money', CommonEnumSelect: 'select', CommonServerLookupSelect: 'select', CommonBilingualSelectMenu: 'select', CommonSaveButton: 'button'
}
const attribute = (node: ElementNode, name: string): string | undefined => {
  const prop = node.props.find(item => item.type === NodeTypes.ATTRIBUTE && item.name === name)
  return prop?.type === NodeTypes.ATTRIBUTE ? prop.value?.content : undefined
}
const binding = (node: ElementNode, name: string): string | undefined => {
  const prop = node.props.find(item => item.type === NodeTypes.DIRECTIVE && item.name === 'bind' && item.arg?.type === NodeTypes.SIMPLE_EXPRESSION && item.arg.content === name)
  return prop?.type === NodeTypes.DIRECTIVE && prop.exp?.type === NodeTypes.SIMPLE_EXPRESSION ? prop.exp.content : undefined
}
/**
 * Identify the semantic kind from the actual control declaration.
 * @returns Semantic kind supported by the actual control.
 * @param node Vue template element to inspect.
 * @param kinds Recognized component-to-control mappings.
 */
const kindOf = (node: ElementNode, kinds: Record<string, TargetKind>): TargetKind | undefined => {
  const semanticKind = attribute(node, 'data-help-kind')
  if (semanticKind === 'navigation' && ['a', 'button', 'UButton'].includes(node.tag)) return 'navigation'
  if (semanticKind === 'section' && ['div', 'section', 'fieldset'].includes(node.tag)) return 'section'
  const type = attribute(node, 'type')
  if (binding(node, 'type')) return undefined
  if (node.tag === 'input' || node.tag === 'UInput') {
    if (!type || ['text', 'email', 'tel', 'url', 'search', 'password'].includes(type)) return 'text'
    if (['number', 'checkbox', 'date', 'button'].includes(type)) return type as TargetKind
    if (['submit', 'reset'].includes(type)) return 'button'
    return undefined
  }
  return kinds[node.tag]
}

/**
 *
 * @returns Actionable differences between approved contracts and Vue source.
 * @param root0 Independent source and ledger evidence.
 * @param root0.ledger Approved supported view and target contracts.
 * @param root0.sources Vue SFC source documents to inspect.
 * @param root0.componentKinds Additional explicitly recognized control components.
 * @param root0.forwardedTargets Explicit component prop forwarding chains to verify.
 */
export const checkVueContracts = ({ ledger, sources, componentKinds = {}, forwardedTargets = [] }: VueContractOptions): ContractDiagnostic[] => {
  const diagnostics: ContractDiagnostic[] = []
  const kinds = { ...defaults, ...componentKinds }
  const seenViews = new Set<string>()
  const seenTargets = new Set<string>()
  const roots = new Map<string, RootNode>()
  const nodes = new Map<string, ElementNode[]>()
  const repeatedNodes = new Set<ElementNode>()
  for (const { filename, source } of sources) {
    try {
      const parsed = parse(source, { filename })
      if (parsed.errors.length) throw new Error('Invalid SFC')
      if (!parsed.descriptor.template) continue
      const root = parseTemplate(parsed.descriptor.template.content)
      roots.set(filename, root)
      const elements: ElementNode[] = []
      /**
       * Collect template controls while tracking repeated contexts.
       * @param node Vue template element to inspect.
       * @param repeated Whether a parent already repeats this element.
       */
      const collect = (node: TemplateChildNode, repeated = false) => {
        if (node.type !== NodeTypes.ELEMENT) return
        const isRepeated = repeated || node.props.some(item => item.type === NodeTypes.DIRECTIVE && item.name === 'for')
        if (isRepeated) repeatedNodes.add(node)
        elements.push(node)
        node.children.forEach(child => collect(child, isRepeated))
      }
      root.children.forEach(child => collect(child))
      nodes.set(filename, elements)
    } catch {
      diagnostics.push({ code: 'invalid-source', filename, message: `${filename}: cannot parse Vue template.` })
    }
  }
  const kebab = (name: string) => name.replace(/[A-Z]/g, character => `-${character.toLowerCase()}`)
  const propBinding = (node: ElementNode, prop: string) => binding(node, prop) ?? binding(node, kebab(prop))
  const propAttribute = (node: ElementNode, prop: string) => attribute(node, prop) ?? attribute(node, kebab(prop))
  const validForwarding = new Set<ForwardedTarget>()
  const allowedDynamic = new Set<ElementNode>()
  for (const contract of forwardedTargets) {
    const endpoints = (nodes.get(contract.filename) ?? []).filter(node => binding(node, 'data-help-target') === contract.prop)
    const valid = endpoints.length === 1 && !repeatedNodes.has(endpoints[0]!) && kindOf(endpoints[0]!, kinds) === contract.kind
      && (contract.via ?? []).every(hop => (nodes.get(hop.filename) ?? []).filter(node => node.tag === hop.component && !repeatedNodes.has(node) && propBinding(node, contract.prop) === contract.prop).length === 1)
    if (!valid) diagnostics.push({ code: 'invalid-forwarding', filename: contract.filename, message: `${contract.component}.${contract.prop}: expected independently verified forwarding to ${contract.kind}.` })
    else {
      validForwarding.add(contract)
      endpoints.forEach(node => allowedDynamic.add(node))
    }
  }
  for (const [filename, root] of roots) {
    /**
     * Compare one declaration with the independent approved ledger.
     * @param node Vue template element to inspect.
     * @param inheritedView Nearest statically declared owning view.
     * @param inheritedRepeat Whether a parent repeats this declaration.
     */
    const visit = (node: TemplateChildNode, inheritedView?: string, inheritedRepeat = false) => {
      if (node.type !== NodeTypes.ELEMENT) return
      const repeated = inheritedRepeat || node.props.some(item => item.type === NodeTypes.DIRECTIVE && item.name === 'for')
      const declaredView = attribute(node, 'data-help-view')
      const view = declaredView ?? inheritedView
      const forwarded = forwardedTargets.filter(contract => node.tag === contract.component && propAttribute(node, contract.prop) !== undefined)
      const targets = [attribute(node, 'data-help-target'), ...forwarded.map(contract => propAttribute(node, contract.prop))].filter((item): item is string => item !== undefined)
      let target = targets[0]
      const report = (code: string, detail: string) => diagnostics.push({ code, filename, view, target, message: `${filename}: guided-help ${view ?? '(no view)'}/${target ?? '(no target)'}: ${detail}` })
      if (node.props.some(item => item.type === NodeTypes.ATTRIBUTE && ['data-help-view', 'data-help-target'].includes(item.name) && !item.value?.content)) report('invalid-declaration', 'help identifiers require nonempty literal values.')
      if (forwardedTargets.some(contract => contract.component === node.tag && propBinding(node, contract.prop) !== undefined)) report('dynamic-declaration', 'forwarded help identifiers require static literals at the owning view.')
      if (binding(node, 'data-help-view') !== undefined || (binding(node, 'data-help-target') !== undefined && !allowedDynamic.has(node))) report('dynamic-declaration', 'help identifiers must be static literals.')
      if (declaredView !== undefined) {
        if (!ledger.views.some(item => item.key === declaredView)) report('unknown-view', 'view is absent from approved ledger.')
        if (seenViews.has(declaredView)) report('duplicate-view', 'view is declared more than once.')
        seenViews.add(declaredView)
      }
      for (const declaredTarget of targets) {
        target = declaredTarget
        const forwardedContract = forwarded.find(contract => propAttribute(node, contract.prop) === target)
        if (repeated) report('repeated-declaration', 'repeated targets require an explicit unique-context convention.')
        const expected = ledger.views.find(item => item.key === view)?.targets.find(item => item.key === target)
        if (!view) report('unscoped-target', 'target must belong to an explicit view.')
        else if (!expected) report('unknown-target', 'target is absent from this view in approved ledger.')
        if (seenTargets.has(target)) report('duplicate-target', 'target is declared more than once.')
        seenTargets.add(target)
        const actualKind = forwardedContract ? (validForwarding.has(forwardedContract) ? forwardedContract.kind : undefined) : kindOf(node, kinds)
        if (expected && actualKind !== expected.kind) report('kind-mismatch', `expected ${expected.kind}, found ${actualKind ?? 'unrecognized control'}.`)
      }
      node.children.forEach(child => visit(child, view, repeated))
    }
    root.children.forEach(node => visit(node))
  }
  for (const view of ledger.views) {
    if (!seenViews.has(view.key)) diagnostics.push({ code: 'missing-view', view: view.key, message: `Guided-help view ${view.key} is missing from Vue source.` })
    for (const target of view.targets) {
      if (!seenTargets.has(target.key)) diagnostics.push({ code: 'missing-target', view: view.key, target: target.key, message: `Guided-help target ${view.key}/${target.key} expected ${target.kind} is missing from Vue source.` })
    }
  }
  return diagnostics
}
