import { sql, type Kysely, type RawBuilder } from 'kysely'
import type { H3Event } from 'h3'
import type { AuthContext } from './authorize'
import type { AssignableEntityType, Database } from '~~/shared/types/database'
import type { SearchResult } from '~~/shared/types/search'
import { ASSIGNABLE_ENTITY_TYPE_ENUM, WORKFLOW_TARGET_ENTITY_TYPE_ENUM } from '~~/shared/constants/enums'
import { ENTITY_AUTHORIZATION_POLICIES, buildAssignedWorkRoute } from '~~/shared/utils/entity-assignments'
import { escapeLikePattern } from './sql-like'
import { buildAssignedWorkOpenPredicate, buildAssignedWorkReadPredicates } from './assigned-work-query'
import {
  buildAssignedWorkAssignmentLineage,
  buildAssignedWorkSearchQualifiedBindings,
  buildAssignedWorkSearchSourceFacts
} from './assigned-work-search-sources'

const PERSONAL_WORK_LIMIT = 5
const SOURCE_CANDIDATE_LIMIT = 25
const RECORD_ROOT_TYPES = ['applicantrecipient', 'fundingcaseagreement', 'fundingcaseintake'] as const
const ASSIGNED_WORK_OWNER_SUBJECTS = new Set<string>([
  ...Object.values(ENTITY_AUTHORIZATION_POLICIES).map(policy => policy.subject).filter(subject => subject !== 'resolved_owner'),
  'agency', 'transfer_payment'
])

export interface AssignedWorkSearchCandidate {
  id: string
  entity_type: AssignableEntityType
  name_en: string
  name_fr: string
  reference: string | null
  status: string
  agreement_id: string | null
  proponent_id: string | null
  stream_id: string | null
  agency_id: string | null
  program_id: string | null
  owner_subject: string
  variant: string | null
  is_primary: boolean
  rank: number
}

/**
 * Builds the bounded assignment-first query for execution and PostgreSQL plan verification.
 * @param options Personal search context.
 * @param options.commonUserId Current active Common User identity.
 * @param options.auth Fresh authorization snapshot supplied by the caller.
 * @param options.search Optional trimmed own-identity text.
 * @returns Bounded candidates and one response truncation probe.
 */
