/* eslint-disable jsdoc/require-jsdoc -- uses the canonical approval and assessment reference shapes. */
import type { H3Event } from 'h3'
import type { Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { getAssessmentHelperDefinition } from '~~/shared/utils/assessment-helpers'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import type { PortableAuthoringImportReport, PortableAuthoringSchema } from '~~/shared/utils/portable-authoring-schema'
import { listAgencyScopedCommonUsers } from './additional-reviewer-runtime'
import { isAssignableGroup } from './group-eligibility'
import { canAccessApplicantRecipient } from './applicant-recipient-auth'
import { requireAuthContext } from './authorize'

type ReferenceRemoval = PortableAuthoringImportReport['removed'][number]
type Approval = Extract<PortableAuthoringSchema, { kind: 'approval' }>
type Assessment = Extract<PortableAuthoringSchema, { kind: 'assessment' }>
type AssessmentDefinition = Assessment['payload']['egcs_cn_assessmentschema']
type Subsection = AssessmentDefinition['sections'][number]['subSections'][number]
type Dependency = NonNullable<Subsection['depends']>[number]

export const prepareApprovalImport = async (
  trx: Transaction<Database>,
  agencyId: string,
  definition: Approval,
  removed: ReferenceRemoval[]
): Promise<Approval> => {
  const { payload } = definition
  const wantedTypes = [...new Set([
    ...payload.egcs_cn_additionalattachmenttypeids,
    ...payload.steps.flatMap(step => step.egcs_cn_attachmenttypeids)
  ])]
  const types = wantedTypes.length
    ? await trx.selectFrom('Common_Attachment_Types').select('id')
        .where('egcs_cn_agency', '=', agencyId).where('_deleted', '=', false)
        .where('id', 'in', wantedTypes).execute()
    : []
  const attachmentIds = new Set(types.map(item => String(item.id)))
  const users = payload.steps.some(step => step.egcs_cn_defaultuser)
    ? await listAgencyScopedCommonUsers(trx, agencyId)
    : []
  const userIds = new Set(users.map(user => user.id))
  const groupIds = new Set<string>()
  for (const id of new Set(payload.steps.flatMap(step => step.egcs_cn_defaultgroup ? [step.egcs_cn_defaultgroup] : []))) {
    if (await isAssignableGroup(trx, id, agencyId)) groupIds.add(id)
  }

  const keepTypes = (ids: string[], path: string) => ids.filter(id => {
    if (attachmentIds.has(id)) return true
    removed.push({ path, reference: id })
    return false
  })
  const steps = payload.steps.flatMap((step, index) => {
    const path = `steps.${index + 1}`
    const group = step.egcs_cn_defaultgroup
    const user = step.egcs_cn_defaultuser
    if ((group && user) || (!group && !user) || (group && !groupIds.has(group)) || (user && !userIds.has(user))) {
      removed.push({ path, reference: step.egcs_cn_name_en })
      return []
    }
    return [{ ...step, egcs_cn_attachmenttypeids: keepTypes(step.egcs_cn_attachmenttypeids, `${path}.egcs_cn_attachmenttypeids`) }]
  })

  return {
    ...definition,
    payload: {
      ...payload,
      steps,
      egcs_cn_additionalattachmenttypeids: keepTypes(payload.egcs_cn_additionalattachmenttypeids, 'egcs_cn_additionalattachmenttypeids')
    }
  }
}

export const prepareAssessmentImport = async (
  event: H3Event,
  trx: Transaction<Database>,
  agencyId: string,
  definition: Assessment,
  removed: ReferenceRemoval[]
): Promise<Assessment> => {
  const prepared = structuredClone(definition)
  const { egcs_cn_entitytype: entityType, egcs_cn_assessmentschema: schema } = prepared.payload
  const lookups = new Map<string, Promise<boolean>>()
  const referenceExists = async (field: string, value: string | number | boolean) => {
    const table = getAssessmentHelperDefinition(entityType, field)?.referenceTable
    if (!table) return true
    if (typeof value !== 'string' || !isPositivePostgresBigintText(value)) return false
    const key = `${table}:${value}`
    const lookup = async () => {
      switch (table) {
        case 'Agency_Profile':
          return value === agencyId
        case 'Agency_Applicant_Recipient_Subtype':
          return Boolean(await trx.selectFrom(table).select('id').where('id', '=', value)
            .where('egcs_ay_organizationagency', '=', agencyId).where('_deleted', '=', false).executeTakeFirst())
        case 'Transfer_Payment_Agreement_Subtype':
          return Boolean(await trx.selectFrom(`${table} as subtype`)
            .innerJoin('Transfer_Payment_Stream as stream', 'stream.id', 'subtype.egcs_tp_transferpaymentstream')
            .innerJoin('Transfer_Payment_Profile as program', 'program.id', 'stream.egcs_tp_transferpaymentprofile')
            .select('subtype.id').where('subtype.id', '=', value)
            .where('program.egcs_tp_agency', '=', agencyId)
            .where('subtype._deleted', '=', false).where('stream._deleted', '=', false).where('program._deleted', '=', false)
            .executeTakeFirst())
        case 'Common_User':
          return (await listAgencyScopedCommonUsers(trx, agencyId)).some(user => user.id === value)
        case 'Applicant_Recipient_Profile':
          return await canAccessApplicantRecipient(await requireAuthContext(event), value, 'read', trx)
        default:
          return false
      }
    }
    const pending = lookups.get(key) ?? lookup()
    lookups.set(key, pending)
    return await pending
  }
  const cleanDependencies = async (rules: Subsection['depends'], path: string) => {
    if (!rules) return undefined
    const accepted: Dependency[] = []
    for (const [index, rule] of rules.entries()) {
      const alternatives = Array.isArray(rule) ? rule : [rule]
      const retained: typeof alternatives = []
      for (const [alternativeIndex, alternative] of alternatives.entries()) {
        if (alternative.on.type === 'helpers' && !await referenceExists(alternative.on.field, alternative.value)) {
          const rulePath = `${path}.depends.${index + 1}`
          removed.push({
            path: Array.isArray(rule) ? `${rulePath}.${alternativeIndex + 1}` : rulePath,
            reference: String(alternative.value)
          })
        } else {
          retained.push(alternative)
        }
      }
      if (retained.length === alternatives.length) accepted.push(rule)
      else if (retained.length) accepted.push(retained)
    }
    return accepted
  }
  const cleanWeight = async (weight: Subsection['weight'], path: string) => {
    const modifiers = Array.isArray(weight) ? weight[1] : weight.adjustable ? [weight] : []
    for (const [index, modifier] of modifiers.entries()) {
      if (modifier.on.type !== 'helpers') continue
      const validWeights: [string, number][] = []
      for (const [id, value] of Object.entries(modifier.weights)) {
        if (await referenceExists(modifier.on.field, id)) {
          validWeights.push([id, value])
        } else {
          removed.push({ path: `${path}.weight.${index + 1}`, reference: id })
        }
      }
      modifier.weights = Object.fromEntries(validWeights)
    }
  }

  if (schema.helpers) {
    const validHelpers: [string, string | number | boolean][] = []
    for (const [field, value] of Object.entries(schema.helpers)) {
      if (await referenceExists(field, value)) {
        validHelpers.push([field, value])
      } else {
        removed.push({ path: `helpers.${field}`, reference: String(value) })
      }
    }
    schema.helpers = Object.fromEntries(validHelpers)
  }
  for (const section of schema.sections) {
    for (const subsection of section.subSections) {
      const path = `sections.${section.name}.subSections.${subsection.name}`
      subsection.depends = await cleanDependencies(subsection.depends, path)
      await cleanWeight(subsection.weight, path)
      for (const question of subsection.questions) {
        const questionPath = `${path}.questions.${question.name}`
        question.depends = await cleanDependencies(question.depends, questionPath)
        await cleanWeight(question.weight, questionPath)
      }
    }
  }
  return prepared
}
