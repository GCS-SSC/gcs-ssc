import { defineEventHandler } from 'h3'
import type { Insertable } from 'kysely'
import { resolveCurrentCommonUser } from '~~/server/utils/additional-reviewer-runtime'
import {
  assertAgreementClaimCanStartReconcile,
  assertNoCompletedFinalAgreementClaimReconcile,
  assertNoInProgressAgreementClaimReconcile,
  assertSingleFinalAgreementClaimReconcile,
  executeAgreementClaimMutation,
  lockAgreementClaimForUpdate,
  prepareAgreementClaimRoute
} from '~~/server/utils/agreement-claim'
import { notFound } from '~~/server/utils/api-errors'
import { throwIfAgreementUniqueConstraintError } from '~~/server/utils/agreement-unique-constraint-errors'
import type { FundingCaseAgreementClaimReconcileTable } from '~~/shared/types/database'
import { FundingCaseAgreementClaimReconcileCreateSchema } from '~~/shared/types/schemas'
import { createPrimaryEntityAssignment } from '~~/server/utils/entity-assignment'
import { authorizeAssignedItem } from '~~/server/utils/authorize'
import { BusinessStatusViolation, lockAgencyDraftStatus, lockBusinessStatus, transitionBusinessStatus } from '~~/server/utils/business-status-runtime'

export default defineEventHandler(async event => {
  const validated = await readValidatedBodyI18n(event, FundingCaseAgreementClaimReconcileCreateSchema)
  const prepared = await prepareAgreementClaimRoute(event, 'create', {
    entityType: 'fundingcaseagreementclaim',
    entityId: validated.egcs_fc_fundingagreementclaim
  })
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementId, agreementContext, db } = prepared
  await authorizeAssignedItem(event, 'fundingcaseagreementclaim', validated.egcs_fc_fundingagreementclaim)

  const currentCommonUser = await resolveCurrentCommonUser(event)
  if (!currentCommonUser) {
    return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }

  try {
    return await executeAgreementClaimMutation(
      event,
      db,
      agreementId,
      agreementContext,
      [{ type: 'claim', id: validated.egcs_fc_fundingagreementclaim }],
      async trx => {
        await lockAgreementClaimForUpdate(trx, validated.egcs_fc_fundingagreementclaim)
        const claim = await assertAgreementClaimCanStartReconcile(event, trx, agreementId, validated.egcs_fc_fundingagreementclaim)
        if (!claim || typeof claim !== 'object' || !('id' in claim)) {
          return claim
        }

        const completedFinalConflict = await assertNoCompletedFinalAgreementClaimReconcile(
          event,
          trx,
          validated.egcs_fc_fundingagreementclaim
        )
        if (completedFinalConflict) {
          return completedFinalConflict
        }

        const openFinalConflict = await assertSingleFinalAgreementClaimReconcile(
          event,
          trx,
          validated.egcs_fc_fundingagreementclaim
        )
        if (openFinalConflict) {
          return openFinalConflict
        }

        if (validated.egcs_fc_isfinal) {
          const inProgressConflict = await assertNoInProgressAgreementClaimReconcile(
            event,
            trx,
            validated.egcs_fc_fundingagreementclaim
          )
          if (inProgressConflict) {
            return inProgressConflict
          }
        }

        const draftStatusId = await lockAgencyDraftStatus(trx, agreementContext.agencyId)
        const reconcile = await trx
          .insertInto('Funding_Case_Agreement_Claim_Reconcile')
          .values({
            egcs_fc_fundingagreementclaim: validated.egcs_fc_fundingagreementclaim,
            egcs_fc_user: currentCommonUser.id,
            egcs_fc_status: draftStatusId,
            egcs_fc_isfinal: validated.egcs_fc_isfinal
          } satisfies Insertable<FundingCaseAgreementClaimReconcileTable>)
          .returningAll()
          .executeTakeFirstOrThrow()
        await createPrimaryEntityAssignment(trx, 'fundingclaimreconcile', String(reconcile.id), currentCommonUser.id)

        const agencyConfiguration = await trx.selectFrom('Agency_Profile')
          .select('egcs_ay_claimreconciliationstartstatus')
          .where('id', '=', agreementContext.agencyId)
          .where('_deleted', '=', false)
          .executeTakeFirst()
        if (agencyConfiguration?.egcs_ay_claimreconciliationstartstatus) {
          try {
            await lockBusinessStatus(trx, 'fundingcaseagreementclaim', validated.egcs_fc_fundingagreementclaim, 'engine')
          } catch (error: unknown) {
            if (error instanceof BusinessStatusViolation && error.code === 'BUSINESS_STATUS_TERMINAL') return reconcile
            throw error
          }
          await transitionBusinessStatus(
            trx,
            'fundingcaseagreementclaim',
            validated.egcs_fc_fundingagreementclaim,
            agencyConfiguration.egcs_ay_claimreconciliationstartstatus
          )
        }

        return reconcile
      },
      { operation: 'createReconcile' }
    )
  } catch (error: unknown) {
    await throwIfAgreementUniqueConstraintError(event, error)
    throw error
  }
})