export const buildAssignedWorkSearchCandidates = async (options: {
  commonUserId: string
  auth: AuthContext
  search: string
}): Promise<RawBuilder<AssignedWorkSearchCandidate>> => {
  const { commonUserId, auth } = options
  const search = options.search.trim().toLocaleLowerCase()
  const readGrants = auth.userAbilities.getGrants().filter(grant => grant.action === 'read')
  const authorizationPredicates = buildAssignedWorkReadPredicates(readGrants)
  const permittedSubjects = new Set(readGrants.map(grant => grant.subject))
  const hasRuntimeOwnerRead = readGrants.some(grant => ASSIGNED_WORK_OWNER_SUBJECTS.has(grant.subject))
  const accessibleTypes = Object.entries(ENTITY_AUTHORIZATION_POLICIES)
    .filter(([, policy]) => policy.subject === 'resolved_owner' ? hasRuntimeOwnerRead : permittedSubjects.has(policy.subject))
    .map(([entityType]) => entityType)
  if (authorizationPredicates.length === 0 || accessibleTypes.length === 0) {
    return sql`SELECT NULL::text id, NULL::text entity_type, NULL::text name_en, NULL::text name_fr,
      NULL::text reference, NULL::text status, NULL::text agreement_id, NULL::text proponent_id,
      NULL::text stream_id, NULL::text agency_id, NULL::text program_id, NULL::text owner_subject,
      NULL::text variant, FALSE is_primary, 0 rank WHERE FALSE`
  }
  const normalizedPattern = escapeLikePattern(search)
  const prefix = `${normalizedPattern}%`
  const substring = `%${normalizedPattern}%`
  const broaderMatching = /[\p{L}\p{N}]{3}/u.test(search)
  const numericId = /^\d+$/.test(search) && BigInt(search) <= BigInt('9223372036854775807') ? search : null
  const businessEntityTypes = [...WORKFLOW_TARGET_ENTITY_TYPE_ENUM]
  const typedSources = [...ASSIGNABLE_ENTITY_TYPE_ENUM, 'transferpaymentstream']
  const qualifiedBindings = await buildAssignedWorkSearchQualifiedBindings()
  const namePrefix = broaderMatching
    ? sql`(lower(work.name_en) LIKE ${prefix} ESCAPE '\\' OR lower(work.name_fr) LIKE ${prefix} ESCAPE '\\')`
    : sql`FALSE`
  const nameSubstring = broaderMatching
    ? sql`(lower(work.name_en) LIKE ${substring} ESCAPE '\\' OR lower(work.name_fr) LIKE ${substring} ESCAPE '\\'
      OR lower(work.reference) LIKE ${substring} ESCAPE '\\')`
    : sql`FALSE`
  return sql<AssignedWorkSearchCandidate>`
    WITH RECURSIVE actor_assignments AS MATERIALIZED (
      SELECT assignment.egcs_cn_entityid entity_id, assignment.egcs_cn_entitytype::text entity_type,
        assignment.egcs_cn_isprimary is_primary
      FROM "Common_Entity_Assignment" assignment
      JOIN LATERAL (
        SELECT target.id FROM "Common_Entity" target
        WHERE target.id = assignment.egcs_cn_entityid
          AND target.egcs_cn_entitytype = assignment.egcs_cn_entitytype AND NOT target._deleted OFFSET 0
      ) identity ON TRUE
      WHERE assignment.egcs_cn_user = ${commonUserId}::bigint AND NOT assignment._deleted
        AND assignment.egcs_cn_entitytype::text IN (${sql.join(accessibleTypes)})
        AND (${search === ''} OR assignment.egcs_cn_entitytype::text NOT IN (${sql.join([...RECORD_ROOT_TYPES])}))
    ), assignment_paths AS (
      ${buildAssignedWorkAssignmentLineage()}
    ), needed_identities AS MATERIALIZED (
      SELECT DISTINCT id, entity_type FROM assignment_paths
    ), source_facts AS MATERIALIZED (
      SELECT facts.* FROM (${buildAssignedWorkSearchSourceFacts()}) facts
      JOIN LATERAL (
        SELECT target.id FROM "Common_Entity" target
        WHERE target.id = facts.id AND target.egcs_cn_entitytype = facts.entity_type AND NOT target._deleted OFFSET 0
      ) identity ON TRUE
    ), qualified_bindings AS MATERIALIZED (
      ${qualifiedBindings}
    ), work AS MATERIALIZED (
      SELECT target.id, target.entity_type, target.name_en, target.name_fr, target.reference, target.status,
        COALESCE(target.agreement_id, owner.agreement_id) agreement_id,
        COALESCE(target.proponent_id, owner.proponent_id) proponent_id,
        CASE WHEN owner.entity_type = 'transferpaymentstream' THEN owner.id END stream_id,
        target.variant, assignment.is_primary,
        COALESCE(subject.owner_subject, owner.owner_subject, 'agency') owner_subject,
        CASE WHEN owner.owner_subject = 'applicant_recipient' AND target.entity_type <> 'applicantrecipient'
          THEN COALESCE(binding.agency_id, target.schema_agency)
          ELSE COALESCE(memo.agency_id, owner.agency_id, target.schema_agency) END agency_id,
        CASE WHEN memo.id IS NULL THEN owner.program_id END program_id
      FROM actor_assignments assignment
      JOIN source_facts target ON target.id = assignment.entity_id AND target.entity_type = assignment.entity_type
      LEFT JOIN LATERAL (
        SELECT facts.* FROM (
          SELECT required.* FROM assignment_paths required
          WHERE required.origin_id = assignment.entity_id AND required.origin_type = assignment.entity_type OFFSET 0
        ) path
        JOIN source_facts facts ON facts.id = path.id AND facts.entity_type = path.entity_type
        WHERE path.origin_id = assignment.entity_id AND path.origin_type = assignment.entity_type
          AND facts.entity_type IN ('applicantrecipient', 'fundingcaseagreement', 'fundingcaseintake', 'transferpaymentstream')
        ORDER BY cardinality(path.visited) DESC LIMIT 1
      ) owner ON TRUE
      LEFT JOIN LATERAL (
        SELECT facts.owner_subject FROM (
          SELECT required.* FROM assignment_paths required
          WHERE required.origin_id = assignment.entity_id AND required.origin_type = assignment.entity_type OFFSET 0
        ) path
        JOIN source_facts facts ON facts.id = path.id AND facts.entity_type = path.entity_type
        WHERE path.origin_id = assignment.entity_id AND path.origin_type = assignment.entity_type
          AND facts.owner_subject IN ('correction', 'account_receivable', 'journal_voucher')
        ORDER BY cardinality(path.visited) LIMIT 1
      ) subject ON TRUE
      LEFT JOIN LATERAL (
        SELECT facts.id, facts.agency_id FROM (
          SELECT required.* FROM assignment_paths required
          WHERE required.origin_id = assignment.entity_id AND required.origin_type = assignment.entity_type OFFSET 0
        ) path
        JOIN source_facts facts ON facts.id = path.id AND facts.entity_type = path.entity_type
        WHERE path.origin_id = assignment.entity_id AND path.origin_type = assignment.entity_type
          AND facts.entity_type = 'fundingcaseaccountreceivablecreditmemo' LIMIT 1
      ) memo ON TRUE
      LEFT JOIN LATERAL (
        SELECT qualified.agency_id FROM (
          SELECT required.* FROM assignment_paths required
          WHERE required.origin_id = assignment.entity_id AND required.origin_type = assignment.entity_type OFFSET 0
        ) path
        JOIN qualified_bindings qualified ON qualified.entity_id = path.id AND qualified.entity_type = path.entity_type
        WHERE path.origin_id = assignment.entity_id AND path.origin_type = assignment.entity_type LIMIT 1
      ) binding ON TRUE
      WHERE (memo.id IS NULL OR memo.agency_id = owner.agency_id)
      AND (owner.id IS NOT NULL OR (target.schema_agency IS NOT NULL AND EXISTS (
        SELECT 1 FROM assignment_paths path
        WHERE path.origin_id = assignment.entity_id AND path.origin_type = assignment.entity_type
          AND position(':' in path.entity_type) = 0 AND path.entity_type NOT IN (${sql.join(typedSources)})
      )))
      AND NOT EXISTS (
        SELECT 1 FROM (
          SELECT required.* FROM assignment_paths required
          WHERE required.origin_id = assignment.entity_id AND required.origin_type = assignment.entity_type OFFSET 0
        ) path
        LEFT JOIN LATERAL (
          SELECT target.id FROM "Common_Entity" target
          WHERE target.id = path.id AND target.egcs_cn_entitytype = path.entity_type AND NOT target._deleted OFFSET 0
        ) identity ON TRUE
        LEFT JOIN source_facts ancestor ON ancestor.id = path.id AND ancestor.entity_type = path.entity_type
        LEFT JOIN qualified_bindings qualified ON qualified.entity_id = path.id AND qualified.entity_type = path.entity_type
        LEFT JOIN "Common_Status" ancestor_status ON ancestor_status.id = CASE
          WHEN ancestor.entity_type IN (${sql.join(businessEntityTypes)}) THEN ancestor.status::bigint END
        WHERE path.origin_id = assignment.entity_id AND path.origin_type = assignment.entity_type AND (
          identity.id IS NULL
          OR (path.entity_type IN (${sql.join(typedSources)}) AND ancestor.id IS NULL)
          OR (position(':' in path.entity_type) > 0 AND qualified.entity_id IS NULL)
          OR (ancestor.entity_type IN (${sql.join(businessEntityTypes)})
            AND (ancestor_status.id IS NULL OR ancestor_status._deleted OR ancestor_status.egcs_cn_terminal))
        )
      )
    ), authorized_work AS MATERIALIZED (
      SELECT work.* FROM work
      LEFT JOIN "Agency_Profile" owner_agency ON owner_agency.id = work.agency_id AND NOT owner_agency._deleted
      LEFT JOIN "Common_Status" business_status ON business_status.id = CASE
        WHEN work.entity_type IN (${sql.join(businessEntityTypes)}) THEN work.status::bigint END
      LEFT JOIN "Common_Completion" completion ON completion.egcs_cn_entityid = work.id
        AND completion.egcs_cn_entitytype::text = work.entity_type AND NOT completion._deleted
      WHERE (work.owner_subject = 'applicant_recipient' OR owner_agency.id IS NOT NULL)
        AND (${sql.join(authorizationPredicates, sql` OR `)})
        AND ${buildAssignedWorkOpenPredicate({ mode: 'palette' })}
    ), exact_candidates AS MATERIALIZED (
      ${sql.join(accessibleTypes.map(entityType => sql`(
        SELECT work.*, 0 rank FROM authorized_work work
        WHERE work.entity_type = ${entityType}
          AND (${search === ''} OR work.id = ${numericId}::bigint OR lower(work.reference) = ${search})
        LIMIT ${SOURCE_CANDIDATE_LIMIT + 1}
      )`), sql` UNION ALL `)}
    ), prefix_candidates AS MATERIALIZED (
      ${sql.join(accessibleTypes.map(entityType => sql`(
        SELECT work.*, 1 rank FROM authorized_work work
        WHERE work.entity_type = ${entityType} AND ${namePrefix}
          AND NOT (work.id = COALESCE(${numericId}::bigint, -1) OR COALESCE(lower(work.reference) = ${search}, FALSE))
        LIMIT GREATEST(${SOURCE_CANDIDATE_LIMIT + 1} - cardinality(ARRAY(
          SELECT id FROM exact_candidates WHERE entity_type = ${entityType}
        )), 0)
      )`), sql` UNION ALL `)}
    ), substring_candidates AS MATERIALIZED (
      ${sql.join(accessibleTypes.map(entityType => sql`(
        SELECT work.*, 2 rank FROM authorized_work work
        WHERE work.entity_type = ${entityType} AND ${nameSubstring} AND NOT ${namePrefix}
          AND NOT (work.id = COALESCE(${numericId}::bigint, -1) OR COALESCE(lower(work.reference) = ${search}, FALSE))
        LIMIT GREATEST(${SOURCE_CANDIDATE_LIMIT + 1} - cardinality(ARRAY(
          SELECT id FROM exact_candidates WHERE entity_type = ${entityType}
          UNION ALL SELECT id FROM prefix_candidates WHERE entity_type = ${entityType}
        )), 0)
      )`), sql` UNION ALL `)}
    ), bounded_candidates AS MATERIALIZED (
      SELECT * FROM exact_candidates UNION ALL SELECT * FROM prefix_candidates UNION ALL SELECT * FROM substring_candidates
    )
    SELECT id::text, entity_type, name_en, name_fr, reference, status,
      agreement_id::text, proponent_id::text, stream_id::text, agency_id::text, program_id::text,
      owner_subject, variant, is_primary, rank
    FROM bounded_candidates
    ORDER BY rank, is_primary DESC, entity_type, bounded_candidates.id
    LIMIT ${PERSONAL_WORK_LIMIT + 1}
  `
}

