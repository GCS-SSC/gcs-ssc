import { defineEventHandler, getRouterParam } from 'h3'
import { z } from 'zod'
import { PaginationSchema, PositivePostgresBigintIdSchema } from '~~/shared/types/schemas'
import { authorizeAgreementResource, resolveAgreementVisibility } from '~~/server/utils/agreement'
import { requireAuthContext } from '~~/server/utils/authorize'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'
import { badRequest } from '~~/server/utils/api-errors'
import { escapeLikePattern } from '~~/server/utils/sql-like'

const QuerySchema = PaginationSchema.extend({
  selected_ids: z.union([PositivePostgresBigintIdSchema, z.array(PositivePostgresBigintIdSchema).max(100)]).optional()
})

export default defineEventHandler(async event => {
  const agreementId = getRouterParam(event, 'id')
  if (!agreementId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  return await executeFreshReadSnapshot(event, async (db, freshAuthContext) => {
    const context = await authorizeAgreementResource(event, 'create', agreementId, db, { freshAuth: true, freshAuthContext })
    if (!context) return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
    const { page, limit, search, selected_ids } = await getValidatedQueryI18n(event, QuerySchema)
    const visibility = await resolveAgreementVisibility(freshAuthContext ?? await requireAuthContext(event), 'read', db)
    let query = db.selectFrom('Funding_Case_Agreement_Profile as agreement')
      .innerJoin('Transfer_Payment_Stream as stream', 'stream.id', 'agreement.egcs_fc_transferpaymentstream')
      .innerJoin('Transfer_Payment_Profile as program', 'program.id', 'stream.egcs_tp_transferpaymentprofile')
      .where('program.egcs_tp_agency', '=', context.agencyId)
      .where('agreement.id', '!=', agreementId).where('agreement._deleted', '=', false)
      .where('stream._deleted', '=', false).where('program._deleted', '=', false)
    if (!visibility.hasGlobalAccess) {
      query = query.where(eb => eb.or([
        ...(visibility.agencyIds.length ? [eb('program.egcs_tp_agency', 'in', visibility.agencyIds)] : []),
        ...(visibility.transferPaymentIds.length ? [eb('program.id', 'in', visibility.transferPaymentIds)] : []),
        ...(visibility.agreementIds.length ? [eb('agreement.id', 'in', visibility.agreementIds)] : [])
      ]))
    }
    if (selected_ids) query = query.where('agreement.id', 'in', Array.isArray(selected_ids) ? selected_ids : [selected_ids])
    query = query.where(eb => eb.not(eb.exists(eb.selectFrom('Funding_Case_Agreement_Relationship as existing')
      .select('existing.id').where('existing._deleted', '=', false).where(eb2 => eb2.or([
        eb2.and([eb2('existing.egcs_fc_fundingagreement', '=', agreementId), eb2('existing.egcs_fc_relatedagreement', '=', eb2.ref('agreement.id'))]),
        eb2.and([eb2('existing.egcs_fc_relatedagreement', '=', agreementId), eb2('existing.egcs_fc_fundingagreement', '=', eb2.ref('agreement.id'))])
      ])))))
    if (search) {
      const pattern = `%${escapeLikePattern(search)}%`
      query = query.where(eb => eb.or([
        eb('agreement.egcs_fc_agreementnumber', 'ilike', pattern),
        eb('agreement.egcs_fc_title_en', 'ilike', pattern), eb('agreement.egcs_fc_title_fr', 'ilike', pattern)
      ]))
    }
    const [rows, count] = await Promise.all([
      query.select(['agreement.id', 'agreement.egcs_fc_agreementnumber', 'agreement.egcs_fc_title_en', 'agreement.egcs_fc_title_fr'])
        .orderBy('agreement.egcs_fc_agreementnumber').orderBy('agreement.id').limit(limit).offset((page - 1) * limit).execute(),
      query.select(eb => eb.fn.count('agreement.id').as('total')).executeTakeFirstOrThrow()
    ])
    const items = rows.map(row => ({ id: row.id,
      label_en: `${row.egcs_fc_agreementnumber} — ${row.egcs_fc_title_en}`,
      label_fr: `${row.egcs_fc_agreementnumber} — ${row.egcs_fc_title_fr}` }))
    return { items, total: Number(count.total), page, limit }
  })
})
