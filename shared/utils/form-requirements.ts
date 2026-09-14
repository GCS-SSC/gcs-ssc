import { z } from 'zod'

export type FormFieldRequirement = 'required' | 'optional' | 'unknown'

/** Metadata on the unchanged asynchronous Nuxt UI validation callable. */
export const FORM_VALIDATOR_SCHEMA = Symbol('gcs.form-validator-schema')

/**
 * Reads schema metadata without invoking validation or application callbacks.
 * @param validator Application form validator.
 * @returns Its associated schema, when the validator carries metadata.
 */
export const getFormValidatorSchema = (validator: unknown): z.ZodType | undefined => {
  if (typeof validator !== 'function') return undefined
  const source = (validator as unknown as { [FORM_VALIDATOR_SCHEMA]?: FormRequirementSchemaSource })[FORM_VALIDATOR_SCHEMA]
  return typeof source === 'function' ? source() : source
}

export type FormRequirementSchemaSource = z.ZodType | (() => z.ZodType | undefined)

/**
 * Associates a custom validator with its input schema, including reactive schemas.
 * @param validator Existing callable; validation semantics remain unchanged.
 * @param schemaOrGetter Schema or getter evaluated only when metadata is requested.
 * @returns The same callable carrying its requirement schema.
 */
export const withFormRequirements = <T extends (...args: never[]) => unknown>(validator: T, schemaOrGetter: FormRequirementSchemaSource): T =>
  Object.assign(validator, { [FORM_VALIDATOR_SCHEMA]: schemaOrGetter })

interface SchemaDefinition {
  type: string
  checks?: Array<{ _zod?: { def?: CheckDefinition } }>
  innerType?: unknown
  in?: unknown
  out?: unknown
  element?: unknown
  valueType?: unknown
  items?: unknown[]
  rest?: unknown
  options?: unknown[]
  left?: unknown
  right?: unknown
  shape?: Record<string, unknown>
  values?: unknown[]
  entries?: Record<string, string | number>
  discriminator?: string
  coerce?: boolean
  format?: string
}

interface CheckDefinition {
  check?: string
  minimum?: number
  length?: number
  format?: string
  pattern?: RegExp
  value?: number
  inclusive?: boolean
}

const definitionOf = (schema: unknown): SchemaDefinition | undefined =>
  (schema as { _zod?: { def?: SchemaDefinition } } | undefined)?._zod?.def

const readValue = (value: unknown, key: string): unknown => {
  if (value === null || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, key)) return undefined
  return (value as Record<string, unknown>)[key]
}

/**
 * Combines alternatives: one optional branch permits omission.
 * @param requirements Requirements of each alternative.
 * @returns The least restrictive proven requirement.
 */
const combineUnion = (requirements: FormFieldRequirement[]): FormFieldRequirement => {
  if (requirements.includes('optional')) return 'optional'
  if (requirements.length > 0 && requirements.every(value => value === 'required')) return 'required'
  return 'unknown'
}

/**
 * Combines simultaneous constraints.
 * @param requirements Requirements of each constraint.
 * @returns The strongest proven requirement.
 */
const combineIntersection = (requirements: FormFieldRequirement[]): FormFieldRequirement => {
  if (requirements.includes('required')) return 'required'
  if (requirements.every(value => value === 'optional')) return 'optional'
  return 'unknown'
}

/**
 * Identifies checks whose semantics need explicit metadata.
 * @param definition Zod schema definition.
 * @returns Whether arbitrary application checks exist.
 */
const hasOpaqueChecks = (definition: SchemaDefinition): boolean =>
  Boolean(definition.checks?.some(check => {
    const kind = check._zod?.def?.check
    return kind === undefined || kind === 'custom' || kind === 'overwrite'
  }))

/**
 * A positive length rule proves an empty value is invalid without running checks.
 * @param definition Zod schema definition.
 * @returns Whether a positive lower length bound exists.
 */
