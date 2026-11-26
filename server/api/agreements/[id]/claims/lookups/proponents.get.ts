import { defineEventHandler } from 'h3'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'
import { z } from 'zod'
import { PaginationSchema, PositivePostgresBigintIdSchema } from '~~/shared/types/schemas/common'
import { prepareAgreementClaimRoute } from '~~/server/utils/agreement-claim'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { submittingProponentDisplayName } from '~~/server/utils/agreement-submitting-proponent'

const QuerySchema = PaginationSchema.extend({
  selected: z.preprocess(value => value === undefined ? [] : Array.isArray(value) ? value : [value],
    z.array(PositivePostgresBigintIdSchema).max(100))
})

export default defineEventHandler(async event => {
  const { page, limit, search, selected } = await getValidatedQueryI18n(event, QuerySchema)
  return await executeFreshReadSnapshot(event, async () => {
    const prepared = await prepareAgreementClaimRoute(event, 'create')
    if (!prepared || !('agreementId' in prepared)) return prepared
    let base = prepared.db.selectFrom('Applicant_Recipient_Profile as payee')
      .innerJoin('Funding_Case_Agreement_Applicant_Recipient as link', 'link.egcs_fc_applicantrecipient', 'payee.id')
      .where('link.egcs_fc_fundingagreement', '=', prepared.agreementId)
      .where('link._deleted', '=', false)
      .where('payee._deleted', '=', false)
      .where('payee.egcs_ar_active', '=', true)
    if (selected.length > 0) base = base.where('payee.id', 'in', selected)
    else if (search) {
      base = base.where(eb => eb(eb.fn<string>('pg_catalog.concat_ws', [
        eb.val(' '),
        'payee.egcs_ar_legalname_en',
        'payee.egcs_ar_legalname_fr',
        'payee.egcs_ar_operatingname_en',
        'payee.egcs_ar_operatingname_fr'
      ]), 'ilike', `%${escapeLikePattern(search)}%`))
    }
    const [items, count] = await Promise.all([
      base.select(['payee.id', submittingProponentDisplayName('payee', 'en').as('label_en'),
        submittingProponentDisplayName('payee', 'fr').as('label_fr')])
        .orderBy('payee.id').limit(limit).offset((page - 1) * limit).execute(),
      base.select(eb => [eb.fn.countAll().as('total'),
        eb.fn.countAll().filterWhere('payee._deleted', '=', false).filterWhere('payee.egcs_ar_active', '=', true).as('active')]).executeTakeFirst()
    ])
    const total = Number(count?.total ?? 0)
    return { items, total, page, limit, stats: { total, active: Number(count?.active ?? 0) } }
  })
})
