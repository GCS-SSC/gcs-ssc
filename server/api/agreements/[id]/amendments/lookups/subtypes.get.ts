import { defineEventHandler, getRouterParam } from 'h3'
import { assertAgreementAmendmentExists } from '~~/server/utils/agreement-amendment'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'
import { z } from 'zod'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { PositivePostgresBigintIdSchema } from '~~/shared/types/schemas'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { badRequest } from '~~/server/utils/api-errors'
import { authorizeAgreementResource } from '~~/server/utils/agreement'

const readRoute = defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id')
  if (!agreementId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  if (!isPositivePostgresBigintText(agreementId)) return await badRequest(event, 'INVALID_ID', 'apiErrors.request.invalid')
  const query = await getValidatedQueryI18n(event, z.object({
    amendment_type_ids: z.string().default('').transform((value, ctx) => {
      const parsed = z.array(PositivePostgresBigintIdSchema).safeParse(value === '' ? [] : value.split(','))
      if (parsed.success) return parsed.data
      for (const issue of parsed.error.issues) ctx.addIssue({ ...issue })
      return z.NEVER
    }),
    amendmentId: PositivePostgresBigintIdSchema.optional()
  }))
  let assignmentTarget
  if (query.amendmentId) {
    assignmentTarget = { entityType: 'fundingcaseamendment' as const, entityId: query.amendmentId }
  }
  const context = await authorizeAgreementResource(event, 'read', agreementId, db, { assignmentTarget })
  if (!context) return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  if (query.amendmentId) await assertAgreementAmendmentExists(event, db, agreementId, query.amendmentId)
  const typeIds = query.amendment_type_ids
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

export default defineEventHandler(async event =>
  await executeFreshReadSnapshot(event, async () => await readRoute(event)))
