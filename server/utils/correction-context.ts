import type { Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { resolveAgreementScopeContext } from './agreement'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

/**
 * Resolves Correction ownership without granting parent or source access.
 * @param db Current database or transaction.
 * @param correctionId Exact Correction identity.
 * @returns Correction ownership context, or null when unavailable.
 */
export const resolveCorrectionRuntimeContext = async (db: Kysely<Database>, correctionId: string) => {
  if (!isPositivePostgresBigintText(correctionId)) return null
  const correction = await db.selectFrom('Funding_Case_Agreement_Correction')
    .select(['egcs_fc_fundingagreement', 'egcs_fc_commitment'])
    .where('id', '=', correctionId).where('_deleted', '=', false).executeTakeFirst()
  if (!correction) return null
  const context = await resolveAgreementScopeContext(String(correction.egcs_fc_fundingagreement), db)
  return context ? { ...context, correctionId, commitmentId: String(correction.egcs_fc_commitment) } : null
}
