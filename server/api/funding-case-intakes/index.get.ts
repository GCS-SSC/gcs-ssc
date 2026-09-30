import { requireAuthContext } from '~~/server/utils/authorize'
import { PaginationSchema, PositivePostgresBigintIdSchema } from '~~/shared/types/schemas'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { sql } from 'kysely'

const querySchema = PaginationSchema.extend({ egcs_fi_fundingopportunity: PositivePostgresBigintIdSchema.optional() })

export default defineEventHandler(async event => {
  const auth = await requireAuthContext(event)
  const { page, limit, search, egcs_fi_fundingopportunity: opportunityId } = await getValidatedQueryI18n(event, querySchema)
  const readGrants = auth.userAbilities.getGrants()
    .filter(grant => grant.subject === 'funding_case' && grant.action === 'read')
  if (readGrants.length === 0) {
    return { items: [], total: 0, stats: { total: 0 }, page, limit }
  }
  const hasGlobalRead = readGrants.some(grant => grant.scope.type === 'global')
  const agencyIds = readGrants.flatMap(grant => grant.scope.type === 'agency' ? [grant.scope.agencyId] : [])
  const programScopes = readGrants.flatMap(grant => grant.scope.type === 'program' ? [grant.scope] : [])
  let query = event.context.$db.selectFrom('Funding_Case_Intake_Profile')
    .innerJoin('Funding_Opportunity_Profile', 'Funding_Opportunity_Profile.id', 'Funding_Case_Intake_Profile.egcs_fi_fundingopportunity')
    .innerJoin('Applicant_Recipient_Profile', 'Applicant_Recipient_Profile.id', 'Funding_Case_Intake_Profile.egcs_fi_applicantrecipient')
    .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Funding_Opportunity_Profile.egcs_fo_transferpaymentstream')
    .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
    .where('Funding_Case_Intake_Profile._deleted', '=', false)
    .where('Funding_Opportunity_Profile._deleted', '=', false)
    .where('Applicant_Recipient_Profile._deleted', '=', false)
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
  if (opportunityId) query = query.where('Funding_Case_Intake_Profile.egcs_fi_fundingopportunity', '=', String(opportunityId))
  if (search) {
    const pattern = `%${escapeLikePattern(search)}%`
    query = query.where(eb => eb.or([
      eb(sql<string>`CAST(${sql.ref('Funding_Case_Intake_Profile.id')} AS TEXT)`, 'like', pattern),
      eb(sql<string>`CAST(${sql.ref('Funding_Case_Intake_Profile.egcs_fi_applicationid')} AS TEXT)`, 'like', pattern),
      eb('Funding_Case_Intake_Profile.egcs_fi_externalsourceid', 'ilike', pattern)
    ]))
  }
  const [items, countResult] = await Promise.all([
    query.select([
      'Funding_Case_Intake_Profile.id', 'egcs_fi_applicationid', 'egcs_fi_externalsourceid', 'egcs_fi_fundingopportunity',
      'egcs_fi_applicantrecipient', 'egcs_fi_status',
      'Funding_Opportunity_Profile.egcs_fo_name_en as opportunity_name_en',
      'Funding_Opportunity_Profile.egcs_fo_name_fr as opportunity_name_fr',
      'Applicant_Recipient_Profile.egcs_ar_legalname_en as proponent_name_en',
      'Applicant_Recipient_Profile.egcs_ar_legalname_fr as proponent_name_fr'
    ])
      .orderBy('Funding_Case_Intake_Profile.id', 'desc')
      .limit(limit).offset((page - 1) * limit).execute(),
    query.select(eb => eb.fn.count('Funding_Case_Intake_Profile.id').as('total')).executeTakeFirst()
  ])
  const total = Number(countResult?.total || 0)
  return {
    items,
    total, stats: { total }, page, limit
  }
})
