/* eslint-disable jsdoc/require-jsdoc -- transaction-bound assessment helper snapshot */
import { sql, type Transaction } from 'kysely'
import type { Database, Entity_Type, JsonValue } from '~~/shared/types/database'
import { getAssessmentHelperDefinition, referencedAssessmentHelperFields } from '~~/shared/utils/assessment-helpers'
import { averageAnnualAgreementValue } from '~~/shared/utils/assessment-helper-values'
import { isAssignableEntityType } from '~~/shared/utils/entity-assignments'
import { sumMoney } from '~~/shared/utils/money'
import { databaseMoneyText, parseDatabaseMoney } from './database-money'
import { resolveEntityAssignmentOwner } from './entity-assignment'

export const captureAssessmentHelpers = async (
  db: Transaction<Database>,
  input: { entityType: Entity_Type, entityId: string, assessmentSchema: JsonValue }
): Promise<Record<string, JsonValue> | null> => {
  const fields = referencedAssessmentHelperFields(input.assessmentSchema)
    .filter(field => {
      const definition = getAssessmentHelperDefinition(input.entityType, field)
      return definition && !definition.retired
    })
  if (!fields.length) return null
  let values: Record<string, JsonValue>
  if (input.entityType === 'applicantrecipient') {
    const profile = await db.selectFrom('Applicant_Recipient_Profile').select([
      'id', 'egcs_ar_leadagency', 'egcs_ar_legalname_en', 'egcs_ar_legalname_fr',
      'egcs_ar_researchorganization_en', 'egcs_ar_researchorganization_fr', 'egcs_ar_active'
    ]).where('id', '=', input.entityId).where('_deleted', '=', false).forShare().executeTakeFirstOrThrow()
    values = {
      id: String(profile.id), egcs_ar_leadagency: profile.egcs_ar_leadagency ?? null,
      egcs_ar_legalname_en: profile.egcs_ar_legalname_en ?? null, egcs_ar_legalname_fr: profile.egcs_ar_legalname_fr ?? null,
      egcs_ar_researchorganization_en: profile.egcs_ar_researchorganization_en ?? null,
      egcs_ar_researchorganization_fr: profile.egcs_ar_researchorganization_fr ?? null, egcs_ar_active: profile.egcs_ar_active
    }
  } else {
    const owner = isAssignableEntityType(input.entityType)
      ? await resolveEntityAssignmentOwner(db, input.entityType, input.entityId)
      : null
    if (owner?.kind !== 'agreement') throw new Error('Assessment helpers require an owning Agreement')
    const agreement = await db.selectFrom('Funding_Case_Agreement_Profile').select([
      'egcs_fc_agreementsubtype', 'egcs_fc_furtherdistribution', 'egcs_fc_agreementtype', 'egcs_fc_currency',
      sql<string>`egcs_fc_authorizedassistancestartdate::text`.as('startDate'),
      sql<string>`egcs_fc_authorizedassistanceenddate::text`.as('endDate')
    ]).where('id', '=', owner.agreementId).where('_deleted', '=', false).forShare().executeTakeFirstOrThrow()
    values = {
      egcs_fc_agreementsubtype: agreement.egcs_fc_agreementsubtype,
      egcs_fc_furtherdistribution: agreement.egcs_fc_furtherdistribution,
      egcs_fc_agreementtype: agreement.egcs_fc_agreementtype,
      egcs_fc_currency: agreement.egcs_fc_currency
    }
    if (fields.some(field => field === 'egcs_fc_applicantrecipientsubtypes' || field === 'egcs_fc_recipientcount')) {
      const recipients = await db.selectFrom('Funding_Case_Agreement_Applicant_Recipient as link')
        .innerJoin('Applicant_Recipient_Profile as proponent', 'proponent.id', 'link.egcs_fc_applicantrecipient')
        .select('link.egcs_fc_applicantrecipientsubtype as subtypeId')
        .where('link.egcs_fc_fundingagreement', '=', owner.agreementId)
        .where('link._deleted', '=', false).where('proponent._deleted', '=', false)
        .orderBy('proponent.id').orderBy('link.id').forShare(['proponent']).execute()
      values.egcs_fc_applicantrecipientsubtypes = [...new Set(recipients.flatMap(row => row.subtypeId === null ? [] : [String(row.subtypeId)]))]
      values.egcs_fc_recipientcount = recipients.length
    }
    if (fields.some(field => field === 'egcs_fc_agreementvalue' || field === 'egcs_fc_averageannualvalue')) {
      const lines = await db.selectFrom('Funding_Case_Agreement_Budget_Line_Item as line')
        .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year as year', 'year.id', 'line.egcs_fc_fundingagreementbudgetfiscalyear')
        .innerJoin('Funding_Case_Agreement_Budget_Version as version', 'version.id', 'year.egcs_fc_budgetversion')
        .innerJoin('Agency_Fiscal_Year as fiscal', 'fiscal.id', 'year.egcs_fc_fiscalyear')
        .select(databaseMoneyText(sql.ref('line.egcs_fc_programfunding')).as('amount'))
        .where('year.egcs_fc_fundingagreement', '=', owner.agreementId)
        .where('line.egcs_fc_currency', '=', agreement.egcs_fc_currency)
        .where('line.egcs_fc_pendingfunding', '=', false)
        .where('line._deleted', '=', false).where('year._deleted', '=', false).where('version._deleted', '=', false).where('fiscal._deleted', '=', false)
        .where('version.egcs_fc_iscurrent', '=', true).execute()
      const total = sumMoney(lines.map(line => parseDatabaseMoney(line.amount, agreement.egcs_fc_currency)), agreement.egcs_fc_currency)
      values.egcs_fc_agreementvalue = { amount: total.amount, currency: total.currency }
      if (fields.includes('egcs_fc_averageannualvalue')) {
        const fiscalYears = await db.selectFrom('Agency_Fiscal_Year').select([
          sql<string>`egcs_ay_startdate::text`.as('startDate'),
          sql<string>`egcs_ay_enddate::text`.as('endDate')
        ]).where('egcs_ay_organizationagency', '=', owner.agencyId).where('_deleted', '=', false)
          .where('egcs_ay_startdate', '<=', sql<Date>`${agreement.endDate}::date`)
          .where('egcs_ay_enddate', '>=', sql<Date>`${agreement.startDate}::date`).forShare().execute()
        const average = averageAnnualAgreementValue(total, agreement.startDate, agreement.endDate, fiscalYears)
        if (average) values.egcs_fc_averageannualvalue = { amount: average.amount, currency: average.currency }
      }
    }
  }
  return Object.fromEntries(fields.flatMap(field => values[field] === undefined ? [] : [[field, values[field]]]))
}
