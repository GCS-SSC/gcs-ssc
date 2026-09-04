import type { Selectable, Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { z } from 'zod'
import type { CommonWorkflowSetupMemberOwnersSchema } from '~~/shared/types/schemas'

type WorkflowMember = Selectable<Database['Common_Workflow_Setup_Member']>
type WorkflowMemberOwner = z.infer<typeof CommonWorkflowSetupMemberOwnersSchema>[number]
type WorkflowSetupIdentity = Pick<Selectable<Database['Common_Workflow_Setup']>, 'id' | 'egcs_cn_scopetype' | 'egcs_cn_scopeid' | 'egcs_cn_entitytype'>
type WorkflowMemberReference = Pick<WorkflowMember, 'egcs_cn_kind'> & Partial<Pick<
  WorkflowMember,
  'egcs_cn_reviewset' | 'egcs_cn_recommendationset' | 'egcs_cn_approvaltemplate'
>>

/**
 * Confirms a selected workflow member belongs to the setup's exact scope; review sets also match target type.
 * @param trx Transaction used to resolve the referenced setup.
 * @param setup Owning workflow setup identity.
 * @param member Proposed workflow member reference.
 * @returns Whether the reference is active and belongs to the workflow setup.
 */
export const isValidWorkflowSetupMemberReference = async (
  trx: Transaction<Database>,
  setup: WorkflowSetupIdentity,
  member: WorkflowMemberReference
): Promise<boolean> => {
  if (member.egcs_cn_kind === 'review_set' && member.egcs_cn_reviewset) {
    return Boolean(await trx.selectFrom('Common_Review_Set_Setup')
      .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Review_Set_Setup.id')
      .select('Common_Review_Set_Setup.id')
      .where('Common_Review_Set_Setup.id', '=', String(member.egcs_cn_reviewset))
      .where('Common_Review_Set_Setup.egcs_cn_scopetype', '=', setup.egcs_cn_scopetype)
      .where('Common_Review_Set_Setup.egcs_cn_scopeid', '=', String(setup.egcs_cn_scopeid))
      .where('Common_Review_Set_Setup.egcs_cn_entitytype', '=', setup.egcs_cn_entitytype)
      .where('Common_Publication.egcs_cn_state', '=', 'published')
      .where('Common_Review_Set_Setup._deleted', '=', false).where('Common_Publication._deleted', '=', false)
      .forUpdate().executeTakeFirst())
  }
  if (member.egcs_cn_kind === 'recommendation_set' && member.egcs_cn_recommendationset) {
    return Boolean(await trx.selectFrom('Common_Recommendation_Set_Setup')
      .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Recommendation_Set_Setup.id')
      .select('Common_Recommendation_Set_Setup.id')
      .where('Common_Recommendation_Set_Setup.id', '=', String(member.egcs_cn_recommendationset))
      .where('Common_Recommendation_Set_Setup.egcs_cn_scopetype', '=', setup.egcs_cn_scopetype)
      .where('Common_Recommendation_Set_Setup.egcs_cn_scopeid', '=', String(setup.egcs_cn_scopeid))
      .where('Common_Publication.egcs_cn_state', '=', 'published')
      .where('Common_Recommendation_Set_Setup._deleted', '=', false).where('Common_Publication._deleted', '=', false)
      .forUpdate().executeTakeFirst())
  }
  if (member.egcs_cn_kind === 'approval_template' && member.egcs_cn_approvaltemplate) {
    if (!['fundingopportunity', 'transferpaymentstream'].includes(setup.egcs_cn_scopetype)) return false
    const scopeType = setup.egcs_cn_scopetype as 'fundingopportunity' | 'transferpaymentstream'
    return Boolean(await trx.selectFrom('Common_Approval_Template')
      .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Approval_Template.id')
      .innerJoin('Common_Publication_Version', 'Common_Publication_Version.id', 'Common_Publication.egcs_cn_currentversion')
      .select('Common_Approval_Template.id')
      .where('Common_Approval_Template.id', '=', String(member.egcs_cn_approvaltemplate))
      .where('Common_Approval_Template.egcs_cn_scopetype', '=', scopeType)
      .where('Common_Approval_Template.egcs_cn_scopeid', '=', String(setup.egcs_cn_scopeid))
      .where('Common_Publication.egcs_cn_state', '=', 'published')
      .where('Common_Approval_Template._deleted', '=', false).where('Common_Publication._deleted', '=', false)
      .forUpdate().executeTakeFirst())
  }
  return false
}

/**
 * Replaces owner defaults only after every nested member and user reference is current and valid.
 * @param trx Transaction used for validation and replacement.
 * @param member Persisted workflow setup member.
 * @param owners Proposed nested-member owner mappings.
 * @returns Whether every mapping was valid and the replacement was applied.
 */
export const replaceWorkflowSetupMemberOwners = async (
  trx: Transaction<Database>,
  member: WorkflowMember,
  owners: WorkflowMemberOwner[]
): Promise<boolean> => {
  if (member.egcs_cn_kind === 'approval_template') return owners.length === 0

  const nestedIds = owners.map(owner => String(
    member.egcs_cn_kind === 'review_set' ? owner.egcs_cn_reviewsetup : owner.egcs_cn_recommendationsetup
  ))
  if (nestedIds.some(id => id === 'undefined') || new Set(nestedIds).size !== nestedIds.length) return false

  if (nestedIds.length > 0) {
    const validNested = member.egcs_cn_kind === 'review_set'
      ? await trx.selectFrom('Common_Review_Setup').select('id')
          .where('id', 'in', nestedIds).where('egcs_cn_reviewset', '=', String(member.egcs_cn_reviewset))
          .where('_deleted', '=', false).forUpdate().execute()
      : await trx.selectFrom('Common_Recommendation_Setup').select('id')
          .where('id', 'in', nestedIds).where('egcs_cn_recommendationset', '=', String(member.egcs_cn_recommendationset))
          .where('_deleted', '=', false).forUpdate().execute()
    if (validNested.length !== nestedIds.length) return false
  }

  const ownerIds = [...new Set(owners.flatMap(owner => owner.egcs_cn_defaultowner ? [String(owner.egcs_cn_defaultowner)] : []))]
  if (ownerIds.length > 0) {
    const validOwners = await trx.selectFrom('Common_User').select('id')
      .where('id', 'in', ownerIds).where('_deleted', '=', false).forUpdate().execute()
    if (validOwners.length !== ownerIds.length) return false
  }

  await trx.updateTable('Common_Workflow_Setup_Member_Owner').set({ _deleted: true })
    .where('egcs_cn_workflowsetupmember', '=', String(member.id)).where('_deleted', '=', false).execute()
  if (owners.length > 0) {
    await trx.insertInto('Common_Workflow_Setup_Member_Owner').values(owners.map(owner => ({
      ...owner, egcs_cn_workflowsetupmember: String(member.id), _deleted: false
    }))).execute()
  }
  return true
}
