import type { Language_Preference } from '~~/shared/types/database'
import { customFieldHasValue, customFieldOptionIds } from '~~/shared/types/schemas/agreement-custom-fields'
import type { AgreementCustomFieldValues, AssignedAgencyCustomFieldDefinition } from '~~/shared/types/schemas/agreement-custom-fields'
import { getFallbackValue } from './document-rendering'

export interface AgreementDocumentCustomFieldEntry {
  id: string
  name: string
  value: string
}

/**
 * Resolves saved values through the Agreement's assigned definitions for document output.
 * @param definitions - Live Stream assignments, including inactive retained fields/options.
 * @param values - Saved Agreement values keyed by Agency field ID.
 * @param language - Language of the generated document.
 * @returns Stable-ID lookups and an ordered list of populated, localized fields.
 */
export const buildAgreementDocumentCustomFields = (
  definitions: AssignedAgencyCustomFieldDefinition[],
  values: AgreementCustomFieldValues,
  language: Language_Preference
): { customFields: Record<string, string>, customFieldEntries: AgreementDocumentCustomFieldEntry[] } => {
  const customFields: Record<string, string> = {}
  const customFieldEntries: AgreementDocumentCustomFieldEntry[] = []
  const numberFormatter = new Intl.NumberFormat(language === 'fra' ? 'fr-CA' : 'en-CA', { maximumSignificantDigits: 21 })
  for (const field of definitions) {
    const savedValue = values[field.id]
    if (!customFieldHasValue(savedValue)) continue
    let value: string
    if (field.egcs_ay_kind === 'relational') {
      value = customFieldOptionIds(savedValue).map(optionId => {
        const option = field.options.find(candidate => candidate.id === optionId)
        return option ? (language === 'fra' ? option.egcs_ay_name_fr : option.egcs_ay_name_en) : getFallbackValue(language)
      }).join(', ')
    } else if (typeof savedValue === 'number') {
      value = numberFormatter.format(savedValue)
    } else {
      value = String(savedValue)
    }
    customFields[field.id] = value
    customFieldEntries.push({ id: field.id, name: language === 'fra' ? field.egcs_ay_name_fr : field.egcs_ay_name_en, value })
  }
  return { customFields, customFieldEntries }
}
