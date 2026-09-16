import { authorize } from '~~/server/utils/authorize'
import { auditEventDetail, resolveAuditReadAccess } from '~~/server/utils/audit-browser'

export default defineEventHandler(async event => {
  await authorize(event, 'audit', 'read', resolveAuditReadAccess)
  return await auditEventDetail(event, true)
})
