import { sql } from 'kysely'
import { FundingCaseAgreementPaymentCreateSchema } from '~~/shared/types/schemas'
import {
  assertAgreementPaymentFiscalYear,
  prepareAgreementPaymentRoute,
  resolveActiveAgreementPaymentCommitmentByType
} from '~~/server/utils/agreement-payment'
import { runExtensionCreateOperationHooks } from '~~/server/utils/extensions'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { createPrimaryEntityAssignment, resolveAssignmentCommonUserId } from '~~/server/utils/entity-assignment'
import { notFound } from '~~/server/utils/api-errors'
import { lockAgencyDraftStatus } from '~~/server/utils/business-status-runtime'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from '~~/server/utils/database-money'

export default defineEventHandler(async event => {
  const prepared = await prepareAgreementPaymentRoute(event, 'create')
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementId, agreementContext, db } = prepared
  const validated = await readValidatedBodyI18n(event, FundingCaseAgreementPaymentCreateSchema)

  return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, agreementContext, async (trx, currentContext, auth) => {
    const commitment = await resolveActiveAgreementPaymentCommitmentByType(
      event,
      trx,
      agreementId,
      validated.egcs_fc_commitmenttype
    )
    if (!commitment || typeof commitment !== 'object' || !('id' in commitment)) {
      return commitment
    }

    const fiscalYear = await assertAgreementPaymentFiscalYear(
      event,
      trx,
      agreementId,
      validated.egcs_fc_fiscalyear
    )
    if (!fiscalYear || typeof fiscalYear !== 'object' || !('id' in fiscalYear)) {
      return fiscalYear
    }

    const paymentValues = {
      egcs_fc_fundingagreementcommitment: String(commitment.id),
      egcs_fc_fiscalyear: validated.egcs_fc_fiscalyear,
      egcs_fc_paymenttype: validated.egcs_fc_paymenttype,
      egcs_fc_periodstart: validated.egcs_fc_periodstart,
      egcs_fc_periodend: validated.egcs_fc_periodend,
      egcs_fc_paymentamount: validated.egcs_fc_paymentamount,
      egcs_fc_currency: validated.egcs_fc_currency,
      egcs_fc_comment: validated.egcs_fc_comment
    }
    const hookValues = {
      ...paymentValues,
      egcs_fc_commitmenttype: validated.egcs_fc_commitmenttype,
      ...(validated.extensions ? { extensions: validated.extensions } : {})
    }

    const extensionResponse = await runExtensionCreateOperationHooks(
      event,
      trx,
      'agreement.payments.create',
      currentContext,
      hookValues
    )
    if (extensionResponse) {
      return extensionResponse
    }

    const creatorId = await resolveAssignmentCommonUserId(trx, auth.userId)
    if (!creatorId) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
    const draftStatusId = await lockAgencyDraftStatus(trx, currentContext.agencyId)

    const createdPayment = await trx
      .insertInto('Funding_Case_Agreement_Payment')
      .values({
        ...paymentValues,
        egcs_fc_paymentamount: databaseMoneyValue(paymentValues.egcs_fc_paymentamount),
        egcs_fc_status: draftStatusId
      })
      .returning([
        'id',
        'egcs_fc_fundingagreementcommitment',
        'egcs_fc_fiscalyear',
        'egcs_fc_paymenttype',
        'egcs_fc_periodstart',
        'egcs_fc_periodend',
        databaseMoneyText(sql.ref('egcs_fc_paymentamount')).as('egcs_fc_paymentamount'),
        'egcs_fc_currency',
        'egcs_fc_comment',
        'egcs_fc_status',
        '_deleted'
      ])
      .executeTakeFirstOrThrow()
    const exactCreatedPayment = {
      ...createdPayment,
      egcs_fc_paymentamount: parseDatabaseMoney(createdPayment.egcs_fc_paymentamount)
    }

    await createPrimaryEntityAssignment(trx, 'fundingcasepayment', String(createdPayment.id), creatorId)

    await runExtensionCreateOperationHooks(
      event,
      trx,
      'agreement.payments.create',
      currentContext,
      hookValues,
      exactCreatedPayment as Record<string, unknown>
    )

    return exactCreatedPayment
  }, { action: 'create' })
})
