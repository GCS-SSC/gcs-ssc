import { sql } from 'kysely'
import { requireAuthContext } from '~~/server/utils/authorize'
import { databaseMoneyText, parseDatabaseMoney } from '~~/server/utils/database-money'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { PaginationSchema } from '~~/shared/types/schemas'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { journalVoucherPaymentIsFinal } from '~~/server/utils/journal-voucher-source'

export default defineEventHandler(async event => {
  const auth = await requireAuthContext(event)
  const { page, limit, search } = await getValidatedQueryI18n(event, PaginationSchema)
  const read = auth.userAbilities.getGrants().filter(grant => grant.subject === 'agreement' && grant.action === 'read')
  const create = auth.userAbilities.getGrants().filter(grant => grant.subject === 'journal_voucher' && grant.action === 'create')
  if (!read.length || !create.length) return { items: [], total: 0, page, limit }
  let query = event.context.$db.selectFrom('Funding_Case_Agreement_Payment as payment')
    .innerJoin('Funding_Case_Agreement_Profile as a', 'a.id', 'payment.egcs_fc_fundingagreement')
    .innerJoin('Transfer_Payment_Stream as s', 's.id', 'a.egcs_fc_transferpaymentstream')
    .innerJoin('Transfer_Payment_Profile as p', 'p.id', 's.egcs_tp_transferpaymentprofile')
    .innerJoin('Common_Status as status', 'status.id', 'payment.egcs_fc_status')
    .where('payment._deleted', '=', false).where('a._deleted', '=', false).where('s._deleted', '=', false).where('p._deleted', '=', false)
    .where('status._deleted', '=', false).where('status.egcs_cn_terminal', '=', true)
    .where(journalVoucherPaymentIsFinal('payment'))
  for (const grants of [read, create]) {
    if (!grants.some(grant => grant.scope.type === 'global')) {
      query = query.where(eb => eb.or(grants.flatMap(grant => {
        if (grant.scope.type === 'agency') return [eb('p.egcs_tp_agency', '=', grant.scope.agencyId)]
        if (grant.scope.type === 'program') return [eb.and([eb('p.egcs_tp_agency', '=', grant.scope.agencyId), eb('p.id', '=', grant.scope.transferPaymentId)])]
        return []
      })))
    }
  }
  if (search) query = query.where('a.egcs_fc_agreementnumber', 'ilike', `%${escapeLikePattern(search)}%`)
  const rows = await query.select(['payment.id', 'a.egcs_fc_agreementnumber', 'payment.egcs_fc_currency', databaseMoneyText(sql.ref('payment.egcs_fc_paymentamount')).as('egcs_fc_amount')])
    .orderBy('payment.id', 'desc').limit(limit).offset((page - 1) * limit).execute()
  const count = await query.select(sql<string>`count(*)::text`.as('total')).executeTakeFirstOrThrow()
  return { items: rows.map(row => ({ ...row, egcs_fc_amount: parseDatabaseMoney(row.egcs_fc_amount),
    label_en: `${row.egcs_fc_agreementnumber} · ${row.id} · ${row.egcs_fc_amount} ${row.egcs_fc_currency.toUpperCase()}`,
    label_fr: `${row.egcs_fc_agreementnumber} · ${row.id} · ${row.egcs_fc_amount} ${row.egcs_fc_currency.toUpperCase()}` })), total: Number(count.total), page, limit }
})
