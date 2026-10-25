import { readFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import ts from 'typescript'
import { parse as parseSfc } from '@vue/compiler-sfc'
import { parse, NodeTypes } from '@vue/compiler-dom'
import type { ElementNode, TemplateChildNode } from '@vue/compiler-dom'
import { z } from 'zod'
import type { UiTargetSource } from './source'

const escapeAttribute = (value: string): string => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const staticAttribute = (node: ElementNode, name: string): string | undefined => {
  const attribute = node.props.find(prop => prop.type === NodeTypes.ATTRIBUTE && prop.name === name)
  return attribute?.type === NodeTypes.ATTRIBUTE ? attribute.value?.content : undefined
}
const boundAttribute = (node: ElementNode, name: string): string | undefined => {
  const attribute = node.props.find(prop => prop.type === NodeTypes.DIRECTIVE && prop.name === 'bind' && prop.arg?.type === NodeTypes.SIMPLE_EXPRESSION && prop.arg.content === name)
  return attribute?.type === NodeTypes.DIRECTIVE && attribute.exp?.type === NodeTypes.SIMPLE_EXPRESSION ? attribute.exp.content : undefined
}
/**
 * Read a literal string from a field definition.
 * @param node - Static field definition.
 * @param name - Property to read.
 * @returns The literal value when present.
 */
const propertyText = (node: ts.ObjectLiteralExpression, name: string): string | undefined => {
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) continue
    const propertyName = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) ? property.name.text : undefined
    if (propertyName === name && ts.isStringLiteral(property.initializer)) return property.initializer.text
  }
  return undefined
}

/**
 * Read the same static field arrays that AdminCommonManagerTab renders.
 * @param source - Vue caller containing developer-defined fields.
 * @returns Synthetic declarations for the shared source scanner.
 */
export const extractSchemaFieldSources = (source: UiTargetSource): UiTargetSource[] => {
  if (!source.source.includes('<AdminCommonManagerTab')) return []
  const { descriptor } = parseSfc(source.source, { filename: source.filename })
  if (!descriptor.template) return []
  const script = descriptor.scriptSetup?.content ?? descriptor.script?.content ?? ''
  const tree = ts.createSourceFile(source.filename, script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const arrays = new Map<string, ts.ArrayLiteralExpression>()
  const collectArrays = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isArrayLiteralExpression(node.initializer)) arrays.set(node.name.text, node.initializer)
    ts.forEachChild(node, collectArrays)
  }
  collectArrays(tree)
  const declarations: string[] = []
  /**
   * Collect field arrays used by each manager instance.
   * @param nodes - Parsed template children.
   */
  const visit = (nodes: TemplateChildNode[]) => {
    for (const node of nodes) {
      if (node.type !== NodeTypes.ELEMENT) continue
      if (node.tag === 'AdminCommonManagerTab') {
        const scope = staticAttribute(node, 'field-scope')
        const fields = arrays.get(boundAttribute(node, 'fields') ?? '')
        if (!scope || !fields) throw new Error(`${source.filename}: AdminCommonManagerTab requires a static field-scope and a static fields array for its UI target registry.`)
        for (const field of fields.elements) {
          if (!ts.isObjectLiteralExpression(field)) throw new Error(`${source.filename}: UI field arrays must contain explicit field definitions.`)
          const key = propertyText(field, 'key')
          const labelKey = propertyText(field, 'labelKey')
          const type = propertyText(field, 'type')
          if (!key || !labelKey || !type) throw new Error(`${source.filename}: UI fields require static key, labelKey and type.`)
          const control = type === 'boolean' ? 'USwitch' : ['enum', 'lookup'].includes(type) ? 'USelect' : 'UInput'
          declarations.push(`<UFormField data-field-scope="${escapeAttribute(scope)}" name="${escapeAttribute(key)}" :label="t('${escapeAttribute(labelKey)}')"><${control} /></UFormField>`)
        }
      }
      visit(node.children)
    }
  }
  visit(parse(descriptor.template.content).children)
  return declarations.length ? [{ ...source, filename: `${source.filename}#schema-fields`, source: `<template>${declarations.join('')}</template>` }] : []
}

