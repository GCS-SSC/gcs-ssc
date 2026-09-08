import { z } from 'zod'
import { sql, type Kysely } from 'kysely'
import type { H3Event } from 'h3'
import type { Database } from '~~/shared/types/database'
import { PaginationSchema, PositivePostgresBigintIdSchema } from '~~/shared/types/schemas'
import { authorize, resolveAnyAgency } from './authorize'
import { notFound } from './api-errors'
import { escapeLikePattern } from './sql-like'
import { authorizeTransferPaymentProfileResource } from './transfer-payment-route-authorization'

const AgencyLookupContextBaseSchema = z.object({
  permission_action: z.enum(['create', 'update']).default('create'),
  transfer_payment_id: PositivePostgresBigintIdSchema.optional()
})
type AgencyLookupContext = z.infer<typeof AgencyLookupContextBaseSchema>

/**
 * Requires the exact existing program when hydrating its immutable Agency field.
 *
 * @param query - Lookup purpose and optional program identifier.
 * @param context - Validation issue collector.
 */
const requireUpdateTarget = (query: AgencyLookupContext, context: z.RefinementCtx) => {
  if (query.permission_action === 'update' && query.transfer_payment_id === undefined) {
    context.addIssue({ code: 'custom', path: ['transfer_payment_id'], message: 'validation.required' })
  }
}

export const TransferPaymentAgencyLookupQuerySchema = AgencyLookupContextBaseSchema.superRefine(requireUpdateTarget)
export const TransferPaymentAgencyLookupListQuerySchema = AgencyLookupContextBaseSchema
  .extend(PaginationSchema.shape)
  .superRefine(requireUpdateTarget)

/**
 * Resolves permitted Agency labels from the form's existing Transfer Payment authority.
 *
 * @param event - Authenticated lookup request.
 * @param query - Validated purpose and program identifier.
 * @param selectedAgencyId - Exact selected Agency for create-mode hydration.
 * @returns Authorized Agency identifiers, or null for global creation authority.
 */
export const resolveTransferPaymentAgencyLookupIds = async (
  event: H3Event,
  query: AgencyLookupContext,
  selectedAgencyId?: string
): Promise<string[] | null> => {
  if (query.permission_action === 'update') {
    // The passed query schema requires this value; keep direct helper calls fail-closed.
    if (query.transfer_payment_id === undefined) return []
    const access = await authorizeTransferPaymentProfileResource(event, 'update', query.transfer_payment_id)
    if (!access) {
      return await notFound(event, 'TRANSFER_PAYMENT_PROFILE_NOT_FOUND', 'apiErrors.transfer_payment.profile_not_found')
    }
    return [access.agencyId]
  }

  if (selectedAgencyId !== undefined) {
    await authorize(event, 'transfer_payment', 'create', { type: 'agency', agencyId: selectedAgencyId })
    return [selectedAgencyId]
  }

  const access = await authorize(event, 'transfer_payment', 'create', resolveAnyAgency(event.context.$db))
  return access.hasGlobalAccess === true ? null : access.agencyIds ?? []
}

/**
 * Builds a label query, preserving non-deleted inactive Agencies accepted by program writes.
 *
 * @param db - Request or snapshot database.
 * @param agencyIds - Authorized Agency identifiers, or null for global access.
 * @returns The constrained Agency query.
 */
export const transferPaymentAgencyLookupQuery = (db: Kysely<Database>, agencyIds: string[] | null) => {
  let query = db.selectFrom('Agency_Profile').where('_deleted', '=', false)
  if (agencyIds !== null) {
    query = agencyIds.length > 0 ? query.where('id', 'in', agencyIds) : query.where(sql<boolean>`false`)
  }
  return query
}

/**
 * Reads a bounded label page and its count from the caller's snapshot.
 *
 * @param db - Shared snapshot database.
 * @param agencyIds - Authorized Agency identifiers, or null for global access.
 * @param queryInput - Validated pagination and search.
 * @returns Minimal labels and their filtered count.
 */
const listTransferPaymentAgencyLookupsInSnapshot = async (
  db: Kysely<Database>,
  agencyIds: string[] | null,
  queryInput: z.infer<typeof TransferPaymentAgencyLookupListQuerySchema>
) => {
  const { page, limit, search } = queryInput
  let query = transferPaymentAgencyLookupQuery(db, agencyIds)
  if (search) {
    const pattern = `%${escapeLikePattern(search)}%`
    query = query.where(eb => eb.or([
      eb('egcs_ay_name_en', 'ilike', pattern),
      eb('egcs_ay_name_fr', 'ilike', pattern),
      eb(sql<string>`CAST(${sql.ref('id')} AS TEXT)`, 'ilike', pattern)
    ]))
  }
  const [items, count] = await Promise.all([
    query.select(['id', 'egcs_ay_name_en', 'egcs_ay_name_fr']).orderBy('id', 'asc')
      .limit(limit).offset((page - 1) * limit).execute(),
    query.select(eb => eb.fn.count('id').as('total')).executeTakeFirstOrThrow()
  ])
  return { items: items.map(item => ({ ...item, id: String(item.id) })), total: Number(count.total), page, limit }
}

/**
 * Keeps the bounded Agency label page and count on one read-only snapshot.
 *
 * @param db - Request database.
 * @param agencyIds - Authorized Agency identifiers, or null for global access.
 * @param query - Validated pagination and search.
 * @returns Minimal labels and their filtered count.
 */
export const listTransferPaymentAgencyLookups = async (
  db: Kysely<Database>,
  agencyIds: string[] | null,
  query: z.infer<typeof TransferPaymentAgencyLookupListQuerySchema>
) => await db.transaction().setIsolationLevel('repeatable read').setAccessMode('read only')
  .execute(trx => listTransferPaymentAgencyLookupsInSnapshot(trx, agencyIds, query))
