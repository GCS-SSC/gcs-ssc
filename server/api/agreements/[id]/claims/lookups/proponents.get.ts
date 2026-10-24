import { defineEventHandler } from 'h3'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'
import { sql } from 'kysely'
import { z } from 'zod'
import { PaginationSchema, PositivePostgresBigintIdSchema } from '~~/shared/types/schemas/common'
import { prepareAgreementClaimRoute } from '~~/server/utils/agreement-claim'
import { escapeLikePattern } from '~~/server/utils/sql-like'

const QuerySchema = PaginationSchema.extend({
  claimId: PositivePostgresBigintIdSchema.optional(),
  selected: z.preprocess(value => value === undefined ? [] : Array.isArray(value) ? value : [value],
    z.array(PositivePostgresBigintIdSchema).max(100)),
  permission_action: z.enum(['create', 'update']).default('create')
}).superRefine((query, ctx) => {
  if (query.permission_action === 'update' && !query.claimId) ctx.addIssue({ code: 'custom', path: ['claimId'], message: 'validation.required' })
})

export default defineEventHandler(async event => {
  const { page, limit, search, claimId, selected, permission_action } = await getValidatedQueryI18n(event, QuerySchema)
  return await executeFreshReadSnapshot(event, async () => {
    const prepared = await prepareAgreementClaimRoute(event, permission_action,
      claimId ? { entityType: 'fundingcaseagreementclaim', entityId: claimId } : undefined)
    if (!prepared || !('agreementId' in prepared)) return prepared
    const claim = claimId
      ? await prepared.db.selectFrom('Funding_Case_Agreement_Claim')
          .select('egcs_fc_applicantrecipient').where('id', '=', claimId)
          .where('egcs_fc_fundingagreement', '=', prepared.agreementId).where('_deleted', '=', false).executeTakeFirst()
      : null
    const savedProponent = claim ? String(claim.egcs_fc_applicantrecipient) : null
    let base = prepared.db.selectFrom('Applicant_Recipient_Profile as payee')
      .where(eb => eb.or([
        eb.and([
          eb('payee._deleted', '=', false),
          eb('payee.egcs_ar_active', '=', true),
          eb.exists(eb.selectFrom('Funding_Case_Agreement_Applicant_Recipient as link').select('link.id')
            .whereRef('link.egcs_fc_applicantrecipient', '=', 'payee.id')
            .where('link.egcs_fc_fundingagreement', '=', prepared.agreementId).where('link._deleted', '=', false))
        ]),
        ...(savedProponent && selected.includes(savedProponent) ? [eb('payee.id', '=', savedProponent)] : [])
      ]))
    if (selected.length > 0) base = base.where('payee.id', 'in', selected)
    else if (search) base = base.where(sql<boolean>`concat_ws(' ',payee.egcs_ar_legalname_en,payee.egcs_ar_legalname_fr,payee.egcs_ar_operatingname_en,payee.egcs_ar_operatingname_fr) ILIKE ${`%${escapeLikePattern(search)}%`}`)
    const [items, count] = await Promise.all([
      base.select(['payee.id', sql<string>`COALESCE(NULLIF(BTRIM(${sql.ref('payee.egcs_ar_operatingname_en')}),''),${sql.ref('payee.egcs_ar_legalname_en')},${''})`.as('label_en'),
        sql<string>`COALESCE(NULLIF(BTRIM(${sql.ref('payee.egcs_ar_operatingname_fr')}),''),${sql.ref('payee.egcs_ar_legalname_fr')},${''})`.as('label_fr')])
        .orderBy('payee.id').limit(limit).offset((page - 1) * limit).execute(),
      base.select(eb => [eb.fn.countAll().as('total'),
        eb.fn.countAll().filterWhere('payee._deleted', '=', false).filterWhere('payee.egcs_ar_active', '=', true).as('active')]).executeTakeFirst()
    ])
    const total = Number(count?.total ?? 0)
    return { items, total, page, limit, stats: { total, active: Number(count?.active ?? 0) } }
  })
})
