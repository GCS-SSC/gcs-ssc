import { badRequest } from '~~/server/utils/api-errors'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { resolveAgreementAmendmentActivityVersion } from '~~/server/utils/agreement-amendment'
import { getAgreementActivityOutcomeTags, getAgreementActivityResponsiblePartyTags } from '~~/server/utils/agreement-activity'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { PaginationSchema } from '~~/shared/types/schemas'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id')
  const amendmentId = getRouterParam(event, 'amendmentId')
  if (!agreementId || !amendmentId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  const agreementContext = await authorizeAgreementResource(event, 'read', agreementId, db, {
    assignmentTarget: { entityType: 'fundingcaseamendment', entityId: amendmentId }
  })
  if (!agreementContext) return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')

  const versionId = await resolveAgreementAmendmentActivityVersion(event, db, agreementId, amendmentId)
  if (typeof versionId !== 'string') return versionId
  const { page, limit, search } = await getValidatedQueryI18n(event, PaginationSchema)
  let query = db.selectFrom('Funding_Case_Agreement_Activity')
    .where('egcs_fc_fundingagreement', '=', agreementId)
    .where('egcs_fc_activityversion', '=', versionId)
    .where('_deleted', '=', false)
  if (search) {
    const pattern = `%${escapeLikePattern(search)}%`
    query = query.where(eb => eb.or([
      eb('egcs_fc_name_en', 'ilike', pattern), eb('egcs_fc_name_fr', 'ilike', pattern),
      eb('egcs_fc_description_en', 'ilike', pattern), eb('egcs_fc_description_fr', 'ilike', pattern),
      eb('egcs_fc_expectedresults_en', 'ilike', pattern), eb('egcs_fc_expectedresults_fr', 'ilike', pattern)
    ]))
  }
  const [rows, countResult] = await Promise.all([
    query.selectAll().orderBy('id', 'asc').limit(limit).offset((page - 1) * limit).execute(),
    query.select(eb => eb.fn.count('id').as('total')).executeTakeFirst()
  ])
  const total = Number(countResult?.total ?? 0)
  const ids = rows.map(row => String(row.id))
  const [outcomes, responsibleParties] = await Promise.all([
    getAgreementActivityOutcomeTags(db, ids), getAgreementActivityResponsiblePartyTags(db, ids)
  ])
  const items = rows.map(row => {
    const outcomeTags = outcomes.get(String(row.id)) ?? []
    const responsiblePartyTags = responsibleParties.get(String(row.id)) ?? []
    return { ...row, outcome_ids: outcomeTags.map(item => item.id), responsible_party_ids: responsiblePartyTags.map(item => item.id), outcomes: outcomeTags, responsible_parties: responsiblePartyTags }
  })
  return { items, total, stats: { total, active: total }, page, limit }
})
