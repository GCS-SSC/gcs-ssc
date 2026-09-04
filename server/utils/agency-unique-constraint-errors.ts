import type { H3Event } from 'h3'
import { throwIfMappedConstraintError, type ConstraintErrorMapping } from '~~/server/utils/database-constraint-errors'

const UNIQUE_VIOLATION_CODE = '23505'
const FOREIGN_KEY_VIOLATION_CODE = '23503'

const CONSTRAINT_ERROR_MAP: Record<string, ConstraintErrorMapping> = {
  ay_ref_profilegwcoanumber: {
    code: 'AGENCY_INVALID_GWCOA_NUMBER',
    key: 'apiErrors.agency.invalid_gwcoa_number'
  },
  ay_idx_profileagencyfinancialsystemidnameennamefrstatus: {
    code: 'AGENCY_DUPLICATE_PROFILE',
    key: 'apiErrors.agency.duplicate_profile'
  },
  ay_idx_costcategoryorganizationagencynameen: {
    code: 'AGENCY_DUPLICATE_COST_CATEGORY_NAME_EN',
    key: 'apiErrors.agency.duplicate_cost_category_name_en'
  },
  ay_idx_costcategoryorganizationagencynamefr: {
    code: 'AGENCY_DUPLICATE_COST_CATEGORY_NAME_FR',
    key: 'apiErrors.agency.duplicate_cost_category_name_fr'
  },
  ay_idx_costcategorylineitemorganizationcostcategorynameen: {
    code: 'AGENCY_DUPLICATE_COST_CATEGORY_LINE_ITEM_NAME_EN',
    key: 'apiErrors.agency.duplicate_cost_category_line_item_name_en'
  },
  ay_idx_costcategorylineitemorganizationcostcategorynamefr: {
    code: 'AGENCY_DUPLICATE_COST_CATEGORY_LINE_ITEM_NAME_FR',
    key: 'apiErrors.agency.duplicate_cost_category_line_item_name_fr'
  },
  ay_idx_fiscalyearorganizationagencyfiscalyeardisplay: {
    code: 'AGENCY_DUPLICATE_FISCAL_YEAR_DISPLAY',
    key: 'apiErrors.agency.duplicate_fiscal_year_display'
  },
  ay_idx_fiscalyearorganizationagencyfiscalyear: {
    code: 'AGENCY_DUPLICATE_FISCAL_YEAR',
    key: 'apiErrors.agency.duplicate_fiscal_year'
  },
  ay_idx_addresstypeorganizationagencytypenameen: {
    code: 'AGENCY_DUPLICATE_ADDRESS_TYPE_NAME_EN',
    key: 'apiErrors.agency.duplicate_address_type_name_en'
  },
  ay_idx_addresstypeorganizationagencytypenamefr: {
    code: 'AGENCY_DUPLICATE_ADDRESS_TYPE_NAME_FR',
    key: 'apiErrors.agency.duplicate_address_type_name_fr'
  },
  ay_idx_uniqueartypeen: {
    code: 'AGENCY_DUPLICATE_APPLICANT_RECIPIENT_SUBTYPE_NAME_EN',
    key: 'apiErrors.agency.duplicate_applicant_recipient_subtype_name_en'
  },
  ay_idx_uniqueartypefr: {
    code: 'AGENCY_DUPLICATE_APPLICANT_RECIPIENT_SUBTYPE_NAME_FR',
    key: 'apiErrors.agency.duplicate_applicant_recipient_subtype_name_fr'
  },
  ay_idx_approvalbehalftypeorganizationagencynameen: {
    code: 'AGENCY_DUPLICATE_APPROVAL_BEHALF_TYPE_NAME_EN',
    key: 'apiErrors.agency.duplicate_approval_behalf_type_name_en'
  },
  ay_idx_approvalbehalftypeorganizationagencynamefr: {
    code: 'AGENCY_DUPLICATE_APPROVAL_BEHALF_TYPE_NAME_FR',
    key: 'apiErrors.agency.duplicate_approval_behalf_type_name_fr'
  },
  ay_idx_agreementtypeorganizationagencyagreementtypenameen: {
    code: 'AGENCY_DUPLICATE_AGREEMENT_TYPE_NAME_EN',
    key: 'apiErrors.agency.duplicate_agreement_type_name_en'
  },
  ay_idx_agreementtypeorganizationagencyagreementtypenamefr: {
    code: 'AGENCY_DUPLICATE_AGREEMENT_TYPE_NAME_FR',
    key: 'apiErrors.agency.duplicate_agreement_type_name_fr'
  },
  ay_idx_holdbackbasisorganizationagencycode: {
    code: 'AGENCY_DUPLICATE_HOLDBACK_BASIS_CODE',
    key: 'apiErrors.agency.duplicate_holdback_basis_code'
  },
  cn_idx_attachmenttypesagencynameen: {
    code: 'AGENCY_DUPLICATE_ATTACHMENT_TYPE_NAME_EN',
    key: 'apiErrors.agency.duplicate_attachment_type_name_en'
  },
  cn_idx_attachmenttypesagencynamefr: {
    code: 'AGENCY_DUPLICATE_ATTACHMENT_TYPE_NAME_FR',
    key: 'apiErrors.agency.duplicate_attachment_type_name_fr'
  }
}

/**
 * Throws a localized API 400 when a known agency constraint violation is detected.
 *
 * @param event - The current H3 event.
 * @param error - The caught database error.
 * @returns Never returns when a known constraint is matched.
 * @throws Error - Re-throws when the error is not a known agency constraint violation.
 */
export const throwIfAgencyUniqueConstraintError = async (event: H3Event, error: unknown): Promise<never> => {
  return await throwIfMappedConstraintError(
    event,
    error,
    [UNIQUE_VIOLATION_CODE, FOREIGN_KEY_VIOLATION_CODE],
    CONSTRAINT_ERROR_MAP
  )
}
