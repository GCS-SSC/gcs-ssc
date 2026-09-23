import type { H3Event } from 'h3'
import { authorize } from './authorize'
import { notFound } from './api-errors'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import type { Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'

type WorkflowCatalogAction = 'read' | 'update'

/**
 * Authorizes an Agency Workflow catalog while concealing missing or inaccessible Agencies.
 * @param event - Request event.
 * @param action - Agency role action.
 * @param agencyId - Agency route ID.
 * @returns Authorized Agency ID.
 */
export const authorizeAgencyWorkflowCatalog = async (
  event: H3Event,
  action: WorkflowCatalogAction,
  agencyId: string
): Promise<string> => {
  const result = await authorize(event, 'agency', action, async ({ context }) => {
    if (!isPositivePostgresBigintText(agencyId)) {
      return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
    }
    const agency = await event.context.$db.selectFrom('Agency_Profile').select('id')
      .where('id', '=', agencyId).where('_deleted', '=', false).executeTakeFirst()
    if (!agency || !context.userAbilities.authorize('agency', action, { type: 'agency', agencyId })) {
      return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
    }
    return { bypass: true, data: agencyId }
  })
  return result.data!
}

/**
 * Authorizes a Workflow aggregate in the requested Agency without disclosing foreign rows.
 * @param event - Request event.
 * @param action - Agency role action.
 * @param agencyId - Agency route ID.
 * @param workflowSetupId - Workflow route ID.
 * @returns Authorized Agency ID.
 */
export const authorizeAgencyWorkflowSetup = async (
  event: H3Event,
  action: WorkflowCatalogAction,
  agencyId: string,
  workflowSetupId: string
): Promise<string> => {
  const result = await authorize(event, 'agency', action, async ({ context }) => {
    if (!isPositivePostgresBigintText(agencyId) || !isPositivePostgresBigintText(workflowSetupId)) {
      return await notFound(event, 'WORKFLOW_SETUP_NOT_FOUND', 'apiErrors.admin_common.not_found')
    }
    const setup = await event.context.$db.selectFrom('Common_Workflow_Setup')
      .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Common_Workflow_Setup.egcs_cn_agency')
      .select('Common_Workflow_Setup.id')
      .where('Common_Workflow_Setup.id', '=', workflowSetupId)
      .where('Common_Workflow_Setup.egcs_cn_agency', '=', agencyId)
      .where('Common_Workflow_Setup._deleted', '=', false)
      .where('Agency_Profile._deleted', '=', false).executeTakeFirst()
    if (!setup || !context.userAbilities.authorize('agency', action, { type: 'agency', agencyId })) {
      return await notFound(event, 'WORKFLOW_SETUP_NOT_FOUND', 'apiErrors.admin_common.not_found')
    }
    return { bypass: true, data: agencyId }
  })
  return result.data!
}

/**
 * Checks that every selected status is active in the Workflow's Agency.
 * @param trx - Locked mutation transaction.
 * @param agencyId - Owning Agency ID.
 * @param statusIds - Selected status IDs.
 * @returns Whether every selected status belongs to the Agency.
 */
export const areAgencyWorkflowStatusesValid = async (
  trx: Transaction<Database>,
  agencyId: string,
  statusIds: Array<string | null | undefined>
): Promise<boolean> => {
  const selected = [...new Set(statusIds.filter((id): id is string => Boolean(id)))]
  if (selected.length === 0) return true
  const active = await trx.selectFrom('Common_Status').select('id')
    .where('id', 'in', selected)
    .where('egcs_cn_agency', '=', agencyId)
    .where('_deleted', '=', false)
    .forUpdate().execute()
  return active.length === selected.length
}
