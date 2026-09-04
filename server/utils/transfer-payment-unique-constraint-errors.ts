import type { H3Event } from 'h3'
import { throwIfMappedConstraintError, type ConstraintErrorMapping } from '~~/server/utils/database-constraint-errors'

const UNIQUE_VIOLATION_CODE = '23505'

const CONSTRAINT_ERROR_MAP: Record<string, ConstraintErrorMapping> = {
  tp_idx_streamtransferpaymentprofilenameennamefrstatus: {
    code: 'TRANSFER_PAYMENT_DUPLICATE_PROGRAM_STREAM_NAME',
    key: 'apiErrors.transfer_payment.duplicate_program_stream_name'
  },
  tp_idx_outcometransferpaymentprofilenameen: {
    code: 'TRANSFER_PAYMENT_DUPLICATE_PROGRAM_OUTCOME_NAME',
    key: 'apiErrors.transfer_payment.duplicate_program_outcome_name'
  },
  tp_idx_outcometransferpaymentprofilenamefr: {
    code: 'TRANSFER_PAYMENT_DUPLICATE_PROGRAM_OUTCOME_NAME',
    key: 'apiErrors.transfer_payment.duplicate_program_outcome_name'
  },
  tp_idx_objectivetransferpaymentprofileobjectiveen: {
    code: 'TRANSFER_PAYMENT_DUPLICATE_PROGRAM_OBJECTIVE',
    key: 'apiErrors.transfer_payment.duplicate_program_objective'
  },
  tp_idx_objectivetransferpaymentprofileobjectivefr: {
    code: 'TRANSFER_PAYMENT_DUPLICATE_PROGRAM_OBJECTIVE',
    key: 'apiErrors.transfer_payment.duplicate_program_objective'
  },
  tp_idx_fiscalyearbudgettransferpaymentprofilefiscalyear: {
    code: 'TRANSFER_PAYMENT_DUPLICATE_PROGRAM_BUDGET_FISCAL_YEAR',
    key: 'apiErrors.transfer_payment.duplicate_program_budget_fiscal_year'
  },
  tp_idx_outcomeperformanceindicatortransferpaymentoutcomenameen: {
    code: 'TRANSFER_PAYMENT_DUPLICATE_OUTCOME_PERFORMANCE_INDICATOR_NAME',
    key: 'apiErrors.transfer_payment.duplicate_outcome_performance_indicator_name'
  },
  tp_idx_outcomeperformanceindicatortransferpaymentoutcomenamefr: {
    code: 'TRANSFER_PAYMENT_DUPLICATE_OUTCOME_PERFORMANCE_INDICATOR_NAME',
    key: 'apiErrors.transfer_payment.duplicate_outcome_performance_indicator_name'
  },
  tp_idx_streambudgettransferpaymentstreamtransferpaymentbudget: {
    code: 'TRANSFER_PAYMENT_DUPLICATE_STREAM_BUDGET_FISCAL_YEAR',
    key: 'apiErrors.transfer_payment.duplicate_stream_budget_fiscal_year'
  },
  tp_idx_uniquestreameligiblerecipient: {
    code: 'TRANSFER_PAYMENT_DUPLICATE_STREAM_ELIGIBLE_RECIPIENT',
    key: 'apiErrors.transfer_payment.duplicate_stream_eligible_recipient'
  },
  tp_idx_uniqueastreamcostcatline: {
    code: 'TRANSFER_PAYMENT_DUPLICATE_STREAM_COST_CATEGORY_LINE_ITEM',
    key: 'apiErrors.transfer_payment.duplicate_stream_cost_category_line_item'
  },
  tp_idx_streamholdbackbasisstreamagencybasis: {
    code: 'TRANSFER_PAYMENT_DUPLICATE_STREAM_HOLDBACK_BASIS',
    key: 'apiErrors.transfer_payment.duplicate_stream_holdback_basis'
  },
  tp_idx_amendmenttypetransferpaymentstreamnameen: {
    code: 'TRANSFER_PAYMENT_DUPLICATE_STREAM_AMENDMENT_TYPE',
    key: 'apiErrors.transfer_payment.duplicate_stream_amendment_type'
  },
  tp_idx_amendmenttypetransferpaymentstreamnamefr: {
    code: 'TRANSFER_PAYMENT_DUPLICATE_STREAM_AMENDMENT_TYPE',
    key: 'apiErrors.transfer_payment.duplicate_stream_amendment_type'
  },
  tp_idx_amendmentsubtypetransferpaymentstreamnameen: {
    code: 'TRANSFER_PAYMENT_DUPLICATE_STREAM_AMENDMENT_SUBTYPE',
    key: 'apiErrors.transfer_payment.duplicate_stream_amendment_subtype'
  },
  tp_idx_amendmentsubtypetransferpaymentstreamnamefr: {
    code: 'TRANSFER_PAYMENT_DUPLICATE_STREAM_AMENDMENT_SUBTYPE',
    key: 'apiErrors.transfer_payment.duplicate_stream_amendment_subtype'
  },
  tp_idx_agreementsubtypetransferpaymentstreamagreementtype: {
    code: 'TRANSFER_PAYMENT_DUPLICATE_STREAM_AGREEMENT_SUBTYPE',
    key: 'apiErrors.transfer_payment.duplicate_stream_agreement_subtype'
  },
  tp_idx_monitortypetransferpaymentstreamnameen: {
    code: 'TRANSFER_PAYMENT_DUPLICATE_STREAM_MONITOR_TYPE',
    key: 'apiErrors.transfer_payment.duplicate_stream_monitor_type'
  },
  tp_idx_commitmenttypetransferpaymentstreamnameen: {
    code: 'TRANSFER_PAYMENT_DUPLICATE_STREAM_COMMITMENT_TYPE',
    key: 'apiErrors.transfer_payment.duplicate_stream_commitment_type'
  },
  tp_idx_commitmenttypetransferpaymentstreamnamefr: {
    code: 'TRANSFER_PAYMENT_DUPLICATE_STREAM_COMMITMENT_TYPE',
    key: 'apiErrors.transfer_payment.duplicate_stream_commitment_type'
  },
  tp_idx_monitortypetransferpaymentstreamnamefr: {
    code: 'TRANSFER_PAYMENT_DUPLICATE_STREAM_MONITOR_TYPE',
    key: 'apiErrors.transfer_payment.duplicate_stream_monitor_type'
  },
  tp_idx_streamriskratingtransferpaymentstreamriskscore: {
    code: 'TRANSFER_PAYMENT_DUPLICATE_STREAM_RISK_RATING',
    key: 'apiErrors.transfer_payment.duplicate_stream_risk_rating'
  },
  tp_idx_streamriskratingtransferpaymentstreamnameen: {
    code: 'TRANSFER_PAYMENT_DUPLICATE_STREAM_RISK_RATING',
    key: 'apiErrors.transfer_payment.duplicate_stream_risk_rating'
  },
  tp_idx_streamriskratingtransferpaymentstreamnamefr: {
    code: 'TRANSFER_PAYMENT_DUPLICATE_STREAM_RISK_RATING',
    key: 'apiErrors.transfer_payment.duplicate_stream_risk_rating'
  },
  tp_idx_streamareaofexpertisetransferpaymentstreamnameen: {
    code: 'TRANSFER_PAYMENT_DUPLICATE_STREAM_AREA_OF_EXPERTISE',
    key: 'apiErrors.transfer_payment.duplicate_stream_area_of_expertise'
  },
  tp_idx_streamareaofexpertisetransferpaymentstreamnamefr: {
    code: 'TRANSFER_PAYMENT_DUPLICATE_STREAM_AREA_OF_EXPERTISE',
    key: 'apiErrors.transfer_payment.duplicate_stream_area_of_expertise'
  },
  tp_idx_uniquechartofaccount: {
    code: 'TRANSFER_PAYMENT_DUPLICATE_STREAM_CHART_OF_ACCOUNT',
    key: 'apiErrors.transfer_payment.duplicate_stream_chart_of_account'
  }
}

/**
 * Checks if an error is a transfer payment unique constraint violation and throws a user-friendly API error.
 *
 * @param event - The H3 event.
 * @param error - The caught error object.
 * @returns Never returns if it's a known constraint error (throws), otherwise returns void to let caller handle it.
 * @throws ApiError if a known unique constraint violation is detected.
 */
export const throwIfTransferPaymentUniqueConstraintError = async (event: H3Event, error: unknown): Promise<never> => {
  return await throwIfMappedConstraintError(event, error, [UNIQUE_VIOLATION_CODE], CONSTRAINT_ERROR_MAP)
}
