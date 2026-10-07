import type { Kysely, Transaction } from 'kysely'
import type { Database, Workflow_Purpose } from '~~/shared/types/database'
import { readPublishedReviewSetup } from './review-setup-versioning'
import { readPublishedReviewSchema } from './review-schema-versioning'

type DbClient = Kysely<Database> | Transaction<Database>
type RiskSourceSetup = { id: string, egcs_cn_purpose: Workflow_Purpose }
type RiskSourceMember = {
  id?: string
  egcs_cn_kind: string
  egcs_cn_reviewset?: string | null
  egcs_cn_setsriskrating?: boolean
  egcs_cn_riskreviewsetup?: string | null
}

/**
 * Lists assessments from the selected review set's immutable published plan.
 * @param db Database connection in the caller's authorization transaction.
 * @param reviewSetId Selected review set.
 * @returns Bilingual assessment choices with review setup member IDs.
 */
export const readPublishedRiskAssessmentMembers = async (db: DbClient, reviewSetId: string) => {
  const publication = await db.selectFrom('Common_Publication')
    .innerJoin('Common_Publication_Version', 'Common_Publication_Version.id', 'Common_Publication.egcs_cn_currentversion')
    .select('Common_Publication_Version.egcs_cn_definition')
    .where('Common_Publication.id', '=', reviewSetId)
    .where('Common_Publication.egcs_cn_kind', '=', 'review_set_setup')
    .where('Common_Publication.egcs_cn_state', '=', 'published')
    .where('Common_Publication._deleted', '=', false)
    .executeTakeFirst()
  if (!publication) return []
  const plan = readPublishedReviewSetup(publication.egcs_cn_definition)
  const assessments = plan.members.filter(member => member.reviewType === 'assessment')
  if (!assessments.length) return []
  const versions = await db.selectFrom('Common_Publication_Version')
    .select(['id', 'egcs_cn_definition'])
    .where('id', 'in', assessments.map(member => member.schema.publicationVersionId)).execute()
  return assessments.flatMap(member => {
    const version = versions.find(candidate => String(candidate.id) === member.schema.publicationVersionId)
    const schema = version ? readPublishedReviewSchema(version.egcs_cn_definition) : null
    return schema?.reviewType === 'assessment'
      ? [{ id: member.memberId, egcs_cn_order: member.order, egcs_cn_name_en: schema.name.en, egcs_cn_name_fr: schema.name.fr }]
      : []
  })
}

/**
 * Validates the explicit risk source, including uniqueness within the locked workflow.
 * @param db Workflow mutation transaction.
 * @param setup Owning workflow identity and purpose.
 * @param member Proposed merged member values.
 * @returns Whether the risk source is valid for this workflow.
 */
export const isValidWorkflowRiskSource = async (
  db: DbClient,
  setup: RiskSourceSetup,
  member: RiskSourceMember
): Promise<boolean> => {
  if (!member.egcs_cn_setsriskrating) return !member.egcs_cn_riskreviewsetup
  if (setup.egcs_cn_purpose !== 'risk_rating' || member.egcs_cn_kind !== 'review_set'
    || !member.egcs_cn_reviewset || !member.egcs_cn_riskreviewsetup) return false
  const choices = await readPublishedRiskAssessmentMembers(db, String(member.egcs_cn_reviewset))
  if (!choices.some(choice => choice.id === String(member.egcs_cn_riskreviewsetup))) return false
  let selected = db.selectFrom('Common_Workflow_Setup_Member').select('id')
    .where('egcs_cn_workflowsetup', '=', setup.id)
    .where('egcs_cn_setsriskrating', '=', true).where('_deleted', '=', false)
  if (member.id) selected = selected.where('id', '!=', member.id)
  return !await selected.executeTakeFirst()
}
