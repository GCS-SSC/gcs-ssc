import { CommonGwcoaPatchSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { executeFreshAuthorizedGwcoaWrite } from '~~/server/utils/gwcoa-write-transaction'
import { throwIfGwcoaConstraintError } from '~~/server/utils/gwcoa-constraint-errors'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  await authorize(event, 'system', 'update', { type: 'global' })
  const id = getRouterParam(event, 'id')
  if (!id || !isPositivePostgresBigintText(id)) return await badRequest(event, 'INVALID_ID', 'apiErrors.request.invalid_id')
  const body = await readValidatedBodyI18n(event, CommonGwcoaPatchSchema)
  if (Object.keys(body).length === 0) {
    return await badRequest(event, 'NO_UPDATABLE_FIELDS', 'apiErrors.request.no_updatable_fields')
  }

  try {
    return await executeFreshAuthorizedGwcoaWrite(event, 'update', async trx => {
      const locked = await trx.selectFrom('Common_GWCOA').select('id').where('id', '=', id).forUpdate().executeTakeFirst()
      if (!locked) return await notFound(event, 'GWCOA_NOT_FOUND', 'apiErrors.agency.gwcoa_not_found')
      return await trx.updateTable('Common_GWCOA').set(body).where('id', '=', id).returningAll().executeTakeFirstOrThrow()
    })
  } catch (error) {
    return await throwIfGwcoaConstraintError(event, error)
  }
})
