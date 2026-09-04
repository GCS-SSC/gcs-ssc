import type { H3Event } from 'h3'
import {
  authorize,
  authorizeWithFreshAuthContext,
  requireAuthContext,
  requireFreshAuthContext,
  resolveAnyAgency
} from './authorize'
import { notFound } from './api-errors'
import type { Scope } from '~~/shared/utils/scopes'
import { sql } from 'kysely'
import type { Kysely, Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { assertAgencyCostCategoryLineItemNotInUse, assertAgencyCostCategoryNotInUse } from './cost-configuration-integrity'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export type AgencySubentityTable =
  | 'Agency_Address_Type'
  | 'Agency_Approval_Behalf_Type'
  | 'Agency_Agreement_Type'
  | 'Agency_Holdback_Basis'
  | 'Agency_Fiscal_Year'
  | 'Agency_Applicant_Recipient_Subtype'
  | 'Common_Attachment_Types'

const getAgencySubentityColumn = (tableName: AgencySubentityTable) =>
  tableName === 'Common_Attachment_Types' ? 'egcs_cn_agency' : 'egcs_ay_organizationagency'

export interface AgencyAuthContext {
  userId: string
  userAbilities: Awaited<ReturnType<typeof defineUserAbilities>>
}

type AgencyReadTransaction<T> = (trx: Transaction<Database>) => Promise<T>
type AgencyMutationTransaction<T> = (trx: Transaction<Database>) => Promise<T>

export interface AgencyLineItemContext {
  agencyId: string
  costCategoryId: string
}

export interface AgencyResourceNotFoundContract {
  code: string
  key: string
}

type AgencyResourceAction = 'read' | 'update' | 'delete'

const isDatabaseId = isPositivePostgresBigintText

/**
 * Resolves an agency-owned resource inside authorization and masks inaccessible
 * active records with the same contract as missing records.
 *
 * The preliminary ownership query is intentionally performed by the authorize
 * resolver. This lets an authenticated caller's current abilities be evaluated
 * before any resource-specific structural response can escape the route.
 *
 * @param event - Current protected route event.
 * @param action - Agency action required for the resource.
 * @param resolve - Active ownership resolver.
 * @param missing - Route-specific not-found response contract.
 * @returns Authorized active ownership context.
 */
const authorizeResolvedAgencyResource = async <T extends { agencyId: string }>(
  event: H3Event,
  action: AgencyResourceAction,
  resolve: () => Promise<T | null>,
  missing: AgencyResourceNotFoundContract
): Promise<T> => {
  const authorization = await authorize(event, 'agency', action, async ({ context }) => {
    const resolved = await resolve()
    if (!resolved) return await notFound(event, missing.code, missing.key)

    const scope = { type: 'agency' as const, agencyId: resolved.agencyId }
    if (!context.userAbilities.authorize('agency', action, scope)) {
      return await notFound(event, missing.code, missing.key)
    }

    return { scope, data: resolved }
  })

  return authorization.data!
}

/**
 * Authorizes and resolves an active direct agency child without an existence oracle.
 *
 * @param event - Current protected route event.
 * @param tableName - Direct agency child table.
 * @param id - Requested child identifier.
 * @param action - Agency action required for the child.
 * @param missing - Route-specific not-found response contract.
 * @returns Authorized active agency ownership.
 */
export const authorizeActiveAgencySubentity = async (
  event: H3Event,
  tableName: AgencySubentityTable,
  id: string,
  action: AgencyResourceAction,
  missing: AgencyResourceNotFoundContract
): Promise<{ agencyId: string }> => {
  if (!isDatabaseId(id)) return await notFound(event, missing.code, missing.key)
  return await authorizeResolvedAgencyResource(
    event,
    action,
    async () => {
      const agencyId = await resolveAgencyIdFromSubentityId(tableName, id, event.context.$db)
      return agencyId ? { agencyId } : null
    },
    missing
  )
}

/**
 * Authorizes and resolves an active agency cost category without an existence oracle.
 *
 * @param event - Current protected route event.
 * @param id - Requested cost-category identifier.
 * @param action - Agency action required for the category.
 * @param missing - Route-specific not-found response contract.
 * @returns Authorized active agency ownership.
 */
export const authorizeActiveAgencyCostCategory = async (
  event: H3Event,
  id: string,
  action: AgencyResourceAction,
  missing: AgencyResourceNotFoundContract
): Promise<{ agencyId: string }> => {
  if (!isDatabaseId(id)) return await notFound(event, missing.code, missing.key)
  return await authorizeResolvedAgencyResource(
    event,
    action,
    async () => {
      const agencyId = await resolveAgencyIdFromCostCategoryId(id, event.context.$db)
      return agencyId ? { agencyId } : null
    },
    missing
  )
}

/**
 * Authorizes and resolves an active agency line item without an existence oracle.
 *
 * @param event - Current protected route event.
 * @param id - Requested line-item identifier.
 * @param action - Agency action required for the line item.
 * @param missing - Route-specific not-found response contract.
 * @returns Authorized active line-item ownership chain.
 */
export const authorizeActiveAgencyLineItem = async (
  event: H3Event,
  id: string,
  action: AgencyResourceAction,
  missing: AgencyResourceNotFoundContract
): Promise<AgencyLineItemContext> => {
  if (!isDatabaseId(id)) return await notFound(event, missing.code, missing.key)
  return await authorizeResolvedAgencyResource(
    event,
    action,
    async () => await resolveAgencyLineItemContext(id, event.context.$db),
    missing
  )
}

/**
 * Ensures the request has a valid agency authentication context.
 *
 * @param event - The H3 event.
 * @returns The agency authentication context.
 */
export const requireAgencyAuth = async (event: H3Event): Promise<AgencyAuthContext> => {
  return await requireAuthContext(event)
}

/**
 * Asserts that the current user is authorized to perform an action on a subject.
 *
 * @param event - The H3 event.
 * @param subject - The subject to check authorization for.
 * @param action - The action to check authorization for.
 * @param scope - The scope of the action.
 * @returns The agency authentication context if authorized.
 */
export const assertAuthorize = async (
  event: H3Event,
  subject: 'agency' | 'user' | 'role' | 'transfer_payment',
  action: 'create' | 'read' | 'update' | 'delete',
  scope: Scope
): Promise<AgencyAuthContext> => {
  return await authorize(event, subject, action, scope)
}

/**
 * Asserts that the current user can read a specific agency.
 *
 * @param event - The H3 event.
 * @param agencyId - The ID of the agency to read.
 * @returns The agency authentication context if authorized.
 */
export const assertCanReadAgency = async (event: H3Event, agencyId: string): Promise<AgencyAuthContext> => {
  return assertAuthorize(event, 'agency', 'read', { type: 'agency', agencyId })
}

/**
 * Asserts that the current user can update a specific agency.
 *
 * @param event - The H3 event.
 * @param agencyId - The ID of the agency to update.
 * @returns The agency authentication context if authorized.
 */
export const assertCanUpdateAgency = async (event: H3Event, agencyId: string): Promise<AgencyAuthContext> => {
  return assertAuthorize(event, 'agency', 'update', { type: 'agency', agencyId })
}

/**
 * Asserts that the current user can create an agency.
 *
 * @param event - The H3 event.
 * @returns The agency authentication context if authorized.
 */
export const assertCanCreateAgency = async (event: H3Event): Promise<AgencyAuthContext> => {
  return assertAuthorize(event, 'agency', 'create', { type: 'global' })
}

/**
 * Asserts that the current user can view a specific agency (alias for read).
 *
 * @param event - The H3 event.
 * @param agencyId - The ID of the agency to view.
 * @returns The agency authentication context if authorized.
 */
export const assertCanViewAgency = async (event: H3Event, agencyId: string): Promise<AgencyAuthContext> => {
  return assertCanReadAgency(event, agencyId)
}

/**
 * Asserts that the current user can manage a specific agency (alias for update).
 *
 * @param event - The H3 event.
 * @param agencyId - The ID of the agency to manage.
 * @returns The agency authentication context if authorized.
 */
export const assertCanManageAgency = async (event: H3Event, agencyId: string): Promise<AgencyAuthContext> => {
  return assertCanUpdateAgency(event, agencyId)
}

/**
 * Asserts that an agency profile is active (not deleted) and exists.
 *
 * @param event - The H3 event.
 * @param agencyId - The ID of the agency to check.
 * @throws NotFoundError if the agency does not exist or is deleted.
 */
export const assertActiveAgencyProfile = async (event: H3Event, agencyId: string): Promise<void> => {
  if (!isDatabaseId(agencyId)) {
    await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
    return
  }
  const db = event.context.$db
  const agency = await db
    .selectFrom('Agency_Profile')
    .where('id', '=', agencyId)
    .where('_deleted', '=', false)
    .select('id')
    .executeTakeFirst()

  if (!agency) {
    await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
  }
}

/**
 * Runs an agency-scoped read against locked parent state and fresh authorization.
 *
 * Fresh authorization rows are locked before the agency row to preserve the
 * global mutation lock order. `FOR SHARE` blocks the agency soft-delete update
 * while allowing concurrent readers.
 *
 * @param event - The H3 event.
 * @param agencyId - Agency that owns the records being read.
 * @param read - Read operation executed with the transaction database.
 * @returns The read operation result.
 */
export const withActiveAgencyReadTransaction = async <T>(
  event: H3Event,
  agencyId: string,
  read: AgencyReadTransaction<T>
): Promise<T> => {
  if (!isDatabaseId(agencyId)) {
    return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found') as T
  }
  return await event.context.$db.transaction().execute(async trx => {
    const authContext = await requireFreshAuthContext(event, trx)
    const agency = await trx
      .selectFrom('Agency_Profile')
      .select('id')
      .where('id', '=', agencyId)
      .where('_deleted', '=', false)
      .forShare()
      .executeTakeFirst()

    if (!agency) {
      return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
    }

    await authorizeWithFreshAuthContext(
      event,
      authContext,
      'agency',
      'read',
      { type: 'agency', agencyId }
    )

    return await read(trx)
  })
}

/**
 * Runs an agency-scoped mutation while holding the active parent row lock.
 *
 * @param event - The H3 event.
 * @param agencyId - Agency that owns the record being mutated.
 * @param mutate - Mutation executed after the parent and fresh authorization are locked.
 * @param action - Fresh Agency authorization action required inside the transaction.
 * @returns The mutation result.
 */
export const withActiveAgencyMutationTransaction = async <T>(
  event: H3Event,
  agencyId: string,
  mutate: AgencyMutationTransaction<T>,
  action: 'update' | 'delete' = 'update'
): Promise<T> => {
  if (!isDatabaseId(agencyId)) {
    return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found') as T
  }
  return await event.context.$db.transaction().execute(async trx => {
    const authContext = await requireFreshAuthContext(event, trx)
    const agency = await trx
      .selectFrom('Agency_Profile')
      .select('id')
      .where('id', '=', agencyId)
      .where('_deleted', '=', false)
      .forUpdate()
      .executeTakeFirst()

    if (!agency) {
      return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
    }

    await authorizeWithFreshAuthContext(
      event,
      authContext,
      'agency',
      action,
      { type: 'agency', agencyId }
    )

    return await mutate(trx)
  })
}

/**
 * Runs a cost-category-scoped read against its locked active ownership chain.
 *
 * Fresh authorization rows are locked before the agency and category rows.
 * Parent-first share locks prevent an agency/category soft delete or category
 * reparent from racing the nested line-item query.
 *
 * @param event - The H3 event.
 * @param agencyId - Initially resolved owning agency identifier.
 * @param costCategoryId - Cost category whose line items are being read.
 * @param read - Read operation executed with the transaction database.
 * @returns The read operation result.
 */
export const withActiveAgencyCostCategoryReadTransaction = async <T>(
  event: H3Event,
  agencyId: string,
  costCategoryId: string,
  read: AgencyReadTransaction<T>
): Promise<T> => {
  return await event.context.$db.transaction().execute(async trx => {
    const authContext = await requireFreshAuthContext(event, trx)
    const agency = await trx
      .selectFrom('Agency_Profile')
      .select('id')
      .where('id', '=', agencyId)
      .where('_deleted', '=', false)
      .forShare()
      .executeTakeFirst()
    if (!agency) {
      return await notFound(event, 'CATEGORY_NOT_FOUND', 'apiErrors.agency.category_not_found')
    }

    const costCategory = await trx
      .selectFrom('Agency_Cost_Category')
      .select('id')
      .where('id', '=', costCategoryId)
      .where('egcs_ay_organizationagency', '=', agencyId)
      .where('_deleted', '=', false)
      .forShare()
      .executeTakeFirst()
    if (!costCategory) {
      return await notFound(event, 'CATEGORY_NOT_FOUND', 'apiErrors.agency.category_not_found')
    }

    await authorizeWithFreshAuthContext(
      event,
      authContext,
      'agency',
      'read',
      { type: 'agency', agencyId }
    )

    return await read(trx)
  })
}

/**
 * Runs a cost-category mutation against its locked active ownership chain.
 *
 * @param event - The H3 event.
 * @param agencyId - Initially resolved owning agency identifier.
 * @param costCategoryId - Cost category that owns the record being created.
 * @param mutate - Mutation executed after parent locks and fresh authorization.
 * @returns The mutation result.
 */
export const withActiveAgencyCostCategoryMutationTransaction = async <T>(
  event: H3Event,
  agencyId: string,
  costCategoryId: string,
  mutate: AgencyMutationTransaction<T>
): Promise<T> => {
  return await event.context.$db.transaction().execute(async trx => {
    const authContext = await requireFreshAuthContext(event, trx)
    const agency = await trx
      .selectFrom('Agency_Profile')
      .select('id')
      .where('id', '=', agencyId)
      .where('_deleted', '=', false)
      .forUpdate()
      .executeTakeFirst()
    if (!agency) {
      return await notFound(event, 'CATEGORY_NOT_FOUND', 'apiErrors.agency.category_not_found')
    }

    const costCategory = await trx
      .selectFrom('Agency_Cost_Category')
      .select('id')
      .where('id', '=', costCategoryId)
      .where('egcs_ay_organizationagency', '=', agencyId)
      .where('_deleted', '=', false)
      .forUpdate()
      .executeTakeFirst()
    if (!costCategory) {
      return await notFound(event, 'CATEGORY_NOT_FOUND', 'apiErrors.agency.category_not_found')
    }

    await authorizeWithFreshAuthContext(
      event,
      authContext,
      'agency',
      'update',
      { type: 'agency', agencyId }
    )
    return await mutate(trx)
  })
}

/**
 * Retrieves the IDs of agencies viewable by the current user.
 *
 * @remarks
 * Users with global agency read grants can access all agencies. In that case,
 * `agencyIds` is returned empty and callers should treat that as unscoped access.
 *
 * @param event - The H3 event.
 * @returns Authorization summary containing global access and scoped agency IDs.
 *
 * @example
 * ```typescript
 * const { hasGlobalAccess, agencyIds } = await getViewableAgencyIds(event)
 * ```
 */
export const getViewableAgencyIds = async (
  event: H3Event
): Promise<{ hasGlobalAccess: boolean; agencyIds: string[] }> => {
  const result = await authorize(event, 'agency', 'read', resolveAnyAgency(event.context.$db))
  const hasGlobalAccess = Boolean(result.hasGlobalAccess)
  if (hasGlobalAccess) {
    return { hasGlobalAccess: true, agencyIds: [] }
  }
  return { hasGlobalAccess: false, agencyIds: result.agencyIds ?? [] }
}

/**
 * Resolves an agency ID by querying a specific column in a table.
 *
 * @param tableName - The name of the database table to query.
 * @param id - The unique identifier of the row.
 * @param agencyColumn - The name of the column containing the agency ID.
 * @param db - The Kysely database instance.
 * @returns A promise that resolves to the agency ID string, or null if not found.
 */
const resolveAgencyIdFromColumn = async (
  tableName: keyof Database,
  id: string,
  agencyColumn: string,
  db: Kysely<Database>
): Promise<string | null> => {
  const row: Record<string, unknown> | undefined = await db
    .selectFrom(tableName as keyof Database)
    .where('id', '=', id)
    .where('_deleted', '=', false)
    .select(agencyColumn as never)
    .executeTakeFirst()

  if (!row) return null
  const value = row[agencyColumn]
  return value ? String(value) : null
}

/**
 * Resolves an agency ID from a database query promise.
 *
 * @param query - A promise representing the database query for the agency ID.
 * @returns A promise that resolves to the agency ID string, or null if not found.
 */
const resolveAgencyIdFromJoin = async (
  query: Promise<{ agency_id?: unknown } | undefined>
): Promise<string | null> => {
  const row: { agency_id?: unknown } | undefined = await query
  if (!row?.agency_id) return null
  return String(row.agency_id)
}

/**
 * Resolves the agency ID from a cost category ID.
 *
 * @param costCategoryId - The ID of the cost category.
 * @param db - The database instance.
 * @returns The resolved agency ID or null.
 */
export const resolveAgencyIdFromCostCategoryId = async (
  costCategoryId: string,
  db: Kysely<Database>
): Promise<string | null> => {
  return resolveAgencyIdFromJoin(
    db
      .selectFrom('Agency_Cost_Category')
      .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Agency_Cost_Category.egcs_ay_organizationagency')
      .where('Agency_Cost_Category.id', '=', costCategoryId)
      .where('Agency_Cost_Category._deleted', '=', false)
      .where('Agency_Profile._deleted', '=', false)
      .select('Agency_Cost_Category.egcs_ay_organizationagency as agency_id')
      .executeTakeFirst()
  )
}

/**
 * Resolves the agency ID from a line item ID.
 *
 * @param lineItemId - The ID of the line item.
 * @param db - The database instance.
 * @returns The resolved agency ID or null.
 */
export const resolveAgencyIdFromLineItemId = async (
  lineItemId: string,
  db: Kysely<Database>
): Promise<string | null> => {
  const context = await resolveAgencyLineItemContext(lineItemId, db)
  if (!context) return null
  return context.agencyId
}

/**
 * Resolves an active line item's active category and agency ownership chain.
 *
 * @param lineItemId - The ID of the line item.
 * @param db - The database instance.
 * @returns The resolved ownership context or null.
 */
export const resolveAgencyLineItemContext = async (
  lineItemId: string,
  db: Kysely<Database>
): Promise<AgencyLineItemContext | null> => {
  const row = await db
    .selectFrom('Agency_Cost_Category_Line_Item')
    .innerJoin(
      'Agency_Cost_Category',
      'Agency_Cost_Category.id',
      'Agency_Cost_Category_Line_Item.egcs_ay_organizationcostcategory'
    )
    .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Agency_Cost_Category.egcs_ay_organizationagency')
    .where('Agency_Cost_Category_Line_Item.id', '=', lineItemId)
    .where('Agency_Cost_Category_Line_Item._deleted', '=', false)
    .where('Agency_Cost_Category._deleted', '=', false)
    .where('Agency_Profile._deleted', '=', false)
    .select([
      'Agency_Cost_Category.egcs_ay_organizationagency as agency_id',
      'Agency_Cost_Category_Line_Item.egcs_ay_organizationcostcategory as cost_category_id'
    ])
    .executeTakeFirst()

  if (!row) return null
  return {
    agencyId: String(row.agency_id),
    costCategoryId: String(row.cost_category_id)
  }
}

/**
 * Resolves the agency ID from a subentity ID.
 *
 * @param tableName - The name of the subentity table.
 * @param id - The ID of the subentity.
 * @param db - The database instance.
 * @returns The resolved agency ID or null.
 */
export const resolveAgencyIdFromSubentityId = async (
  tableName: AgencySubentityTable,
  id: string,
  db: Kysely<Database>
): Promise<string | null> => {
  const agencyId = await resolveAgencyIdFromColumn(tableName, id, getAgencySubentityColumn(tableName), db)
  if (!agencyId) return null

  const agency = await db
    .selectFrom('Agency_Profile')
    .select('id')
    .where('id', '=', agencyId)
    .where('_deleted', '=', false)
    .executeTakeFirst()

  return agency ? agencyId : null
}

/**
 * Locks an active agency and one of its active direct children before soft deletion.
 *
 * Rechecking the child's agency foreign key while taking the row lock prevents
 * a stale authorization scope from deleting a child that was concurrently moved.
 *
 * @param event - The H3 event.
 * @param trx - Active deletion transaction.
 * @param tableName - Direct agency child table to update.
 * @param id - Child identifier.
 * @param agencyId - Freshly authorized owning agency identifier.
 * @param beforeDelete - Optional integrity guard executed after parent/child locks and fresh authorization.
 * @returns Whether one active child was soft-deleted.
 */
export const softDeleteActiveAgencySubentity = async (
  event: H3Event,
  trx: Transaction<Database>,
  tableName: AgencySubentityTable,
  id: string,
  agencyId: string,
  beforeDelete?: (trx: Transaction<Database>) => Promise<void>
): Promise<boolean> => {
  const authContext = await requireFreshAuthContext(event, trx)
  const agency = await trx
    .selectFrom('Agency_Profile')
    .select('id')
    .where('id', '=', agencyId)
    .where('_deleted', '=', false)
    .forUpdate()
    .executeTakeFirst()
  if (!agency) return false

  const child = await trx
    .selectFrom(tableName)
    .select('id')
    .where('id', '=', id)
    .where(sql.ref(getAgencySubentityColumn(tableName)), '=', agencyId)
    .where('_deleted', '=', false)
    .forUpdate()
    .executeTakeFirst()
  if (!child) return false

  await authorizeWithFreshAuthContext(
    event,
    authContext,
    'agency',
    'delete',
    { type: 'agency', agencyId }
  )

  await beforeDelete?.(trx)

  const deleted = await trx
    .updateTable(tableName)
    .set({ _deleted: true })
    .where('id', '=', id)
    .where(sql.ref(getAgencySubentityColumn(tableName)), '=', agencyId)
    .where('_deleted', '=', false)
    .returning('id')
    .executeTakeFirst()

  return Boolean(deleted)
}

/**
 * Soft-deletes an active cost category through a locked ownership chain.
 *
 * @param event - The H3 event.
 * @param trx - Active deletion transaction.
 * @param id - Cost category identifier.
 * @param agencyId - Initially authorized owning agency identifier.
 * @returns Whether one active category was soft-deleted.
 */
export const softDeleteActiveAgencyCostCategory = async (
  event: H3Event,
  trx: Transaction<Database>,
  id: string,
  agencyId: string
): Promise<boolean> => {
  const authContext = await requireFreshAuthContext(event, trx)
  const agency = await trx
    .selectFrom('Agency_Profile')
    .select('id')
    .where('id', '=', agencyId)
    .where('_deleted', '=', false)
    .forUpdate()
    .executeTakeFirst()
  if (!agency) return false

  const costCategory = await trx
    .selectFrom('Agency_Cost_Category')
    .select('id')
    .where('id', '=', id)
    .where('egcs_ay_organizationagency', '=', agencyId)
    .where('_deleted', '=', false)
    .forUpdate()
    .executeTakeFirst()
  if (!costCategory) return false

  await authorizeWithFreshAuthContext(
    event,
    authContext,
    'agency',
    'delete',
    { type: 'agency', agencyId }
  )

  await assertAgencyCostCategoryNotInUse(event, trx, id)

  const deleted = await trx
    .updateTable('Agency_Cost_Category')
    .set({ _deleted: true })
    .where('id', '=', id)
    .where('egcs_ay_organizationagency', '=', agencyId)
    .where('_deleted', '=', false)
    .returning('id')
    .executeTakeFirst()

  return Boolean(deleted)
}

/**
 * Soft-deletes an active cost-category line item through its locked ownership chain.
 *
 * @param event - The H3 event.
 * @param trx - Active deletion transaction.
 * @param id - Line-item identifier.
 * @param context - Initially resolved active ownership context.
 * @returns Whether one active line item was soft-deleted.
 */
export const softDeleteActiveAgencyLineItem = async (
  event: H3Event,
  trx: Transaction<Database>,
  id: string,
  context: AgencyLineItemContext
): Promise<boolean> => {
  const authContext = await requireFreshAuthContext(event, trx)
  const agency = await trx
    .selectFrom('Agency_Profile')
    .select('id')
    .where('id', '=', context.agencyId)
    .where('_deleted', '=', false)
    .forUpdate()
    .executeTakeFirst()
  if (!agency) return false

  const costCategory = await trx
    .selectFrom('Agency_Cost_Category')
    .select('id')
    .where('id', '=', context.costCategoryId)
    .where('egcs_ay_organizationagency', '=', context.agencyId)
    .where('_deleted', '=', false)
    .forUpdate()
    .executeTakeFirst()
  if (!costCategory) return false

  const lineItem = await trx
    .selectFrom('Agency_Cost_Category_Line_Item')
    .select('id')
    .where('id', '=', id)
    .where('egcs_ay_organizationcostcategory', '=', context.costCategoryId)
    .where('_deleted', '=', false)
    .forUpdate()
    .executeTakeFirst()
  if (!lineItem) return false

  await authorizeWithFreshAuthContext(event, authContext, 'agency', 'delete', {
    type: 'agency',
    agencyId: context.agencyId
  })

  await assertAgencyCostCategoryLineItemNotInUse(event, trx, id)

  const deleted = await trx
    .updateTable('Agency_Cost_Category_Line_Item')
    .set({ _deleted: true })
    .where('id', '=', id)
    .where('egcs_ay_organizationcostcategory', '=', context.costCategoryId)
    .where('_deleted', '=', false)
    .returning('id')
    .executeTakeFirst()

  return Boolean(deleted)
}

/**
 * Resolves the agency ID from a transfer payment profile ID.
 *
 * @param profileId - The ID of the transfer payment profile.
 * @param db - The database instance.
 * @returns The resolved agency ID or null.
 */
export const resolveAgencyIdFromTransferPaymentProfileId = async (
  profileId: string,
  db: Kysely<Database>
): Promise<string | null> => {
  return resolveAgencyIdFromColumn('Transfer_Payment_Profile', profileId, 'egcs_tp_agency', db)
}

/**
 * Resolves the agency ID from a transfer payment stream ID.
 *
 * @param streamId - The ID of the transfer payment stream.
 * @param db - The database instance.
 * @returns The resolved agency ID or null.
 */
export const resolveAgencyIdFromTransferPaymentStreamId = async (
  streamId: string,
  db: Kysely<Database>
): Promise<string | null> => {
  return resolveAgencyIdFromJoin(
    db
      .selectFrom('Transfer_Payment_Stream')
      .innerJoin(
        'Transfer_Payment_Profile',
        'Transfer_Payment_Profile.id',
        'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile'
      )
      .where('Transfer_Payment_Stream.id', '=', streamId)
      .where('Transfer_Payment_Stream._deleted', '=', false)
      .where('Transfer_Payment_Profile._deleted', '=', false)
      .select('Transfer_Payment_Profile.egcs_tp_agency as agency_id')
      .executeTakeFirst()
  )
}

/**
 * Resolves the agency ID from a transfer payment outcome ID.
 *
 * @param outcomeId - The ID of the transfer payment outcome.
 * @param db - The database instance.
 * @returns The resolved agency ID or null.
 */
export const resolveAgencyIdFromTransferPaymentOutcomeId = async (
  outcomeId: string,
  db: Kysely<Database>
): Promise<string | null> => {
  return resolveAgencyIdFromJoin(
    db
      .selectFrom('Transfer_Payment_Outcome')
      .innerJoin(
        'Transfer_Payment_Profile',
        'Transfer_Payment_Profile.id',
        'Transfer_Payment_Outcome.egcs_tp_transferpaymentprofile'
      )
      .where('Transfer_Payment_Outcome.id', '=', outcomeId)
      .where('Transfer_Payment_Outcome._deleted', '=', false)
      .where('Transfer_Payment_Profile._deleted', '=', false)
      .select('Transfer_Payment_Profile.egcs_tp_agency as agency_id')
      .executeTakeFirst()
  )
}

/**
 * Resolves the agency ID from a transfer payment budget ID.
 *
 * @param budgetId - The ID of the transfer payment budget.
 * @param db - The database instance.
 * @returns The resolved agency ID or null.
 */
export const resolveAgencyIdFromTransferPaymentBudgetId = async (
  budgetId: string,
  db: Kysely<Database>
): Promise<string | null> => {
  return resolveAgencyIdFromJoin(
    db
      .selectFrom('Transfer_Payment_Fiscal_Year_Budget')
      .innerJoin(
        'Transfer_Payment_Profile',
        'Transfer_Payment_Profile.id',
        'Transfer_Payment_Fiscal_Year_Budget.egcs_tp_transferpaymentprofile'
      )
      .where('Transfer_Payment_Fiscal_Year_Budget.id', '=', budgetId)
      .where('Transfer_Payment_Fiscal_Year_Budget._deleted', '=', false)
      .where('Transfer_Payment_Profile._deleted', '=', false)
      .select('Transfer_Payment_Profile.egcs_tp_agency as agency_id')
      .executeTakeFirst()
  )
}

/**
 * Resolves the agency ID from a transfer payment stream budget ID.
 *
 * @param streamBudgetId - The ID of the transfer payment stream budget.
 * @param db - The database instance.
 * @returns The resolved agency ID or null.
 */
export const resolveAgencyIdFromTransferPaymentStreamBudgetId = async (
  streamBudgetId: string,
  db: Kysely<Database>
): Promise<string | null> => {
  return resolveAgencyIdFromJoin(
    db
      .selectFrom('Transfer_Payment_Stream_Budget')
      .innerJoin(
        'Transfer_Payment_Stream',
        'Transfer_Payment_Stream.id',
        'Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentstream'
      )
      .innerJoin(
        'Transfer_Payment_Profile',
        'Transfer_Payment_Profile.id',
        'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile'
      )
      .where('Transfer_Payment_Stream_Budget.id', '=', streamBudgetId)
      .where('Transfer_Payment_Stream_Budget._deleted', '=', false)
      .where('Transfer_Payment_Stream._deleted', '=', false)
      .where('Transfer_Payment_Profile._deleted', '=', false)
      .select('Transfer_Payment_Profile.egcs_tp_agency as agency_id')
      .executeTakeFirst()
  )
}

/**
 * Resolves the agency ID from a transfer payment eligible recipient ID.
 *
 * @param eligibleRecipientId - The ID of the eligible recipient.
 * @param db - The database instance.
 * @returns The resolved agency ID or null.
 */
export const resolveAgencyIdFromTransferPaymentEligibleRecipientId = async (
  eligibleRecipientId: string,
  db: Kysely<Database>
): Promise<string | null> => {
  return resolveAgencyIdFromJoin(
    db
      .selectFrom('Transfer_Payment_Stream_Eligible_Recipient')
      .innerJoin(
        'Transfer_Payment_Stream',
        'Transfer_Payment_Stream.id',
        'Transfer_Payment_Stream_Eligible_Recipient.egcs_tp_transferpaymentstream'
      )
      .innerJoin(
        'Transfer_Payment_Profile',
        'Transfer_Payment_Profile.id',
        'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile'
      )
      .where('Transfer_Payment_Stream_Eligible_Recipient.id', '=', eligibleRecipientId)
      .where('Transfer_Payment_Stream_Eligible_Recipient._deleted', '=', false)
      .where('Transfer_Payment_Stream._deleted', '=', false)
      .where('Transfer_Payment_Profile._deleted', '=', false)
      .select('Transfer_Payment_Profile.egcs_tp_agency as agency_id')
      .executeTakeFirst()
  )
}

/**
 * Resolves the agency ID from a transfer payment cost category line item ID.
 *
 * @param lineItemId - The ID of the cost category line item.
 * @param db - The database instance.
 * @returns The resolved agency ID or null.
 */
export const resolveAgencyIdFromTransferPaymentCostCategoryLineItemId = async (
  lineItemId: string,
  db: Kysely<Database>
): Promise<string | null> => {
  return resolveAgencyIdFromJoin(
    db
      .selectFrom('Transfer_Payment_Stream_Cost_Category_Line_Item')
      .innerJoin(
        'Transfer_Payment_Stream',
        'Transfer_Payment_Stream.id',
        'Transfer_Payment_Stream_Cost_Category_Line_Item.egcs_tp_transferpaymentstream'
      )
      .innerJoin(
        'Transfer_Payment_Profile',
        'Transfer_Payment_Profile.id',
        'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile'
      )
      .where('Transfer_Payment_Stream_Cost_Category_Line_Item.id', '=', lineItemId)
      .where('Transfer_Payment_Stream_Cost_Category_Line_Item._deleted', '=', false)
      .where('Transfer_Payment_Stream._deleted', '=', false)
      .where('Transfer_Payment_Profile._deleted', '=', false)
      .select('Transfer_Payment_Profile.egcs_tp_agency as agency_id')
      .executeTakeFirst()
  )
}

/**
 * Resolves the agency ID from a transfer payment performance indicator ID.
 *
 * @param indicatorId - The ID of the performance indicator.
 * @param db - The database instance.
 * @returns The resolved agency ID or null.
 */
export const resolveAgencyIdFromTransferPaymentPerformanceIndicatorId = async (
  indicatorId: string,
  db: Kysely<Database>
): Promise<string | null> => {
  return resolveAgencyIdFromJoin(
    db
      .selectFrom('Transfer_Payment_Outcome_Performance_Indicator')
      .innerJoin(
        'Transfer_Payment_Outcome',
        'Transfer_Payment_Outcome.id',
        'Transfer_Payment_Outcome_Performance_Indicator.egcs_tp_transferpaymentoutcome'
      )
      .innerJoin(
        'Transfer_Payment_Profile',
        'Transfer_Payment_Profile.id',
        'Transfer_Payment_Outcome.egcs_tp_transferpaymentprofile'
      )
      .where('Transfer_Payment_Outcome_Performance_Indicator.id', '=', indicatorId)
      .where('Transfer_Payment_Outcome_Performance_Indicator._deleted', '=', false)
      .where('Transfer_Payment_Outcome._deleted', '=', false)
      .where('Transfer_Payment_Profile._deleted', '=', false)
      .select('Transfer_Payment_Profile.egcs_tp_agency as agency_id')
      .executeTakeFirst()
  )
}

/**
 * Resolves the agency ID from a transfer payment monitor type ID.
 *
 * @param monitorTypeId - The ID of the monitor type.
 * @param db - The database instance.
 * @returns The resolved agency ID or null.
 */
export const resolveAgencyIdFromTransferPaymentMonitorTypeId = async (
  monitorTypeId: string,
  db: Kysely<Database>
): Promise<string | null> => {
  return resolveAgencyIdFromJoin(
    db
      .selectFrom('Transfer_Payment_Monitor_Type')
      .innerJoin(
        'Transfer_Payment_Stream',
        'Transfer_Payment_Stream.id',
        'Transfer_Payment_Monitor_Type.egcs_tp_transferpaymentstream'
      )
      .innerJoin(
        'Transfer_Payment_Profile',
        'Transfer_Payment_Profile.id',
        'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile'
      )
      .where('Transfer_Payment_Monitor_Type.id', '=', monitorTypeId)
      .where('Transfer_Payment_Monitor_Type._deleted', '=', false)
      .where('Transfer_Payment_Stream._deleted', '=', false)
      .where('Transfer_Payment_Profile._deleted', '=', false)
      .select('Transfer_Payment_Profile.egcs_tp_agency as agency_id')
      .executeTakeFirst()
  )
}
