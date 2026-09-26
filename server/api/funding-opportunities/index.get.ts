import { requireAuthContext } from '~~/server/utils/authorize'
import { PaginationSchema } from '~~/shared/types/schemas'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { sql } from 'kysely'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const auth = await requireAuthContext(event)
  const { page, limit, search } = await getValidatedQueryI18n(event, PaginationSchema)
  const readGrants = auth.userAbilities.getGrants()
    .filter(grant => grant.subject === 'transfer_payment' && grant.action === 'read')
  if (readGrants.length === 0) {
    return { items: [], total: 0, stats: { total: 0 }, page, limit }
  }
  const hasGlobalRead = readGrants.some(grant => grant.scope.type === 'global')
  const agencyIds = readGrants.flatMap(grant => grant.scope.type === 'agency' ? [grant.scope.agencyId] : [])
  const programScopes = readGrants.flatMap(grant => grant.scope.type === 'program' ? [grant.scope] : [])
  let query = db.selectFrom('Funding_Opportunity_Profile')
    .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Funding_Opportunity_Profile.egcs_fo_transferpaymentstream')
    .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
    .where('Funding_Opportunity_Profile._deleted', '=', false)
    .where('Transfer_Payment_Stream._deleted', '=', false)
    .where('Transfer_Payment_Profile._deleted', '=', false)
  if (!hasGlobalRead) {
    query = query.where(eb => eb.or([
      ...(agencyIds.length ? [eb('Transfer_Payment_Profile.egcs_tp_agency', 'in', agencyIds)] : []),
      ...programScopes.map(scope => eb.and([
        eb('Transfer_Payment_Profile.egcs_tp_agency', '=', scope.agencyId),
        eb('Transfer_Payment_Profile.id', '=', scope.transferPaymentId)
      ]))
    ]))
  }
  if (search) {
    const pattern = `%${escapeLikePattern(search)}%`
    query = query.where(eb => eb.or([
      eb('Funding_Opportunity_Profile.egcs_fo_name_en', 'ilike', pattern),
      eb('Funding_Opportunity_Profile.egcs_fo_name_fr', 'ilike', pattern)
    ]))
  }
  const [pageRows, countResult] = await Promise.all([
    query.select([
      'Funding_Opportunity_Profile.id', 'egcs_fo_transferpaymentstream',
      sql<string>`to_char(egcs_fo_datestart, 'YYYY-MM-DD')`.as('egcs_fo_datestart'),
      sql<string>`to_char(egcs_fo_dateend, 'YYYY-MM-DD')`.as('egcs_fo_dateend'),
      'egcs_fo_name_en', 'egcs_fo_name_fr', 'egcs_fo_objective_en', 'egcs_fo_objective_fr',
      'egcs_fo_applicationschema', 'egcs_fo_status', 'Funding_Opportunity_Profile._deleted'
    ])
      .orderBy('Funding_Opportunity_Profile.id', 'desc')
      .limit(limit).offset((page - 1) * limit).execute(),
    query.select(eb => eb.fn.count('Funding_Opportunity_Profile.id').as('total')).executeTakeFirst()
  ])
  const links = pageRows.length
    ? await db.selectFrom('Funding_Opportunity_Stream')
        .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Funding_Opportunity_Stream.egcs_fo_transferpaymentstream')
        .select(['Funding_Opportunity_Stream.egcs_fo_fundingopportunity as opportunity_id', 'Transfer_Payment_Stream.id',
          'Transfer_Payment_Stream.egcs_tp_name_en as name_en', 'Transfer_Payment_Stream.egcs_tp_name_fr as name_fr'])
        .where('Funding_Opportunity_Stream.egcs_fo_fundingopportunity', 'in', pageRows.map(row => String(row.id)))
        .where('Funding_Opportunity_Stream._deleted', '=', false).execute()
    : []
  return {
    items: pageRows.map(row => {
      const streams = links.filter(link => String(link.opportunity_id) === String(row.id))
        .map(link => ({ id: String(link.id), name_en: link.name_en, name_fr: link.name_fr }))
        .sort((a, b) => a.id === String(row.egcs_fo_transferpaymentstream)
          ? -1
          : b.id === String(row.egcs_fo_transferpaymentstream)
            ? 1
            : a.id.localeCompare(b.id, undefined, { numeric: true }))
      return { ...row, egcs_fo_transferpaymentstreams: streams.map(stream => stream.id), streams }
    }),
    total: Number(countResult?.total || 0), stats: { total: Number(countResult?.total || 0) }, page, limit
  }
})
