import { defineEventHandler, getHeader, setResponseHeader } from 'h3'
import { sql } from 'kysely'
import { forbidden, unauthorized } from '~~/server/utils/api-errors'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { requireAuthContext } from '~~/server/utils/authorize'
import { TablePreferencesSchema, type TablePreferences } from '~~/shared/types/schemas/table-preferences'

/** Replaces the current active account's saved table preferences atomically. */
export default defineEventHandler(async event => {
  const { userId } = await requireAuthContext(event)
  if (getHeader(event, 'X-GCS-Table-Preferences-User') !== userId) return await forbidden(event)

  event.context.auditRequestInputsRestricted = true
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  const preferences = await readValidatedBodyI18n(event, TablePreferencesSchema)
  const user = await event.context.$db.updateTable('user')
    .set({ tablePreferences: sql<TablePreferences>`${JSON.stringify(preferences)}::jsonb` })
    .where('id', '=', userId)
    .where('_deleted', '=', false)
    .returning('tablePreferences')
    .executeTakeFirst()
  if (!user) return await unauthorized(event)
  return user.tablePreferences
})
