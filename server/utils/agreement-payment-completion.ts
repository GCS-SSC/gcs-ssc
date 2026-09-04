/* eslint-disable jsdoc/require-jsdoc -- Temporary coverage while payment completion helpers receive complete documentation. */
import type { H3Event } from 'h3'
import {
  badRequest,
  notFound
} from '~~/server/utils/api-errors'
import { resolveCurrentCommonUser } from '~~/server/utils/additional-reviewer-runtime'
import {
  assertAgreementPaymentEditable,
  getPaymentLineTotal,
  paymentLineTotalMatchesPaymentAmount,
  resolveAgreementPaymentRuntimeContext
} from '~~/server/utils/agreement-payment'
import {
  emitCompletionHook,
  resolveCompletionEvidenceId,
  resolveCompletionRecord
} from '~~/server/utils/completion-runtime-core'
import { createCompletionTransition } from '~~/server/utils/workflow-runtime'
import {
  executeFreshAuthorizedAgreementWrite
} from '~~/server/utils/agreement-write-transaction'
import { authorizeFreshAssignedItem } from '~~/server/utils/authorize'
import { resolveAgreementScopeContext } from '~~/server/utils/agreement'
import type { CompletionHookPayload } from '~~/shared/types/completion'
import type {
  CompletionExecuteInput
} from '~~/shared/types/schemas/completion'
import { resolveBusinessStatusProtection } from '~~/server/utils/business-status-runtime'
import { compareMoney, parseMoney } from '~~/shared/utils/money'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'

const ZERO_MONEY = parseMoney('0')

export const getAgreementPaymentCompletionRuntime = async (
  event: H3Event,
  paymentId: string
) => {
  return await executeFreshReadSnapshot(event, async trx => {
    const context = await resolveAgreementPaymentRuntimeContext(trx, paymentId)
    if (!context) return null
    const item = await resolveCompletionRecord(trx, 'fundingcasepayment', paymentId)
    const protection = await resolveBusinessStatusProtection(trx, 'fundingcasepayment', paymentId)
    const lineTotal = await getPaymentLineTotal(trx, paymentId)
    const hasPositiveLineTotal = compareMoney(lineTotal, ZERO_MONEY) > 0
    const linesMatch = hasPositiveLineTotal && await paymentLineTotalMatchesPaymentAmount(trx, paymentId)

    return {
      item,
      can_complete: item === null
        && linesMatch
        && Boolean(protection && !protection.locked),
      blocker: item
        ? null
        : !hasPositiveLineTotal
            ? 'lines_required' as const
            : !linesMatch
                ? 'payment_total_mismatch' as const
                : !protection || protection.locked
                    ? 'business_status' as const
                    : null
    }
  })
}

export const executeAgreementPaymentCompletion = async (
  event: H3Event,
  input: CompletionExecuteInput
) => {
  const db = event.context.$db
  const paymentId = input.entityId
  const context = await resolveAgreementPaymentRuntimeContext(db, paymentId)
  if (!context) {
    return null
  }

  const currentCommonUser = await resolveCurrentCommonUser(event)
  if (!currentCommonUser) {
    return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }

  const comments = input.comments ?? ''

  const agreementContext = await resolveAgreementScopeContext(context.agreementId, db)
  if (!agreementContext) {
    return await notFound(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  }

  const hookPayload = await executeFreshAuthorizedAgreementWrite(event, db, context.agreementId, agreementContext, async (trx, currentAgreementContext) => {
    const lockedPayment = await trx
      .selectFrom('Funding_Case_Agreement_Payment')
      .innerJoin(
        'Funding_Case_Agreement_Commitment',
        'Funding_Case_Agreement_Commitment.id',
        'Funding_Case_Agreement_Payment.egcs_fc_fundingagreementcommitment'
      )
      .select([
        'Funding_Case_Agreement_Payment.egcs_fc_status as egcs_fc_status'
      ])
      .where('Funding_Case_Agreement_Payment.id', '=', paymentId)
      .where('Funding_Case_Agreement_Commitment.egcs_fc_fundingagreement', '=', context.agreementId)
      .where('Funding_Case_Agreement_Payment._deleted', '=', false)
      .where('Funding_Case_Agreement_Commitment._deleted', '=', false)
      .forUpdate('Funding_Case_Agreement_Payment')
      .executeTakeFirst()
    if (!lockedPayment) {
      return await notFound(event, 'AGREEMENT_PAYMENT_NOT_FOUND', 'apiErrors.agreement.payment_not_found')
    }
    const protection = await resolveBusinessStatusProtection(trx, 'fundingcasepayment', paymentId)
    if (!protection || protection.locked) {
      return await badRequest(event, 'AGREEMENT_PAYMENT_LOCKED', 'apiErrors.request.invalid_status')
    }

    await trx
      .selectFrom('Funding_Case_Agreement_Payment_Line')
      .select('id')
      .where('egcs_fc_fundingagreementpayment', '=', paymentId)
      .where('_deleted', '=', false)
      .orderBy('id', 'asc')
      .forUpdate()
      .execute()

    const existingCompletion = await resolveCompletionEvidenceId(trx, 'fundingcasepayment', paymentId)
    if (existingCompletion) {
      return await badRequest(event, 'AGREEMENT_PAYMENT_ALREADY_COMPLETED', 'apiErrors.request.invalid_status')
    }

    const lineTotal = await getPaymentLineTotal(trx, paymentId)
    if (compareMoney(lineTotal, ZERO_MONEY) <= 0) {
      return await badRequest(event, 'AGREEMENT_PAYMENT_LINES_REQUIRED', 'apiErrors.request.invalid_status')
    }

    if (!await paymentLineTotalMatchesPaymentAmount(trx, paymentId)) {
      return await badRequest(event, 'AGREEMENT_PAYMENT_LINES_MUST_MATCH_TOTAL', 'apiErrors.agreement.payment_lines_must_match_total')
    }

    const { completion: createdCompletion } = await createCompletionTransition(
      event,
      trx,
      'fundingcasepayment',
      paymentId,
      {
        comments,
        initiatedBy: currentCommonUser.id
      }
    )

    const completionHookPayload: CompletionHookPayload = {
      completionId: createdCompletion.id,
      entityType: 'fundingcasepayment',
      entityId: paymentId,
      completedByUserId: currentCommonUser.id,
      completedAt: createdCompletion.completedAt,
      comments,
      context: {
        agreementId: currentAgreementContext.agreementId,
        streamId: currentAgreementContext.streamId,
        parentEntityType: 'fundingcaseagreement',
        parentEntityId: currentAgreementContext.agreementId
      }
    }

    return completionHookPayload
  }, {
    businessStatusMode: 'engine',
    businessStatusTarget: { entityType: 'fundingcasepayment', entityId: paymentId },
    authorize: async (trx, _currentAgreementContext, authContext) => {
      await assertAgreementPaymentEditable(event, trx, context.agreementId, paymentId, { lockPayment: true })
      await authorizeFreshAssignedItem(event, trx, authContext, 'fundingcasepayment', paymentId)
    }
  })

  await emitCompletionHook(hookPayload)

  return {
    item: {
      id: hookPayload.completionId,
      egcs_cn_comments: hookPayload.comments,
      egcs_cn_user: hookPayload.completedByUserId,
      egcs_cn_user_name: currentCommonUser.name,
      egcs_cn_completedat: hookPayload.completedAt
    },
    can_complete: false
  }
}
