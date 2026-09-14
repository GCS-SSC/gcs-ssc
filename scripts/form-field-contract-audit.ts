/* eslint-disable jsdoc/require-jsdoc */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parse } from '@vue/compiler-sfc'
import { parse as parseTemplate, NodeTypes } from '@vue/compiler-dom'
import type { ElementNode, RootNode, TemplateChildNode } from '@vue/compiler-dom'
import ts from 'typescript'
import { createHash } from 'node:crypto'
import type { z } from 'zod'
import { resolveFormFieldRequirement } from '../shared/utils/form-requirements'
import { catalogVueFields, collectVueFiles } from './form-field-inventory'
import type { CatalogField } from './form-field-inventory'

type Candidate = { schema: z.ZodType, evidence: string }
type Scope = { file: string, source: ts.SourceFile }
type Usage = { file: string, tag: string, attrs: Record<string, string>, formExpression: string | null }
export interface FieldContractAudit {
  id: string
  fingerprint: string
  file: string
  line: number
  name: string | null
  kind: CatalogField['kind']
  controls: Array<{ tag: string, model: string | null }>
  strategy: 'explicit' | 'schema' | 'group-instruction' | 'display' | 'delegated-component' | 'ui-state' | 'filter' | 'defaulted' | 'shared-control' | 'dynamic-schema' | 'unresolved'
  requirement: 'required' | 'optional' | 'conditional' | 'unknown' | 'not-applicable'
  evidence: string[]
}
export interface FieldContractDecision {
  fingerprint: string
  strategy: 'filter' | 'defaulted' | 'display' | 'shared-control' | 'dynamic-schema' | 'group-instruction'
  requirement: 'optional' | 'conditional' | 'not-applicable' | 'required'
  reason: string
  evidence: Array<{ file: string, sha256: string }>
}
const digest = (source: string): string => createHash('sha256').update(source).digest('hex')
export const fieldContractFingerprint = (field: CatalogField): string => {
  const semanticAttrs = (attrs: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(attrs).filter(([key]) => !['class', ':class', 'style', ':style', ':ui', 'ui', 'key', ':key'].includes(key)).sort(([left], [right]) => left.localeCompare(right)))
  return digest(JSON.stringify({ file: field.file, kind: field.kind, tag: field.tag, name: field.name, label: field.label, conditions: field.conditions, attributes: semanticAttrs(field.attributes), form: field.form ? semanticAttrs(field.form) : null, controls: field.controls.map(control => ({ tag: control.tag, model: control.model, attributes: semanticAttrs(control.attributes) })) }))
}
const attrsOf = (node: ElementNode): Record<string, string> => Object.fromEntries(node.props.map(prop => {
  if (prop.type === NodeTypes.ATTRIBUTE) return [prop.name, prop.value?.content ?? 'true']
  return [prop.name === 'bind' && prop.arg?.type === NodeTypes.SIMPLE_EXPRESSION ? `:${prop.arg.content}` : `v-${prop.name}`, prop.exp?.type === NodeTypes.SIMPLE_EXPRESSION ? prop.exp.content : '']
}))
const isSchema = (value: unknown): value is z.ZodType => Boolean(value && typeof value === 'object' && '_zod' in value && 'safeParse' in value)
/**
 * Checks omission structurally, without executing transforms or refinements.
 * UInputNumber clears to undefined rather than the empty string used by UInput.
 * @param schema Executable schema being inspected.
 * @param segments Remaining field path segments.
 * @returns Whether the selected leaf structurally accepts an omitted value.
 */
