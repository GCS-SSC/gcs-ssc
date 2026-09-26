import type { Kysely } from 'kysely'
import type { H3Event } from 'h3'
import type { Database } from '~~/shared/types/database'
import { throwApiError } from '~~/server/utils/api-errors'

/** Agency status flags that control whether an Opportunity accepts Intake submissions. */
export interface FundingOpportunityStatusFlags {
  egcs_cn_isdraft: boolean
  egcs_cn_readonly: boolean
  egcs_cn_terminal: boolean
  _deleted: boolean
}

/**
 * A live, writable, non-Draft Agency status makes an Opportunity intake-eligible.
 * @param status - Status flags resolved from the owning Agency.
 * @returns Whether the Opportunity can accept an Intake.
 */
export const isFundingOpportunityIntakeEligible = (status: FundingOpportunityStatusFlags | null | undefined): boolean =>
  Boolean(status && !status._deleted && !status.egcs_cn_isdraft && !status.egcs_cn_readonly && !status.egcs_cn_terminal)

/**
 * Resolves a status only from the Opportunity's owning Agency.
 * @param db - Database or active transaction.
 * @param statusId - Agency status identifier.
 * @param agencyId - Opportunity owning Agency identifier.
 * @returns Status flags when the status belongs to that Agency.
 */
export const getFundingOpportunityStatus = async (
  db: Kysely<Database>, statusId: string, agencyId: string
): Promise<FundingOpportunityStatusFlags | undefined> => await db.selectFrom('Common_Status')
  .select(['egcs_cn_isdraft', 'egcs_cn_readonly', 'egcs_cn_terminal', '_deleted'])
  .where('id', '=', statusId).where('egcs_cn_agency', '=', agencyId)
  .forShare()
  .executeTakeFirst()

/**
 * Applies the Agency status lock to ordinary Opportunity edits and deletion.
 * @param event - Request receiving a localized conflict.
 * @param status - Current Opportunity status flags.
 * @returns Resolves if ordinary edits remain available.
 */
export const assertFundingOpportunityWritable = async (
  event: H3Event, status: FundingOpportunityStatusFlags | null | undefined
): Promise<void> => {
  const code = !status || status._deleted
    ? 'BUSINESS_STATUS_NOT_FOUND'
    : status.egcs_cn_terminal
      ? 'BUSINESS_STATUS_TERMINAL'
      : status.egcs_cn_readonly
        ? 'BUSINESS_STATUS_READ_ONLY'
        : null
  if (code) await throwApiError(event, { statusCode: 409, code, key: 'apiErrors.request.invalid_status' })
}
