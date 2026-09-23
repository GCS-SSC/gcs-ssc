/* eslint-disable jsdoc/require-jsdoc -- Approval-template authorization is exercised by route tests. */
import type { H3Event } from 'h3'
import type { Kysely, Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { notFound, throwApiError } from '~~/server/utils/api-errors'
import { authorize } from '~~/server/utils/authorize'
import { withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { PublicationLifecycleConflictError } from './system-publication'

export type ApprovalTemplateScopeAction = 'read' | 'create' | 'update' | 'delete'
export type ApprovalTemplateScopeContext = { agencyId: string }

export const resolveApprovalTemplateScopeContext = async (
  db: Kysely<Database> | Transaction<Database>,
  agencyId: string
): Promise<ApprovalTemplateScopeContext | null> => {
  if (!isPositivePostgresBigintText(agencyId)) return null
  const agency = await db.selectFrom('Agency_Profile')
    .select('id')
    .where('id', '=', agencyId)
    .where('_deleted', '=', false)
    .executeTakeFirst()
  return agency ? { agencyId: String(agency.id) } : null
}

export const resolveApprovalTemplateScopeContextFromTemplateId = async (
  db: Kysely<Database> | Transaction<Database>,
  templateId: string
): Promise<ApprovalTemplateScopeContext | null> => {
  if (!isPositivePostgresBigintText(templateId)) return null
  const template = await db.selectFrom('Common_Approval_Template')
    .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Common_Approval_Template.egcs_cn_agency')
    .select('Common_Approval_Template.egcs_cn_agency as agencyId')
    .where('Common_Approval_Template.id', '=', templateId)
    .where('Common_Approval_Template._deleted', '=', false)
    .where('Agency_Profile._deleted', '=', false)
    .executeTakeFirst()
  return template ? { agencyId: String(template.agencyId) } : null
}

/**
 * Authorizes an Agency catalog without disclosing inaccessible Agencies.
 * @param event - Request event.
 * @param action - Catalog action.
 * @param agencyId - Owning Agency ID.
 * @returns Authorized Agency context.
 */
export const authorizeApprovalTemplateScope = async (
  event: H3Event,
  action: ApprovalTemplateScopeAction,
  agencyId: string
): Promise<ApprovalTemplateScopeContext> => {
  const agencyAction = action === 'read' ? 'read' : 'update'
  const authorization = await authorize(event, 'agency', agencyAction, async ({ context }) => {
    const scopeContext = await resolveApprovalTemplateScopeContext(event.context.$db, agencyId)
    if (!scopeContext || !context.userAbilities.authorize('agency', agencyAction, { type: 'agency', agencyId })) {
      return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
    }
    return { bypass: true, data: scopeContext }
  })
  return authorization.data!
}

/**
 * Authorizes a template in the requested Agency without disclosing foreign rows.
 * @param event - Request event.
 * @param action - Catalog action.
 * @param agencyId - Agency ID from the route.
 * @param templateId - Approval Template ID from the route.
 * @returns Authorized Agency context.
 */
export const authorizeApprovalTemplateById = async (
  event: H3Event,
  action: Exclude<ApprovalTemplateScopeAction, 'create'>,
  agencyId: string,
  templateId: string
): Promise<ApprovalTemplateScopeContext> => {
  const agencyAction = action === 'read' ? 'read' : 'update'
  const authorization = await authorize(event, 'agency', agencyAction, async ({ context }) => {
    const scopeContext = await resolveApprovalTemplateScopeContextFromTemplateId(event.context.$db, templateId)
    if (!scopeContext || scopeContext.agencyId !== agencyId ||
      !context.userAbilities.authorize('agency', agencyAction, { type: 'agency', agencyId })) {
      return await notFound(event, 'APPROVAL_TEMPLATE_NOT_FOUND', 'apiErrors.admin_common.not_found')
    }
    return { bypass: true, data: scopeContext }
  })
  return authorization.data!
}

/**
 * Executes an Agency catalog write with fresh authorization and a parent row lock.
 * @param event - Request event.
 * @param action - Catalog action.
 * @param scopeContext - Authorized Agency context.
 * @param callback - Aggregate mutation.
 * @returns Mutation result.
 */
export const executeApprovalTemplateScopeWrite = async <T>(
  event: H3Event,
  action: Extract<ApprovalTemplateScopeAction, 'create' | 'update' | 'delete'>,
  scopeContext: ApprovalTemplateScopeContext,
  callback: (trx: Transaction<Database>, currentScopeContext: ApprovalTemplateScopeContext) => Promise<T>
): Promise<T> => {
  try {
    return await withActiveAgencyMutationTransaction(event, scopeContext.agencyId, async trx => {
      return await callback(trx, scopeContext)
    }, 'update')
  } catch (error: unknown) {
    if (error instanceof PublicationLifecycleConflictError) {
      return await throwApiError(event, {
        statusCode: 409, code: error.code, key: 'apiErrors.request.invalid_status'
      })
    }
    throw error
  }
}
