import { sql } from 'kysely'
import { z } from 'zod'
import { PaginationSchema } from '~~/shared/types/schemas/common'
import { prepareAgreementClaimRoute } from '~~/server/utils/agreement-claim'
import { escapeLikePattern } from '~~/server/utils/sql-like'

const QuerySchema = PaginationSchema.extend({
  claimId: z.union([z.string().min(1), z.number()]).transform(String).optional(),
  permission_action: z.enum(['create', 'update']).default('create')
}).superRefine((query, ctx) => {
  if (query.permission_action === 'update' && !query.claimId) ctx.addIssue({ code: 'custom', path: ['claimId'], message: 'validation.required' })
})

export default defineEventHandler(async event => {
  const { page, limit, search, claimId, permission_action } = await getValidatedQueryI18n(event, QuerySchema)
  const prepared = await prepareAgreementClaimRoute(event, permission_action,
    claimId ? { entityType: 'fundingcaseagreementclaim', entityId: claimId } : undefined)
  if (!prepared || !('agreementId' in prepared)) return prepared
  let base = prepared.db.selectFrom('Funding_Case_Agreement_Applicant_Recipient as link')
    .innerJoin('Applicant_Recipient_Profile as payee', 'payee.id', 'link.egcs_fc_applicantrecipient')
    .where('link.egcs_fc_fundingagreement', '=', prepared.agreementId).where('link._deleted', '=', false)
    .where('payee._deleted', '=', false).where('payee.egcs_ar_active', '=', true)
  if (search) base = base.where(sql<boolean>`concat_ws(' ',payee.egcs_ar_legalname_en,payee.egcs_ar_legalname_fr,payee.egcs_ar_operatingname_en,payee.egcs_ar_operatingname_fr) ILIKE ${`%${escapeLikePattern(search)}%`}`)
  const [items, count] = await Promise.all([
    base.select(['payee.id', sql<string>`COALESCE(${sql.ref('payee.egcs_ar_operatingname_en')},${sql.ref('payee.egcs_ar_legalname_en')},${''})`.as('label_en'),
      sql<string>`COALESCE(${sql.ref('payee.egcs_ar_operatingname_fr')},${sql.ref('payee.egcs_ar_legalname_fr')},${''})`.as('label_fr')])
      .orderBy('payee.id').limit(limit).offset((page - 1) * limit).execute(),
    base.select(eb => eb.fn.countAll().as('total')).executeTakeFirst()
  ])
  const total = Number(count?.total ?? 0)
  return { items, total, page, limit, stats: { total, active: total } }
})
