/* eslint-disable jsdoc/require-jsdoc -- authorization wrappers use descriptive exported names */
import type { H3Event } from 'h3'
import type { Kysely, Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { authorize } from './authorize'
import { notFound } from './api-errors'
import { throwIfAgencyUniqueConstraintError } from './agency-unique-constraint-errors'
import { withActiveAgencyMutationTransaction, withActiveAgencyReadTransaction } from './agency-auth'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

type Db = Kysely<Database> | Transaction<Database>

export const requireFundingAgency = async (event: H3Event, action: 'read' | 'create' | 'update' | 'delete', agencyId: string | undefined) => {
  if (!agencyId || !isPositivePostgresBigintText(agencyId)) return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
  await authorize(event, 'agency', action, { type: 'agency', agencyId })
  return agencyId
}

export const withFundingAgencyRead = async <T>(event: H3Event, agencyId: string, work: (db: Db) => Promise<T>) =>
  await withActiveAgencyReadTransaction(event, agencyId, work)

export const withFundingAgencyWrite = async <T>(event: H3Event, agencyId: string, work: (db: Db) => Promise<T>, action: 'update' | 'delete' = 'update') => {
  try {
    return await withActiveAgencyMutationTransaction(event, agencyId, work, action)
  } catch (error: unknown) {
    await throwIfAgencyUniqueConstraintError(event, error)
    throw error
  }
}

export const requireFundingType = async (event: H3Event, db: Db, agencyId: string, typeId: string | undefined) => {
  if (!typeId || !isPositivePostgresBigintText(typeId)) return await notFound(event, 'FUNDING_TYPE_NOT_FOUND', 'apiErrors.agency.funding_type_not_found')
  const row = await db.selectFrom('Agency_Funding_Type').selectAll()
    .where('id', '=', typeId).where('egcs_ay_organizationagency', '=', agencyId).where('_deleted', '=', false).executeTakeFirst()
  if (!row) return await notFound(event, 'FUNDING_TYPE_NOT_FOUND', 'apiErrors.agency.funding_type_not_found')
  return row
}

export const requireFundingSubtype = async (event: H3Event, db: Db, typeId: string, subtypeId: string | undefined) => {
  if (!subtypeId || !isPositivePostgresBigintText(subtypeId)) return await notFound(event, 'FUNDING_SUBTYPE_NOT_FOUND', 'apiErrors.agency.funding_subtype_not_found')
  const row = await db.selectFrom('Agency_Funding_Subtype').selectAll()
    .where('id', '=', subtypeId).where('egcs_ay_fundingtype', '=', typeId).where('_deleted', '=', false).executeTakeFirst()
  if (!row) return await notFound(event, 'FUNDING_SUBTYPE_NOT_FOUND', 'apiErrors.agency.funding_subtype_not_found')
  return row
}
