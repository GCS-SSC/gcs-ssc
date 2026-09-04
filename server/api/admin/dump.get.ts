import { runAdminSqlDump } from '~~/server/utils/admin-dump'
import { authorize } from '~~/server/utils/authorize'
import { throwApiError } from '~~/server/utils/api-errors'

export default defineEventHandler(async event => {
  await authorize(event, 'system', 'read', { type: 'global' })

  const abortController = new AbortController()
  const abortDump = (): void => abortController.abort()
  event.node?.req.once('aborted', abortDump)
  event.node?.res.once('close', abortDump)

  setHeaders(event, {
    'Content-Type': 'application/sql',
    'Content-Disposition': `attachment; filename="migrations-${new Date().toISOString().slice(0, 10)}.sql"`
  })

  try {
    return await runAdminSqlDump({ signal: abortController.signal })
  } catch {
    return await throwApiError(event, {
      statusCode: 500,
      code: 'ADMIN_DUMP_FAILED',
      key: 'common.unknown_error'
    })
  } finally {
    event.node?.req.off('aborted', abortDump)
    event.node?.res.off('close', abortDump)
  }
})
