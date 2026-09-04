import { z } from 'zod'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { PaginationSchema } from '~~/shared/types/schemas/common'
import { prepareAgreementPaymentRoute } from '~~/server/utils/agreement-payment'
import { budgetFiscalYearStableId } from '~~/server/utils/agreement-budget-lineage'

const QuerySchema = PaginationSchema.extend({
  paymentId: z.union([z.string().min(1), z.number()]).transform(String).optional(),
  permission_action: z.enum(['create', 'update']).default('create')
}).superRefine((query, ctx) => {
  if (query.permission_action === 'update' && !query.paymentId) {
    ctx.addIssue({ code: 'custom', path: ['paymentId'], message: 'validation.required' })
  }
})

export default defineEventHandler(async event => {
  const { page, limit, search, paymentId, permission_action } = await getValidatedQueryI18n(event, QuerySchema)
  let assignmentTarget
  if (paymentId) assignmentTarget = { entityType: 'fundingcasepayment' as const, entityId: paymentId }
  const prepared = await prepareAgreementPaymentRoute(event, permission_action, assignmentTarget)
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementId, db } = prepared
  const offset = (page - 1) * limit

  let baseQuery = db
    .selectFrom('Funding_Case_Agreement_Budget_Fiscal_Year')
    .innerJoin(
      'Funding_Case_Agreement_Budget_Version',
      'Funding_Case_Agreement_Budget_Version.id',
      'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion'
    )
    .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fiscalyear')
    .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fundingagreement', '=', agreementId)
    .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
    .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
    .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)
    .where('Agency_Fiscal_Year._deleted', '=', false)

  if (search) {
    baseQuery = baseQuery.where('Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay', 'ilike', `%${escapeLikePattern(search)}%`)
  }

  const [items, countResult] = await Promise.all([
    baseQuery
      .select([
        budgetFiscalYearStableId.as('id'),
        'Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay as label_en',
        'Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay as label_fr'
      ])
      .orderBy('Agency_Fiscal_Year.egcs_ay_fiscalyear', 'asc')
      .limit(limit)
      .offset(offset)
      .execute(),
    baseQuery
      .select(eb => eb.fn.count('Funding_Case_Agreement_Budget_Fiscal_Year.id').as('total'))
      .executeTakeFirst()
  ])

  const total = Number(countResult?.total ?? 0)

  return {
    items,
    total,
    stats: {
      total,
      active: total
    },
    page,
    limit
  }
})