export const numberControlAcceptsUndefined = (schema: unknown, segments: string[]): boolean | undefined => {
  const definition = (schema as { _zod?: { def?: { type: string, innerType?: unknown, shape?: Record<string, unknown>, element?: unknown, options?: unknown[], left?: unknown, right?: unknown, out?: unknown } } })?._zod?.def
  if (!definition) return undefined
  if (!segments.length) {
    if (['optional', 'default', 'prefault', 'catch', 'any', 'unknown', 'undefined', 'void'].includes(definition.type)) return true
    if (['nullable', 'readonly', 'nonoptional'].includes(definition.type)) return numberControlAcceptsUndefined(definition.innerType, segments)
    return false
  }
  if (definition.type === 'object') {
    const child = definition.shape?.[segments[0]!]
    return child ? numberControlAcceptsUndefined(child, segments.slice(1)) : undefined
  }
  if (definition.type === 'array') return numberControlAcceptsUndefined(definition.element, segments.slice(1))
  if (definition.innerType) return numberControlAcceptsUndefined(definition.innerType, segments)
  if (definition.type === 'pipe' && (schema as z.ZodType).meta()?.formPreservesInputPaths === true) return numberControlAcceptsUndefined(definition.out, segments)
  if (definition.type === 'union' || definition.type === 'intersection') {
    const alternatives = definition.type === 'union' ? definition.options ?? [] : [definition.left, definition.right]
    const results = alternatives.map(alternative => numberControlAcceptsUndefined(alternative, segments)).filter(result => result !== undefined)
    return results.length ? results.every(Boolean) : undefined
  }
  return undefined
}

const uniqueCandidates = (candidates: Candidate[]): Candidate[] => [...new Map(candidates.map(candidate => [candidate.evidence, candidate])).values()]
const nativeOrNuxt = (tag: string): boolean => /^[a-z]/.test(tag) || /^U[A-Z]/.test(tag)

