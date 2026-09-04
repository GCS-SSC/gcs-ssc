import { CommonGwcoaCreateSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { executeFreshAuthorizedGwcoaWrite } from '~~/server/utils/gwcoa-write-transaction'
import { throwIfGwcoaConstraintError } from '~~/server/utils/gwcoa-constraint-errors'

export default defineEventHandler(async event => {
  await authorize(event, 'system', 'create', { type: 'global' })
  const body = await readValidatedBodyI18n(event, CommonGwcoaCreateSchema)
  try {
    return await executeFreshAuthorizedGwcoaWrite(event, 'create', async trx =>
      await trx.insertInto('Common_GWCOA').values(body).returningAll().executeTakeFirstOrThrow()
    )
  } catch (error) {
    return await throwIfGwcoaConstraintError(event, error)
  }
})
