import { sql, type Kysely } from 'kysely'
import type { Database, Entity_Type } from '~~/shared/types/database'
import { buildAssignedWorkRoute, isAssignableEntityType } from '~~/shared/utils/entity-assignments'
import {
  buildAssignedWorkAssignmentLineage,
  buildAssignedWorkSearchQualifiedBindings,
  buildAssignedWorkSearchSourceFacts
} from './assigned-work-search-sources'

interface NotificationSource {
  id: string
  entity_type: string
  name_en: string | null
  name_fr: string | null
  reference: string | null
  agreement_id: string | null
  proponent_id: string | null
  variant: string | null
  program_id: string | null
  agreement_number: string
}

type NotificationTarget = { entityType: Entity_Type; entityId: string }

/**
 * Builds the bounded, live typed lineage shared by message descriptors and canonical scope.
 * @param target Exact approval target.
 * @returns SQL context with source facts and qualified-owner validity.
 */
const buildNotificationSourceContext = async (target: NotificationTarget) => {
  const qualifiedBindings = await buildAssignedWorkSearchQualifiedBindings()
  return sql`
    WITH RECURSIVE actor_assignments AS (
      SELECT ${target.entityId}::bigint entity_id, ${target.entityType}::text entity_type
    ), assignment_paths AS (
      ${buildAssignedWorkAssignmentLineage()}
    ), needed_identities AS MATERIALIZED (
      SELECT DISTINCT id, entity_type FROM assignment_paths
    ), source_facts AS MATERIALIZED (
      SELECT facts.* FROM (${buildAssignedWorkSearchSourceFacts()}) facts
      JOIN "Common_Entity" identity ON identity.id = facts.id
        AND identity.egcs_cn_entitytype = facts.entity_type AND NOT identity._deleted
    ), qualified_bindings AS MATERIALIZED (
      ${qualifiedBindings}
    ), valid_context AS (
      SELECT NOT EXISTS (
        SELECT 1 FROM needed_identities needed
        WHERE NOT EXISTS (
          SELECT 1 FROM "Common_Entity" identity
          WHERE identity.id = needed.id AND identity.egcs_cn_entitytype = needed.entity_type AND NOT identity._deleted
        ) OR (position(':' in needed.entity_type) > 0 AND NOT EXISTS (
          SELECT 1 FROM qualified_bindings binding
          WHERE binding.entity_id = needed.id AND binding.entity_type = needed.entity_type
        )) OR (position(':' in needed.entity_type) = 0 AND NOT EXISTS (
          SELECT 1 FROM source_facts facts
          WHERE facts.id = needed.id AND facts.entity_type = needed.entity_type
        ))
      ) AND (${target.entityType.includes(':')} OR EXISTS (
        SELECT 1 FROM source_facts target
        WHERE target.id = ${target.entityId}::bigint AND target.entity_type = ${target.entityType}
      )) valid
    )
  `
}

interface NotificationScope {
  agencyId: string
  streamId: string
  agencyNameEn: string | null
  agencyNameFr: string | null
  programNameEn: string | null
  programNameFr: string | null
  streamNameEn: string | null
  streamNameFr: string | null
}

/**
 * Reads canonical ownership and its current display names through one live scope query.
 * @param db Current database connection.
 * @param target Exact approval target.
 * @returns Canonical scope with names, when its complete lineage remains valid.
 */
const readNotificationScope = async (db: Kysely<Database>, target: NotificationTarget): Promise<NotificationScope | null> => {
  const context = await buildNotificationSourceContext(target)
  const result = await sql<NotificationScope>`
    ${context}
    SELECT agency.id::text "agencyId", stream.id::text "streamId",
      agency.egcs_ay_name_en "agencyNameEn", agency.egcs_ay_name_fr "agencyNameFr",
      program.egcs_tp_name_en "programNameEn", program.egcs_tp_name_fr "programNameFr",
      stream.egcs_tp_name_en "streamNameEn", stream.egcs_tp_name_fr "streamNameFr"
    FROM assignment_paths path
    JOIN source_facts facts ON facts.id = path.id AND facts.entity_type = path.entity_type
    LEFT JOIN "Funding_Case_Intake_Profile" intake ON facts.entity_type = 'fundingcaseintake'
      AND intake.id = facts.id AND NOT intake._deleted
    LEFT JOIN "Funding_Opportunity_Profile" opportunity ON opportunity.id = intake.egcs_fi_fundingopportunity
      AND NOT opportunity._deleted
    JOIN "Transfer_Payment_Stream" stream ON stream.id = CASE
      WHEN facts.entity_type = 'fundingcaseagreement' THEN (
        SELECT agreement.egcs_fc_transferpaymentstream FROM "Funding_Case_Agreement_Profile" agreement
        WHERE agreement.id = facts.id AND NOT agreement._deleted
      )
      WHEN facts.entity_type = 'transferpaymentstream' THEN facts.id
      WHEN facts.entity_type = 'fundingcaseintake' THEN opportunity.egcs_fo_transferpaymentstream
    END AND NOT stream._deleted
    JOIN "Transfer_Payment_Profile" program ON program.id = stream.egcs_tp_transferpaymentprofile AND NOT program._deleted
    JOIN "Agency_Profile" agency ON agency.id = program.egcs_tp_agency AND NOT agency._deleted
    WHERE (SELECT valid FROM valid_context)
    ORDER BY cardinality(path.visited)
    LIMIT 1
  `.execute(db)
  return result.rows[0] ?? null
}

