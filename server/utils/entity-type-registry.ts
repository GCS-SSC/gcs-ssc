import type { Kysely, Transaction } from 'kysely'
import {
  getCoreEntityDefinition,
  isCoreEntityType,
  type EntityApprovalSubmissionCapability,
  type EntityAssignmentMode,
  type EntityCompletionCapability,
  type EntityOwnerKind,
  type EntityRiskRatingCapability,
  type EntityStandardWorkflowCapability,
  type EntityWorkflowPurpose
} from '~~/shared/constants/entity-registry'
import type { Database, Entity_Type } from '~~/shared/types/database'

type DbClient = Kysely<Database> | Transaction<Database>

export interface EntityTypeLifecycleDefinition {
  type: Entity_Type
  completion: EntityCompletionCapability
  approvalSubmission: EntityApprovalSubmissionCapability
  standardWorkflow: EntityStandardWorkflowCapability
  riskRating: EntityRiskRatingCapability
  supportsDirectReviews: boolean
  ownerKind: EntityOwnerKind | null
  assignmentMode: EntityAssignmentMode | null
}

/**
 * Resolves the canonical code declaration or an installed extension declaration.
 * @param db - Database or transaction used for installed-type lookup.
 * @param entityType - Stable core or extension-qualified type identity.
 * @returns The installed lifecycle definition, or null when unavailable.
 */
export const resolveEntityTypeLifecycleDefinition = async (
  db: DbClient,
  entityType: Entity_Type
): Promise<EntityTypeLifecycleDefinition | null> => {
  if (isCoreEntityType(entityType)) {
    const definition = getCoreEntityDefinition(entityType)
    return {
      type: entityType,
      completion: definition.completion,
      approvalSubmission: definition.approvalSubmission,
      standardWorkflow: definition.standardWorkflow,
      riskRating: definition.riskRating,
      supportsDirectReviews: definition.supportsDirectReviews,
      ownerKind: definition.ownerKind,
      assignmentMode: definition.assignmentMode
    }
  }

  const row = await db.selectFrom('Common_Entity_Type')
    .select([
      'egcs_cn_type',
      'egcs_cn_completion',
      'egcs_cn_approvalsubmission',
      'egcs_cn_standardworkflow',
      'egcs_cn_riskrating',
      'egcs_cn_supportsdirectreviews',
      'egcs_cn_ownerkind',
      'egcs_cn_assignmentmode'
    ])
    .where('egcs_cn_type', '=', entityType)
    .where('_deleted', '=', false)
    .executeTakeFirst()

  return row
    ? {
        type: row.egcs_cn_type,
        completion: row.egcs_cn_completion,
        approvalSubmission: row.egcs_cn_approvalsubmission,
        standardWorkflow: row.egcs_cn_standardworkflow,
        riskRating: row.egcs_cn_riskrating,
        supportsDirectReviews: row.egcs_cn_supportsdirectreviews,
        ownerKind: row.egcs_cn_ownerkind,
        assignmentMode: row.egcs_cn_assignmentmode
      }
    : null
}

/**
 * Returns whether an installed type explicitly supports direct Review configuration.
 * @param db Registry database.
 * @param entityType Qualified or core entity type.
 * @returns Whether direct Review configuration is supported.
 */
export const supportsDirectReviewConfiguration = async (
  db: DbClient,
  entityType: Entity_Type
): Promise<boolean> => Boolean((await resolveEntityTypeLifecycleDefinition(db, entityType))?.supportsDirectReviews)

/**
 * Returns whether an installed lifecycle type accepts the requested Workflow purpose.
 * @param db Registry database.
 * @param entityType Qualified or core entity type.
 * @param purpose Requested Workflow purpose.
 * @returns Whether the type and purpose are compatible.
 */
export const supportsWorkflowConfiguration = async (
  db: DbClient,
  entityType: Entity_Type,
  purpose: EntityWorkflowPurpose
): Promise<boolean> => {
  const definition = await resolveEntityTypeLifecycleDefinition(db, entityType)
  return Boolean(definition && (
    (purpose === 'standard' && definition.standardWorkflow === 'explicit')
    || (purpose === 'approval_submission' && definition.approvalSubmission !== 'none')
    || (purpose === 'risk_rating' && definition.riskRating === 'explicit')
  ))
}
