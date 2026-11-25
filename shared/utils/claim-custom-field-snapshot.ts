import type {
  AgreementCustomFieldPatch,
  AssignedAgencyCustomFieldDefinition,
  ClaimCustomFieldSnapshot
} from '~~/shared/types/schemas/agreement-custom-fields'

type ClaimFieldAnswer = AgreementCustomFieldPatch[string]
type CapturedFieldAnswer = ClaimCustomFieldSnapshot[number]['value']

/**
 * Projects captured rows in their saved order and resolves choice IDs to pinned labels.
 * @param field - Captured field definition.
 * @param answer - Answer to freeze.
 * @returns Display evidence without catalog references.
 */
const snapshotAnswer = (field: AssignedAgencyCustomFieldDefinition, answer: ClaimFieldAnswer | undefined): CapturedFieldAnswer => {
  if (Array.isArray(answer)) {
    return answer.flatMap(id => field.options.filter(option => option.id === id)
      .map(option => ({ en: option.egcs_ay_name_en, fr: option.egcs_ay_name_fr })))
  }
  if (!answer || typeof answer !== 'object' || !('rows' in answer)) return answer ?? null
  const structure = field.egcs_ay_structure
  if (!structure || !answer.rows.length) return null
  const columns = structure.kind === 'table' ? structure.columns : structure.fields
  return {
    kind: structure.kind,
    rows: answer.rows.map(row => ({
      id: row.id,
      cells: columns.map(column => {
        const value = row.cells[column.id]
        return {
          labelEn: column.labelEn,
          labelFr: column.labelFr,
          ...(structure.kind === 'table' && column.kind === 'number' ? { format: 'decimal' as const } : {}),
          value: Array.isArray(value)
            ? value.flatMap(id => ('options' in column ? column.options ?? [] : [])
                .filter(option => option.id === id).map(option => ({ en: option.labelEn, fr: option.labelFr })))
            : value ?? null
        }
      })
    }))
  }
}

/**
 * Freezes visible field, cell and option labels with the values shown in History.
 * @param definitions - Pinned field definitions.
 * @param values - Values for this version.
 * @returns Ordered evidence for the Claim snapshot.
 */
export const claimCustomFieldSnapshot = (
  definitions: AssignedAgencyCustomFieldDefinition[],
  values: AgreementCustomFieldPatch
): ClaimCustomFieldSnapshot => definitions.filter(field => field.egcs_tp_active).map(field => ({
  key: field.id,
  labelEn: field.egcs_ay_name_en,
  labelFr: field.egcs_ay_name_fr,
  value: snapshotAnswer(field, values[field.id])
}))
