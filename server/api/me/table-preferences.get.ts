import { defineEventHandler, getHeader, setResponseHeader } from 'h3'
import { forbidden, unauthorized } from '~~/server/utils/api-errors'
import { requireAuthContext } from '~~/server/utils/authorize'

/** Reads the current active account's saved table preferences. */
export default defineEventHandler(async event => {
  const { userId } = await requireAuthContext(event)
  if (getHeader(event, 'X-GCS-Table-Preferences-User') !== userId) return await forbidden(event)

  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  const user = await event.context.$db.selectFrom('user')
    .select('tablePreferences')
    .where('id', '=', userId)
    .where('_deleted', '=', false)
    .executeTakeFirst()
  if (!user) return await unauthorized(event)
  return user.tablePreferences
})
