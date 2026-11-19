import type { Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { PublishedAgencyClauseSchema } from '~~/shared/types/schemas/agency-clause'

/**
 * Resolves the latest eligible versions for the Agreement's Stream.
 * @param db Database or transaction used by the caller.
 * @param streamId Current Stream identity.
 * @param agencyId Current owning Agency identity.
 * @returns Query over active, linked and published Clauses.
 */
export const eligibleAgreementClauses = (db: Kysely<Database>, streamId: string, agencyId: string) => db
  .selectFrom('Transfer_Payment_Stream_Clause as link')
  .innerJoin('Agency_Clause as clause', 'clause.id', 'link.egcs_tp_clause')
  .innerJoin('Common_Publication as publication', 'publication.id', 'clause.id')
  .innerJoin('Common_Publication_Version as version', 'version.id', 'publication.egcs_cn_currentversion')
  .where('link.egcs_tp_transferpaymentstream', '=', streamId)
  .where('link._deleted', '=', false)
  .where('clause.egcs_ay_organizationagency', '=', agencyId)
  .where('clause.egcs_ay_active', '=', true)
  .where('clause._deleted', '=', false)
  .where('publication.egcs_cn_state', '=', 'published')
  .where('publication._deleted', '=', false)

/**
 * Builds the Agreement's selected version query independently of current eligibility.
 * @param db Database or transaction used by the caller.
 * @param agreementId Owning Agreement identity.
 * @returns Query over live selections and their immutable versions.
 */
const selectedAgreementClauses = (db: Kysely<Database>, agreementId: string) => db
  .selectFrom('Funding_Case_Agreement_Clause as selection')
  .innerJoin('Common_Publication_Version as pinned', 'pinned.id', 'selection.egcs_fc_publicationversion')
  .where('selection.egcs_fc_fundingagreement', '=', agreementId)
  .where('selection._deleted', '=', false)

/**
 * Reads a pinned publication and orders its wording for rendering.
 * @param row Pinned version identity and definition.
 * @param row.versionId Immutable publication version ID.
 * @param row.definition Stored definition to validate.
 * @returns Bilingual clause evidence in ascending display order.
 */
const selectClauseEvidence = (row: { versionId: string; definition: unknown }) => {
  const { code, nameEn, nameFr, rows } = PublishedAgencyClauseSchema.parse(row.definition)
  return {
    code,
    nameEn,
    nameFr,
    rows: [...rows].sort((left, right) => left.displayOrder - right.displayOrder),
    versionId: row.versionId
  }
}

/**
 * Reads the immutable Clause versions selected on an Agreement.
 * @param db Database or transaction used by the caller.
 * @param agreementId Owning Agreement identity.
 * @returns Pinned bilingual wording for documents and evidence.
 */
export const readAgreementSelectedClauses = async (db: Kysely<Database>, agreementId: string) => {
  const rows = await selectedAgreementClauses(db, agreementId)
    .select(['pinned.id as versionId', 'pinned.egcs_cn_definition as definition'])
    .orderBy('selection.id')
    .execute()
  return rows.map(selectClauseEvidence)
}

/**
 * Lists selections and compares each pin to its publication's latest version.
 * @param db Database or transaction used by the caller.
 * @param agreementId Owning Agreement identity.
 * @param streamId Current Stream identity.
 * @param agencyId Current owning Agency identity.
 * @returns Saved wording and current update availability.
 */
export const listAgreementClauseSelections = async (db: Kysely<Database>, agreementId: string, streamId: string, agencyId: string) => {
  const eligible = eligibleAgreementClauses(db, streamId, agencyId)
    .select(['clause.id as clauseId', 'version.id as eligibleVersion'])
    .as('eligible')
  const rows = await selectedAgreementClauses(db, agreementId)
    .innerJoin('Common_Publication as publication', 'publication.id', 'selection.egcs_fc_clause')
    .leftJoin('Common_Publication_Version as current', 'current.id', 'publication.egcs_cn_currentversion')
    .leftJoin(eligible, 'eligible.clauseId', 'selection.egcs_fc_clause')
    .select([
      'selection.id', 'selection.egcs_fc_clause', 'pinned.id as versionId', 'pinned.egcs_cn_definition as definition',
      'pinned.egcs_cn_version as pinnedVersion', 'current.egcs_cn_version as currentVersion', 'eligible.eligibleVersion'
    ])
    .orderBy('selection.id')
    .execute()
  return rows.map(row => {
    const { code, nameEn, nameFr, rows: texts } = selectClauseEvidence(row)
    const outOfDate = row.currentVersion !== null && row.currentVersion > row.pinnedVersion
    return {
      id: row.id,
      egcs_fc_clause: row.egcs_fc_clause,
      code,
      nameEn,
      nameFr,
      texts,
      outOfDate,
      canUpgrade: outOfDate && row.eligibleVersion !== null
    }
  })
}
