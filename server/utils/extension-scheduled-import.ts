/* eslint-disable jsdoc/require-jsdoc -- Transaction-local authorization callbacks implement the SDK interface. */
import type { Transaction } from 'kysely'
import type { GcsExtensionWriteAuthorization } from '@gcs-ssc/extensions/server'
import type { Database } from '~~/shared/types/database'
import { isExtensionEnabledForAgency, requireRegisteredExtension } from './extensions'
import { resolveAgreementScopeContext } from './agreement'
import { lockTransferPaymentStreams } from './transfer-payment-stream-lock'
import { lockBusinessStatus } from './business-status-runtime'
import { hasActiveAgreementCloseoutWorkflow } from './agreement-closeout'
import { createAgreementClaimAggregate } from './agreement-claim'
import { createAgreementForecastAggregate } from './agreement-forecast-import'

/**
 * Rechecks the current Agreement's primary assignee inside the import transaction.
 * @param trx - Import transaction.
 * @param agreementId - Agreement receiving the draft.
 * @returns Active primary Common User identifier.
 */
const primaryAssignee = async (trx: Transaction<Database>, agreementId: string): Promise<string> => {
  const assignee = await trx.selectFrom('Common_Entity_Assignment as assignment')
    .innerJoin('Common_User as commonUser', 'commonUser.id', 'assignment.egcs_cn_user')
    .innerJoin('user as authUser', 'authUser.id', 'commonUser.egcs_cn_auth_user_id')
    .select('commonUser.id')
    .where('assignment.egcs_cn_entitytype', '=', 'fundingcaseagreement')
    .where('assignment.egcs_cn_entityid', '=', agreementId)
    .where('assignment.egcs_cn_isprimary', '=', true)
    .where('assignment._deleted', '=', false)
    .where('commonUser._deleted', '=', false)
    .where('authUser._deleted', '=', false)
    .forUpdate('assignment').executeTakeFirst()
  if (!assignee) throw new Error('The Agreement needs an active primary user assignee before portal imports can run.')
  return String(assignee.id)
}

/**
 * Service writes are agency-scoped and may only create drafts on open Agreements.
 * @param extensionKey - Enabled extension requesting the import.
 * @param agencyId - Configured Agency.
 * @returns Transaction-scoped host write authorization.
 */
export const createScheduledExtensionWriteAuthorization = (
  extensionKey: string, agencyId: string
): GcsExtensionWriteAuthorization => {
  let lockedDb: Transaction<Database> | null = null
  const requireCurrent = async (rawDb: unknown): Promise<Transaction<Database>> => {
    const trx = rawDb as Transaction<Database>
    if (!trx?.isTransaction || lockedDb !== trx) throw new Error('Scheduled portal import lost its authorized transaction.')
    const extension = await requireRegisteredExtension(extensionKey)
    if (!extension.requiredHostCapabilities.includes('scheduled-agreement-import'))
      throw new Error('This extension has not declared scheduled Agreement import access.')
    const agency = await trx.selectFrom('Agency_Profile').select('id')
      .where('id', '=', agencyId).where('_deleted', '=', false).forUpdate().executeTakeFirst()
    if (!agency || !await isExtensionEnabledForAgency(trx, extensionKey, agencyId))
      throw new Error('The portal connector is not enabled for this agency.')
    return trx
  }
  const lockAgreement = async (rawDb: unknown, agreementId: string, streamId: string,
    recipientId?: string) => {
    const trx = await requireCurrent(rawDb)
    if (!(await lockTransferPaymentStreams(trx, [streamId])).has(streamId))
      throw new Error('The Agreement stream is unavailable.')
    const agreement = await trx.selectFrom('Funding_Case_Agreement_Profile')
      .select(['id', 'egcs_fc_status']).where('id', '=', agreementId).where('_deleted', '=', false)
      .forUpdate().executeTakeFirst()
    const scope = await resolveAgreementScopeContext(agreementId, trx)
    if (!agreement || !scope || scope.agencyId !== agencyId || scope.streamId !== streamId)
      throw new Error('The Agreement is unavailable in this agency.')
    if (recipientId) {
      const recipient = await trx.selectFrom('Funding_Case_Agreement_Applicant_Recipient')
        .select('id').where('egcs_fc_fundingagreement', '=', agreementId)
        .where('egcs_fc_applicantrecipient', '=', recipientId).where('_deleted', '=', false)
        .forUpdate().executeTakeFirst()
      if (!recipient) throw new Error('The verified recipient is no longer linked to this Agreement.')
    }
    await lockBusinessStatus(trx, 'fundingcaseagreement', agreementId)
    if (await hasActiveAgreementCloseoutWorkflow(trx, agreementId))
      throw new Error('The Agreement is in closeout and cannot accept portal submissions.')
    return { trx, assigneeId: await primaryAssignee(trx, agreementId) }
  }
  return {
    lockAuthState: async (rawDb) => {
      const trx = rawDb as Transaction<Database>
      if (!trx?.isTransaction) throw new Error('Scheduled portal import requires an active transaction.')
      lockedDb = trx
      try {
        // Acquire the Agency lock before any extension lifecycle or Agreement locks.
        await requireCurrent(trx)
      } catch (error) {
        lockedDb = null
        throw error
      }
    },
    authorizeCurrentEntity: async (rawDb) => { await requireCurrent(rawDb) },
    authorizeCurrentScope: async (rawDb) => { await requireCurrent(rawDb) },
    createAgreementClaim: async (rawDb, input) => {
      if (!input.applicantRecipientId) throw new Error('Scheduled Claim import requires a verified recipient.')
      const { trx, assigneeId } = await lockAgreement(rawDb, input.agreementId, input.streamId,
        input.applicantRecipientId)
      return createAgreementClaimAggregate(trx, input, agencyId, assigneeId)
    },
    createAgreementForecast: async (rawDb, input) => {
      const { trx, assigneeId } = await lockAgreement(rawDb, input.agreementId, input.streamId,
        input.applicantRecipientId)
      return createAgreementForecastAggregate(trx, input, agencyId, assigneeId)
    }
  }
}
