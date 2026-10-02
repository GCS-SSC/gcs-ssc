/* eslint-disable jsdoc/require-param, jsdoc/require-returns -- Public read contracts are documented at their authorization boundary. */
import type { Kysely, Transaction } from 'kysely'
import type { GcsExtensionAgreementFinancials } from '@gcs-ssc/extensions/server'
import type { Database } from '~~/shared/types/database'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { getAgreementCommitmentPaymentCapacity, getCommitmentLinePaymentCoverage, validateAgreementPaymentAllocations } from './agreement-commitment-line-balance'
import { getAgreementPaidAccountingProjection, getAgreementRecordedPaidToDate } from './agreement-accounting-projection'

/**
 * Binds the financial projection to an authorized Agreement and the caller's active transaction.
 * Route callers supply a fresh read-authorization callback; hooks run inside the host's locked write.
 * No JV records, source API access, assignment, or write authority are returned by this service.
 *
 * @param db - Host-selected database or transaction; extensions cannot replace it.
 * @param agreementId - Canonical Agreement owned by the authorized route or write operation.
 * @param beforeRead - Optional route authorization refresh before every read.
 * @returns The shared financial read contract.
 */
export const createExtensionAgreementFinancials = (
  db: Kysely<Database> | Transaction<Database>,
  agreementId: string,
  beforeRead?: () => Promise<void>
): GcsExtensionAgreementFinancials => {
  /**
   * Refreshes route authority and checks any same-Agreement exclusion.
   * @param excludePaymentId - Payment being recalculated.
   * @returns Nothing after the read scope is verified.
   */
  const prepareRead = async (excludePaymentId?: string): Promise<void> => {
    await beforeRead?.()
    if (excludePaymentId) {
      const payment = await db.selectFrom('Funding_Case_Agreement_Payment as excludedPayment')
        .innerJoin('Funding_Case_Agreement_Commitment as excludedCommitment',
          'excludedCommitment.id', 'excludedPayment.egcs_fc_fundingagreementcommitment')
        .select('excludedPayment.id').where('excludedPayment.id', '=', excludePaymentId)
        .where('excludedCommitment.egcs_fc_fundingagreement', '=', agreementId)
        .where('excludedPayment._deleted', '=', false).where('excludedCommitment._deleted', '=', false).executeTakeFirst()
      if (!payment) throw new Error('The excluded Payment must belong to the bound Agreement.')
    }
  }
  return {
    /** Refreshes the bound authority before exposing cumulative corrected accounting. */
    getRecordedPaidToDate: async input => {
      await prepareRead(input.excludePaymentId)
      if (!isPositivePostgresBigintText(input.fiscalYearId)) throw new Error('Fiscal year requires a positive bigint identifier')
      return await getAgreementRecordedPaidToDate(db, agreementId, input)
    },
    /** Reports retained accounting effects independently of cash and protective capacity. */
    getPaidAccountingProjection: async (input = {}) => {
      await prepareRead(input.excludePaymentId)
      return await getAgreementPaidAccountingProjection(db, agreementId, input)
    },
    /**
   * Reads an exact row using the shared host paid floor.
   * @param input - Exact line and optional current Payment exclusion.
   * @returns Canonical post-JV paid amount.
   */
    getCommitmentLinePaymentCoverage: async input => {
      await prepareRead(input.excludePaymentId)
      const line = await db.selectFrom('Funding_Case_Agreement_Commitment_Line').select('id')
        .where('id', '=', input.commitmentLineId).where('egcs_fc_fundingagreement', '=', agreementId)
        .where('_deleted', '=', false).executeTakeFirst()
      if (!line) throw new Error('The Commitment line must belong to the bound Agreement.')
      const coverage = await getCommitmentLinePaymentCoverage(db, input.commitmentLineId, input)
      return { paidAmount: coverage.paidAmount }
    },
    /**
   * Checks generated allocations together in the same host transaction.
   * @param input - Proposed lines and optional current Payment exclusion.
   * @returns Whether the exact rows and shared coding pools cover the proposals.
   */
    validatePaymentAllocations: async input => {
      await prepareRead(input.excludePaymentId)
      return await validateAgreementPaymentAllocations(db, agreementId, input.allocations, input)
    },
    /**
   * Reads capacity in this authorized context.
   * @param input - Fiscal year, commitment type and optional same-Agreement Payment exclusion.
   * @returns Bound Agreement identity and canonical capacity text.
   */
    getCommitmentPaymentCapacity: async input => {
      await prepareRead(input.excludePaymentId)
      if (![agreementId, input.fiscalYearId, input.commitmentTypeId, ...(input.excludePaymentId ? [input.excludePaymentId] : [])]
        .every(isPositivePostgresBigintText)) {
        throw new Error('Agreement financial capacity requires positive bigint string identifiers.')
      }

      return { agreementId, capacityAmount: await getAgreementCommitmentPaymentCapacity(db, agreementId, input) }
    }
  }
}
