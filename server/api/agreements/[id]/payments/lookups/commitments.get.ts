import { sql } from 'kysely'
import { z } from 'zod'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { PaginationSchema } from '~~/shared/types/schemas/common'
import { prepareAgreementPaymentRoute } from '~~/server/utils/agreement-payment'

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
    .selectFrom('Funding_Case_Agreement_Commitment')
    .innerJoin('Transfer_Payment_Stream_Commitment_Type', 'Transfer_Payment_Stream_Commitment_Type.id', 'Funding_Case_Agreement_Commitment.egcs_fc_type')
    .where('Funding_Case_Agreement_Commitment.egcs_fc_fundingagreement', '=', agreementId)
    .where(sql<boolean>`(
      EXISTS (
        SELECT 1 FROM "Common_Completion" AS completion
        WHERE completion.egcs_cn_entitytype = 'fundingcaseagreementcommitment'
          AND completion.egcs_cn_entityid = "Funding_Case_Agreement_Commitment".id
          AND completion._deleted = FALSE
      )
      OR (
        "Funding_Case_Agreement_Commitment".egcs_fc_active = TRUE
        AND (
          SELECT routing_item.egcs_cn_state
          FROM "Common_Routing_Slip" AS routing_slip
          JOIN "Common_Runtime_Item" AS routing_item
            ON routing_item.id = routing_slip.egcs_cn_runtimeitem
          WHERE routing_slip.egcs_cn_entitytype = 'fundingcaseagreementcommitment'
            AND routing_slip.egcs_cn_entityid = "Funding_Case_Agreement_Commitment".id
            AND routing_slip._deleted = FALSE
            AND routing_item._deleted = FALSE
          ORDER BY routing_slip.id DESC LIMIT 1
        ) = 'approved'
      )
    )`)
    .where('Funding_Case_Agreement_Commitment._deleted', '=', false)
    .where('Transfer_Payment_Stream_Commitment_Type._deleted', '=', false)

  if (search) {
    baseQuery = baseQuery.where(sql<boolean>`(
      ${sql.ref('Transfer_Payment_Stream_Commitment_Type.egcs_tp_name_en')} ILIKE ${`%${escapeLikePattern(search)}%`}
      OR ${sql.ref('Transfer_Payment_Stream_Commitment_Type.egcs_tp_name_fr')} ILIKE ${`%${escapeLikePattern(search)}%`}
      OR ${sql.ref('Funding_Case_Agreement_Commitment.id')}::text ILIKE ${`%${escapeLikePattern(search)}%`}
      OR ${sql.ref('Funding_Case_Agreement_Commitment.egcs_fc_financialsystemnumber')}::text ILIKE ${`%${escapeLikePattern(search)}%`}
    )`)
  }

  const [items, countResult] = await Promise.all([
    baseQuery
      .select([
        'Funding_Case_Agreement_Commitment.id as commitment_id',
        'Funding_Case_Agreement_Commitment.egcs_fc_type as id',
        'Transfer_Payment_Stream_Commitment_Type.egcs_tp_name_en as label_en',
        'Transfer_Payment_Stream_Commitment_Type.egcs_tp_name_fr as label_fr'
      ])
      .orderBy('Funding_Case_Agreement_Commitment.egcs_fc_type', 'asc')
      .orderBy('Funding_Case_Agreement_Commitment.id', 'asc')
      .limit(limit)
      .offset(offset)
      .execute(),
    baseQuery
      .select(eb => eb.fn.count('Funding_Case_Agreement_Commitment.id').as('total'))
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
