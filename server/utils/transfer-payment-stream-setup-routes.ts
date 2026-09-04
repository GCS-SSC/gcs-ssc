import type { H3Event } from 'h3'
import type { Kysely } from 'kysely'
import type { z } from 'zod'
import type { Database } from '~~/shared/types/database'
import { badRequest, notFound } from './api-errors'
import { readValidatedBodyI18n } from './api-validate'
import {
  resolveTransferPaymentStreamScopeContext,
  type TransferPaymentAmendmentTypeScopeContext
} from './transfer-payment-amendment-types'
import { throwIfTransferPaymentUniqueConstraintError } from './transfer-payment-unique-constraint-errors'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

interface TransferPaymentStreamSetupRouteIds {
  profileId: string
  streamId: string
  childId: string
}

type ResolveTransferPaymentStreamContext = (
  profileId: string,
  streamId: string,
  db: Kysely<Database>
) => Promise<TransferPaymentAmendmentTypeScopeContext | null>

interface PrepareTransferPaymentStreamSetupPatchRouteOptions {
  childParam: string
  resolveStreamContext?: ResolveTransferPaymentStreamContext
}

interface TransferPaymentStreamSetupPatchRouteContext extends TransferPaymentStreamSetupRouteIds {
  streamContext: TransferPaymentAmendmentTypeScopeContext
}

/**
 * Checks whether a route id resolution produced all expected route params.
 *
 * @param value - Candidate route id result.
 * @returns True when all route ids are available.
 */
const isTransferPaymentStreamSetupRouteIds = (value: unknown): value is TransferPaymentStreamSetupRouteIds => {
  return typeof value === 'object'
    && value !== null
    && 'profileId' in value
    && 'streamId' in value
    && 'childId' in value
    && typeof value.profileId === 'string'
    && typeof value.streamId === 'string'
    && typeof value.childId === 'string'
}

/**
 * Checks whether stream setup preparation returned route context instead of an API error response.
 *
 * @param value - Candidate route context.
 * @returns True when the route can continue with stream setup mutation logic.
 */
export const isTransferPaymentStreamSetupPatchRouteContext = (value: unknown): value is TransferPaymentStreamSetupPatchRouteContext => {
  return isTransferPaymentStreamSetupRouteIds(value)
    && 'streamContext' in value
    && typeof value.streamContext === 'object'
    && value.streamContext !== null
}

/**
 * Reads the transfer payment profile, stream, and child ids required by stream setup PATCH routes.
 *
 * @param event - The active H3 event.
 * @param childParam - Router param name for the child setup record id.
 * @returns The resolved ids.
 */
export const requireTransferPaymentStreamSetupRouteIds = async (
  event: H3Event,
  childParam: string
): Promise<unknown> => {
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  const childId = getRouterParam(event, childParam)

  if (!profileId || !streamId || !childId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }
  if (
    !isPositivePostgresBigintText(profileId)
    || !isPositivePostgresBigintText(streamId)
    || !isPositivePostgresBigintText(childId)
  ) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_SETUP_NOT_FOUND', 'apiErrors.request.not_found')
  }

  return { profileId, streamId, childId }
}

/**
 * Resolves stream scope for stream setup PATCH routes.
 *
 * @param event - The active H3 event.
 * @param db - Database connection.
 * @param options - Route setup options.
 * @returns The route ids and stream context.
 */
export const prepareTransferPaymentStreamSetupPatchRoute = async (
  event: H3Event,
  db: Kysely<Database>,
  options: PrepareTransferPaymentStreamSetupPatchRouteOptions
): Promise<unknown> => {
  const ids = await requireTransferPaymentStreamSetupRouteIds(event, options.childParam)
  if (!isTransferPaymentStreamSetupRouteIds(ids)) {
    return ids
  }

  const resolveStreamContext = options.resolveStreamContext ?? resolveTransferPaymentStreamScopeContext
  const streamContext = await resolveStreamContext(ids.profileId, ids.streamId, db)

  if (!streamContext) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }

  return {
    ...ids,
    streamContext
  }
}

/**
 * Resolves a stream setup child record and throws the route-specific not found error when absent.
 *
 * @param event - The active H3 event.
 * @param query - Child lookup query promise.
 * @param code - Stable API error code.
 * @param key - Localized translation key.
 * @returns The resolved child row.
 */
export const assertTransferPaymentStreamSetupExists = async <T>(
  event: H3Event,
  query: Promise<T | undefined>,
  code: string,
  key: string
): Promise<T> => {
  const row = await query

  if (!row) {
    return await notFound(event, code, key)
  }

  return row
}

/**
 * Reads and validates a PATCH body for a stream setup route.
 *
 * @param event - The active H3 event.
 * @param schema - Zod schema for the PATCH payload.
 * @returns The validated payload.
 */
export const readTransferPaymentStreamSetupPatchBody = async <TSchema extends z.ZodTypeAny>(
  event: H3Event,
  schema: TSchema
): Promise<z.infer<TSchema>> => {
  const payload = await readValidatedBodyI18n(event, schema)
  if (typeof payload === 'object' && payload !== null && Object.keys(payload).length === 0) {
    return await badRequest(event, 'NO_UPDATABLE_FIELDS', 'apiErrors.request.no_updatable_fields')
  }
  return payload
}

/**
 * Executes a stream setup update and preserves transfer-payment unique constraint error mapping.
 *
 * @param event - The active H3 event.
 * @param query - Update query promise.
 * @returns The updated row.
 */
export const executeTransferPaymentStreamSetupUpdate = async <T>(
  event: H3Event,
  query: Promise<T>
): Promise<T> => {
  try {
    return await query
  } catch (error) {
    return await throwIfTransferPaymentUniqueConstraintError(event, error)
  }
}
