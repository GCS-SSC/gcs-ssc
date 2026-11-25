import type {
  AgreementCustomFieldValues,
  AssignedAgencyCustomFieldDefinition,
  ClaimCustomFieldSnapshot
} from '~~/shared/types/schemas/agreement-custom-fields'

/**
 * Freezes visible field and option labels with the values shown in History.
 * @param definitions - Pinned field definitions.
 * @param values - Values for this version.
 * @returns Ordered evidence for the Claim snapshot.
 */
export const claimCustomFieldSnapshot = (
  definitions: AssignedAgencyCustomFieldDefinition[],
  values: AgreementCustomFieldValues
): ClaimCustomFieldSnapshot => definitions.filter(field => field.egcs_tp_active).map(field => {
  const answer = values[field.id]
  return {
    key: field.id,
    labelEn: field.egcs_ay_name_en,
    labelFr: field.egcs_ay_name_fr,
    value: Array.isArray(answer)
      ? answer.flatMap(id => field.options.filter(option => option.id === id)
          .map(option => ({ en: option.egcs_ay_name_en, fr: option.egcs_ay_name_fr })))
      : answer ?? null
  }
})
