import { badRequest } from '~~/server/utils/api-errors'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { assertAgreementAmendmentExists } from '~~/server/utils/agreement-amendment'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { PaginationSchema } from '~~/shared/types/schemas'
import { buildListRouteResponse } from '~~/server/utils/list-route-response'
import { isRiskRatingWorkflowManaged } from '~~/server/utils/agreement-risk-rating'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const agreementId = getRouterParam(event, 'id') ?? ''
  const amendmentId = getRouterParam(event, 'amendmentId') ?? ''
  if (!isPositivePostgresBigintText(agreementId) || !isPositivePostgresBigintText(amendmentId)) {
    return await badRequest(event, 'INVALID_ID', 'apiErrors.request.invalid')
  }
  const { page, limit, search } = await getValidatedQueryI18n(event, PaginationSchema)
  return await executeFreshReadSnapshot(event, async db => {
    const context = await authorizeAgreementResource(event, 'update', agreementId, db, {
      assignmentTarget: { entityType: 'fundingcaseamendment', entityId: amendmentId }, freshAuth: true
    })
    if (!context) return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
    const amendment = await assertAgreementAmendmentExists(event, db, agreementId, amendmentId)
    if (!('id' in amendment)) return amendment
    let base = db.selectFrom('Transfer_Payment_Stream_Risk_Rating')
      .where('egcs_tp_transferpaymentstream', '=', context.streamId).where('_deleted', '=', false)
    if (search) {
      const escapedSearch = escapeLikePattern(search)
      const scoreSearch = Number(search)
      base = base.where(eb => eb.or([
        eb('egcs_tp_name_en', 'ilike', `%${escapedSearch}%`), eb('egcs_tp_name_fr', 'ilike', `%${escapedSearch}%`),
        ...(Number.isFinite(scoreSearch) ? [eb('egcs_tp_riskscore', '=', scoreSearch)] : [])
      ]))
    }
    const [items, count] = await Promise.all([
      base.select(['id', 'egcs_tp_transferpaymentstream', 'egcs_tp_riskscore', 'egcs_tp_name_en', 'egcs_tp_name_fr',
        'egcs_tp_name_en as label_en', 'egcs_tp_name_fr as label_fr'])
        .orderBy('egcs_tp_riskscore', 'asc').orderBy('id', 'asc').limit(limit).offset((page - 1) * limit).execute(),
      base.select(eb => eb.fn.count('id').as('total')).executeTakeFirst()
    ])
    return {
      ...buildListRouteResponse(items, count, count, page, limit),
      workflow_managed: await isRiskRatingWorkflowManaged(db, {
        streamId: context.streamId, entityType: 'fundingcaseamendment', entityId: amendmentId
      })
    }
  })
})
