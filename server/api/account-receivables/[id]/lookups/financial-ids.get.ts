import { sql } from 'kysely'
import { z } from 'zod'
import { PaginationSchema, PositivePostgresBigintIdSchema } from '~~/shared/types/schemas/common'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { authorizeAccountReceivable } from '~~/server/utils/account-receivable'
import { escapeLikePattern } from '~~/server/utils/sql-like'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  const context = await authorizeAccountReceivable(event, id)
  const input = await getValidatedQueryI18n(event, PaginationSchema.extend({
    selectedIds: z.union([PositivePostgresBigintIdSchema, z.array(PositivePostgresBigintIdSchema).max(100)])
      .transform(value => Array.isArray(value) ? value : [value]).optional()
  }))
  const saved = await event.context.$db.selectFrom('Funding_Case_Agreement_Account_Receivable').select('egcs_fc_agencyfinancialid').where('id', '=', id).executeTakeFirstOrThrow()
  let query = event.context.$db.selectFrom('Applicant_Recipient_Agency_Financial_Id')
    .where('egcs_ar_agency', '=', context.agencyId).where('egcs_ar_applicantrecipient', '=', context.applicantRecipientId)
    .where(eb => eb.or([eb.and([eb('egcs_ar_active', '=', true), eb('_deleted', '=', false)]),
      ...(saved.egcs_fc_agencyfinancialid ? [eb('id', '=', String(saved.egcs_fc_agencyfinancialid))] : [])]))
  if (input.selectedIds) query = query.where('id', 'in', input.selectedIds)
  if (input.search) query = query.where(sql<boolean>`egcs_ar_financialsystemid::text ILIKE ${`%${escapeLikePattern(input.search)}%`}`)
  const [rows, total] = await Promise.all([
    query.select(['id', sql<string>`egcs_ar_financialsystemid::text`.as('label_en'), sql<string>`egcs_ar_financialsystemid::text`.as('label_fr'), 'egcs_ar_active'])
      .orderBy('id', 'desc').limit(input.limit).offset((input.page - 1) * input.limit).execute(),
    query.select(sql<string>`count(*)::text`.as('total')).executeTakeFirstOrThrow()
  ])
  return { items: rows, total: Number(total.total), page: input.page, limit: input.limit }
})
