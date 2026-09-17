/* eslint-disable jsdoc/require-jsdoc -- Relational workflow predicate authoring and immutable metadata. */
import type { Kysely, Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { WorkflowMemberCondition } from '~~/shared/types/schemas/agreement-custom-fields'
import { readAgreementCustomFieldDefinitions } from './agreement-custom-fields'

export const readWorkflowConditions = async (db: Kysely<Database>, memberId: string): Promise<WorkflowMemberCondition[]> => {
  const rows = await db.selectFrom('Common_Workflow_Member_Condition').selectAll()
    .where('egcs_cn_workflowsetupmember', '=', memberId).where('_deleted', '=', false).orderBy('egcs_cn_field').orderBy('egcs_cn_option').execute()
  const conditions = new Map<string, WorkflowMemberCondition>()
  for (const row of rows) {
    const condition = conditions.get(String(row.egcs_cn_field)) ?? { fieldId: String(row.egcs_cn_field), optionIds: [] }
    condition.optionIds.push(String(row.egcs_cn_option))
    conditions.set(String(row.egcs_cn_field), condition)
  }
  return [...conditions.values()]
}

export const replaceWorkflowConditions = async (
  trx: Transaction<Database>, streamId: string, memberId: string, conditions: WorkflowMemberCondition[]
): Promise<boolean> => {
  const fields = await readAgreementCustomFieldDefinitions(trx, streamId)
  if (conditions.some(condition => {
    const field = fields.find(candidate => candidate.id === condition.fieldId)
    return !field?.egcs_tp_active || field.egcs_tp_kind !== 'relational' || !field.egcs_tp_discriminator
      || condition.optionIds.some(id => !field.options.some(option => option.id === id && option.egcs_tp_active))
  })) return false
  await trx.updateTable('Common_Workflow_Member_Condition').set({ _deleted: true }).where('egcs_cn_workflowsetupmember', '=', memberId).execute()
  const rows = conditions.flatMap(condition => condition.optionIds.map(optionId => ({ egcs_cn_workflowsetupmember: memberId, egcs_cn_field: condition.fieldId, egcs_cn_option: optionId })))
  if (rows.length) await trx.insertInto('Common_Workflow_Member_Condition').values(rows).execute()
  return true
}

export const customFieldHasWorkflowReferences = async (
  db: Kysely<Database>, fieldId: string, options: { optionId?: string, includeHistory: boolean }
): Promise<boolean> => {
  let working = db.selectFrom('Common_Workflow_Member_Condition as condition')
    .innerJoin('Common_Workflow_Setup_Member as member', 'member.id', 'condition.egcs_cn_workflowsetupmember')
    .innerJoin('Common_Workflow_Setup as setup', 'setup.id', 'member.egcs_cn_workflowsetup')
    .select('condition.id').where('condition.egcs_cn_field', '=', fieldId)
    .where('condition._deleted', '=', false).where('member._deleted', '=', false).where('setup._deleted', '=', false)
  if (options.optionId) working = working.where('condition.egcs_cn_option', '=', options.optionId)
  if (await working.executeTakeFirst()) return true
  let published = db.selectFrom('Common_Workflow_Publication_Condition as condition')
    .innerJoin('Common_Publication_Version as version', 'version.id', 'condition.egcs_cn_publicationversion')
    .innerJoin('Common_Publication as publication', 'publication.id', 'version.egcs_cn_publication')
    .innerJoin('Common_Workflow_Setup as setup', 'setup.id', 'publication.id')
    .select('condition.id').where('condition.egcs_cn_field', '=', fieldId)
  if (options.optionId) published = published.where('condition.egcs_cn_option', '=', options.optionId)
  if (!options.includeHistory) published = published.where('publication.egcs_cn_state', '=', 'published')
    .whereRef('publication.egcs_cn_currentversion', '=', 'version.id')
    .where(eb => eb.or([
      eb('setup.egcs_cn_purpose', '=', 'standard'),
      eb.exists(eb.selectFrom('Common_Publication_Selection as selection').select('selection.id')
        .whereRef('selection.egcs_cn_publication', '=', 'publication.id'))
    ]))
  return Boolean(await published.executeTakeFirst())
}
