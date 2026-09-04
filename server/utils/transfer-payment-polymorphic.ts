/* eslint-disable jsdoc/require-param, jsdoc/require-returns */
import type { Kysely } from 'kysely'
import type { Database, Entity_Type } from '~~/shared/types/database'
import type { PublicationState } from '~~/shared/constants/system-lifecycle'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export type ReviewSetupMemberRow = {
  id: string | number
  egcs_cn_reviewset: string | number
  egcs_cn_reviewschema: string | number
  egcs_cn_order: number
  egcs_cn_approvaltemplate?: string | number | null
  egcs_cn_failonchecklistfailure?: boolean | null
  egcs_cn_failurethreshold?: number | null
  egcs_cn_name_en?: string | null
  egcs_cn_name_fr?: string | null
  egcs_cn_outcomename_en?: string | null
  egcs_cn_outcomename_fr?: string | null
  egcs_cn_disablecustomoutcomes?: boolean | null
  egcs_cn_disablealignment?: boolean | null
  egcs_cn_disablereviewers?: boolean | null
  publicationId?: string | number | null
  publicationState?: PublicationState | null
  publicationVersionId?: string | number | null
  publicationVersion?: number | null
  egcs_cn_reviewtype?: Database['Common_Review_Schema']['egcs_cn_reviewtype'] | null
  _deleted: boolean
}

type ReviewSchemaValidationTarget = {
  entityType: Entity_Type
  schemaId: string
}

/** Confirms the published approval template belongs to the same stream scope. */
export const validateApprovalTemplateForScope = async (
  db: Kysely<Database>,
  streamId: string,
  approvalTemplateId?: string | null,
  options: { forUpdate?: boolean } = {}
) => {
  if (!approvalTemplateId) {
    return true
  }

  const query = db
    .selectFrom('Common_Approval_Template')
    .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Approval_Template.id')
    .select('Common_Approval_Template.id')
    .where('Common_Approval_Template.id', '=', approvalTemplateId)
    .where('Common_Approval_Template._deleted', '=', false)
    .where('Common_Approval_Template.egcs_cn_scopetype', '=', 'transferpaymentstream')
    .where('Common_Approval_Template.egcs_cn_scopeid', '=', streamId)
    .where('Common_Publication.egcs_cn_kind', '=', 'approval_template')
    .where('Common_Publication.egcs_cn_state', '=', 'published')
    .where('Common_Publication._deleted', '=', false)

  return Boolean(await (options.forUpdate ? query.forUpdate() : query).executeTakeFirst())
}

/** Ensures every requested published approval template exists for the same stream scope. */
export const validateApprovalTemplatesForScope = async (
  db: Kysely<Database>,
  streamId: string,
  approvalTemplateIds: string[]
) => {
  const uniqueApprovalTemplateIds = Array.from(new Set(approvalTemplateIds))
  if (uniqueApprovalTemplateIds.length === 0) {
    return true
  }

  const query = db
    .selectFrom('Common_Approval_Template')
    .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Approval_Template.id')
    .select('Common_Approval_Template.id')
    .where('Common_Approval_Template.id', 'in', uniqueApprovalTemplateIds)
    .where('Common_Approval_Template._deleted', '=', false)
    .where('Common_Approval_Template.egcs_cn_scopetype', '=', 'transferpaymentstream')
    .where('Common_Approval_Template.egcs_cn_scopeid', '=', streamId)
    .where('Common_Publication.egcs_cn_kind', '=', 'approval_template')
    .where('Common_Publication.egcs_cn_state', '=', 'published')
    .where('Common_Publication._deleted', '=', false)

  const existingApprovalTemplates = await query.execute()

  return existingApprovalTemplates.length === uniqueApprovalTemplateIds.length
}

/**
 * Ensures every requested review schema exists for the same agency.
 *
 * Empty input is treated as invalid for review-set validation, but the helper
 * returns `false` instead of throwing so existing routes can map that case to a
 * standard validation error response.
 */
export const validateReviewSchemasForAgency = async (
  db: Kysely<Database>,
  agencyId: string,
  reviewSchemaTargets: string[] | ReviewSchemaValidationTarget[]
) => {
  if (reviewSchemaTargets.length === 0) {
    return false
  }

  const requestedSchemaIds = reviewSchemaTargets.map(target => typeof target === 'string' ? target : target.schemaId)
  if (requestedSchemaIds.some(schemaId => !isPositivePostgresBigintText(schemaId))) {
    return false
  }

  if (typeof reviewSchemaTargets[0] === 'string') {
    const uniqueReviewSchemaIds = Array.from(new Set(reviewSchemaTargets as string[]))

    const existingReviewSchemas = await db
      .selectFrom('Common_Review_Schema')
      .select('id')
      .where('id', 'in', uniqueReviewSchemaIds)
      .where('egcs_cn_agency', '=', agencyId)
      .where('_deleted', '=', false)
      .execute()

    return existingReviewSchemas.length === uniqueReviewSchemaIds.length
  }

  const uniqueTargets = Array.from(
    new Map((reviewSchemaTargets as ReviewSchemaValidationTarget[]).map(target => [`${target.entityType}:${target.schemaId}`, target])).values()
  )
  const schemaIds = uniqueTargets.map(target => target.schemaId)

  const existingReviewSchemas = await db
    .selectFrom('Common_Review_Schema')
    .select(['id', 'egcs_cn_entitytype'])
    .where('id', 'in', schemaIds)
    .where('egcs_cn_agency', '=', agencyId)
    .where('_deleted', '=', false)
    .execute()

  const validTargets = new Set(existingReviewSchemas.map(schema => `${schema.egcs_cn_entitytype}:${String(schema.id)}`))
  return uniqueTargets.every(target => validTargets.has(`${target.entityType}:${target.schemaId}`))
}

