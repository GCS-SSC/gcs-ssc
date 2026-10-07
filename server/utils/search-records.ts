/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- Internal query builders have explicit typed contracts. */
import { sql, type Kysely, type RawBuilder } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { SearchRecordType, SearchResult } from '~~/shared/types/search'
import type { AuthorizationSubject } from '~~/shared/utils/abilities'
import { isCanonicalPostgresBigintText, isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import type { AuthContext } from './authorize'
import { escapeLikePattern } from './sql-like'

export const SEARCH_SOURCE_CANDIDATES = 25
export const SEARCH_RECORD_LIMIT = 12
export type SearchTier = 'exact' | 'prefix' | 'substring'
type ReadGrant = ReturnType<AuthContext['userAbilities']['getGrants']>[number]

interface SearchSource {
  type: SearchRecordType
  table: keyof Database
  subject: AuthorizationSubject
  names: readonly string[]
  references: readonly string[]
  numericReferences?: readonly string[]
  active?: string
  status?: string
  entityType?: string
  stream?: string
}

export const SEARCH_SOURCES: readonly SearchSource[] = [
  { type: 'agreement', table: 'Funding_Case_Agreement_Profile', subject: 'agreement',
    names: ['egcs_fc_title_en', 'egcs_fc_title_fr'], references: ['egcs_fc_agreementnumber'], numericReferences: ['egcs_fc_financialsystemnumber'],
    status: 'egcs_fc_status', entityType: 'fundingcaseagreement', stream: 'egcs_fc_transferpaymentstream' },
  { type: 'proponent', table: 'Applicant_Recipient_Profile', subject: 'applicant_recipient',
    names: ['egcs_ar_legalname_en', 'egcs_ar_legalname_fr', 'egcs_ar_operatingname_en', 'egcs_ar_operatingname_fr'],
    references: [], active: 'egcs_ar_active' },
  { type: 'opportunity', table: 'Funding_Opportunity_Profile', subject: 'transfer_payment',
    names: ['egcs_fo_name_en', 'egcs_fo_name_fr'], references: [], status: 'egcs_fo_status',
    entityType: 'fundingopportunity', stream: 'egcs_fo_transferpaymentstream' },
  { type: 'intake', table: 'Funding_Case_Intake_Profile', subject: 'funding_case',
    names: [], references: ['egcs_fi_externalsourceid'], numericReferences: ['egcs_fi_applicationid'],
    status: 'egcs_fi_status', entityType: 'fundingcaseintake' },
  { type: 'program', table: 'Transfer_Payment_Profile', subject: 'transfer_payment',
    names: ['egcs_tp_name_en', 'egcs_tp_name_fr'], references: ['egcs_tp_abbreviation_en', 'egcs_tp_abbreviation_fr'],
    active: 'egcs_tp_active' },
  { type: 'stream', table: 'Transfer_Payment_Stream', subject: 'transfer_payment',
    names: ['egcs_tp_name_en', 'egcs_tp_name_fr'], references: ['egcs_tp_abbreviation_en', 'egcs_tp_abbreviation_fr'],
    active: 'egcs_tp_active' },
  { type: 'agency', table: 'Agency_Profile', subject: 'agency',
    names: ['egcs_ay_name_en', 'egcs_ay_name_fr'],
    references: ['egcs_ay_abbreviation_en', 'egcs_ay_abbreviation_fr'],
    numericReferences: ['egcs_ay_gwcoa_number', 'egcs_ay_agencyfinancialsystemid'], active: 'egcs_ay_active' }
]

export interface SearchCandidate {
  id: string
  name_en: string
  name_fr: string
  reference: string | null
  status: string
  type: SearchRecordType
  tier: number
}

const normalizeField = (field: string): RawBuilder<string> => sql`lower(coalesce(${sql.ref(field)}, ''))`
export const permitsBroadSearch = (search: string): boolean => /[\p{L}\p{N}]{3}/u.test(search)
const disjunction = (predicates: RawBuilder<unknown>[]): RawBuilder<unknown> => predicates.length
  ? sql`(${sql.join(predicates, sql` OR `)})`
  : sql`FALSE`

const scopedRead = (grants: ReadGrant[], agency: RawBuilder<unknown>, program?: RawBuilder<unknown>): RawBuilder<unknown> =>
  disjunction(grants.map(grant => {
    if (grant.scope.type === 'global') return sql`TRUE`
    if (grant.scope.type === 'agency') return sql`${agency} = ${grant.scope.agencyId}::bigint`
    return program
      ? sql`${agency} = ${grant.scope.agencyId}::bigint AND ${program} = ${grant.scope.transferPaymentId}::bigint`
      : sql`FALSE`
  }))

// Push structural scope into the source's indexed foreign key before probing live owners.
// Correlated owner checks alone would visit every common-name match in inaccessible agencies.
const sourceScope = (source: SearchSource, grants: ReadGrant[]): RawBuilder<unknown> => {
  if (source.type === 'proponent' || grants.some(grant => grant.scope.type === 'global')) return sql`TRUE`
  if (source.type === 'agency') return scopedRead(grants, sql`src.id`)
  if (source.type === 'program') return scopedRead(grants, sql`src.egcs_tp_agency`, sql`src.id`)
  const owners = scopeOwnerRelation(source, grants)
  return owners ? sql`${sql.ref(`src.${owners.field}`)} IN (${owners.query})` : sql`FALSE`
}

export interface SearchSourceScope {
  field: string
  ids: string[]
  hasMore: boolean
}

const scopePrograms = (grants: ReadGrant[]) => sql`SELECT scope_program.id FROM "Transfer_Payment_Profile" scope_program
  WHERE scope_program._deleted = false
    AND ${scopedRead(grants, sql`scope_program.egcs_tp_agency`, sql`scope_program.id`)}`

const scopeStreams = (grants: ReadGrant[]) => sql`SELECT scope_stream.id FROM "Transfer_Payment_Stream" scope_stream
  WHERE scope_stream._deleted = false AND scope_stream.egcs_tp_transferpaymentprofile IN (${scopePrograms(grants)})`

const scopeOwnerRelation = (source: SearchSource, grants: ReadGrant[], streamIds?: readonly string[]) => {
  if (['proponent', 'agency', 'program'].includes(source.type)
    || !grants.length || grants.some(grant => grant.scope.type === 'global')) return null
  if (source.type === 'stream') return { field: 'egcs_tp_transferpaymentprofile', query: scopePrograms(grants) }
  if (source.type === 'intake') return { field: 'egcs_fi_fundingopportunity', query: sql`
    SELECT scope_opportunity.id FROM "Funding_Opportunity_Profile" scope_opportunity
    WHERE scope_opportunity._deleted = false AND ${streamIds
      ? sql`scope_opportunity.egcs_fo_transferpaymentstream = ANY(${streamIds}::bigint[])`
      : sql`scope_opportunity.egcs_fo_transferpaymentstream IN (${scopeStreams(grants)})`}` }
  if (!source.stream) throw new Error('Record search source has no owner reference')
  return { field: source.stream, query: scopeStreams(grants) }
}

/** Resolves Intake's stream scope before looking up its immediate Opportunity owners. */
export const buildSearchStreamScopeQuery = (source: SearchSource, auth: AuthContext): RawBuilder<{ id: string }> | null => {
  const grants = auth.userAbilities.getGrants().filter(grant => grant.action === 'read' && grant.subject === source.subject)
  if (source.type !== 'intake' || !grants.length || grants.some(grant => grant.scope.type === 'global')) return null
  return sql`SELECT owner.id::text id FROM (${scopeStreams(grants)}) owner LIMIT ${SEARCH_SOURCE_CANDIDATES + 1}`
}

/** Builds a bounded structural-scope lookup without reading names or business evidence. */
export const buildSearchScopeQuery = (
  source: SearchSource, auth: AuthContext, streamIds?: readonly string[]
): RawBuilder<{ id: string }> | null => {
  const grants = auth.userAbilities.getGrants().filter(grant => grant.action === 'read' && grant.subject === source.subject)
  const owners = scopeOwnerRelation(source, grants, streamIds)
  return owners ? sql`SELECT owner.id::text id FROM (${owners.query}) owner LIMIT ${SEARCH_SOURCE_CANDIDATES + 1}` : null
}

/** Resolves small scopes completely; wide scopes retain relational filtering. */
export const resolveSearchSourceScope = async (
  db: Kysely<Database>, source: SearchSource, auth: AuthContext
): Promise<SearchSourceScope | null> => {
  const grants = auth.userAbilities.getGrants().filter(grant => grant.action === 'read' && grant.subject === source.subject)
  const owners = scopeOwnerRelation(source, grants)
  let streamIds: string[] | undefined
  const streamQuery = buildSearchStreamScopeQuery(source, auth)
  if (streamQuery) {
    const ids = (await streamQuery.execute(db)).rows.map(row => row.id)
    if (ids.length <= SEARCH_SOURCE_CANDIDATES) streamIds = ids
  }
  const query = buildSearchScopeQuery(source, auth, streamIds)
  if (!owners || !query) return null
  const ids = (await query.execute(db)).rows.map(row => row.id)
  return { field: owners.field, ids, hasMore: ids.length > SEARCH_SOURCE_CANDIDATES }
}

const sourceOwner = (source: SearchSource, grants: ReadGrant[]): RawBuilder<unknown> => {
  if (source.type === 'proponent') return sql`TRUE`
  if (source.type === 'agency') return scopedRead(grants, sql`src.id`)
  if (source.type === 'program') return sql`EXISTS (
    SELECT 1 FROM "Agency_Profile" agency
    WHERE agency.id = src.egcs_tp_agency AND agency._deleted = false
      AND ${scopedRead(grants, sql`agency.id`, sql`src.id`)} OFFSET 0
  )`
  if (source.type === 'stream') return sql`EXISTS (
    SELECT 1 FROM "Transfer_Payment_Profile" program
    JOIN "Agency_Profile" agency ON agency.id = program.egcs_tp_agency AND agency._deleted = false
    WHERE program.id = src.egcs_tp_transferpaymentprofile AND program._deleted = false
      AND ${scopedRead(grants, sql`agency.id`, sql`program.id`)} OFFSET 0
  )`
  const intakeOwner = source.type === 'intake'
  return sql`EXISTS (
    SELECT 1 FROM ${intakeOwner
      ? sql`"Funding_Opportunity_Profile" opportunity
      JOIN "Transfer_Payment_Stream" stream ON stream.id = opportunity.egcs_fo_transferpaymentstream AND stream._deleted = false
      JOIN "Applicant_Recipient_Profile" proponent ON proponent.id = src.egcs_fi_applicantrecipient AND proponent._deleted = false`
      : sql`"Transfer_Payment_Stream" stream`}
    JOIN "Transfer_Payment_Profile" program ON program.id = stream.egcs_tp_transferpaymentprofile AND program._deleted = false
    JOIN "Agency_Profile" agency ON agency.id = program.egcs_tp_agency AND agency._deleted = false
    WHERE ${intakeOwner
      ? sql`opportunity.id = src.egcs_fi_fundingopportunity AND opportunity._deleted = false`
      : sql`stream.id = ${sql.ref(`src.${source.stream}`)} AND stream._deleted = false`}
      AND ${scopedRead(grants, sql`agency.id`, sql`program.id`)}
      AND EXISTS (SELECT 1 FROM "Common_Status" status
        WHERE status.id = ${sql.ref(`src.${source.status}`)} AND status._deleted = false
          AND status.egcs_cn_agency = agency.id AND status.egcs_cn_terminal = false OFFSET 0)
    OFFSET 0
  )`
}

const sourceIdentityAvailable = (source: SearchSource, grants: ReadGrant[]): RawBuilder<unknown> => sql`
  src._deleted = false
  ${source.active ? sql`AND ${sql.ref(`src.${source.active}`)} = true` : sql``}
  AND ${sourceScope(source, grants)}
`

const sourceLive = (source: SearchSource, grants: ReadGrant[]): RawBuilder<unknown> => sql`
  ${sourceOwner(source, grants)}
  ${source.status
    ? sql`AND NOT EXISTS (SELECT 1 FROM "Common_Completion" completion
    WHERE completion.egcs_cn_entityid = src.id AND completion.egcs_cn_entitytype = ${source.entityType}
      AND completion._deleted = false OFFSET 0)`
    : sql``}
`

const sourceIdentityColumns = (source: SearchSource): string[] => [...new Set([
  'id', ...source.names, ...source.references, ...(source.numericReferences ?? []),
  source.status, source.stream,
  ...(source.type === 'program' ? ['egcs_tp_agency'] : []),
  ...(source.type === 'stream' ? ['egcs_tp_transferpaymentprofile'] : []),
  ...(source.type === 'intake' ? ['egcs_fi_fundingopportunity', 'egcs_fi_applicantrecipient'] : [])
].filter((field): field is string => field !== undefined))]

const candidateProjection = (source: SearchSource, referenceOverride?: RawBuilder<string>): RawBuilder<unknown> => {
  const ownName = (language: 'en' | 'fr') => source.names.length
    ? sql`coalesce(${sql.join([
      ...source.names.filter(field => field.endsWith(`_${language}`)),
      ...source.names.filter(field => !field.endsWith(`_${language}`))
    ].map(field => sql`nullif(${sql.ref(`src.${field}`)}, '')`))}, '#' || src.id::text)`
    : sql`${language === 'en' ? 'Application #' : 'Demande no '} || src.id::text`
  return sql`src.id::text id, ${ownName('en')} name_en, ${ownName('fr')} name_fr,
    ${referenceOverride ?? (source.references.length || source.numericReferences?.length
      ? sql`coalesce(${sql.join([
        ...source.references.map(field => sql`nullif(${sql.ref(`src.${field}`)}, '')`),
        ...(source.numericReferences ?? []).map(field => sql`${sql.ref(`src.${field}`)}::text`)
      ])}, NULL::text)`
      : sql`NULL::text`)} reference,
    ${source.status ? sql`${sql.ref(`src.${source.status}`)}::text` : sql`'active'::text`} status`
}

/** Builds one unsorted, permission-filtered tier with a source-local candidate probe. */
export const buildSearchSourceQuery = (
  source: SearchSource,
  auth: AuthContext,
  search: string,
  tier: SearchTier,
  limit: number,
  excludedIds: readonly string[] = [],
  scope: SearchSourceScope | null = null
): RawBuilder<Omit<SearchCandidate, 'type' | 'tier'>> | null => {
  const grants = auth.userAbilities.getGrants().filter(grant => grant.action === 'read' && grant.subject === source.subject)
  if (!grants.length || (tier !== 'exact' && !permitsBroadSearch(search))) return null
  const normalized = search.toLowerCase()
  const numericId = isPositivePostgresBigintText(search) ? search : null
  const numericReference = isCanonicalPostgresBigintText(search) ? search : null
  const matches = tier === 'exact'
    ? disjunction([
        ...(numericId ? [sql`src.id = ${numericId}::bigint`] : []),
        ...(numericReference
          ? (source.numericReferences ?? []).map(field =>
              sql`${sql.ref(`src.${field}`)} = ${numericReference}::bigint`)
          : []),
        ...source.references.map(field => sql`${normalizeField(`src.${field}`)} = ${normalized}`)
      ])
    : disjunction([...source.names, ...source.references].map(field =>
        sql`${normalizeField(`src.${field}`)} LIKE ${`${tier === 'substring' ? '%' : ''}${escapeLikePattern(normalized)}%`}`))
  const matching = sql`${matches} AND ${sourceIdentityAvailable(source, grants)}
    ${scope && !scope.hasMore ? sql`AND ${sql.ref(`src.${scope.field}`)} = ANY(${scope.ids}::bigint[])` : sql``}
    ${excludedIds.length ? sql`AND src.id NOT IN (${sql.join(excludedIds.map(id => sql`${id}::bigint`))})` : sql``}`
  if (source.type !== 'proponent' && !grants.some(grant => grant.scope.type === 'global')) {
    // Keep liveness subplans outside the scope semijoin. Otherwise PostgreSQL can
    // evaluate them against every inaccessible identity before resolving scope.
    return sql`SELECT ${candidateProjection(source)} FROM (
      SELECT ${sql.join(sourceIdentityColumns(source).map(field => sql.ref(`src.${field}`)))}
      FROM ${sql.table(source.table)} src WHERE ${matching} OFFSET 0
    ) src WHERE ${sourceLive(source, grants)} LIMIT ${limit}`
  }
  return sql`SELECT ${candidateProjection(source)} FROM ${sql.table(source.table)} src
    WHERE ${matching} AND ${sourceLive(source, grants)} LIMIT ${limit}`
}

/** Registry matching starts at its normalized index, then resolves only live readable roots. */
export const buildSearchRegistryQuery = (
  auth: AuthContext, search: string, tier: SearchTier, limit: number, excludedIds: readonly string[] = []
): RawBuilder<Omit<SearchCandidate, 'type' | 'tier'>> | null => {
  const source = SEARCH_SOURCES.find(entry => entry.type === 'proponent')!
  const grants = auth.userAbilities.getGrants().filter(grant => grant.action === 'read' && grant.subject === source.subject)
  if (!grants.length || (tier !== 'exact' && !permitsBroadSearch(search))) return null
  const field = normalizeField('registry.egcs_ar_number')
  const normalized = search.toLowerCase()
  const matches = tier === 'exact'
    ? sql`${field} = ${normalized}`
    : sql`${field} LIKE ${`${tier === 'substring' ? '%' : ''}${escapeLikePattern(normalized)}%`}`
  // The lateral primary-key probe resolves registry matches without sorting or grouping them. Duplicate
  // registries are removed by the bounded caller and subsequent probes exclude selected roots.
  return sql`SELECT ${candidateProjection(source, sql`registry.egcs_ar_number`)} FROM "Applicant_Recipient_Registry" registry
    CROSS JOIN LATERAL (SELECT * FROM "Applicant_Recipient_Profile" profile
      WHERE profile.id = registry.egcs_ar_applicantrecipient AND profile._deleted = false
        AND profile.egcs_ar_active = true OFFSET 0) src
    WHERE registry._deleted = false AND ${matches}
      ${excludedIds.length ? sql`AND src.id NOT IN (${sql.join(excludedIds.map(id => sql`${id}::bigint`))})` : sql``}
    LIMIT ${limit}`
}

const loadSourceCandidates = async (db: Kysely<Database>, auth: AuthContext, search: string, source: SearchSource) => {
  const candidates = new Map<string, SearchCandidate>()
  const probeLimit = SEARCH_SOURCE_CANDIDATES + 1
  const scope = await resolveSearchSourceScope(db, source, auth)
  if (scope && !scope.hasMore && !scope.ids.length) return { candidates: [], hasMore: false }
  for (const [tierNumber, tier] of (['exact', 'prefix', 'substring'] as const).entries()) {
    if (candidates.size >= probeLimit) break
    const query = buildSearchSourceQuery(source, auth, search, tier, probeLimit - candidates.size, [...candidates.keys()], scope)
    if (query) {
      const result = await query.execute(db)
      for (const row of result.rows) candidates.set(row.id, { ...row, type: source.type, tier: tierNumber })
    }
    if (source.type !== 'proponent') continue
    // Refill after bounded duplicate registry hits, never counting/ranking the registry match set.
    while (candidates.size < probeLimit) {
      const registryQuery = buildSearchRegistryQuery(auth, search, tier, probeLimit - candidates.size, [...candidates.keys()])
      if (!registryQuery) break
      const registryRows = (await registryQuery.execute(db)).rows
      if (!registryRows.length) break
      for (const row of registryRows) candidates.set(row.id, { ...row, type: source.type, tier: tierNumber })
    }
  }
  return { candidates: [...candidates.values()].slice(0, SEARCH_SOURCE_CANDIDATES), hasMore: candidates.size > SEARCH_SOURCE_CANDIDATES }
}

interface DisplayContext { id: string; parent_en: string | null; parent_fr: string | null; program_id: string | null }

const loadDisplayContext = async (db: Kysely<Database>, auth: AuthContext, source: SearchSource, ids: string[]): Promise<DisplayContext[]> => {
  if (!ids.length) return []
  const grants = auth.userAbilities.getGrants().filter(grant => grant.action === 'read')
  const parentPermission = (subject: AuthorizationSubject, agency: RawBuilder<unknown>, program?: RawBuilder<unknown>) =>
    scopedRead(grants.filter(grant => grant.subject === subject), agency, program)
  let parent = sql`NULL::text parent_en, NULL::text parent_fr, NULL::text program_id`
  let joins = sql``
  if (source.type === 'program') {
    joins = sql`LEFT JOIN "Agency_Profile" parent ON parent.id = src.egcs_tp_agency AND parent._deleted = false
      AND ${parentPermission('agency', sql`parent.id`)}`
    parent = sql`parent.egcs_ay_name_en parent_en, parent.egcs_ay_name_fr parent_fr, NULL::text program_id`
  } else if (source.type === 'stream') {
    joins = sql`LEFT JOIN "Transfer_Payment_Profile" parent ON parent.id = src.egcs_tp_transferpaymentprofile AND parent._deleted = false
      AND ${parentPermission('transfer_payment', sql`parent.egcs_tp_agency`, sql`parent.id`)}`
    parent = sql`parent.egcs_tp_name_en parent_en, parent.egcs_tp_name_fr parent_fr, src.egcs_tp_transferpaymentprofile::text program_id`
  } else if (source.stream) {
    joins = sql`LEFT JOIN "Transfer_Payment_Stream" parent ON parent.id = ${sql.ref(`src.${source.stream}`)} AND parent._deleted = false
      LEFT JOIN "Transfer_Payment_Profile" program ON program.id = parent.egcs_tp_transferpaymentprofile AND program._deleted = false`
    const allowed = parentPermission('transfer_payment', sql`program.egcs_tp_agency`, sql`program.id`)
    parent = sql`CASE WHEN ${allowed} THEN parent.egcs_tp_name_en END parent_en,
      CASE WHEN ${allowed} THEN parent.egcs_tp_name_fr END parent_fr, program.id::text program_id`
  } else if (source.type === 'intake') {
    joins = sql`LEFT JOIN "Funding_Opportunity_Profile" parent ON parent.id = src.egcs_fi_fundingopportunity AND parent._deleted = false
      LEFT JOIN "Transfer_Payment_Stream" stream ON stream.id = parent.egcs_fo_transferpaymentstream AND stream._deleted = false
      LEFT JOIN "Transfer_Payment_Profile" program ON program.id = stream.egcs_tp_transferpaymentprofile AND program._deleted = false`
    const allowed = parentPermission('transfer_payment', sql`program.egcs_tp_agency`, sql`program.id`)
    parent = sql`CASE WHEN ${allowed} THEN parent.egcs_fo_name_en END parent_en,
      CASE WHEN ${allowed} THEN parent.egcs_fo_name_fr END parent_fr, program.id::text program_id`
  }
  return (await sql<DisplayContext>`SELECT src.id::text id, ${parent}
    FROM ${sql.table(source.table)} src ${joins}
    WHERE src.id IN (${sql.join(ids.map(id => sql`${id}::bigint`))})`.execute(db)).rows
}

const recordDestination = (type: SearchRecordType, id: string, programId: string | null) => {
  switch (type) {
    case 'agreement': return `/agreements/${id}`
    case 'proponent': return `/proponents/edit/${id}`
    case 'opportunity': return `/funding-opportunities/${id}`
    case 'intake': return `/funding-case-intakes/${id}`
    case 'program': return `/transfer-payments/${id}`
    case 'stream': return `/transfer-payments/${programId}/streams/${id}`
    case 'agency': return `/agencies/${id}`
  }
}

export const searchRecords = async (db: Kysely<Database>, auth: AuthContext, search: string): Promise<{ items: SearchResult[]; hasMore: boolean }> => {
  if (!search.trim()) return { items: [], hasMore: false }
  // A transaction shares one connection; standalone callers must also leave pool capacity
  // for ordinary reads when several searches run together.
  const sources: Awaited<ReturnType<typeof loadSourceCandidates>>[] = []
  for (let index = 0; index < SEARCH_SOURCES.length; index += 3) {
    sources.push(...await Promise.all(SEARCH_SOURCES.slice(index, index + 3)
      .map(source => loadSourceCandidates(db, auth, search, source))))
  }
  const ranked = sources.flatMap(source => source.candidates).sort((left, right) =>
    left.tier - right.tier || left.name_en.localeCompare(right.name_en) || left.type.localeCompare(right.type)
    || left.id.length - right.id.length || left.id.localeCompare(right.id))
  const selected = ranked.slice(0, SEARCH_RECORD_LIMIT)
  const contexts: DisplayContext[][] = []
  for (let index = 0; index < SEARCH_SOURCES.length; index += 3) {
    contexts.push(...await Promise.all(SEARCH_SOURCES.slice(index, index + 3).map(source => loadDisplayContext(db, auth, source,
      selected.filter(candidate => candidate.type === source.type).map(candidate => candidate.id)))))
  }
  const contextByIdentity = new Map(contexts.flatMap((rows, index) => rows.map(row => [`${SEARCH_SOURCES[index]!.type}:${row.id}`, row] as const)))
  return {
    items: selected.map(({ tier: _tier, ...candidate }) => {
      const context = contextByIdentity.get(`${candidate.type}:${candidate.id}`)
      return { ...candidate, parent_en: context?.parent_en ?? null, parent_fr: context?.parent_fr ?? null,
        url: recordDestination(candidate.type, candidate.id, context?.program_id ?? null) }
    }),
    hasMore: ranked.length > SEARCH_RECORD_LIMIT || sources.some(source => source.hasMore)
  }
}