const requiresLength = (definition: SchemaDefinition): boolean =>
  Boolean(definition.checks?.some(check => {
    const rule = check._zod?.def
    return ((rule?.check === 'min_length' || rule?.check === 'min_size') && typeof rule.minimum === 'number' && rule.minimum > 0)
      || ((rule?.check === 'length_equals' || rule?.check === 'size_equals') && typeof rule.length === 'number' && rule.length > 0)
  }))

const requiredStringFormats = new Set([
  'email', 'url', 'uuid', 'guid', 'cuid', 'cuid2', 'ulid', 'nanoid',
  'datetime', 'date', 'time', 'duration', 'ipv4', 'ipv6', 'cidrv4', 'cidrv6',
  'e164', 'jwt', 'xid', 'ksuid'
])

/**
 * Classifies user entry using declarative Zod structure.
 * @param schema Field input schema.
 * @param depth Recursion guard for recursive definitions.
 * @returns The proven requirement, or unknown for opaque semantics.
 */
const classifyLeaf = (schema: unknown, depth: number): FormFieldRequirement => {
  if (depth > 64) return 'unknown'
  const definition = definitionOf(schema)
  if (!definition) return 'unknown'
  const explicit = z.globalRegistry.get(schema as z.ZodType)?.formRequired
  if (typeof explicit === 'boolean') return explicit ? 'required' : 'optional'
  const descend = (inner: unknown) => classifyLeaf(inner, depth + 1)
  const opaque = hasOpaqueChecks(definition)
  switch (definition.type) {
    case 'optional':
    case 'exact_optional':
    case 'nullable':
    case 'default':
    case 'catch':
      return opaque ? 'unknown' : 'optional'
    case 'prefault':
      // The factory and downstream checks may reject the prefault value.
      return 'unknown'
    case 'readonly':
      return descend(definition.innerType)
    case 'nonoptional': {
      // nonoptional removes undefined, but preserves other accepted empty values.
      const innerDefinition = definitionOf(definition.innerType)
      return innerDefinition?.type === 'optional' || innerDefinition?.type === 'exact_optional'
        ? descend(innerDefinition.innerType)
        : descend(definition.innerType)
    }
    case 'pipe': {
      const input = descend(definition.in)
      // A transform can accept or manufacture empty values. Never execute it.
      if (input === 'required') return 'required'
      return 'unknown'
    }
    case 'union': {
      const combined = combineUnion((definition.options ?? []).map(descend))
      return opaque && combined === 'optional' ? 'unknown' : combined
    }
    case 'intersection':
      return combineIntersection([descend(definition.left), descend(definition.right)])
    case 'string':
      if (requiresLength(definition)) return 'required'
      // Only known formats that exclude an empty string establish requiredness.
      if (requiredStringFormats.has(definition.format ?? '') || definition.checks?.some(check =>
        requiredStringFormats.has(check._zod?.def?.format ?? ''))) return 'required'
      if (opaque || definition.coerce || definition.format || definition.checks?.some(check => check._zod?.def?.check === 'string_format')) return 'unknown'
      return 'optional'
    case 'array':
    case 'set':
      if (requiresLength(definition)) return 'required'
      return opaque ? 'unknown' : 'optional'
    case 'boolean':
      // false is a valid answer, not a missing checkbox value.
      return opaque ? 'unknown' : 'optional'
    case 'number':
      if (!definition.coerce) return 'required'
      // Blank text coerces to zero. Only a declared bound can prove it invalid.
      if (definition.checks?.some(check => {
        const rule = check._zod?.def
        if (typeof rule?.value !== 'number') return false
        return (rule.check === 'greater_than' && (rule.value > 0 || (rule.value === 0 && rule.inclusive === false)))
          || (rule.check === 'less_than' && (rule.value < 0 || (rule.value === 0 && rule.inclusive === false)))
      })) return 'required'
      return opaque ? 'unknown' : 'optional'
    case 'bigint':
    case 'date':
    case 'file':
      return definition.coerce ? 'unknown' : 'required'
    case 'enum':
      return Object.values(definition.entries ?? {}).includes('') ? 'optional' : 'required'
    case 'literal':
      return definition.values?.some(value => value === '' || value === false || value === null || value === undefined)
        ? 'optional'
        : 'required'
    case 'any':
    case 'unknown':
    case 'undefined':
    case 'null':
    case 'void':
      return opaque ? 'unknown' : 'optional'
    default:
      return 'unknown'
  }
}

