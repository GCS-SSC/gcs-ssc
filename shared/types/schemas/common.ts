import { z } from 'zod'
import type { Entity_Type } from '../database'
import { isPositivePostgresBigintText } from '../../utils/database-id'
import {
  CORE_ASSIGNABLE_ENTITY_TYPE_ENUM,
  CORE_COMPLETION_ENTITY_TYPE_ENUM,
  CORE_DIRECT_REVIEW_ENTITY_TYPE_ENUM,
  CORE_LIFECYCLE_ENTITY_TYPE_ENUM
} from '../../constants/entity-registry'

export type WithId<T> = T & { id: string }

/**
 * Creates a required string ID schema that normalizes numeric IDs to strings.
 *
 * @returns Required string ID schema.
 */
export const RequiredStringId = () =>
  z.preprocess(
    value => {
      if (value === undefined || value === null) {
        return value
      }

      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
        return String(value)
      }

      return value
    },
    z.string({ error: 'validation.required' }).min(1, { error: 'validation.required' })
  )

/** Canonical positive decimal identifier accepted by PostgreSQL signed bigint columns. */
export const PositivePostgresBigintIdSchema = z.preprocess(
  value => {
    if (typeof value === 'string') return value
    if (typeof value === 'bigint') return String(value)
    if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value)
    return value
  },
  z.string({ error: 'validation.required' })
    .min(1, { error: 'validation.required' })
    .refine(isPositivePostgresBigintText, { error: 'validation.invalid_selection' })
)

/** Stable core or extension-qualified polymorphic entity identity. */
export const EntityTypeIdentitySchema = z.string({ error: 'validation.required' })
  .regex(/^[a-z][a-z0-9-]{0,62}(?::[a-z][a-z0-9-]{0,62})?$/, { error: 'validation.invalid_selection' })
  .transform(value => value as Entity_Type)

/**
 * Applies the shared core-bigint versus qualified-extension identity rule.
 * @param target Parsed polymorphic target.
 * @param target.entityType Core or qualified extension entity type.
 * @param target.entityId Entity identity supplied by the caller.
 * @param ctx Zod refinement context.
 * @returns Nothing; validation issues are appended to the context.
 */
export const validateCoreOrExtensionEntityTarget = (
  target: { entityType: Entity_Type, entityId: string },
  ctx: z.RefinementCtx
) => {
  if (!target.entityType.includes(':') && !isPositivePostgresBigintText(target.entityId)) {
    ctx.addIssue({ code: 'custom', message: 'validation.invalid_selection', path: ['entityId'] })
  }
}

/** Core targets use bigint identities while qualified extension targets retain their declared opaque IDs. */
export const CoreOrExtensionEntityTargetSchema = z.object({
  entityType: EntityTypeIdentitySchema,
  entityId: RequiredStringId()
}).superRefine(validateCoreOrExtensionEntityTarget)

/**
 * Builds a qualified-or-core identity schema for one lifecycle capability.
 * @param coreTypes Unqualified core identities accepted by the capability.
 * @param requiredError Stable validation key for a missing identity.
 * @returns Restricted entity identity schema.
 */
const createRestrictedEntityTypeIdentitySchema = (
  coreTypes: readonly string[],
  requiredError: string = 'validation.required'
) => z.string({ error: requiredError })
  .regex(/^[a-z][a-z0-9-]{0,62}(?::[a-z][a-z0-9-]{0,62})?$/, { error: 'validation.invalid_selection' })
  .refine(value => value.includes(':') || coreTypes.includes(value), { error: 'validation.invalid_selection' })
  .transform(value => value as Entity_Type)

/**
 * Builds the Workflow target identity schema with a caller-specific required-field error.
 * @param requiredError Stable validation key for a missing identity.
 * @returns Workflow-capable entity identity schema.
 */
export const createWorkflowTargetEntityTypeIdentitySchema = (requiredError?: string) =>
  createRestrictedEntityTypeIdentitySchema(CORE_LIFECYCLE_ENTITY_TYPE_ENUM, requiredError)
export const WorkflowTargetEntityTypeIdentitySchema = createWorkflowTargetEntityTypeIdentitySchema()

/** Core Completion targets or extension-qualified targets validated against the installed registry. */
export const CompletionTargetEntityTypeIdentitySchema = createRestrictedEntityTypeIdentitySchema(
  CORE_COMPLETION_ENTITY_TYPE_ENUM
)

/** Core direct-Review targets or extension-qualified targets validated by the host registry at write time. */
export const DirectReviewEntityTypeIdentitySchema = EntityTypeIdentitySchema.refine(
  value => value.includes(':') || (CORE_DIRECT_REVIEW_ENTITY_TYPE_ENUM as readonly string[]).includes(value),
  { error: 'validation.invalid_selection' }
)

/** Core assignable targets or extension-qualified targets validated against the installed registry by host routes. */
export const AssignableEntityTypeIdentitySchema = EntityTypeIdentitySchema.refine(
  value => value.includes(':') || (CORE_ASSIGNABLE_ENTITY_TYPE_ENUM as readonly string[]).includes(value),
  { error: 'validation.invalid_selection' }
)

/**
 * Creates an optional string schema that trims input and preserves nullable output.
 *
 * @param emptyValue - Value to emit when trimmed text is blank.
 * @returns Optional nullable trimmed string schema.
 */
export const OptionalNullableTrimmedString = (emptyValue: '' | null = null) => z.preprocess(
  value => {
    if (value === undefined) {
      return undefined
    }

    if (value === null) {
      return null
    }

    const nextValue = String(value).trim()
    return nextValue === '' ? emptyValue : nextValue
  },
  z.union([z.string(), z.null()]).optional()
)

// --- Pagination ---
export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().optional(),
  status: z.string().optional()
})

export const EnFrLabelSchema = z.object({
  en: z.string(),
  fr: z.string()
})

export type EnFrLabel = z.infer<typeof EnFrLabelSchema>