/**
 * Resolves the exact live Stream owner without searching Agency or Proponent siblings.
 * @param db Current database connection.
 * @param target Approval business target.
 * @returns Canonical Agency and Stream, or null for streamless or invalid sources.
 */
export const resolveApprovalNotificationScope = async (
  db: Kysely<Database>, target: NotificationTarget
): Promise<{ agencyId: string; streamId: string } | null> => {
  const scope = await readNotificationScope(db, target)
  return scope ? { agencyId: scope.agencyId, streamId: scope.streamId } : null
}

/**
 * Joins available bilingual names without repeating equal translations.
 * @param names Available English and French values.
 * @returns Bilingual display name, or blank when neither value exists.
 */
const bilingualName = (...names: (string | null | undefined)[]): string =>
  [...new Set(names.filter(name => name !== null && name !== undefined && name.trim() !== ''))].join(' / ')

/**
 * Resolves approval message identity through the same bounded business sources as assigned work.
 * Qualified entities have no SDK detail-route contract, so their owning business record is used.
 * @param db Current database connection.
 * @param target Approval business target.
 * @returns Business reference, bilingual title, canonical scope and authenticated detail path, when live.
 */
export const resolveApprovalNotificationDescriptor = async (
  db: Kysely<Database>,
  target: NotificationTarget
): Promise<{ reference: string; title: string; path: string; canonicalStreamId: string | null; canonicalAgencyId: string | null; agencyNameEn: string; agencyNameFr: string; programNameEn: string; programNameFr: string; streamNameEn: string; streamNameFr: string; agreementNumber: string } | null> => {
  const context = await buildNotificationSourceContext(target)
  const result = await sql<NotificationSource>`
    ${context}
    SELECT facts.id::text, facts.entity_type, facts.name_en, facts.name_fr, facts.reference,
      facts.agreement_id::text, facts.proponent_id::text, facts.variant, facts.program_id::text,
      COALESCE((
        SELECT agreement.reference FROM assignment_paths ancestor
        JOIN source_facts agreement ON agreement.id = ancestor.id AND agreement.entity_type = ancestor.entity_type
        WHERE ancestor.entity_type = 'fundingcaseagreement'
        ORDER BY cardinality(ancestor.visited) LIMIT 1
      ), '') agreement_number
    FROM assignment_paths path
    JOIN source_facts facts ON facts.id = path.id AND facts.entity_type = path.entity_type
    WHERE (${target.entityType.includes(':')} OR (facts.id = ${target.entityId}::bigint AND facts.entity_type = ${target.entityType}))
    AND (SELECT valid FROM valid_context)
    ORDER BY cardinality(path.visited)
    LIMIT 1
  `.execute(db)
  const source = result.rows[0]
  if (!source || (!isAssignableEntityType(source.entity_type) && source.entity_type !== 'transferpaymentstream')) return null
  const title = bilingualName(source.name_en, source.name_fr)
  if (!title) return null
  const path = source.entity_type === 'transferpaymentstream'
    ? `/transfer-payments/${source.program_id}/streams/${source.id}`
    : source.entity_type === 'fundingcaseaccountreceivablecreditmemo'
      ? `/proponents/edit/${source.proponent_id}/credit-memos/${source.id}`
      : buildAssignedWorkRoute(source.entity_type, source.id, source.agreement_id, source.variant)
  const scope = await readNotificationScope(db, target)
  return { reference: source.reference ?? title, title, path,
    canonicalStreamId: scope?.streamId ?? null, canonicalAgencyId: scope?.agencyId ?? null,
    agencyNameEn: scope?.agencyNameEn ?? '', agencyNameFr: scope?.agencyNameFr ?? '',
    programNameEn: scope?.programNameEn ?? '', programNameFr: scope?.programNameFr ?? '',
    streamNameEn: scope?.streamNameEn ?? '', streamNameFr: scope?.streamNameFr ?? '',
    agreementNumber: source.agreement_number }
}
