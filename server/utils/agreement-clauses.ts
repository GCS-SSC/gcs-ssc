import type { Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { PublishedAgencyClauseSchema } from '~~/shared/types/schemas/agency-clause'
import { readAssessmentClauseOutcomes } from './assessment-clause-outcomes'
import { readPublishedReviewSchema } from '~~/server/utils/review-schema-versioning'

/**
 * Finds current published versions of active Clauses owned by an Agency.
 * @param db Database or transaction used by the caller.
 * @param agencyId Owning Agency identity.
 * @returns Query over same-Agency Clause versions.
 */
export const publishedAgencyClauses = (db: Kysely<Database>, agencyId: string) => db
  .selectFrom('Agency_Clause as clause')
  .innerJoin('Common_Publication as publication', 'publication.id', 'clause.id')
  .innerJoin('Common_Publication_Version as version', 'version.id', 'publication.egcs_cn_currentversion')
  .where('clause.egcs_ay_organizationagency', '=', agencyId)
  .where('clause.egcs_ay_active', '=', true)
  .where('clause._deleted', '=', false)
  .where('publication.egcs_cn_state', '=', 'published')
  .where('publication._deleted', '=', false)

/**
 * Resolves the latest eligible versions for the Agreement's Stream.
 * @param db Database or transaction used by the caller.
 * @param streamId Current Stream identity.
 * @param agencyId Current owning Agency identity.
 * @returns Query over active, linked and published Clauses.
 */
export const eligibleAgreementClauses = (db: Kysely<Database>, streamId: string, agencyId: string) =>
  publishedAgencyClauses(db, agencyId)
    .where(eb => eb.exists(eb.selectFrom('Transfer_Payment_Stream_Clause as link')
      .select('link.id')
      .whereRef('link.egcs_tp_clause', '=', 'clause.id')
      .where('link.egcs_tp_transferpaymentstream', '=', streamId)
      .where('link._deleted', '=', false)))

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
  const published = publishedAgencyClauses(db, agencyId).select('clause.id').as('published')
  const eligible = eligibleAgreementClauses(db, streamId, agencyId).select('clause.id').as('eligible')
  const selections = selectedAgreementClauses(db, agreementId)
  const rows = await selections
    .innerJoin('Common_Publication as publication', 'publication.id', 'selection.egcs_fc_clause')
    .leftJoin('Common_Publication_Version as current', 'current.id', 'publication.egcs_cn_currentversion')
    .leftJoin(published, 'published.id', 'selection.egcs_fc_clause')
    .leftJoin(eligible, 'eligible.id', 'selection.egcs_fc_clause')
    .select([
      'selection.id', 'selection.egcs_fc_clause', 'selection.egcs_fc_protected',
      'pinned.id as versionId', 'pinned.egcs_cn_definition as definition',
      'pinned.egcs_cn_version as pinnedVersion', 'current.egcs_cn_version as currentVersion',
      'eligible.id as streamEligible', 'published.id as agencyEligible'
    ])
    .orderBy('selection.id')
    .execute()
  const sources = rows.length === 0
    ? []
    : await selections
        .innerJoin('Funding_Case_Agreement_Clause_Review as application', 'application.egcs_fc_selection', 'selection.id')
        .innerJoin('Common_Review as review', 'review.id', 'application.egcs_fc_review')
        .innerJoin('Common_Runtime_Item as item', 'item.id', 'review.egcs_cn_runtimeitem')
        .innerJoin('Common_Publication_Version as schema', 'schema.id', 'item.egcs_cn_publicationversion')
        .where('application._deleted', '=', false)
        .select([
          'selection.id as selectionId', 'application.id as applicationId', 'review.id as reviewId', 'schema.id as reviewVersionId',
          'schema.egcs_cn_definition as reviewDefinition', 'application.egcs_fc_result as result',
          'application.egcs_fc_outcome as outcomeId', 'application.egcs_fc_strategy as strategyValue'
        ])
        .orderBy('application.id')
        .execute()
  const sourcesBySelection = Map.groupBy(sources, source => source.selectionId)
  return rows.map(row => {
    const { code, nameEn, nameFr, rows: texts } = selectClauseEvidence(row)
    const outOfDate = row.currentVersion !== null && row.currentVersion > row.pinnedVersion
    const reviewSources = (sourcesBySelection.get(row.id) ?? []).map(({ reviewDefinition, applicationId, reviewId, reviewVersionId, result, outcomeId, strategyValue }) => {
      const definition = readPublishedReviewSchema(reviewDefinition)
      if (!definition) throw new Error('Clause application references an invalid Review Schema version')
      const outcome = outcomeId === null ? undefined : readAssessmentClauseOutcomes(reviewDefinition).find(item => item.id === outcomeId)
      return {
        applicationId, reviewId, reviewVersionId, name: definition.name, result,
        outcome: outcome ? { en: outcome.label_en, fr: outcome.label_fr } : null,
        strategy: outcome?.strategies.find(item => item.value === strategyValue)?.label ?? null
      }
    })
    return {
      id: row.id,
      egcs_fc_clause: row.egcs_fc_clause,
      code,
      nameEn,
      nameFr,
      texts,
      protected: row.egcs_fc_protected,
      reviewSources,
      outOfDate,
      canUpgrade: outOfDate && (row.streamEligible !== null || (reviewSources.length > 0 && row.agencyEligible !== null))
    }
  })
}
