import { authorize } from '~~/server/utils/authorize'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => await executeFreshReadSnapshot(event, async db => {
  await authorize(event, 'system', 'read', { type: 'global' })
  const id = getRouterParam(event, 'id')
  if (!id || !isPositivePostgresBigintText(id)) return await badRequest(event, 'INVALID_ID', 'apiErrors.request.invalid_id')
  const row = await db.selectFrom('Common_GWCOA').selectAll().where('id', '=', id).executeTakeFirst()
  return row ?? await notFound(event, 'GWCOA_NOT_FOUND', 'apiErrors.agency.gwcoa_not_found')
}))
