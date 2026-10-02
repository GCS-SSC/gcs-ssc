import { sql } from 'kysely'
import { authorizeCorrectionAgreement } from '~~/server/utils/correction'
import { requireAgreementPaymentSourceListRead } from '~~/server/utils/agreement-payment-source'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { PaginationSchema } from '~~/shared/types/schemas'
import { escapeLikePattern } from '~~/server/utils/sql-like'

export default defineEventHandler(async event => {
  const agreementId = getRouterParam(event, 'id') ?? ''
  await authorizeCorrectionAgreement(event, agreementId, 'create')
  await requireAgreementPaymentSourceListRead(event, event.context.$db, agreementId)
  const { page, limit, search } = await getValidatedQueryI18n(event, PaginationSchema)
  let query = event.context.$db.selectFrom('Funding_Case_Agreement_Commitment as commitment')
    .innerJoin('Transfer_Payment_Stream_Commitment_Type as type', 'type.id', 'commitment.egcs_fc_type')
    .innerJoin('Agency_Commitment_Type as agencyType', 'agencyType.id', 'type.egcs_tp_agencycommitmenttype')
    .where('commitment.egcs_fc_fundingagreement', '=', agreementId).where('commitment.egcs_fc_active', '=', true)
    .where('commitment._deleted', '=', false)
  if (search) query = query.where(eb => eb.or([eb('agencyType.egcs_ay_name_en', 'ilike', `%${escapeLikePattern(search)}%`),
    eb('agencyType.egcs_ay_name_fr', 'ilike', `%${escapeLikePattern(search)}%`), sql<boolean>`commitment.id::text ILIKE ${`%${escapeLikePattern(search)}%`}`]))
  const rows = await query.select(['commitment.id', 'agencyType.egcs_ay_name_en', 'agencyType.egcs_ay_name_fr'])
    .orderBy('commitment.id', 'desc').limit(limit).offset((page - 1) * limit).execute()
  const count = await query.select(sql<string>`count(*)::text`.as('total')).executeTakeFirstOrThrow()
  return { items: rows.map(row => ({ id: String(row.id), label_en: `${row.egcs_ay_name_en} · ${row.id}`,
    label_fr: `${row.egcs_ay_name_fr} · ${row.id}` })), total: Number(count.total), page, limit }
})