/**
 * Resolves a rendered field through its enclosing schema.
 * @param schema Current enclosing schema.
 * @param parts Unresolved field path segments.
 * @param state Current state at this path.
 * @param depth Recursion guard.
 * @returns Requirement of the addressed field.
 */
const resolvePath = (schema: unknown, parts: string[], state: unknown, depth: number): FormFieldRequirement | 'absent' => {
  if (depth > 64) return 'unknown'
  if (parts.length === 0) return classifyLeaf(schema, depth)
  const definition = definitionOf(schema)
  if (!definition) return 'unknown'
  const descend = (inner: unknown, nextParts = parts, nextState = state) => resolvePath(inner, nextParts, nextState, depth + 1)
  switch (definition.type) {
    case 'optional':
    case 'exact_optional':
    case 'nullable':
    case 'default':
    case 'prefault':
    case 'catch':
    case 'readonly':
    case 'nonoptional':
      // A rendered descendant edits an existing container. Its own rule applies.
      return descend(definition.innerType)
    case 'object': {
      const key = parts[0]!
      return definition.shape && Object.prototype.hasOwnProperty.call(definition.shape, key)
        ? descend(definition.shape[key], parts.slice(1), readValue(state, key))
        : 'absent'
    }
    case 'array':
      return /^\d+$/.test(parts[0]!)
        ? descend(definition.element, parts.slice(1), readValue(state, parts[0]!))
        : 'unknown'
    case 'tuple': {
      const index = Number(parts[0])
      if (!/^\d+$/.test(parts[0]!) || !Number.isSafeInteger(index)) return 'unknown'
      return descend(definition.items?.[index] ?? definition.rest, parts.slice(1), readValue(state, parts[0]!))
    }
    case 'record':
      return descend(definition.valueType, parts.slice(1), readValue(state, parts[0]!))
    case 'pipe':
      // Only audited normalizers may opt into their unchanged output field paths.
      return descend(z.globalRegistry.get(schema as z.ZodType)?.formPreservesInputPaths === true ? definition.out : definition.in)
    case 'union': {
      const options = definition.options ?? []
      if (definition.discriminator) {
        const discriminator = definition.discriminator
        const selectedValue = readValue(state, discriminator)
        const selected = options.filter(option => {
          const field = definitionOf(definitionOf(option)?.shape?.[discriminator])
          return field?.type === 'literal' && field.values?.includes(selectedValue)
        })
        if (selected.length === 1) return descend(selected[0])
      }
      return combineUnion(options.map(option => {
        const result = descend(option)
        return result === 'absent' ? 'optional' : result
      }))
    }
    case 'intersection':
      return combineIntersection([descend(definition.left), descend(definition.right)].map(result => result === 'absent' ? 'optional' : result))
    default:
      return 'unknown'
  }
}

/**
 * Derives user-entry requirements from Zod structure, never parsing synthetic data.
 * Opaque refinements/preprocessors remain unknown and need explicit field metadata.
 * Dot paths and numeric bracket paths address nested objects, rows and records.
 * @param schema Form schema associated with its validator.
 * @param path Rendered input name relative to the form state.
 * @param state Current state, used only to select discriminated union branches.
 * @returns Required, optional, or unknown when explicit metadata is needed.
 */
export const resolveFormFieldRequirement = (schema: unknown, path: string, state?: unknown): FormFieldRequirement => {
  const normalized = path.replace(/\[(\d+)\]/g, '.$1')
  if (!normalized || normalized.split('.').some(part => !part || ['__proto__', 'prototype', 'constructor'].includes(part))) return 'unknown'
  const result = resolvePath(schema, normalized.split('.'), state, 0)
  return result === 'absent' ? 'unknown' : result
}
