import { resolveEntityTypeLifecycleDefinition } from './entity-type-registry'
/* eslint-disable jsdoc/require-jsdoc -- Relational workflow predicate authoring and immutable metadata. */
import { sql, type Kysely, type Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { WorkflowMemberConditionsSchema, type CustomFieldCondition, type WorkflowMemberCondition } from '~~/shared/types/schemas/agreement-custom-fields'
import { readWorkflowProfileChoices, resolveWorkflowProfileCondition } from './workflow-profile-conditions'
import { readAgreementCustomFieldDefinitions } from './agreement-custom-fields'

export const readWorkflowConditions = async (db: Kysely<Database>, memberId: string): Promise<WorkflowMemberCondition[]> => {
  const rows = await db.selectFrom('Common_Workflow_Member_Condition').selectAll()
    .where('egcs_cn_workflowsetupmember', '=', memberId).where('_deleted', '=', false).orderBy('egcs_cn_field').orderBy('egcs_cn_option').execute()
  const conditions = new Map<string, CustomFieldCondition>()
  for (const row of rows) {
    const condition = conditions.get(String(row.egcs_cn_field)) ?? { fieldId: String(row.egcs_cn_field), optionIds: [] }
    condition.optionIds.push(String(row.egcs_cn_option))
    conditions.set(String(row.egcs_cn_field), condition)
  }
  const member = await db.selectFrom('Common_Workflow_Setup_Member').selectAll().where('id', '=', memberId).executeTakeFirstOrThrow()
  return WorkflowMemberConditionsSchema.parse([...conditions.values(), ...(member.egcs_cn_profileconditions ?? [])])
}

export const replaceWorkflowConditions = async (
  trx: Transaction<Database>, streamId: string, memberId: string, conditions: WorkflowMemberCondition[]
): Promise<boolean> => {
  const setup = await trx.selectFrom('Common_Workflow_Setup_Member as m')
    .innerJoin('Common_Workflow_Setup as s', 's.id', 'm.egcs_cn_workflowsetup')
    .select(['s.egcs_cn_entitytype', 's.egcs_cn_scopeid']).where('m.id', '=', memberId).executeTakeFirstOrThrow()
  if (String(setup.egcs_cn_scopeid) !== streamId) return false
  if (conditions.length && (await resolveEntityTypeLifecycleDefinition(trx, setup.egcs_cn_entitytype))?.ownerKind !== 'agreement') return false
  const custom = conditions.filter((condition): condition is CustomFieldCondition => 'fieldId' in condition)
  const profile = conditions.filter(condition => 'source' in condition)
  if (profile.length) {
    const choices = await readWorkflowProfileChoices(trx, streamId)
    try {
      profile.forEach(condition => resolveWorkflowProfileCondition(condition, choices))
    } catch {
      return false
    }
  }
  const fields = await readAgreementCustomFieldDefinitions(trx, streamId)
  if (custom.some(condition => {
    const field = fields.find(candidate => candidate.id === condition.fieldId)
    return !field?.egcs_tp_active || field.egcs_tp_kind !== 'relational' || !field.egcs_tp_discriminator
      || condition.optionIds.some(id => !field.options.some(option => option.id === id && option.egcs_tp_active))
  })) return false
  await trx.updateTable('Common_Workflow_Setup_Member').set({ egcs_cn_profileconditions: sql`${JSON.stringify(profile)}::jsonb` }).where('id', '=', memberId).execute()
  await trx.updateTable('Common_Workflow_Member_Condition').set({ _deleted: true }).where('egcs_cn_workflowsetupmember', '=', memberId).execute()
  const rows = custom.flatMap(condition => condition.optionIds.map(optionId => ({ egcs_cn_workflowsetupmember: memberId, egcs_cn_field: condition.fieldId, egcs_cn_option: optionId })))
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
