import type { Insertable } from 'kysely'
import { FundingCaseAgreementCommitmentCreateSchema } from '~~/shared/types/schemas'
import type { FundingCaseAgreementCommitmentTable } from '~~/shared/types/database'
import { assertCommitmentTypeBelongsToAgreementStream, prepareAgreementCommitmentRoute } from '~~/server/utils/agreement-commitment'
import { throwIfAgreementUniqueConstraintError } from '~~/server/utils/agreement-unique-constraint-errors'
import { runExtensionCreateOperationHooks } from '~~/server/utils/extensions'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { createPrimaryEntityAssignment, resolveAssignmentCommonUserId } from '~~/server/utils/entity-assignment'
import { notFound } from '~~/server/utils/api-errors'
import { lockAgencyDraftStatus } from '~~/server/utils/business-status-runtime'

export default defineEventHandler(async event => {
  const prepared = await prepareAgreementCommitmentRoute(event, 'create')
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementId, agreementContext, db } = prepared
  const validated = await readValidatedBodyI18n(event, FundingCaseAgreementCommitmentCreateSchema)

  try {
    return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, agreementContext, async (trx, currentContext, auth) => {
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
          egcs_fc_status: draftStatusId,
          egcs_fc_financialsystemnumber: null
        } satisfies Insertable<FundingCaseAgreementCommitmentTable>)
        .returningAll()
        .executeTakeFirstOrThrow()

      await createPrimaryEntityAssignment(trx, 'fundingcaseagreementcommitment', String(createdCommitment.id), creatorId)

      await runExtensionCreateOperationHooks(
        event,
        trx,
        'agreement.commitments.create',
        currentContext,
        validated,
        createdCommitment as Record<string, unknown>
      )

      return createdCommitment
    }, { action: 'create' })
  } catch (error: unknown) {
    await throwIfAgreementUniqueConstraintError(event, error)
    throw error
  }
})
