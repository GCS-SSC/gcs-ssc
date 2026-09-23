import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { prepareAgreementCommitmentRoute } from '~~/server/utils/agreement-commitment'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { PaginationSchema } from '~~/shared/types/schemas/common'
import { z } from 'zod'

const QuerySchema = PaginationSchema.extend({
  commitmentId: z.union([z.string().min(1), z.number()]).transform(String).optional(),
  permission_action: z.enum(['create', 'update']).default('create')
}).superRefine((query, ctx) => {
  if (query.permission_action === 'update' && !query.commitmentId) {
    ctx.addIssue({ code: 'custom', path: ['commitmentId'], message: 'validation.required' })
  }
})

export default defineEventHandler(async event => {
  const { page, limit, search, commitmentId, permission_action } = await getValidatedQueryI18n(event, QuerySchema)
  const assignmentTarget = commitmentId
    ? { entityType: 'fundingcaseagreementcommitment' as const, entityId: commitmentId }
    : undefined
  const prepared = await prepareAgreementCommitmentRoute(event, permission_action, assignmentTarget)
  if (!prepared || !('agreementContext' in prepared)) return prepared
  const { db, agreementContext } = prepared
  const offset = (page - 1) * limit
  let query = db.selectFrom('Transfer_Payment_Stream_Commitment_Type')
    .innerJoin('Agency_Commitment_Type', 'Agency_Commitment_Type.id', 'Transfer_Payment_Stream_Commitment_Type.egcs_tp_agencycommitmenttype')
    .where('Transfer_Payment_Stream_Commitment_Type.egcs_tp_transferpaymentstream', '=', agreementContext.streamId)
    .where('Transfer_Payment_Stream_Commitment_Type._deleted', '=', false)
    .where('Agency_Commitment_Type._deleted', '=', false)
  if (search) {
    const pattern = `%${escapeLikePattern(search)}%`
    query = query.where(eb => eb.or([
      eb('Agency_Commitment_Type.egcs_ay_name_en', 'ilike', pattern),
      eb('Agency_Commitment_Type.egcs_ay_name_fr', 'ilike', pattern)
    ]))
  }
  const [items, count] = await Promise.all([
    query.select(['Transfer_Payment_Stream_Commitment_Type.id as id', 'Agency_Commitment_Type.egcs_ay_name_en as label_en', 'Agency_Commitment_Type.egcs_ay_name_fr as label_fr'])
      .orderBy('Agency_Commitment_Type.egcs_ay_name_en').limit(limit).offset(offset).execute(),
    query.select(eb => eb.fn.count('Transfer_Payment_Stream_Commitment_Type.id').as('total')).executeTakeFirst()
  ])
  const total = Number(count?.total ?? 0)
  return { items, total, stats: { total, active: total }, page, limit }
})
