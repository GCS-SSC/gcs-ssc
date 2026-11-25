import type { AssignedAgencyCustomFieldDefinition } from '../types/schemas/agreement-custom-fields'

/**
 * Returns the section key pinned on a financial field, with a group for older unsectioned fields.
 * @param field - Pinned financial field.
 * @returns Section key used in edit comments.
 */
export const financialCustomFieldSectionKey = (field: AssignedAgencyCustomFieldDefinition) => field.section?.id ?? 'unsectioned'
