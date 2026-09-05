/* eslint-disable jsdoc/require-jsdoc -- Relational workflow predicate authoring and immutable metadata. */
import type { Kysely, Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { WorkflowMemberCondition } from '~~/shared/types/schemas/agreement-custom-fields'
import { readAgreementCustomFieldDefinitions } from './agreement-custom-fields'

export const readWorkflowConditions = async (db: Kysely<Database>, memberId: string): Promise<WorkflowMemberCondition[]> => {
  const rows = await db.selectFrom('Common_Workflow_Member_Condition').selectAll()
    .where('member_id', '=', memberId).where('_deleted', '=', false).orderBy('field_id').orderBy('option_id').execute()
  const conditions = new Map<string, WorkflowMemberCondition>()
  for (const row of rows) {
    const condition = conditions.get(String(row.field_id)) ?? { fieldId: String(row.field_id), optionIds: [] }
    condition.optionIds.push(String(row.option_id))
    conditions.set(String(row.field_id), condition)
  }
  return [...conditions.values()]
}

export const replaceWorkflowConditions = async (
  trx: Transaction<Database>, streamId: string, memberId: string, conditions: WorkflowMemberCondition[]
): Promise<boolean> => {
  const fields = await readAgreementCustomFieldDefinitions(trx, streamId)
  if (conditions.some(condition => {
    const field = fields.find(candidate => candidate.id === condition.fieldId)
    return !field?.active || field.kind !== 'relational' || !field.discriminator
      || condition.optionIds.some(id => !field.options.some(option => option.id === id && option.active))
  })) return false
  await trx.updateTable('Common_Workflow_Member_Condition').set({ _deleted: true }).where('member_id', '=', memberId).execute()
  const rows = conditions.flatMap(condition => condition.optionIds.map(optionId => ({ member_id: memberId, field_id: condition.fieldId, option_id: optionId })))
  if (rows.length) await trx.insertInto('Common_Workflow_Member_Condition').values(rows).execute()
  return true
}

export const customFieldHasWorkflowReferences = async (
  db: Kysely<Database>, fieldId: string, options: { optionId?: string, includeHistory: boolean }
): Promise<boolean> => {
  let working = db.selectFrom('Common_Workflow_Member_Condition as condition')
    .innerJoin('Common_Workflow_Setup_Member as member', 'member.id', 'condition.member_id')
    .innerJoin('Common_Workflow_Setup as setup', 'setup.id', 'member.egcs_cn_workflowsetup')
    .select('condition.id').where('condition.field_id', '=', fieldId)
    .where('condition._deleted', '=', false).where('member._deleted', '=', false).where('setup._deleted', '=', false)
  if (options.optionId) working = working.where('condition.option_id', '=', options.optionId)
  if (await working.executeTakeFirst()) return true
  let published = db.selectFrom('Common_Workflow_Publication_Condition as condition')
    .innerJoin('Common_Publication_Version as version', 'version.id', 'condition.version_id')
    .innerJoin('Common_Publication as publication', 'publication.id', 'version.egcs_cn_publication')
    .innerJoin('Common_Workflow_Setup as setup', 'setup.id', 'publication.id')
    .select('condition.id').where('condition.field_id', '=', fieldId)
  if (options.optionId) published = published.where('condition.option_id', '=', options.optionId)
  if (!options.includeHistory) published = published.where('publication.egcs_cn_state', '=', 'published')
    .whereRef('publication.egcs_cn_currentversion', '=', 'version.id')
    .where(eb => eb.or([
      eb('setup.egcs_cn_purpose', '=', 'standard'),
      eb.exists(eb.selectFrom('Common_Publication_Selection as selection').select('selection.id')
        .whereRef('selection.egcs_cn_publication', '=', 'publication.id'))
    ]))
  return Boolean(await published.executeTakeFirst())
}