/** Confirms the recommendation schema belongs to the same Agency. */
export const validateRecommendationSchemaForAgency = async (
  db: Kysely<Database>,
  agencyId: string,
  schemaId: string
) => {
  const schema = await db
    .selectFrom('Common_Recommendation_Schema')
    .select('id')
    .where('id', '=', schemaId)
    .where('egcs_cn_agency', '=', agencyId)
    .where('_deleted', '=', false)
    .executeTakeFirst()

  return Boolean(schema)
}

/** Ensures every requested recommendation schema exists for the same Agency. */
export const validateRecommendationSchemasForAgency = async (
  db: Kysely<Database>,
  agencyId: string,
  schemaIds: string[],
  options: { forUpdate?: boolean } = {}
) => {
  if (schemaIds.length === 0) {
    return true
  }

  if (schemaIds.some(schemaId => !isPositivePostgresBigintText(schemaId))) {
    return false
  }

  const uniqueSchemaIds = Array.from(new Set(schemaIds))

  const query = db
    .selectFrom('Common_Recommendation_Schema')
    .select('id')
    .where('id', 'in', uniqueSchemaIds)
    .where('egcs_cn_agency', '=', agencyId)
    .where('_deleted', '=', false)
  const existingSchemas = await (options.forUpdate ? query.forUpdate() : query).execute()

  return existingSchemas.length === uniqueSchemaIds.length
}

/** Groups review setup members by their parent review set setup ID. */
export const groupReviewSetupMembers = (members: ReviewSetupMemberRow[]) => {
  const membersBySetId = new Map<string, ReviewSetupMemberRow[]>()
  for (const member of members) {
    const setId = String(member.egcs_cn_reviewset)
    const existingMembers = membersBySetId.get(setId)
    if (existingMembers) {
      existingMembers.push(member)
    } else {
      membersBySetId.set(setId, [member])
    }
  }

  return membersBySetId
}

/** Normalizes review setup member rows for API responses. */
export const mapReviewSetupMembers = (members: ReviewSetupMemberRow[]) => members.map(member => ({
  id: String(member.id),
  egcs_cn_reviewschema: String(member.egcs_cn_reviewschema),
  ...(member.egcs_cn_reviewtype ? { egcs_cn_reviewtype: member.egcs_cn_reviewtype } : {}),
  egcs_cn_order: member.egcs_cn_order,
  ...(member.egcs_cn_approvaltemplate ? { egcs_cn_approvaltemplate: String(member.egcs_cn_approvaltemplate) } : {}),
  egcs_cn_failonchecklistfailure: member.egcs_cn_failonchecklistfailure === true,
  ...(member.egcs_cn_failurethreshold !== null && member.egcs_cn_failurethreshold !== undefined
    ? { egcs_cn_failurethreshold: member.egcs_cn_failurethreshold }
    : {}),
  egcs_cn_disablecustomoutcomes: member.egcs_cn_disablecustomoutcomes === true,
  egcs_cn_disablealignment: member.egcs_cn_disablealignment === true,
  egcs_cn_disablereviewers: member.egcs_cn_disablereviewers === true,
  ...(member.egcs_cn_name_en ? { egcs_cn_name_en: member.egcs_cn_name_en } : {}),
  ...(member.egcs_cn_name_fr ? { egcs_cn_name_fr: member.egcs_cn_name_fr } : {}),
  ...(member.egcs_cn_outcomename_en ? { egcs_cn_outcomename_en: member.egcs_cn_outcomename_en } : {}),
  ...(member.egcs_cn_outcomename_fr ? { egcs_cn_outcomename_fr: member.egcs_cn_outcomename_fr } : {}),
  ...(member.publicationId != null ? { publicationId: String(member.publicationId) } : {}),
  ...(member.publicationState != null ? { publicationState: member.publicationState } : {}),
  ...(member.publicationVersionId != null ? { publicationVersionId: String(member.publicationVersionId) } : {}),
  ...(member.publicationVersion != null ? { publicationVersion: member.publicationVersion } : {}),
  _deleted: member._deleted
}))