/**
 * Loads parent display identities only for the five final authorized palette selections.
 * @param db Database transaction holding the search snapshot.
 * @param auth Fresh read grants used to mask parent names.
 * @param candidates Final five authorized candidates.
 * @returns Bilingual search results with direct destinations and permitted parent labels.
 */
const loadAssignedWorkSearchContext = async (
  db: Kysely<Database>, auth: AuthContext, candidates: AssignedWorkSearchCandidate[]
): Promise<SearchResult[]> => {
  if (candidates.length === 0) return []
  const rows = sql.join(candidates.map(candidate => sql`(
    ${candidate.id}::bigint, ${candidate.entity_type}::text, ${candidate.agreement_id}::bigint,
    ${candidate.proponent_id}::bigint, ${candidate.stream_id}::bigint, ${candidate.agency_id}::bigint,
    ${candidate.program_id}::bigint, ${candidate.owner_subject}::text
  )`))
  const readGrants = auth.userAbilities.getGrants().filter(grant => grant.action === 'read')
  /**
   * Authorizes an independently readable display parent.
   * @param subject Subject of the displayed parent identity.
   * @returns Matching parent-scope predicate.
   */
  const parentRead = (subject: 'agreement' | 'agency' | 'transfer_payment'): RawBuilder<unknown> => {
    const scopes = readGrants.filter(grant => grant.subject === subject).map(grant => {
      if (grant.scope.type === 'global') return sql`TRUE`
      if (grant.scope.type === 'agency') return sql`selected.agency_id = ${grant.scope.agencyId}::bigint`
      return sql`selected.agency_id = ${grant.scope.agencyId}::bigint AND selected.program_id = ${grant.scope.transferPaymentId}::bigint`
    })
    return scopes.length ? sql`(${sql.join(scopes, sql` OR `)})` : sql`FALSE`
  }
  const proponentRead = readGrants.some(grant => grant.subject === 'applicant_recipient')
  const result = await sql<{ id: string; entity_type: string; parent_en: string | null; parent_fr: string | null }>`
    SELECT selected.id::text, selected.entity_type,
      COALESCE(agreement.egcs_fc_agreementnumber, proponent.egcs_ar_legalname_en, proponent.egcs_ar_operatingname_en,
        proponent.egcs_ar_legalname_fr, proponent.egcs_ar_operatingname_fr, stream.egcs_tp_name_en, agency.egcs_ay_name_en) parent_en,
      COALESCE(agreement.egcs_fc_agreementnumber, proponent.egcs_ar_legalname_fr, proponent.egcs_ar_operatingname_fr,
        proponent.egcs_ar_legalname_en, proponent.egcs_ar_operatingname_en, stream.egcs_tp_name_fr, agency.egcs_ay_name_fr) parent_fr
    FROM (VALUES ${rows}) selected(id, entity_type, agreement_id, proponent_id, stream_id, agency_id, program_id, owner_subject)
    LEFT JOIN LATERAL (SELECT parent.egcs_fc_agreementnumber FROM "Funding_Case_Agreement_Profile" parent
      WHERE parent.id = selected.agreement_id AND NOT parent._deleted AND ${parentRead('agreement')} OFFSET 0) agreement ON TRUE
    LEFT JOIN LATERAL (SELECT parent.egcs_ar_legalname_en, parent.egcs_ar_operatingname_en, parent.egcs_ar_legalname_fr, parent.egcs_ar_operatingname_fr
      FROM "Applicant_Recipient_Profile" parent WHERE parent.id = selected.proponent_id AND NOT parent._deleted AND ${proponentRead} OFFSET 0) proponent ON TRUE
    LEFT JOIN LATERAL (SELECT parent.egcs_tp_name_en, parent.egcs_tp_name_fr FROM "Transfer_Payment_Stream" parent
      WHERE parent.id = selected.stream_id AND NOT parent._deleted AND ${parentRead('transfer_payment')} OFFSET 0) stream ON TRUE
    LEFT JOIN LATERAL (SELECT parent.egcs_ay_name_en, parent.egcs_ay_name_fr FROM "Agency_Profile" parent
      WHERE parent.id = selected.agency_id AND NOT parent._deleted AND ${parentRead('agency')} OFFSET 0) agency ON TRUE
  `.execute(db)
  const contexts = new Map(result.rows.map(row => [`${row.entity_type}:${row.id}`, row]))
  return candidates.map(candidate => {
    const context = contexts.get(`${candidate.entity_type}:${candidate.id}`)
    return {
      id: candidate.id,
      type: candidate.entity_type,
      name_en: candidate.name_en,
      name_fr: candidate.name_fr,
      reference: candidate.reference,
      parent_en: context?.parent_en ?? null,
      parent_fr: context?.parent_fr ?? null,
      status: candidate.status,
      url: candidate.entity_type === 'fundingcaseaccountreceivablecreditmemo' && candidate.proponent_id
        ? `/proponents/edit/${candidate.proponent_id}/credit-memos/${candidate.id}`
        : buildAssignedWorkRoute(candidate.entity_type, candidate.id, candidate.agreement_id, candidate.variant)
    }
  })
}