const labelSchema = z.object({ en: z.string(), fr: z.string() })
const nodeSchema = z.object({
  type: z.enum(['stack', 'group', 'section', 'accordion', 'collection', 'text', 'notice', 'input', 'textarea', 'number', 'select', 'switch']),
  key: z.string().optional(),
  label: labelSchema.optional(),
  /** @returns Recursively nested layout children. */
  get children() { return z.array(nodeSchema).optional() },
  /** @returns A repeated row definition. */
  get item_schema() { return nodeSchema.optional() }
})

/**
 * Read schema sources explicitly declared by their owning renderer.
 * @param root - Public repository root.
 * @param sources - Application and extension Vue sources.
 * @returns Source declarations for developer-defined schema fields.
 */
export const collectSchemaFieldSources = async (root: string, sources: UiTargetSource[]): Promise<UiTargetSource[]> => {
  const collected: UiTargetSource[] = []
  const declarations = new Set<string>()
  for (const source of sources) {
    if (!source.source.includes('data-field-schema-source')) continue
    const { descriptor } = parseSfc(source.source, { filename: source.filename })
    if (!descriptor.template) continue
    /**
     * Load every schema referenced by a renderer branch.
     * @param nodes - Template declarations to inspect.
     */
    const visit = async (nodes: TemplateChildNode[]): Promise<void> => {
      for (const node of nodes) {
        if (node.type !== NodeTypes.ELEMENT) continue
        const schemaPath = staticAttribute(node, 'data-field-schema-source')
        if (schemaPath) {
          const scope = staticAttribute(node, 'data-field-schema-scope')
          const en = staticAttribute(node, 'data-field-schema-label-en')
          const fr = staticAttribute(node, 'data-field-schema-label-fr')
          if (!scope || !en || !fr) throw new Error(`${source.filename}: Schema field sources require a scope and bilingual labels.`)
          const filename = relative(root, resolve(root, dirname(source.filename), schemaPath))
          const identity = `${filename}:${scope}`
          if (!declarations.has(identity)) {
            declarations.add(identity)
            const schema = nodeSchema.parse(JSON.parse(await readFile(resolve(root, filename), 'utf8')))
            const fields: string[] = []
            /**
             * Convert a developer field definition into a shared target declaration.
             * @param field - Parsed schema node.
             * @param prefix - Collection path without instance indexes.
             */
            const emit = (field: z.infer<typeof nodeSchema>, prefix: string) => {
              const path = [prefix, field.key].filter(Boolean).join('.')
              if (['input', 'textarea', 'number', 'select', 'switch'].includes(field.type)) {
                if (!field.key || !field.label) throw new Error(`${filename}: ${field.type} requires a stable key and bilingual label.`)
                const control = field.type === 'switch' ? 'USwitch' : field.type === 'select' ? 'USelect' : 'UInput'
                fields.push(`<UFormField data-field-scope="${escapeAttribute(scope)}" data-scope-label-en="${escapeAttribute(en)}" data-scope-label-fr="${escapeAttribute(fr)}" name="${escapeAttribute(path)}" data-field-label-en="${escapeAttribute(field.label.en)}" data-field-label-fr="${escapeAttribute(field.label.fr)}"><${control} /></UFormField>`)
              }
              for (const child of field.children ?? []) emit(child, prefix)
              if (field.item_schema) emit(field.item_schema, path)
            }
            emit(schema, '')
            collected.push({ filename, source: `<template>${fields.join('')}</template>`, owner: source.owner })
          }
        }
        await visit(node.children)
      }
    }
    await visit(parse(descriptor.template.content).children)
  }
  return collected
}
