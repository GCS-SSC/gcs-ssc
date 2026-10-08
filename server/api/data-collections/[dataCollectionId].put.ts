import { z } from 'zod'
import { notFound, unauthorized } from '~~/server/utils/api-errors'
import { getValidatedQueryI18n, readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { requireAuthContext } from '~~/server/utils/authorize'
import { resolveCurrentCommonUser } from '~~/server/utils/additional-reviewer-runtime'
import { saveDataCollectionById } from '~~/server/utils/data-collection-runtime'
import { executeFreshAuthorizedReviewRuntimeWrite, resolveReviewRuntimeEntityFromDataCollection } from '~~/server/utils/review-runtime-access'
import { DataCollectionSaveSchema } from '~~/shared/types/schemas/data-collection'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export const DataCollectionSaveQuerySchema = z.strictObject({
  submit: z.enum(['true', 'false'], { error: 'validation.invalid_selection' }).default('false')
}, { error: 'validation.invalid_selection' })

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const id = getRouterParam(event, 'dataCollectionId') ?? ''
  if (!isPositivePostgresBigintText(id)) return await notFound(event, 'DATA_COLLECTION_NOT_FOUND', 'apiErrors.admin_common.not_found')
  const query = await getValidatedQueryI18n(event, DataCollectionSaveQuerySchema)
  const body = await readValidatedBodyI18n(event, DataCollectionSaveSchema)
  const context = await resolveReviewRuntimeEntityFromDataCollection(event.context.$db, id)
  if (!context) return await notFound(event, 'DATA_COLLECTION_NOT_FOUND', 'apiErrors.admin_common.not_found')
  return await executeFreshAuthorizedReviewRuntimeWrite(event, context, async trx => {
    const actor = await resolveCurrentCommonUser(event, trx)
    if (!actor) return await unauthorized(event)
    return await saveDataCollectionById(event, id, body.responses, query.submit === 'true', actor.id, trx, body.revision)
  })
})
