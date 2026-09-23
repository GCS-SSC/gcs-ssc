/* eslint-disable jsdoc/require-jsdoc -- Shared workflow authoring catalogs and immutable labels. */
import type { Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { AgreementProfileCondition } from '~~/shared/types/schemas/agreement-custom-fields'

export const profileConditionLabels = {
  agreement_subtype: { name_en: 'Agreement subtype', name_fr: 'Sous-type d’entente' },
  further_distribution: { name_en: 'Further distribution', name_fr: 'Redistribution' },
  recipient_subtype: { name_en: 'Recipient subtype', name_fr: 'Sous-type de bénéficiaire' }
}
export const readWorkflowProfileChoices = async (db: Kysely<Database>, agencyId: string) => {
  const [agreementTypes, recipientSubtypes] = await Promise.all([
    db.selectFrom('Agency_Agreement_Type').select(['id', 'egcs_ay_name_en as name_en', 'egcs_ay_name_fr as name_fr'])
      .where('egcs_ay_organizationagency', '=', agencyId).where('_deleted', '=', false).orderBy('id').forShare().execute(),
    db.selectFrom('Agency_Applicant_Recipient_Subtype').select(['id', 'egcs_ay_name_en as name_en', 'egcs_ay_name_fr as name_fr'])
      .where('egcs_ay_organizationagency', '=', agencyId).where('_deleted', '=', false).orderBy('id').forShare().execute()
  ])
  return {
    agreement_subtype: agreementTypes.map(row => ({ ...row, id: String(row.id) })),
    recipient_subtype: recipientSubtypes.map(row => ({ ...row, id: String(row.id) }))
  }
}
export const resolveWorkflowProfileCondition = (condition: AgreementProfileCondition, choices: Awaited<ReturnType<typeof readWorkflowProfileChoices>>) => {
  const options = condition.source === 'further_distribution'
    ? [{ id: String(condition.value), name_en: condition.value ? 'Yes' : 'No', name_fr: condition.value ? 'Oui' : 'Non' }]
    : condition.optionIds.map(id => {
        const option = choices[condition.source].find(item => item.id === id)
        if (!option) throw new Error('Workflow profile selection is unavailable')
        return option
      })
  return { ...condition, ...profileConditionLabels[condition.source], options }
}
