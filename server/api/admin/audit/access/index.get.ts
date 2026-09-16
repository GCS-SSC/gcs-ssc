import { authorize } from '~~/server/utils/authorize'
import { listAuditEvents, resolveAuditReadAccess } from '~~/server/utils/audit-browser'

export default defineEventHandler(async event => {
  await authorize(event, 'audit', 'read', resolveAuditReadAccess)
  return await listAuditEvents(event, 'access')
})
