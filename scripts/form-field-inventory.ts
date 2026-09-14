/* eslint-disable jsdoc/require-jsdoc */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from '@vue/compiler-sfc'
import { parse as parseTemplate, NodeTypes } from '@vue/compiler-dom'
import type { ElementNode, RootNode, TemplateChildNode } from '@vue/compiler-dom'
import ts from 'typescript'

export interface FieldControl {
  tag: string
  classification: 'native' | 'named-control' | 'model-bound-candidate' | 'dynamic'
  line: number
  model: string | null
  attributes: Record<string, string>
}
export interface CatalogField {
  id: string
  file: string
  line: number
  kind: 'field' | 'standalone-control'
  tag: string
  name: string | null
  label: string | null
  attributes: Record<string, string>
  conditions: string[]
  form: Record<string, string> | null
  controls: FieldControl[]
  schemaClues: string[]
  unresolved: string[]
}

const attributeMap = (node: ElementNode): Record<string, string> => Object.fromEntries(node.props.map(prop => {
  if (prop.type === NodeTypes.ATTRIBUTE) return [prop.name, prop.value?.content ?? 'true']
  const argument = prop.arg?.type === NodeTypes.SIMPLE_EXPRESSION ? prop.arg.content : ''
  const expression = prop.exp?.type === NodeTypes.SIMPLE_EXPRESSION ? prop.exp.content : ''
  return [prop.name === 'bind' ? `:${argument}` : `v-${prop.name}${argument ? `:${argument}` : ''}`, expression]
}))
const value = (attributes: Record<string, string>, name: string): string | null => attributes[`:${name}`] ?? attributes[name] ?? null
const fieldTag = (tag: string): boolean => /^(U|Common|Extension)FormField$/.test(tag)
const formTag = (tag: string): boolean => tag === 'form' || tag === 'CommonResourceCrud' || /^(U|Common|Extension)Form$/.test(tag)
const classifyControl = (tag: string, attributes: Record<string, string>): FieldControl['classification'] | null => {
  if (/^(input|textarea|select)$/.test(tag)) return 'native'
  if (tag === 'component') return 'dynamic'
  if (/(?:Input|InputNumber|InputDate|InputTime|InputTags|Textarea|Select|SelectMenu|MultiSelect|MultiSelectMenu|DatePicker|Checkbox|CheckboxGroup|RadioGroup|Switch|Slider|PinInput|FileUpload)$/.test(tag)) return 'named-control'
  if (attributes[':model-value'] !== undefined || Object.keys(attributes).some(key => key === 'v-model' || key.startsWith('v-model:'))) return 'model-bound-candidate'
  return null
}

const collectSchemaClues = (script: string): string[] => {
  const source = ts.createSourceFile('component.ts', script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const clues = new Set<string>()
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && /schema|validat/i.test(node.getText(source))) clues.add(node.getText(source))
    if (ts.isVariableDeclaration(node) && node.initializer && /schema|validat/i.test(node.getText(source))) clues.add(node.getText(source))
    ts.forEachChild(node, visit)
  }
  visit(source)
  return [...clues]
}

/**
 * Catalogs declarations without assuming unresolved fields are optional.
 * @param file - Source filename for stable source locations.
 * @param source - Complete Vue single-file component source.
 * @returns Field declarations and unresolved contexts.
 */
