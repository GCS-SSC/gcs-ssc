import { authorize } from '~~/server/utils/authorize'
import { listAuditEvents } from '~~/server/utils/audit-browser'

export default defineEventHandler(async event => {
  await authorize(event, 'audit', 'read', { type: 'global' })
  return await listAuditEvents(event, 'events')
})
