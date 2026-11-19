/* eslint-disable jsdoc/require-jsdoc -- Shared workflow authoring catalogs and immutable labels. */
import type { Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { AgreementProfileCondition } from '~~/shared/types/schemas/agreement-custom-fields'

export const profileConditionLabels = {
  jv_fiscal_eligible: { name_en: 'JV fiscal year is open', name_fr: 'L’exercice de la pièce de journal est ouvert' },
  jv_payment_final: { name_en: 'JV source Payment is final', name_fr: 'Le paiement source de la pièce de journal est définitif' },
  jv_rationale_present: { name_en: 'JV rationale is present', name_fr: 'La justification de la pièce de journal est présente' },
  agreement_subtype: { name_en: 'Agreement subtype', name_fr: 'Sous-type d’entente' },
  amendment_type: { name_en: 'Amendment type', name_fr: 'Type de modification' },
  amendment_subtype: { name_en: 'Amendment subtype', name_fr: 'Sous-type de modification' },
  further_distribution: { name_en: 'Further distribution', name_fr: 'Redistribution' },
  recipient_subtype: { name_en: 'Recipient subtype', name_fr: 'Sous-type de bénéficiaire' }
}
const readAmendmentChoices = async (
  db: Kysely<Database>, agencyId: string,
  table: 'Transfer_Payment_Amendment_Type' | 'Transfer_Payment_Amendment_Subtype',
  ids?: string[]
) => {
  if (ids?.length === 0) return []
  const rows = await db.selectFrom(db.dynamic.table(table).as('choice'))
    .innerJoin('Transfer_Payment_Stream as stream', 'stream.id', 'choice.egcs_tp_transferpaymentstream')
    .innerJoin('Transfer_Payment_Profile as program', 'program.id', 'stream.egcs_tp_transferpaymentprofile')
    .select(['choice.id', 'choice.egcs_tp_name_en as name_en', 'choice.egcs_tp_name_fr as name_fr',
      'program.egcs_tp_name_en as program_en', 'program.egcs_tp_name_fr as program_fr',
      'stream.egcs_tp_name_en as stream_en', 'stream.egcs_tp_name_fr as stream_fr'])
    .where('program.egcs_tp_agency', '=', agencyId)
    .where('choice._deleted', '=', false).where('stream._deleted', '=', false).where('program._deleted', '=', false)
    .$if(ids !== undefined, query => query.where('choice.id', 'in', ids ?? []))
    // Capture already owns its target Stream. Lock catalog rows without locking
    // another Stream or Program; Agency authoring serializes Program transfers.
    .orderBy('choice.id').forShare(['choice']).execute()
  return rows.map(row => ({ id: String(row.id), name_en: row.name_en, name_fr: row.name_fr,
    category_en: `${row.program_en} / ${row.stream_en}`, category_fr: `${row.program_fr} / ${row.stream_fr}` }))
}

export const amendmentConditionOptionIds = (conditions: AgreementProfileCondition[], source: 'amendment_type' | 'amendment_subtype') =>
  [...new Set(conditions.flatMap(condition => condition.source === source ? condition.optionIds : []))]

export const readWorkflowProfileChoices = async (
  db: Kysely<Database>, agencyId: string, options: { amendmentTypeIds?: string[], amendmentSubtypeIds?: string[] } = {}
) => {
  const [agreementTypes, recipientSubtypes, amendmentTypes, amendmentSubtypes] = await Promise.all([
    db.selectFrom('Agency_Agreement_Type').select(['id', 'egcs_ay_name_en as name_en', 'egcs_ay_name_fr as name_fr'])
      .where('egcs_ay_organizationagency', '=', agencyId).where('_deleted', '=', false).orderBy('id').forShare().execute(),
    db.selectFrom('Agency_Applicant_Recipient_Subtype').select(['id', 'egcs_ay_name_en as name_en', 'egcs_ay_name_fr as name_fr'])
      .where('egcs_ay_organizationagency', '=', agencyId).where('_deleted', '=', false).orderBy('id').forShare().execute(),
    readAmendmentChoices(db, agencyId, 'Transfer_Payment_Amendment_Type', options.amendmentTypeIds),
    readAmendmentChoices(db, agencyId, 'Transfer_Payment_Amendment_Subtype', options.amendmentSubtypeIds)
  ])
  return {
    agreement_subtype: agreementTypes.map(row => ({ ...row, id: String(row.id) })),
    amendment_type: amendmentTypes,
    amendment_subtype: amendmentSubtypes,
    recipient_subtype: recipientSubtypes.map(row => ({ ...row, id: String(row.id) }))
  }
}
export const resolveWorkflowProfileCondition = (condition: AgreementProfileCondition, choices: Awaited<ReturnType<typeof readWorkflowProfileChoices>>) => {
  const options = 'value' in condition
    ? [{ id: String(condition.value), name_en: condition.value ? 'Yes' : 'No', name_fr: condition.value ? 'Oui' : 'Non' }]
    : condition.optionIds.map(id => {
        const option = choices[condition.source].find(item => item.id === id)
        if (!option) throw new Error('Workflow profile selection is unavailable')
        return option
      })
  return { ...condition, ...profileConditionLabels[condition.source], options }
}
