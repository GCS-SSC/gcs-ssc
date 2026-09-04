import { sql } from 'kysely'
import { FundingCaseAgreementPaymentLineCreateSchema } from '~~/shared/types/schemas'
import {
  assertAgreementPaymentCommitmentLine,
  assertAgreementPaymentEditable,
  assertPaymentLineWithinCommitmentBalance,
  prepareAgreementPaymentRoute,
  syncAgreementPaymentEditingStatus
} from '~~/server/utils/agreement-payment'
import { throwIfAgreementUniqueConstraintError } from '~~/server/utils/agreement-unique-constraint-errors'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { runExtensionAgreementPaymentMutationGuards } from '~~/server/utils/extensions'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from '~~/server/utils/database-money'

export default defineEventHandler(async event => {
  const validated = await readValidatedBodyI18n(event, FundingCaseAgreementPaymentLineCreateSchema)
  const prepared = await prepareAgreementPaymentRoute(event, 'create', {
    entityType: 'fundingcasepayment',
    entityId: validated.egcs_fc_fundingagreementpayment
  })
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementId, agreementContext, db } = prepared

  try {
    const created = await executeFreshAuthorizedAgreementWrite(event, db, agreementId, agreementContext, async trx => {
      const editablePayment = await assertAgreementPaymentEditable(
        event,
        trx,
        agreementId,
        validated.egcs_fc_fundingagreementpayment,
        { lockPayment: true }
      )
      if (!editablePayment || typeof editablePayment !== 'object' || !('id' in editablePayment)) {
        return editablePayment
      }

      await runExtensionAgreementPaymentMutationGuards(event, trx, {
        operation: 'payment-line.create',
        agreementId,
        paymentId: validated.egcs_fc_fundingagreementpayment,
        changes: validated
      })

      const commitmentLine = await assertAgreementPaymentCommitmentLine(
        event,
        trx,
        agreementId,
        validated.egcs_fc_fundingagreementpayment,
        validated.egcs_fc_fundingagreementcommitmentline
      )
      if (!commitmentLine || typeof commitmentLine !== 'object' || !('id' in commitmentLine)) {
        return commitmentLine
      }

      const balance = await assertPaymentLineWithinCommitmentBalance(
        event,
        trx,
        validated.egcs_fc_fundingagreementcommitmentline,
        validated.egcs_fc_amount,
        undefined,
        { lockCommitmentLine: true }
      )
      if (!balance || typeof balance !== 'object' || !('paidAmount' in balance)) {
        return balance
      }

      const inserted = await trx
        .insertInto('Funding_Case_Agreement_Payment_Line')
        .values({
          ...validated,
          egcs_fc_amount: databaseMoneyValue(validated.egcs_fc_amount)
        })
        .returning([
          'id',
          'egcs_fc_fundingagreementpayment',
          'egcs_fc_fundingagreementcommitmentline',
          databaseMoneyText(sql.ref('egcs_fc_amount')).as('egcs_fc_amount'),
          '_deleted'
        ])
        .executeTakeFirstOrThrow()

      await syncAgreementPaymentEditingStatus(trx, validated.egcs_fc_fundingagreementpayment, {
        event,
        agreementId
      })

      return { ...inserted, egcs_fc_amount: parseDatabaseMoney(inserted.egcs_fc_amount) }
    }, {
      action: 'create',
      assignmentTarget: {
        entityType: 'fundingcasepayment',
        entityId: validated.egcs_fc_fundingagreementpayment
      }
    })

    return created
  } catch (error: unknown) {
    await throwIfAgreementUniqueConstraintError(event, error)
    throw error
  }
})
