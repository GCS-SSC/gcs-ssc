import { authorize } from '~~/server/utils/authorize'
import { auditEventDetail } from '~~/server/utils/audit-browser'

export default defineEventHandler(async event => {
  await authorize(event, 'audit', 'read', { type: 'global' })
  return await auditEventDetail(event, false)
})
