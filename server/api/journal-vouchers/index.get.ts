import { sql } from 'kysely'
import { requireAuthContext } from '~~/server/utils/authorize'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { PaginationSchema, PositivePostgresBigintIdSchema } from '~~/shared/types/schemas'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { withBusinessRecordState } from '~~/server/utils/business-record-state'

const QuerySchema = PaginationSchema.extend({ egcs_fc_fundingagreement: PositivePostgresBigintIdSchema.optional() })

export default defineEventHandler(async event => {
  const auth = await requireAuthContext(event)
  const { page, limit, search, egcs_fc_fundingagreement: agreementId } = await getValidatedQueryI18n(event, QuerySchema)
  const grants = auth.userAbilities.getGrants().filter(grant => grant.subject === 'journal_voucher' && grant.action === 'read')
  if (!grants.length) return { items: [], total: 0, page, limit }
  let query = event.context.$db.selectFrom('Funding_Case_Agreement_Journal_Voucher as jv')
    .innerJoin('Funding_Case_Agreement_Profile as a', 'a.id', 'jv.egcs_fc_fundingagreement')
    .innerJoin('Transfer_Payment_Stream as s', 's.id', 'a.egcs_fc_transferpaymentstream')
    .innerJoin('Transfer_Payment_Profile as p', 'p.id', 's.egcs_tp_transferpaymentprofile')
    .where('jv._deleted', '=', false).where('a._deleted', '=', false).where('s._deleted', '=', false).where('p._deleted', '=', false)
  if (!grants.some(grant => grant.scope.type === 'global')) {
    query = query.where(eb => eb.or(grants.flatMap(grant => {
      if (grant.scope.type === 'agency') return [eb('p.egcs_tp_agency', '=', grant.scope.agencyId)]
      if (grant.scope.type === 'program') return [eb.and([eb('p.egcs_tp_agency', '=', grant.scope.agencyId), eb('p.id', '=', grant.scope.transferPaymentId)])]
      return []
    })))
  }
  if (agreementId) query = query.where('jv.egcs_fc_fundingagreement', '=', agreementId)
  if (search) query = query.where(eb => eb.or([eb('jv.egcs_fc_agreementnumber', 'ilike', `%${escapeLikePattern(search)}%`), sql<boolean>`jv.egcs_fc_number::text ILIKE ${`%${escapeLikePattern(search)}%`}`]))
  const items = await query.selectAll('jv').orderBy('jv.id', 'desc').limit(limit).offset((page - 1) * limit).execute()
  const count = await query.select(sql<string>`count(*)::text`.as('total')).executeTakeFirstOrThrow()
  return { items: await withBusinessRecordState(event.context.$db, 'fundingcasejournalvoucher', items), total: Number(count.total), page, limit }
})
