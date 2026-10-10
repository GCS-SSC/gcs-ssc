import { assertAgreementCurrency } from '~~/server/utils/agreement-currency'
import { FundingCaseAgreementCommitmentCreateSchema } from '~~/shared/types/schemas'
import { assertAgreementCommitmentTotalWithinProgramFunding, assertCommitmentTypeBelongsToAgreementStream, prepareAgreementCommitmentRoute } from '~~/server/utils/agreement-commitment'
import { throwIfAgreementUniqueConstraintError } from '~~/server/utils/agreement-unique-constraint-errors'
import { runExtensionCreateOperationHooks } from '~~/server/utils/extensions'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { createPrimaryEntityAssignment, resolveAssignmentCommonUserId } from '~~/server/utils/entity-assignment'
import { notFound } from '~~/server/utils/api-errors'
import { lockAgencyDraftStatus } from '~~/server/utils/business-status-runtime'
import { sql } from 'kysely'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from '~~/server/utils/database-money'
import { allocateAgreementCommitment } from '~~/server/utils/agreement-coding-allocator'

export default defineEventHandler(async event => {
  const prepared = await prepareAgreementCommitmentRoute(event, 'create')
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementId, agreementContext, db } = prepared
  const validated = await readValidatedBodyI18n(event, FundingCaseAgreementCommitmentCreateSchema)

  try {
    return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, agreementContext, async (trx, currentContext, auth) => {
      await assertAgreementCurrency(event, trx, agreementId, validated.egcs_fc_currency)
      const commitmentType = await assertCommitmentTypeBelongsToAgreementStream(event, trx, validated.egcs_fc_type, currentContext.streamId)
      if (!commitmentType || !('id' in commitmentType)) return commitmentType
      const extensionResponse = await runExtensionCreateOperationHooks(
        event,
        trx,
        'agreement.commitments.create',
        currentContext,
        validated
      )
      if (extensionResponse) {
        return extensionResponse
      }

      const creatorId = await resolveAssignmentCommonUserId(trx, auth.userId)
      if (!creatorId) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
      const draftStatusId = await lockAgencyDraftStatus(trx, currentContext.agencyId)

      const createdCommitment = await trx
        .insertInto('Funding_Case_Agreement_Commitment')
        .values({
          egcs_fc_fundingagreement: agreementId,
          egcs_fc_type: validated.egcs_fc_type,
          egcs_fc_currency: validated.egcs_fc_currency,
          egcs_fc_totalamount: databaseMoneyValue(validated.egcs_fc_totalamount),
          egcs_fc_status: draftStatusId,
          egcs_fc_financialsystemnumber: null
        })
        .returningAll()
        .returning(databaseMoneyText(sql.ref('egcs_fc_totalamount')).as('egcs_fc_totalamount'))
        .executeTakeFirstOrThrow()

      await assertAgreementCommitmentTotalWithinProgramFunding(event, trx, agreementId, String(createdCommitment.id), validated.egcs_fc_totalamount, { replaceTotal: true })

      await createPrimaryEntityAssignment(trx, 'fundingcaseagreementcommitment', String(createdCommitment.id), creatorId)

      await runExtensionCreateOperationHooks(
        event,
        trx,
        'agreement.commitments.create',
        currentContext,
        validated,
        createdCommitment as Record<string, unknown>
      )

      await allocateAgreementCommitment(event, trx, { agreementId, agencyId: currentContext.agencyId, streamId: currentContext.streamId,
        commitmentId: String(createdCommitment.id), commitmentTypeId: validated.egcs_fc_type, amount: validated.egcs_fc_totalamount, currency: validated.egcs_fc_currency })

      return { ...createdCommitment, egcs_fc_totalamount: parseDatabaseMoney(createdCommitment.egcs_fc_totalamount) }
    }, { action: 'create', correctionFinancialMutation: true })
  } catch (error: unknown) {
    await throwIfAgreementUniqueConstraintError(event, error)
    throw error
  }
})
