import { posix } from 'node:path'
import { parse as parseSfc } from '@vue/compiler-sfc'
import { parse, NodeTypes } from '@vue/compiler-dom'
import type { TemplateChildNode } from '@vue/compiler-dom'
import type { UiTargetSource } from './source.ts'

/** Resolve Nuxt's path-prefixed component names without repeating overlapping words.
 * @param filename Component source path relative to the application root.
 * @returns The auto-imported PascalCase component name.
 */
const componentName = (filename: string): string => {
  const parts = filename.replace(/^app\/components\//, '').replace(/\.vue$/, '').split('/')
  return parts.reduce((name, part) => {
    const words = part.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[-_\s]+/)
    const previous = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(' ')
    let overlap = Math.min(previous.length, words.length)
    while (overlap && previous.slice(-overlap).join('') !== words.slice(0, overlap).join('')) overlap--
    return name + words.slice(overlap).map(word => word[0]?.toUpperCase() + word.slice(1)).join('')
  }, '')
}

/** Follow actual component composition; form scopes never introduce runtime views.
 * @param sources Application source declarations.
 * @returns Actual consuming views for each reusable component source.
 */
export const collectInheritedHelpViews = (sources: UiTargetSource[]): Map<string, Set<string>> => {
  const byName = new Map(sources.filter(source => source.filename.startsWith('app/components/')).map(source => [componentName(source.filename), source.filename]))
  const filenames = new Set(sources.map(source => source.filename))
  const edges: Array<{ parent: string; child: string; view?: string }> = []
  for (const source of sources) {
    if (!source.filename.startsWith('app/')) continue
    const { descriptor } = parseSfc(source.source, { filename: source.filename })
    if (!descriptor.template) continue
    const aliases = new Map<string, string>()
    const script = [descriptor.script?.content, descriptor.scriptSetup?.content].join('\n')
    for (const match of script.matchAll(/import\s+(\w+)\s+from\s+['"]([^'"]+\.vue)['"]/g)) {
      const name = match[1]
      const path = match[2]
      if (!name || !path) continue
      const filename = path.startsWith('~/') || path.startsWith('@/') ? `app/${path.slice(2)}` : posix.normalize(posix.join(posix.dirname(source.filename), path))
      if (filenames.has(filename)) aliases.set(name, filename)
    }
    /** Collect component uses within their nearest actual screen declaration.
     * @param nodes Template children to inspect.
     * @param inheritedView Enclosing declared screen, if present.
     */
    const visit = (nodes: TemplateChildNode[], inheritedView?: string) => {
      for (const node of nodes) {
        if (node.type !== NodeTypes.ELEMENT) continue
        const declaration = node.props.find(prop => prop.type === NodeTypes.ATTRIBUTE && prop.name === 'data-help-view')
        const view = declaration?.type === NodeTypes.ATTRIBUTE ? declaration.value?.content : inheritedView
        const child = aliases.get(node.tag) ?? byName.get(node.tag)
        if (child) edges.push({ parent: source.filename, child, view })
        visit(node.children, view)
      }
    }
    visit(parse(descriptor.template.content).children)
  }
  const inherited = new Map<string, Set<string>>()
  let changed = true
  while (changed) {
    changed = false
    for (const edge of edges) {
      const views = edge.view ? [edge.view] : inherited.get(edge.parent) ?? []
      const destination = inherited.get(edge.child) ?? new Set<string>()
      for (const view of views) {
        if (destination.has(view)) continue
        destination.add(view)
        changed = true
      }
      inherited.set(edge.child, destination)
    }
  }
  return inherited
}
