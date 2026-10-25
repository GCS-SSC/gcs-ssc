import type { Transaction } from 'kysely'
import { uiTargetRegistry } from '#ui-targets'
import type { Database } from '~~/shared/types/database'

const examples = [
  {
    key: 'agreement.fields.profile-fields.egcs_fc_title_en',
    en: 'Use a clear English project title that helps colleagues identify this Agreement.',
    fr: 'Utilisez un titre de projet clair en anglais pour aider vos collègues à reconnaître cette entente.'
  },
  {
    key: 'agreement.fields.profile-fields.egcs_fc_title_fr',
    en: 'Enter the French project title with the same meaning as the English title.',
    fr: 'Saisissez le titre français du projet en conservant le sens du titre anglais.'
  },
  {
    key: 'agreement.fields.profile-fields.egcs_fc_authorizedassistancestartdate',
    en: 'Enter the first day of the assistance period authorized by this Agreement.',
    fr: 'Saisissez le premier jour de la période d’aide autorisée par cette entente.'
  },
  {
    key: 'agreement.fields.profile-fields.egcs_fc_authorizedassistanceenddate',
    en: 'Enter the last day of the assistance period authorized by this Agreement.',
    fr: 'Saisissez le dernier jour de la période d’aide autorisée par cette entente.'
  }
]

/**
 * Adds enabled Agreement field help for the sample NCIA Agency.
 * @param db - Owning final-seed transaction.
 */
export const seedFieldTooltipExamples = async (db: Transaction<Database>): Promise<void> => {
  for (const example of examples) {
    const target = uiTargetRegistry.targets.find(item => item.key === example.key && item.tooltip)
    if (!target || target.owner.kind !== 'host') throw new Error(`Seeded tooltip target is unavailable: ${example.key}`)
    await db.insertInto('Agency_Field_Tooltip').values({
      egcs_ay_agency: '21',
      egcs_ay_targetkey: target.key,
      egcs_ay_text_en: example.en,
      egcs_ay_text_fr: example.fr,
      egcs_ay_enabled: true,
      egcs_ay_label_en: target.label.en,
      egcs_ay_label_fr: target.label.fr,
      egcs_ay_screen_en: target.viewLabel.en,
      egcs_ay_screen_fr: target.viewLabel.fr,
      egcs_ay_extension: null
    }).onConflict(conflict => conflict.doNothing()).execute()
  }
}
