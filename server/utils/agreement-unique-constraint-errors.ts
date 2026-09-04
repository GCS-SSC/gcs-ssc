import type { H3Event } from 'h3'
import { throwIfMappedConstraintError, type ConstraintErrorMapping } from '~~/server/utils/database-constraint-errors'

const UNIQUE_VIOLATION_CODE = '23505'
const CHECK_VIOLATION_CODE = '23514'

const CONSTRAINT_ERROR_MAP: Record<string, ConstraintErrorMapping> = {
  fc_idx_openamendment: {
    code: 'AGREEMENT_OPEN_AMENDMENT_EXISTS',
    key: 'apiErrors.agreement.open_amendment_exists'
  },
  fc_idx_profiletransferpaymentstreamagreementnumber: {
    code: 'AGREEMENT_DUPLICATE_AGREEMENT_NUMBER',
    key: 'apiErrors.agreement.duplicate_agreement_number'
  },
  fc_idx_outcomeactivityoutcomesactivity: {
    code: 'AGREEMENT_DUPLICATE_ACTIVITY_OUTCOME',
    key: 'apiErrors.agreement.duplicate_activity_outcome'
  },
  fc_idx_applicantrecipientapplicantrecipientfundingagreement: {
    code: 'AGREEMENT_DUPLICATE_APPLICANT_RECIPIENT',
    key: 'apiErrors.agreement.duplicate_applicant_recipient'
  },
  fc_idx_budgetfiscalyearfundingagreementfiscalyear: {
    code: 'AGREEMENT_DUPLICATE_BUDGET_FISCAL_YEAR',
    key: 'apiErrors.agreement.duplicate_budget_fiscal_year'
  },
  fc_idx_budgetlineitemversionidentity: {
    code: 'AGREEMENT_DUPLICATE_BUDGET_LINE_ITEM_IDENTITY',
    key: 'apiErrors.agreement.duplicate_budget_line_item_identity'
  },
  fc_idx_activecommitmentfundingagreement: {
    code: 'AGREEMENT_DUPLICATE_COMMITMENT_TYPE',
    key: 'apiErrors.agreement.duplicate_commitment_type'
  },
  fc_idx_uniquecommitmentline: {
    code: 'AGREEMENT_DUPLICATE_COMMITMENT_LINE',
    key: 'apiErrors.agreement.duplicate_commitment_line'
  },
  fc_idx_paymentlinepaymentcommitmentline: {
    code: 'AGREEMENT_DUPLICATE_PAYMENT_LINE',
    key: 'apiErrors.agreement.duplicate_payment_line'
  },
  fc_idx_uniquereconcilelineitem: {
    code: 'AGREEMENT_DUPLICATE_CLAIM_RECONCILE_LINE_ITEM',
    key: 'apiErrors.agreement.duplicate_claim_reconcile_line_item'
  },
  fc_idx_uniquefinalclaimreconcile: {
    code: 'AGREEMENT_DUPLICATE_FINAL_CLAIM_RECONCILE',
    key: 'apiErrors.agreement.duplicate_final_claim_reconcile'
  },
  fc_chk_commitmenttotalprogramfunding: {
    code: 'AGREEMENT_COMMITMENT_EXCEEDS_PROGRAM_FUNDING',
    key: 'apiErrors.agreement.commitment_exceeds_program_funding'
  }
}

export const throwIfAgreementUniqueConstraintError = async (event: H3Event, error: unknown): Promise<never> => {
  return await throwIfMappedConstraintError(event, error, [UNIQUE_VIOLATION_CODE, CHECK_VIOLATION_CODE], CONSTRAINT_ERROR_MAP)
}