export const catalogVueFields = (file: string, source: string): CatalogField[] => {
  const { descriptor, errors } = parse(source, { filename: file })
  if (errors.length) throw new Error(`${file}: ${errors.map(String).join('; ')}`)
  if (!descriptor.template) return []
  const template = descriptor.template
  const ast = parseTemplate(template.content)
  const lineOffset = template.loc.start.line - 1
  const schemaClues = collectSchemaClues([descriptor.script?.content, descriptor.scriptSetup?.content].filter(Boolean).join('\n'))
  const records: CatalogField[] = []
  const walk = (node: RootNode | TemplateChildNode, enclosingField: CatalogField | null, enclosingForm: Record<string, string> | null, conditions: string[]): void => {
    if (node.type !== NodeTypes.ROOT && node.type !== NodeTypes.ELEMENT) return
    let currentField = enclosingField
    let currentForm = enclosingForm
    let currentConditions = conditions
    if (node.type === NodeTypes.ELEMENT) {
      const attributes = attributeMap(node)
      const classification = classifyControl(node.tag, attributes)
      const line = lineOffset + node.loc.start.line
      const localConditions = Object.entries(attributes).filter(([key]) => ['v-if', 'v-else-if', 'v-else', 'v-for'].includes(key)).map(([key, expression]) => `${key}=${expression}`)
      currentConditions = [...conditions, ...localConditions]
      if (formTag(node.tag)) currentForm = { component: node.tag, ...attributes }
      const makeRecord = (kind: CatalogField['kind']): CatalogField => ({
        id: `${file}:${line}:${node.tag}:${records.length + 1}`,
        file, line, kind, tag: node.tag,
        name: value(attributes, 'name'),
        label: value(attributes, 'label') ?? value(attributes, 'aria-label'),
        attributes, conditions: currentConditions, form: currentForm,
        controls: [], schemaClues,
        unresolved: [
          ...(attributes[':name'] ? ['dynamic-field-name'] : []),
          ...(attributes[':'] !== undefined ? ['spread-attributes'] : []),
          ...(node.tag === 'component' ? ['dynamic-component'] : []),
          ...(!currentForm ? ['form-context-outside-component'] : [])
        ]
      })
      if (fieldTag(node.tag)) {
        currentField = makeRecord('field')
        records.push(currentField)
      } else if (classification) {
        if (!currentField) {
          currentField = makeRecord('standalone-control')
          records.push(currentField)
        }
        currentField.controls.push({ tag: node.tag, classification, line, model: attributes['v-model'] ?? Object.entries(attributes).find(([key]) => key.startsWith('v-model:'))?.[1] ?? value(attributes, 'model-value'), attributes })
        if (classification === 'dynamic') currentField.unresolved.push('dynamic-component')
        if (classification === 'model-bound-candidate') currentField.unresolved.push('model-binding-may-be-container')
      }
    }
    // A model-bound container is a candidate declaration, never a field wrapper for its children.
    const childField = currentField?.kind === 'standalone-control' ? enclosingField : currentField
    for (const child of node.children) walk(child, childField, currentForm, currentConditions)
  }
  walk(ast, null, null, [])
  for (const record of records) {
    if (record.kind === 'field' && !record.controls.length) record.unresolved.push('control-outside-component-or-slot')
    if (!record.name && record.kind === 'field') record.unresolved.push('missing-field-name')
  }
  return records
}

export interface CatalogForm {
  file: string
  line: number
  attributes: Record<string, string>
  schemaClues: string[]
  children: string[]
  validation: 'schema-prop' | 'validator-binding' | 'unvalidated'
}

export const catalogVueForms = (file: string, source: string): CatalogForm[] => {
  const { descriptor, errors } = parse(source, { filename: file })
  if (errors.length) throw new Error(`${file}: ${errors.map(String).join('; ')}`)
  if (!descriptor.template) return []
  const template = descriptor.template
  const ast = parseTemplate(template.content)
  const schemaClues = collectSchemaClues([descriptor.script?.content, descriptor.scriptSetup?.content].filter(Boolean).join('\n'))
  const forms: CatalogForm[] = []
  const visit = (node: RootNode | TemplateChildNode, enclosing: CatalogForm | null): void => {
    if (node.type !== NodeTypes.ROOT && node.type !== NodeTypes.ELEMENT) return
    let form = enclosing
    if (node.type === NodeTypes.ELEMENT) {
      const attributes = attributeMap(node)
      if (formTag(node.tag)) {
        form = {
          file, line: template.loc.start.line - 1 + node.loc.start.line,
          attributes, schemaClues, children: [],
          validation: value(attributes, 'schema') ? 'schema-prop' : value(attributes, 'validate') ? 'validator-binding' : 'unvalidated'
        }
        forms.push(form)
      } else if (form && /^[A-Z]/.test(node.tag) && !form.children.includes(node.tag)) form.children.push(node.tag)
    }
    for (const child of node.children) visit(child, form)
  }
  visit(ast, null)
  return forms
}

