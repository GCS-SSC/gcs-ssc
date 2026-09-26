import { z } from 'zod'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { authorize } from '~~/server/utils/authorize'
import { resolveAgreementStreamScopeContext } from '~~/server/utils/agreement'
import { badRequest } from '~~/server/utils/api-errors'
import { PaginationSchema, PositivePostgresBigintIdSchema } from '~~/shared/types/schemas'

const QuerySchema = PaginationSchema.extend({
  stream_id: PositivePostgresBigintIdSchema,
  kind: z.enum(['review', 'workflow']),
  ids: z.union([PositivePostgresBigintIdSchema, z.array(PositivePostgresBigintIdSchema).max(100)]).optional()
})

export default defineEventHandler(async event => {
  const db = event.context.$db
  const { stream_id: streamId, kind, page, limit, search, ids } = await getValidatedQueryI18n(event, QuerySchema)
  const selectedIds = ids ? (Array.isArray(ids) ? ids : [ids]).map(String) : []
  const stream = await resolveAgreementStreamScopeContext(String(streamId), db)
  if (!stream) return await badRequest(event, 'FUNDING_OPPORTUNITY_STREAM_INVALID', 'apiErrors.request.invalid')
  await authorize(event, 'transfer_payment', 'read', stream.scope)

  const rows = kind === 'review'
    ? await db.selectFrom('Transfer_Payment_Stream_Review_Set')
        .innerJoin('Common_Review_Set_Setup', 'Common_Review_Set_Setup.id', 'Transfer_Payment_Stream_Review_Set.egcs_tp_reviewset')
        .select(['Common_Review_Set_Setup.id', 'Common_Review_Set_Setup.egcs_cn_name_en as label_en', 'Common_Review_Set_Setup.egcs_cn_name_fr as label_fr'])
        .where('Transfer_Payment_Stream_Review_Set.egcs_tp_transferpaymentstream', '=', String(streamId))
        .where('Common_Review_Set_Setup.egcs_cn_agency', '=', stream.agencyId)
        .where('Common_Review_Set_Setup.egcs_cn_entitytype', '=', 'fundingcaseintake')
        .where('Common_Review_Set_Setup._deleted', '=', false)
        .where('Transfer_Payment_Stream_Review_Set._deleted', '=', false).execute()
    : await db.selectFrom('Transfer_Payment_Stream_Workflow')
        .innerJoin('Common_Workflow_Setup', 'Common_Workflow_Setup.id', 'Transfer_Payment_Stream_Workflow.egcs_tp_workflow')
        .select(['Common_Workflow_Setup.id', 'Common_Workflow_Setup.egcs_cn_name_en as label_en', 'Common_Workflow_Setup.egcs_cn_name_fr as label_fr'])
        .where('Transfer_Payment_Stream_Workflow.egcs_tp_transferpaymentstream', '=', String(streamId))
        .where('Common_Workflow_Setup.egcs_cn_agency', '=', stream.agencyId)
        .where('Common_Workflow_Setup.egcs_cn_entitytype', '=', 'fundingcaseintake')
        .where('Common_Workflow_Setup._deleted', '=', false)
        .where('Transfer_Payment_Stream_Workflow._deleted', '=', false).execute()
  const visible = rows.filter(row => (!selectedIds.length || selectedIds.includes(String(row.id)))
    && (!search || [row.label_en, row.label_fr]
      .some(label => label.toLocaleLowerCase().includes(search.toLocaleLowerCase()))))
  return { items: visible.slice((page - 1) * limit, page * limit), total: visible.length, page, limit }
})
