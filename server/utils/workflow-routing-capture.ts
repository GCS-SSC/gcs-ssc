/* eslint-disable jsdoc/require-jsdoc -- Transaction-bound capture of Agreement routing inputs; no condition evaluation. */
import type { Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { ReviewRuntimeEntityContext } from './review-runtime-access'
import type { PublishedWorkflowConfiguration } from './workflow-setup-versioning'
import { WorkflowRouteValidationError, type WorkflowRoutingSnapshot, type WorkflowRoutingEvidence } from './workflow-routing-contract'
import { profileConditionLabels, readWorkflowProfileChoices } from './workflow-profile-conditions'
import { readAssignedAgencyCustomFieldDefinitions } from './agreement-custom-fields'
import { customFieldOptionIds, type AgreementRoutingValues, type AgreementCustomFieldValues } from '~~/shared/types/schemas/agreement-custom-fields'
import { journalVoucherPaymentIsFinal } from './journal-voucher-source'

export const captureWorkflowRoutingSnapshot = async (
  trx: Transaction<Database>, context: ReviewRuntimeEntityContext, definition: PublishedWorkflowConfiguration
): Promise<WorkflowRoutingSnapshot> => {
  const referencedIds = [...new Set(definition.members.flatMap(member => (member.conditions ?? []).flatMap(condition => 'fieldId' in condition ? [condition.fieldId] : [])))]
  const agreementId = context.entityType === 'fundingcaseagreement' ? context.entityId : context.agreementId ?? null
  const values: AgreementCustomFieldValues = {}
  const capturedFields: WorkflowRoutingEvidence['fields'] = []
  const profileConditions = definition.members.flatMap(member => (member.conditions ?? []).filter(condition => 'source' in condition))
  let profile: AgreementRoutingValues | undefined
  const relationships: NonNullable<WorkflowRoutingEvidence['relationships']> = []
  if (referencedIds.length || profileConditions.length) {
    if (!agreementId) throw new WorkflowRouteValidationError('Conditional workflow requires an owning Agreement')
    const agreement = await trx.selectFrom('Funding_Case_Agreement_Profile').select(['egcs_fc_customfields', 'egcs_fc_transferpaymentstream', 'egcs_fc_agreementsubtype', 'egcs_fc_furtherdistribution'])
      .where('id', '=', agreementId).where('_deleted', '=', false).forUpdate().executeTakeFirstOrThrow()
    if (profileConditions.length) {
      const stream = await trx.selectFrom('Transfer_Payment_Stream as stream')
        .innerJoin('Transfer_Payment_Profile as program', 'program.id', 'stream.egcs_tp_transferpaymentprofile')
        .select('program.egcs_tp_agency as agencyId')
        .where('stream.id', '=', agreement.egcs_fc_transferpaymentstream)
        .where('stream._deleted', '=', false).where('program._deleted', '=', false)
        .executeTakeFirstOrThrow()
      const agreementType = agreement.egcs_fc_agreementsubtype === null
        ? null
        : await trx.selectFrom('Transfer_Payment_Agreement_Subtype')
            .select('egcs_tp_agreementtype')
            .where('id', '=', agreement.egcs_fc_agreementsubtype)
            .where('egcs_tp_transferpaymentstream', '=', agreement.egcs_fc_transferpaymentstream)
            .where('_deleted', '=', false).executeTakeFirst()
      const rows = await trx.selectFrom('Funding_Case_Agreement_Applicant_Recipient as r')
        .innerJoin('Applicant_Recipient_Profile as p', 'p.id', 'r.egcs_fc_applicantrecipient')
        .leftJoin('Agency_Applicant_Recipient_Subtype as t', 't.id', 'r.egcs_fc_applicantrecipientsubtype')
        .where('r.egcs_fc_fundingagreement', '=', agreementId).where('r._deleted', '=', false).where('p._deleted', '=', false)
        .select(['r.id', 'p.id as proponentId', 'r.egcs_fc_applicantrecipientsubtype as subtypeId', 't.egcs_ay_name_en as name_en', 't.egcs_ay_name_fr as name_fr'])
        .orderBy('p.id').orderBy('r.id').forShare(['p']).execute()
      relationships.push(...rows.map(row => ({ relationshipId: String(row.id), proponentId: String(row.proponentId), subtypeId: row.subtypeId === null ? null : String(row.subtypeId), name_en: row.name_en, name_fr: row.name_fr })))
      profile = { agreement_subtype: agreementType?.egcs_tp_agreementtype ?? null, further_distribution: agreement.egcs_fc_furtherdistribution, recipient_subtype: relationships.map(row => row.subtypeId) }
      if (profileConditions.some(condition => condition.source === 'amendment_subtype')) {
        // Other Agreement-owned targets have no amendment selection. Do not infer
        // one from an open/sibling amendment or its parent Agreement.
        const subtypes = context.entityType === 'fundingcaseamendment'
          ? await trx.selectFrom('Funding_Case_Agreement_Amendment_Subtype as selected')
              .innerJoin('Funding_Case_Agreement_Amendment as amendment', 'amendment.id', 'selected.egcs_fc_amendment')
              .innerJoin('Transfer_Payment_Amendment_Subtype as subtype', 'subtype.id', 'selected.egcs_fc_amendmentsubtype')
              .select('subtype.id')
              .where('amendment.id', '=', context.entityId).where('amendment.egcs_fc_fundingagreement', '=', agreementId)
              .where('subtype.egcs_tp_transferpaymentstream', '=', agreement.egcs_fc_transferpaymentstream)
              .where('selected._deleted', '=', false).where('amendment._deleted', '=', false).where('subtype._deleted', '=', false)
              .orderBy('subtype.id').execute()
          : []
        profile.amendment_subtype = subtypes.map(row => String(row.id))
      }
      if (profileConditions.some(condition => condition.source.startsWith('jv_'))) {
        if (context.entityType !== 'fundingcasejournalvoucher') throw new WorkflowRouteValidationError('JV conditions require a Journal Voucher target')
        const voucher = await trx.selectFrom('Funding_Case_Agreement_Journal_Voucher as jv')
          .innerJoin('Agency_Fiscal_Year as fy', 'fy.id', 'jv.egcs_fc_agencyfiscalyear')
          .innerJoin('Funding_Case_Agreement_Payment as p', 'p.id', 'jv.egcs_fc_payment')
          .innerJoin('Common_Status as status', 'status.id', 'p.egcs_fc_status')
          .select(['fy.egcs_ay_jvopen', 'jv.egcs_fc_narrative_en', 'jv.egcs_fc_narrative_fr', journalVoucherPaymentIsFinal('p').as('isFinal'), 'fy._deleted as fiscalDeleted'])
          .where('jv.id', '=', context.entityId).forShare(['fy', 'p', 'status']).executeTakeFirstOrThrow()
        profile.jv_fiscal_eligible = voucher.egcs_ay_jvopen && !voucher.fiscalDeleted
        profile.jv_payment_final = voucher.isFinal
        profile.jv_rationale_present = Boolean(voucher.egcs_fc_narrative_en.trim() || voucher.egcs_fc_narrative_fr.trim())
      }
      const amendmentSubtypeIds = [...new Set([
        ...profileConditions.flatMap(condition => condition.source === 'amendment_subtype' ? condition.optionIds : []),
        ...profile.amendment_subtype ?? []
      ])]
      const choices = await readWorkflowProfileChoices(trx, String(stream.agencyId), { amendmentSubtypeIds })
      for (const source of new Set(profileConditions.map(condition => condition.source))) {
        const labels = profileConditionLabels[source]
        if (source === 'further_distribution' || source === 'jv_fiscal_eligible' || source === 'jv_payment_final' || source === 'jv_rationale_present') {
          capturedFields.push({ fieldId: source, ...labels, optionId: String(profile[source]), option_en: profile[source] ? 'Yes' : 'No', option_fr: profile[source] ? 'Oui' : 'Non' })
        } else if (source === 'recipient_subtype') {
          for (const row of relationships) capturedFields.push({ fieldId: source, ...labels, optionId: row.relationshipId, option_en: row.name_en ?? 'Unclassified', option_fr: row.name_fr ?? 'Non classé' })
        } else if (source === 'amendment_subtype') {
          for (const id of profile.amendment_subtype ?? []) {
            const option = choices.amendment_subtype.find(item => item.id === id)
            if (option) capturedFields.push({ fieldId: source, ...labels, optionId: option.id,
              option_en: `${option.name_en} (${option.category_en})`, option_fr: `${option.name_fr} (${option.category_fr})` })
          }
        } else {
          const option = choices[source].find(item => item.id === profile![source])
          if (option) capturedFields.push({ fieldId: source, ...labels, optionId: option.id, option_en: option.name_en, option_fr: option.name_fr })
        }
      }
    }
    const fields = await readAssignedAgencyCustomFieldDefinitions(trx, agreement.egcs_fc_transferpaymentstream)
    for (const fieldId of referencedIds) {
      const field = fields.find(candidate => candidate.id === fieldId)
      const value = customFieldOptionIds(agreement.egcs_fc_customfields[fieldId])
      // A published condition can outlive a Stream assignment. Missing or
      // inactive assignments evaluate false without invalidating the packet.
      if (!field?.egcs_tp_active || field.egcs_ay_kind !== 'relational' || !value.length
        || value.some(optionId => !field.options.some(option => option.id === optionId))) continue
      values[fieldId] = value
      for (const optionId of value) {
        const option = field.options.find(candidate => candidate.id === optionId)!
        capturedFields.push({ fieldId, name_en: field.egcs_ay_name_en, name_fr: field.egcs_ay_name_fr, optionId, option_en: option.egcs_ay_name_en, option_fr: option.egcs_ay_name_fr })
      }
    }
  }
  return { agreementId, values, fields: capturedFields, ...(profile ? { profile, relationships } : {}) }
}
