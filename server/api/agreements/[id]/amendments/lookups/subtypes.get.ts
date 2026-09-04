import { z } from 'zod'
import { badRequest } from '~~/server/utils/api-errors'
import { authorizeAgreementResource } from '~~/server/utils/agreement'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id')
  if (!agreementId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  const query = await getValidatedQueryI18n(event, z.object({
    amendment_type_ids: z.string().default(''),
    amendmentId: z.string().min(1).optional()
  }))
  let assignmentTarget
  if (query.amendmentId) {
    assignmentTarget = { entityType: 'fundingcaseamendment' as const, entityId: query.amendmentId }
  }
  const context = await authorizeAgreementResource(event, 'read', agreementId, db, { assignmentTarget })
  if (!context) return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  const typeIds = query.amendment_type_ids.split(',').filter(Boolean)
  if (typeIds.length === 0) return { items: [], total: 0, page: 1, limit: 0 }
  const items = await db.selectFrom('Transfer_Payment_Amendment_Subtype')
    .innerJoin('Transfer_Payment_Amendment_Subtype_Type', 'Transfer_Payment_Amendment_Subtype_Type.egcs_tp_amendmentsubtype', 'Transfer_Payment_Amendment_Subtype.id')
    .select(['Transfer_Payment_Amendment_Subtype.id as id', 'egcs_tp_name_en', 'egcs_tp_name_fr'])
    .distinct()
    .where('Transfer_Payment_Amendment_Subtype.egcs_tp_transferpaymentstream', '=', context.streamId)
    .where('Transfer_Payment_Amendment_Subtype_Type.egcs_tp_amendmenttype', 'in', typeIds)
    .where('Transfer_Payment_Amendment_Subtype._deleted', '=', false)
    .where('Transfer_Payment_Amendment_Subtype_Type._deleted', '=', false)
    .orderBy('Transfer_Payment_Amendment_Subtype.id', 'asc').execute()
  return { items, total: items.length, page: 1, limit: items.length }
})
