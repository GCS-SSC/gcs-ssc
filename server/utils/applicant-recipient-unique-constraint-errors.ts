import type { H3Event } from 'h3'
import { throwIfMappedConstraintError, type ConstraintErrorMapping } from '~~/server/utils/database-constraint-errors'

const UNIQUE_VIOLATION_CODE = '23505'

const CONSTRAINT_ERROR_MAP: Record<string, ConstraintErrorMapping> = {
  ar_idx_registryregistrynumber: {
    code: 'APPLICANT_RECIPIENT_DUPLICATE_REGISTRY_NUMBER',
    key: 'apiErrors.applicant_recipient.duplicate_registry_number'
  },
  ar_idx_agencyfinancialidagencyfinancialsystemid: {
    code: 'APPLICANT_RECIPIENT_DUPLICATE_AGENCY_FINANCIAL_ID',
    key: 'apiErrors.applicant_recipient.duplicate_agency_financial_id'
  },
  ar_idx_othernameothername: {
    code: 'APPLICANT_RECIPIENT_DUPLICATE_OTHER_NAME',
    key: 'apiErrors.applicant_recipient.duplicate_other_name'
  },
  cn_idx_contactemail: {
    code: 'APPLICANT_RECIPIENT_DUPLICATE_CONTACT_EMAIL',
    key: 'apiErrors.applicant_recipient.duplicate_contact_email'
  }
}

/**
 * Throws a localized API error for known applicant recipient unique constraint violations.
 *
 * @param event - Active H3 event.
 * @param error - Caught database error.
 * @returns Never when a known violation is matched.
 */
export const throwIfApplicantRecipientUniqueConstraintError = async (event: H3Event, error: unknown): Promise<never> => {
  return await throwIfMappedConstraintError(event, error, [UNIQUE_VIOLATION_CODE], CONSTRAINT_ERROR_MAP)
}