export const auditFieldContracts = async (root: string): Promise<FieldContractAudit[]> => {
  const paths = await collectVueFiles(root)
  const fields: CatalogField[] = []
  const scopes = new Map<string, Scope>()
  const usages: Usage[] = []
  const aliases = new Map<string, string[]>()
  const imports = new Map<string, Promise<Record<string, unknown>>>()
  const readScope = async (file: string): Promise<Scope | undefined> => {
    const existing = scopes.get(file)
    if (existing) return existing
    try {
      const content = await readFile(file, 'utf8')
      const script = file.endsWith('.vue')
        ? (() => {
            const { descriptor } = parse(content)
            return [descriptor.script?.content, descriptor.scriptSetup?.content].filter(Boolean).join('\n')
          })()
        : content
      const scope = { file, source: ts.createSourceFile(file, script, ts.ScriptTarget.Latest, true) }
      scopes.set(file, scope)
      return scope
    } catch { return undefined }
  }
  const importPath = (file: string, specifier: string): string | undefined => {
    const base = specifier.startsWith('~~/')
      ? resolve(root, specifier.slice(3))
      : specifier.startsWith('~/')
        ? resolve(root, 'app', specifier.slice(2))
        : specifier.startsWith('.') ? resolve(dirname(file), specifier) : undefined
    if (!base) return undefined
    return /\.(ts|vue)$/.test(base) ? base : `${base}.ts`
  }
  const resolveImported = async (scope: Scope, identifier: string, seen: Set<string>): Promise<Candidate[]> => {
    for (const statement of scope.source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
      const bindings = statement.importClause?.namedBindings
      if (!bindings || !ts.isNamedImports(bindings)) continue
      const binding = bindings.elements.find(element => element.name.text === identifier)
      if (!binding) continue
      const rawPath = statement.moduleSpecifier.text
      let target = importPath(scope.file, rawPath)
      if (!target) return []
      if (rawPath.endsWith('/schemas')) target = target.replace(/schemas\.ts$/, 'schemas/index.ts')
      const exported = binding.propertyName?.text ?? binding.name.text
      if (target.includes('/shared/types/schemas/')) {
        const promise = imports.get(target) ?? import(pathToFileURL(target).href).catch(() => ({}))
        imports.set(target, promise)
        const imported = (await promise)[exported]
        return isSchema(imported) ? [{ schema: imported, evidence: `${relative(root, target)}#${exported}` }] : []
      }
      const targetScope = await readScope(target)
      return targetScope ? resolveIdentifier(targetScope, exported, seen) : []
    }
    return []
  }
  const resolveIdentifier = async (scope: Scope, identifier: string, seen: Set<string>): Promise<Candidate[]> => {
    const key = `${scope.file}#${identifier}`
    if (seen.has(key)) return []
    const nextSeen = new Set([...seen, key])
    const imported = await resolveImported(scope, identifier, nextSeen)
    if (imported.length) return imported
    const matches: ts.VariableDeclaration[] = []
    const visit = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node) && (ts.isIdentifier(node.name) ? node.name.text === identifier : ts.isObjectBindingPattern(node.name) && node.name.elements.some(element => element.name.getText(scope.source) === identifier))) matches.push(node)
      ts.forEachChild(node, visit)
    }
    visit(scope.source)
    const candidates: Candidate[] = []
    for (const declaration of matches) {
      if (!declaration.initializer) continue
      if (ts.isObjectBindingPattern(declaration.name) && ts.isCallExpression(declaration.initializer) && ts.isIdentifier(declaration.initializer.expression)) {
        const callName = declaration.initializer.expression.text
        const local = resolve(root, 'app/composables', `${callName}.ts`)
        const composableScope = await readScope(local)
        if (composableScope) candidates.push(...await resolveIdentifier(composableScope, identifier, nextSeen))
      } else candidates.push(...await resolveExpression(scope, declaration.initializer, nextSeen))
    }
    return uniqueCandidates(candidates)
  }
  const resolveExpression = async (scope: Scope, expression: ts.Expression, seen: Set<string>): Promise<Candidate[]> => {
    if (ts.isIdentifier(expression)) return resolveIdentifier(scope, expression.text, seen)
    if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression)) return resolveExpression(scope, expression.expression, seen)
    if (ts.isConditionalExpression(expression)) return uniqueCandidates([...await resolveExpression(scope, expression.whenTrue, seen), ...await resolveExpression(scope, expression.whenFalse, seen)])
    if (ts.isArrowFunction(expression) && !ts.isBlock(expression.body)) return resolveExpression(scope, expression.body, seen)
    if (!ts.isCallExpression(expression)) return []
    const callee = expression.expression
    const method = ts.isPropertyAccessExpression(callee) ? callee.name.text : ts.isIdentifier(callee) ? callee.text : ''
    if (['createValidator', 'computed', 'withFormRequirements'].includes(method)) {
      const argument = expression.arguments[method === 'withFormRequirements' ? 1 : 0]
      return argument ? resolveExpression(scope, argument, seen) : []
    }
    if (ts.isPropertyAccessExpression(callee) && ['omit', 'pick', 'partial', 'required', 'strict', 'passthrough'].includes(method)) {
      const bases = await resolveExpression(scope, callee.expression, seen)
      return bases.flatMap(candidate => {
        const schema = candidate.schema as unknown as Record<string, (...args: unknown[]) => z.ZodType>
        const argument = expression.arguments[0]
        const mask = argument && ts.isObjectLiteralExpression(argument) ? Object.fromEntries(argument.properties.filter(ts.isPropertyAssignment).map(property => [property.name.getText(scope.source).replaceAll('\'', ''), true])) : undefined
        try {
          return [{ schema: schema[method]!(...(mask ? [mask] : [])), evidence: `${candidate.evidence}.${method}(${mask ? Object.keys(mask).join(',') : ''})` }]
        } catch {
          return []
        }
      })
    }
    return []
  }
  const expressionCache = new Map<string, Promise<Candidate[]>>()
  const resolveText = async (file: string, expression: string | null): Promise<Candidate[]> => {
    if (!expression) return []
    const scope = await readScope(file)
    if (!scope) return []
    const parsed = ts.createSourceFile('expression.ts', `(${expression})`, ts.ScriptTarget.Latest, true)
    const statement = parsed.statements[0]
    return statement && ts.isExpressionStatement(statement) ? resolveExpression(scope, statement.expression, new Set()) : []
  }
  const fromText = (file: string, expression: string | null): Promise<Candidate[]> => {
    const key = `${file}#${expression}`
    const promise = expressionCache.get(key) ?? resolveText(file, expression)
    expressionCache.set(key, promise)
    return promise
  }
  for (const path of paths) {
    const content = await readFile(path, 'utf8')
    const file = relative(root, path)
    fields.push(...catalogVueFields(file, content))
    await readScope(path)
    const parts = file.split('/components/')[1]?.replace(/\.vue$/, '').split('/')
    if (parts) {
      const full = parts.reduce((name, part) => name.endsWith(part) || part.startsWith(name) ? part : name + part, '')
      for (const alias of new Set([parts.at(-1)!, full])) aliases.set(alias, [...(aliases.get(alias) ?? []), path])
    }
    const { descriptor } = parse(content)
    if (!descriptor.template) continue
    const visit = (node: RootNode | TemplateChildNode, formExpression: string | null): void => {
      if (node.type !== NodeTypes.ROOT && node.type !== NodeTypes.ELEMENT) return
      let current = formExpression
      if (node.type === NodeTypes.ELEMENT) {
        const attrs = attrsOf(node)
        if (['UForm', 'CommonResourceCrud'].includes(node.tag)) current = attrs[':validate'] ?? attrs[':schema'] ?? null
        usages.push({ file: path, tag: node.tag, attrs, formExpression: current })
      }
      for (const child of node.children) visit(child, current)
    }
    visit(parseTemplate(descriptor.template.content), null)
  }
  const contexts = new Map<string, Candidate[]>()
  for (let iteration = 0; iteration < 12; iteration++) {
    let added = 0
    for (const usage of usages) {
      if (nativeOrNuxt(usage.tag)) continue
      const targets = aliases.get(usage.tag) ?? []
      if (targets.length !== 1) continue
      const local = await fromText(usage.file, usage.attrs[':schema'] ?? usage.formExpression)
      const candidates = local.length ? local : contexts.get(usage.file) ?? []
      if (!candidates.length) continue
      const current = contexts.get(targets[0]!) ?? []
      const next = uniqueCandidates([...current, ...candidates])
      added += next.length - current.length
      contexts.set(targets[0]!, next)
    }
    if (!added) break
  }
  const resolveFieldPaths = (file: string, fieldName: string | null, dynamicName: boolean): string[] => {
    if (!fieldName) return []
    const normalizeTemplate = (expression: string): string | undefined => {
      if (/^[`'"].*[`'"]$/.test(expression)) return expression.slice(1, -1).replace(/\$\{[^}]+\}/g, '0')
      return undefined
    }
    const localUsages = usages.filter(usage => aliases.get(usage.tag)?.includes(file))
    const scope = scopes.get(file)
    const resolveProp = (prop: string): string[] => {
      const values: string[] = []
      const kebab = prop.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)
      for (const usage of localUsages) {
        const direct = usage.attrs[kebab]
        const bound = usage.attrs[`:${kebab}`]
        if (direct !== undefined) values.push(direct)
        else if (bound !== undefined) {
          const normalized = normalizeTemplate(bound)
          if (normalized !== undefined) values.push(normalized)
        }
      }
      if (scope) {
        const visit = (node: ts.Node): void => {
          if (ts.isBindingElement(node) && node.name.getText(scope.source) === prop && node.initializer) {
            const normalized = normalizeTemplate(node.initializer.getText(scope.source))
            if (normalized !== undefined) values.push(normalized)
          }
          ts.forEachChild(node, visit)
        }
        visit(scope.source)
      }
      return [...new Set(values)]
    }
    const call = fieldName.match(/^(?:field|fieldName)\((.*)\)$/)
    const argument = call?.[1]
    if (argument !== undefined) {
      const literal = normalizeTemplate(argument)
      const names = literal !== undefined ? [literal] : resolveProp(argument)
      const prefixes = ['', ...resolveProp('namePrefix')]
      return [...new Set(names.flatMap(name => prefixes.map(prefix => prefix ? `${prefix}.${name}` : name)))].filter(Boolean)
    }
    if (fieldName === 'name' && dynamicName) return resolveProp('name')
    return [normalizeTemplate(fieldName) ?? fieldName]
  }
  const results: FieldContractAudit[] = []
  for (const field of fields) {
    const audit: FieldContractAudit = { id: field.id, fingerprint: fieldContractFingerprint(field), file: field.file, line: field.line, name: field.name, kind: field.kind, controls: field.controls.map(control => ({ tag: control.tag, model: control.model })), strategy: 'unresolved', requirement: 'unknown', evidence: [] }
    const explicit = field.attributes[':required'] ?? field.attributes.required
    if (explicit !== undefined) {
      audit.strategy = 'explicit'
      audit.requirement = explicit === 'true' || explicit === '' ? 'required' : explicit === 'false' ? 'optional' : 'conditional'
      audit.evidence = [`${field.file}:${field.line} required=${explicit}`]
    } else if (field.kind === 'standalone-control' && field.controls.length === 1 && ['UModal', 'UPopover', 'UAccordion', 'UTabs', 'UProgress', 'ExtensionModal', 'ExtensionProgress'].includes(field.controls[0]!.tag)) {
      audit.strategy = 'ui-state'
      audit.requirement = 'not-applicable'
      audit.evidence = [`${field.controls[0]!.tag} binds visibility, expanded selection, or progress rather than a submitted field`]
    } else if (field.kind === 'standalone-control' && field.controls.length === 1 && (aliases.get(field.controls[0]!.tag)?.length === 1) && field.controls[0]!.classification === 'model-bound-candidate') {
      audit.strategy = 'delegated-component'
      audit.requirement = 'not-applicable'
      audit.evidence = [relative(root, aliases.get(field.controls[0]!.tag)![0]!)]
    } else if (field.kind === 'field' && !field.controls.length && !field.unresolved.includes('control-outside-component-or-slot')) {
      audit.strategy = 'display'
      audit.requirement = 'not-applicable'
    } else {
      const file = resolve(root, field.file)
      const direct = await fromText(file, field.form?.[':validate'] ?? field.form?.[':schema'] ?? null)
      const candidates = direct.length ? direct : contexts.get(file) ?? []
      const names = resolveFieldPaths(file, field.name, field.attributes[':name'] !== undefined)
      const resolved = candidates.flatMap(candidate => names.map(name => {
        const requirement = resolveFormFieldRequirement(candidate.schema, name)
        const numericOmissionUnknown = requirement === 'optional' && field.controls.some(control => control.tag === 'UInputNumber') && numberControlAcceptsUndefined(candidate.schema, name.split('.')) !== true
        return { candidate, name, requirement: numericOmissionUnknown ? 'unknown' as const : requirement }
      })).filter(item => item.requirement !== 'unknown')
      if (resolved.length) {
        audit.strategy = 'schema'
        audit.requirement = new Set(resolved.map(item => item.requirement)).size === 1 ? resolved[0]!.requirement : 'conditional'
        audit.evidence = resolved.map(item => `${item.candidate.evidence} path=${item.name}`)
      }
      if (audit.strategy === 'unresolved' && field.controls.length && field.controls.every(control => control.attributes[':aria-describedby']?.includes('Requirement') || control.attributes[':aria-describedby']?.includes('requirementId'))) {
        audit.strategy = 'group-instruction'
        audit.requirement = 'conditional'
        audit.evidence = field.controls.map(control => `${field.file}:${control.line} aria-describedby=${control.attributes[':aria-describedby']}`)
      }
      if (audit.strategy === 'unresolved') audit.evidence = [...candidates.map(candidate => candidate.evidence), ...field.unresolved]
    }
    results.push(audit)
  }
  const decisionDirectory = resolve(root, 'tooling/gcs-ssc/architecture/form-field-contracts')
  const decisionFiles = (await readdir(decisionDirectory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return []
    throw error
  })).filter(file => file.endsWith('.json')).sort()
  const decisions = new Map<string, FieldContractDecision>()
  const evidenceHashes = new Map<string, string>()
  for (const decisionFile of decisionFiles) {
    const entries: FieldContractDecision[] = JSON.parse(await readFile(resolve(decisionDirectory, decisionFile), 'utf8'))
    for (const decision of entries) {
      if (decisions.has(decision.fingerprint)) throw new Error(`Duplicate form-field decision: ${decision.fingerprint}`)
      if (!decision.reason?.trim() || !decision.evidence?.length || !['filter', 'defaulted', 'display', 'shared-control', 'dynamic-schema', 'group-instruction'].includes(decision.strategy) || !['optional', 'conditional', 'not-applicable', 'required'].includes(decision.requirement)) throw new Error(`Incomplete form-field decision in ${decisionFile}: ${decision.fingerprint}`)
      decisions.set(decision.fingerprint, decision)
    }
  }
  for (const [fingerprint, decision] of decisions) {
    const matches = results.filter(result => result.fingerprint === fingerprint)
    if (!matches.length) throw new Error(`Stale form-field decision: ${fingerprint}; remove or re-review the changed declaration.`)
    let valid = true
    for (const evidence of decision.evidence) {
      const path = resolve(root, evidence.file)
      if (!path.startsWith(`${root}/`)) throw new Error(`Evidence escapes repository: ${evidence.file}`)
      const hash = evidenceHashes.get(path) ?? digest(await readFile(path, 'utf8'))
      evidenceHashes.set(path, hash)
      if (hash !== evidence.sha256) valid = false
    }
    for (const match of matches) {
      const reviewedFiles = new Set(decision.evidence.map(evidence => resolve(root, evidence.file)))
      const unreviewedCallers = decision.strategy === 'dynamic-schema' && decision.requirement === 'not-applicable'
        ? [...new Set(usages.filter(usage => aliases.get(usage.tag)?.includes(resolve(root, match.file))).map(usage => usage.file))].filter(file => !reviewedFiles.has(file))
        : []
      if (!valid || unreviewedCallers.length) {
        match.strategy = 'unresolved'
        match.requirement = 'unknown'
        match.evidence.push(unreviewedCallers.length
          ? `Dormant branch has unreviewed component callers: ${unreviewedCallers.map(file => relative(root, file)).join(', ')}`
          : `Reviewed evidence changed: ${decision.reason}`)
      } else if (match.strategy === 'unresolved') {
        match.strategy = decision.strategy
        match.requirement = decision.requirement
        match.evidence = [decision.reason, ...decision.evidence.map(evidence => `${evidence.file}#sha256:${evidence.sha256}`)]
      }
    }
  }
  return results
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv.slice(2).find(argument => !argument.startsWith('--')) ?? '.')
  const results = await auditFieldContracts(root)
  const output = resolve(root, '.agent/reports/required-fields')
  await mkdir(output, { recursive: true })
  const unresolved = results.filter(result => result.strategy === 'unresolved')
  await writeFile(resolve(output, 'contract-audit.json'), `${JSON.stringify({ declarations: results.length, unresolved: unresolved.length, fields: results }, null, 2)}\n`)
  const areas: Record<string, FieldContractAudit[]> = { common: [], authoring: [], agreements: [] }
  for (const row of unresolved) {
    const authoring = ['Assessment', 'AssessmentSchema', 'Checklist', 'ChecklistSchema', 'Recommendation', 'RecommendationSchema', 'Review', 'ReviewSchema'].some(area => row.file.includes(`/${area}/`)) || row.file.startsWith('extensions/')
    const agreements = ['Agreement', 'ApplicantRecipient', 'TransferPayment'].some(area => row.file.includes(`/${area}/`)) || row.file.startsWith('app/pages/agreements/')
    areas[authoring ? 'authoring' : agreements ? 'agreements' : 'common']!.push(row)
  }
  for (const [area, rows] of Object.entries(areas)) await writeFile(resolve(output, `unresolved-${area}.json`), `${JSON.stringify(rows, null, 2)}\n`)
  console.info(JSON.stringify({ declarations: results.length, unresolved: unresolved.length, byStrategy: Object.fromEntries([...new Set(results.map(result => result.strategy))].map(strategy => [strategy, results.filter(result => result.strategy === strategy).length])) }, null, 2))
  if (process.argv.includes('--check') && unresolved.length) process.exitCode = 1
}
