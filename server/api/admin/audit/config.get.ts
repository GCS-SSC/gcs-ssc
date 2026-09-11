import { authorize } from '~~/server/utils/authorize'
import { resolveAuditRetention } from '~~/server/utils/audit-runtime'

export default defineEventHandler(async event => {
  await authorize(event, 'audit', 'read', { type: 'global' })
  return resolveAuditRetention()
})
