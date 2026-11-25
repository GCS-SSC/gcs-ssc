import type { Language_Preference } from '~~/shared/types/database'
import { customFieldHasValue, customFieldOptionIds } from '~~/shared/types/schemas/agreement-custom-fields'
import type { AgreementCustomFieldValues, AssignedAgencyCustomFieldDefinition } from '~~/shared/types/schemas/agreement-custom-fields'
import { customFieldDateSchema } from '~~/shared/types/schemas/custom-field-structure'
import { formatMoneyText, isCanonicalMoney } from '~~/shared/utils/money'
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
): { customFields: Record<string, string>, customFieldEntries: AgreementDocumentCustomFieldEntry[], customFieldValues: AgreementCustomFieldValues } => {
  const customFields: Record<string, string> = {}
  const customFieldValues: AgreementCustomFieldValues = {}
  const customFieldEntries: AgreementDocumentCustomFieldEntry[] = []
  const numberFormatter = new Intl.NumberFormat(language === 'fra' ? 'fr-CA' : 'en-CA', { maximumSignificantDigits: 21 })
  const dateFormatter = new Intl.DateTimeFormat(language === 'fra' ? 'fr-CA' : 'en-CA', { dateStyle: 'medium', timeZone: 'UTC' })
  for (const field of definitions) {
    const savedValue = values[field.id]
    if (!customFieldHasValue(savedValue)) continue
    let value: string
    if (field.egcs_ay_kind === 'relational') {
      value = customFieldOptionIds(savedValue).map(optionId => {
        const option = field.options.find(candidate => candidate.id === optionId)
        return option ? (language === 'fra' ? option.egcs_ay_name_fr : option.egcs_ay_name_en) : getFallbackValue(language)
      }).join(', ')
    } else if (isCanonicalMoney(savedValue)) {
      value = formatMoneyText(savedValue, language === 'fra' ? 'fr-CA' : 'en-CA')
    } else if (typeof savedValue === 'number') {
      value = numberFormatter.format(savedValue)
    } else if (field.egcs_ay_kind === 'date' && typeof savedValue === 'string') {
      value = customFieldDateSchema.safeParse(savedValue).success
        ? dateFormatter.format(new Date(`${savedValue}T00:00:00Z`))
        : getFallbackValue(language)
    } else {
      value = String(savedValue)
    }
    customFields[field.id] = value
    customFieldValues[field.id] = field.egcs_ay_kind === 'relational'
      ? field.egcs_ay_multiple ? [...customFieldOptionIds(savedValue)] : customFieldOptionIds(savedValue)[0]!
      : savedValue!
    customFieldEntries.push({ id: field.id, name: language === 'fra' ? field.egcs_ay_name_fr : field.egcs_ay_name_en, value })
  }
  return { customFields, customFieldEntries, customFieldValues }
}
