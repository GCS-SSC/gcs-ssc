import { defineEventHandler, setResponseHeader } from 'h3'
import { listApprovalAttachments, requireApprovalAttachmentId } from '~~/server/utils/approval-attachments'
import { requireAuthContext } from '~~/server/utils/authorize'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  const approvalId = await requireApprovalAttachmentId(event, 'approvalId')
  return await listApprovalAttachments(event, approvalId)
})
