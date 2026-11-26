/* eslint-disable jsdoc/require-jsdoc -- Submission attribution is checked against the active Agreement relationship. */
import { expressionBuilder, sql, type Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

const expressions = expressionBuilder<never>()
// ECMAScript WhiteSpace and LineTerminator characters used by String.prototype.trim().
const trimCharacters = '\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff'

export const submittingProponentDisplayName = (table: string, locale: 'en' | 'fr') => {
  const trimmed = expressions.fn<string | null>('pg_catalog.btrim', [
    sql.ref(`${table}.egcs_ar_operatingname_${locale}`),
    expressions.val(trimCharacters)
  ])
  return expressions.fn<string>('coalesce', [
    expressions.fn<string | null>('nullif', [trimmed, expressions.val('')]),
    sql.ref(`${table}.egcs_ar_legalname_${locale}`),
    expressions.val('')
  ])
}

export const isAgreementSubmittingProponentAvailable = async (db: Kysely<Database>, agreementId: string, proponentId: string) => {
  if (!isPositivePostgresBigintText(proponentId)) return false
  const link = await db.selectFrom('Funding_Case_Agreement_Applicant_Recipient as link')
    .innerJoin('Applicant_Recipient_Profile as profile', 'profile.id', 'link.egcs_fc_applicantrecipient')
    .select('profile.id').where('link.egcs_fc_fundingagreement', '=', agreementId)
    .where('link.egcs_fc_applicantrecipient', '=', proponentId).where('link._deleted', '=', false)
    .where('profile._deleted', '=', false).where('profile.egcs_ar_active', '=', true)
    .forShare('link').forShare('profile').executeTakeFirst()
  return Boolean(link)
}
