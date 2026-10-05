/* eslint-disable jsdoc/require-jsdoc -- Shared workflow authoring catalogs and immutable labels. */
import type { Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { AgreementProfileCondition } from '~~/shared/types/schemas/agreement-custom-fields'

export const profileConditionLabels = {
  jv_fiscal_eligible: { name_en: 'JV fiscal year is open', name_fr: 'L’exercice de la pièce de journal est ouvert' },
  jv_payment_final: { name_en: 'JV source Payment is final', name_fr: 'Le paiement source de la pièce de journal est définitif' },
  jv_rationale_present: { name_en: 'JV rationale is present', name_fr: 'La justification de la pièce de journal est présente' },
  agreement_subtype: { name_en: 'Agreement subtype', name_fr: 'Sous-type d’entente' },
  amendment_subtype: { name_en: 'Amendment subtype', name_fr: 'Sous-type de modification' },
  further_distribution: { name_en: 'Further distribution', name_fr: 'Redistribution' },
  recipient_subtype: { name_en: 'Recipient subtype', name_fr: 'Sous-type de bénéficiaire' }
}
export const readWorkflowProfileChoices = async (
  db: Kysely<Database>, agencyId: string, options: { amendmentSubtypeIds?: string[] } = {}
) => {
  const [agreementTypes, recipientSubtypes, amendmentSubtypes] = await Promise.all([
    db.selectFrom('Agency_Agreement_Type').select(['id', 'egcs_ay_name_en as name_en', 'egcs_ay_name_fr as name_fr'])
      .where('egcs_ay_organizationagency', '=', agencyId).where('_deleted', '=', false).orderBy('id').forShare().execute(),
    db.selectFrom('Agency_Applicant_Recipient_Subtype').select(['id', 'egcs_ay_name_en as name_en', 'egcs_ay_name_fr as name_fr'])
      .where('egcs_ay_organizationagency', '=', agencyId).where('_deleted', '=', false).orderBy('id').forShare().execute(),
    options.amendmentSubtypeIds?.length === 0
      ? Promise.resolve([])
      : db.selectFrom('Transfer_Payment_Amendment_Subtype as subtype')
          .innerJoin('Transfer_Payment_Stream as stream', 'stream.id', 'subtype.egcs_tp_transferpaymentstream')
          .innerJoin('Transfer_Payment_Profile as program', 'program.id', 'stream.egcs_tp_transferpaymentprofile')
          .select(['subtype.id', 'subtype.egcs_tp_name_en as name_en', 'subtype.egcs_tp_name_fr as name_fr',
            'program.egcs_tp_name_en as program_en', 'program.egcs_tp_name_fr as program_fr',
            'stream.egcs_tp_name_en as stream_en', 'stream.egcs_tp_name_fr as stream_fr'])
          .where('program.egcs_tp_agency', '=', agencyId)
          .where('subtype._deleted', '=', false).where('stream._deleted', '=', false).where('program._deleted', '=', false)
          .$if(options.amendmentSubtypeIds !== undefined, query => query.where('subtype.id', 'in', options.amendmentSubtypeIds ?? []))
        // Capture already owns its target Stream. Lock only subtype references,
        // in ID order, so concurrent runs never lock one another's parent Streams.
        // Agency authoring writes serialize Program transfers through the Agency lock.
          .orderBy('subtype.id').forShare(['subtype']).execute()
  ])
  return {
    agreement_subtype: agreementTypes.map(row => ({ ...row, id: String(row.id) })),
    amendment_subtype: amendmentSubtypes.map(row => ({ id: String(row.id), name_en: row.name_en, name_fr: row.name_fr,
      category_en: `${row.program_en} / ${row.stream_en}`, category_fr: `${row.program_fr} / ${row.stream_fr}` })),
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
