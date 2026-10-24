import { defineEventHandler } from 'h3'
import { authorize } from '~~/server/utils/authorize'
import { resolveAuditReadAccess } from '~~/server/utils/audit-browser'
import { listAuditTableOptions } from '~~/server/utils/audit-table-options'

export default defineEventHandler(async event => {
  await authorize(event, 'audit', 'read', resolveAuditReadAccess)
  return await listAuditTableOptions(event.context.$db)
})