/**
 * Returns personal suggestions or own-identity matches using the caller's fresh read snapshot.
 * @param db Database transaction holding the search snapshot.
 * @param _event Authenticated request; authorization is already resolved by the caller.
 * @param auth Fresh read authorization snapshot.
 * @param search Optional own-identity search text.
 * @returns Up to five personal matches and a truncation indicator.
 */
export const searchAssignedWork = async (
  db: Kysely<Database>, _event: H3Event, auth: AuthContext, search: string
): Promise<{ items: SearchResult[]; hasMore: boolean }> => {
  if (!auth.userAbilities.getGrants().some(grant => grant.action === 'read' && ASSIGNED_WORK_OWNER_SUBJECTS.has(grant.subject))) return { items: [], hasMore: false }
  const commonUser = await db.selectFrom('Common_User')
    .select('id').where('egcs_cn_auth_user_id', '=', auth.userId).where('_deleted', '=', false).executeTakeFirst()
  if (!commonUser) return { items: [], hasMore: false }
  const query = await buildAssignedWorkSearchCandidates({ commonUserId: commonUser.id, auth, search })
  const result = await query.execute(db)
  const items = await loadAssignedWorkSearchContext(db, auth, result.rows.slice(0, PERSONAL_WORK_LIMIT))
  return { items, hasMore: result.rows.length > PERSONAL_WORK_LIMIT }
}