const ignoredDirectories = new Set(['node_modules', '.git', '.nuxt', '.output', 'tests', 'dist', 'coverage'])
export const collectVueFiles = async (root: string): Promise<string[]> => {
  const files: string[] = []
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return []
      throw error
    })) {
      if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) await walk(resolve(directory, entry.name))
      else if (entry.isFile() && entry.name.endsWith('.vue')) files.push(resolve(directory, entry.name))
    }
  }
  for (const folder of ['app', 'extensions', 'packages']) await walk(resolve(root, folder))
  return files.sort()
}

export const writeFieldInventory = async (root: string, output: string): Promise<CatalogField[]> => {
  const files = await collectVueFiles(root)
  const sources = await Promise.all(files.map(async file => ({ file: relative(root, file), source: await readFile(file, 'utf8') })))
  const fields = sources.flatMap(({ file, source }) => catalogVueFields(file, source))
  const forms = sources.flatMap(({ file, source }) => catalogVueForms(file, source))
  const summary = {
    filesScanned: files.length,
    forms: forms.length,
    declarations: fields.length,
    fields: fields.filter(field => field.kind === 'field').length,
    standaloneControls: fields.filter(field => field.kind === 'standalone-control').length,
    controls: fields.reduce((count, field) => count + field.controls.length, 0),
    unresolvedDeclarations: fields.filter(field => field.unresolved.length).length,
    byArea: Object.fromEntries([...new Set(fields.map(field => field.file.split('/').slice(0, 3).join('/')))].sort().map(area => [area, fields.filter(field => field.file === area || field.file.startsWith(`${area}/`)).length]))
  }
  await mkdir(output, { recursive: true })
  await writeFile(resolve(output, 'inventory.json'), `${JSON.stringify({ summary, forms, fields }, null, 2)}\n`)
  const cell = (text: string | null): string => (text ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ')
  await writeFile(resolve(output, 'inventory.md'), [
    '# Form field inventory', '',
    'Generated from Vue and TypeScript syntax trees. Rows are declarations, not rendered runtime instances. Schema clues are navigation aids, never proof of optionality or requirement. Cross-component form contexts, conditional/group requirements, and dynamic controls require runtime/contract verification.', '',
    `Scanned ${summary.filesScanned} Vue files: ${summary.fields} field wrappers, ${summary.standaloneControls} standalone control declarations, ${summary.controls} controls.`, '',
    '| Source | Field | Controls/models | Visual required | Control required / aria-required | Validator | Unresolved |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...fields.map(field => `| ${cell(`${field.file}:${field.line}`)} | ${cell(field.name ?? field.label)} | ${cell(field.controls.map(control => `${control.tag}: ${control.model ?? ''}`).join('; '))} | ${cell(value(field.attributes, 'required'))} | ${cell(field.controls.map(control => `${value(control.attributes, 'required') ?? ''} / ${value(control.attributes, 'aria-required') ?? ''}`).join('; '))} | ${cell(field.form ? value(field.form, 'validate') ?? value(field.form, 'schema') : null)} | ${field.unresolved.join(', ')} |`), ''
  ].join('\n'))
  console.info(JSON.stringify(summary, null, 2))
  return fields
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] ?? '.')
  await writeFieldInventory(root, resolve(root, process.argv[3] ?? '.agent/reports/required-fields'))
}
