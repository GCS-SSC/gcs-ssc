import { DocumentConditionError, parseDocumentCondition, type DocumentCondition } from './document-conditions'

export type CompiledDocumentConditions = Map<string, { expression: string, condition: DocumentCondition }>
type TextNode = { xmlStart: number, xmlEnd: number, start: number, text: string, edits: Array<{ start: number, end: number, value: string }> }
const decode = (value: string): string => value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, name: string) => {
  if (name.startsWith('#')) return String.fromCodePoint(name[1]?.toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1)))
  return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'' } as Record<string, string>)[name] ?? entity
})
const encode = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Normalizes tags across Word runs without changing paragraph/list properties.
 * @param xml - A Word XML part.
 * @param conditions - Compiled expressions shared by this render.
 * @returns XML with canonical tags and preserved formatting.
 */
export const prepareWordConditionTags = (xml: string, conditions: CompiledDocumentConditions): string => {
  const nodes: TextNode[] = []
  let text = ''
  for (const match of xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<\/w:p>|<w:(?:br|cr|tab)\b[^>]*\/?\s*>/g)) {
    if (match[1] === undefined) {
      text += '\n'
      continue
    }
    const contentStart = match.index! + match[0].indexOf('>') + 1
    const decoded = decode(match[1])
    nodes.push({ xmlStart: contentStart, xmlEnd: contentStart + match[1].length, start: text.length, text: decoded, edits: [] })
    text += decoded
  }
  let active: string | undefined
  let cursor = 0
  let nodeCursor = 0
  while (cursor < text.length) {
    const start = text.indexOf('{', cursor)
    if (start < 0) break
    const double = text[start + 1] === '{'
    const contentStart = start + (double ? 2 : 1)
    let end = contentStart
    let quote = ''
    for (; end < text.length; end++) {
      const character = text[end]!
      if (quote) {
        if (character === '\\') end++
        else if (character === quote) quote = ''
      } else if (['\'', '"', '‘', '“'].includes(character)) {
        quote = ({ '‘': '’', '“': '”' } as Record<string, string>)[character] ?? character
      } else if (character === '}' && (!double || text[end + 1] === '}')) break
    }
    const original = text.slice(contentStart, end)
    const tag = original.trim().replace(/^([#/^])\s+/u, '$1')
    if (end === text.length) {
      if (/^#if\b/.test(tag)) throw new DocumentConditionError('syntax', tag.slice(3).trim())
      break // Preserve ordinary malformed tags for Docxtemplater's existing validation.
    }
    cursor = end + (double ? 2 : 1)
    let replacement: string | undefined = double ? `{${tag}}` : undefined
    if (/^#if\b/.test(tag)) {
      const expression = tag.slice(3).trim()
      if (active) throw new DocumentConditionError('blocks', expression)
      if (/[\r\n\u2028\u2029]/u.test(original)) throw new DocumentConditionError('syntax', expression)
      active = `?condition:${conditions.size}`
      conditions.set(active, { expression, condition: parseDocumentCondition(expression) })
      replacement = `{#${active}}`
    } else if (tag === '/if') {
      if (!active) throw new DocumentConditionError('blocks', '/if')
      replacement = `{/${active}}`
      active = undefined
    } else if (tag === 'else' || tag === '#else') {
      throw new DocumentConditionError('blocks', tag)
    }
    if (replacement === undefined) continue
    let first = true
    while (nodeCursor < nodes.length && nodes[nodeCursor]!.start + nodes[nodeCursor]!.text.length <= start) nodeCursor++
    for (let index = nodeCursor; index < nodes.length; index++) {
      const node = nodes[index]!
      if (node.start >= cursor) break
      const localStart = Math.max(start - node.start, 0)
      const localEnd = Math.min(cursor - node.start, node.text.length)
      if (localStart >= localEnd) continue
      node.edits.push({ start: localStart, end: localEnd, value: first ? replacement : '' })
      first = false
    }
  }
  if (active) throw new DocumentConditionError('blocks', conditions.get(active)!.expression)
  const output: string[] = []
  let xmlCursor = 0
  for (const node of nodes) {
    if (!node.edits.length) continue
    let value = node.text
    for (const edit of node.edits.reverse()) value = value.slice(0, edit.start) + edit.value + value.slice(edit.end)
    output.push(xml.slice(xmlCursor, node.xmlStart), encode(value))
    xmlCursor = node.xmlEnd
  }
  output.push(xml.slice(xmlCursor))
  return output.join('')
}
