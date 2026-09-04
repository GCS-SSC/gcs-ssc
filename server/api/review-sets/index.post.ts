import {
  CoreOrExtensionEntityTargetSchema,
  PositivePostgresBigintIdSchema,
  validateCoreOrExtensionEntityTarget
} from '~~/shared/types/schemas/common'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import {
  assertDirectReviewRuntimeEntitySupported,
  authorizeReviewRuntimeAction,
  executeFreshAuthorizedReviewRuntimeWrite,
  getReviewRuntimeOwnerAgencyId,
  resolveReviewRuntimeEntityFromEntity,
  resolveReviewRuntimeSetupScopes,
  respondReviewRuntimeEntityNotFound
} from '~~/server/utils/review-runtime-access'
import {
  assertRuntimeReviewSetCreationResult,
  createRuntimeReviewSetInTransaction
} from '~~/server/utils/review-runtime'
import { resolveCurrentCommonUser } from '~~/server/utils/additional-reviewer-runtime'
import { notFound } from '~~/server/utils/api-errors'
import {
  authorizeExtensionLifecycleRead,
  executeExtensionLifecycleWrite,
  resolveExtensionLifecycleRuntime
} from '~~/server/utils/extension-lifecycle-runtime'
import { requireAuthContext } from '~~/server/utils/authorize'

const CreateReviewSetSchema = CoreOrExtensionEntityTargetSchema.safeExtend({
  reviewSetSetupId: PositivePostgresBigintIdSchema
}).superRefine(validateCoreOrExtensionEntityTarget)

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const db = event.context.$db
  const body = await readValidatedBodyI18n(event, CreateReviewSetSchema)
  const creator = await resolveCurrentCommonUser(event)
  if (!creator) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
  const unsupportedEntityResult = await assertDirectReviewRuntimeEntitySupported(event, body.entityType)

  if (unsupportedEntityResult) {
    return unsupportedEntityResult
  }

  const extensionRuntime = body.entityType.includes(':')
    ? await resolveExtensionLifecycleRuntime(event, body.entityType, body.entityId)
    : null
  const runtimeEntity = extensionRuntime?.context
    ?? await resolveReviewRuntimeEntityFromEntity(db, body.entityType, body.entityId)
  if (!runtimeEntity) {
    return await respondReviewRuntimeEntityNotFound(event, body.entityType)
  }

  // Create stays review-specific: review runtime creation maps to entity update, not entity create.
  if (extensionRuntime) await authorizeExtensionLifecycleRead(event, extensionRuntime)
  else await authorizeReviewRuntimeAction(event, 'create_review_set', runtimeEntity)

  if (extensionRuntime) {
    const result = await executeExtensionLifecycleWrite(event, extensionRuntime, async (trx, current, actorUserId) => {
      if (current.lockedEntity.status.readOnly || current.lockedEntity.status.terminal) return null
      const ownerAgencyId = getReviewRuntimeOwnerAgencyId(current.context)
      if (!ownerAgencyId) return null
      return await createRuntimeReviewSetInTransaction({
        db: trx,
        reviewSetSetupId: body.reviewSetSetupId,
        entityType: current.context.entityType,
        entityId: current.context.entityId,
        ownerAgencyId,
        setupScopes: await resolveReviewRuntimeSetupScopes(trx, current.context, true),
        creatorCommonUserId: actorUserId
      })
    })
    return await assertRuntimeReviewSetCreationResult(event, result)
  }

  const result = await executeFreshAuthorizedReviewRuntimeWrite(
    event,
    runtimeEntity,
    async (trx, currentEntity) => {
      const ownerAgencyId = getReviewRuntimeOwnerAgencyId(currentEntity)
      if (!ownerAgencyId) return null
      const setupScopes = await resolveReviewRuntimeSetupScopes(trx, currentEntity, true)

      return await createRuntimeReviewSetInTransaction({
        db: trx,
        reviewSetSetupId: body.reviewSetSetupId,
        entityType: currentEntity.entityType,
        entityId: currentEntity.entityId,
        ownerAgencyId,
        setupScopes,
        creatorCommonUserId: creator.id
      })
    }
  )

  const errorResult = await assertRuntimeReviewSetCreationResult(event, result)
  if (errorResult) {
    return errorResult
  }

  return result
})
