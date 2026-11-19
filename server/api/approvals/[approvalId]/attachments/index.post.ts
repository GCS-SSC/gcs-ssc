import { defineEventHandler } from 'h3'
import { addApprovalAttachment, requireApprovalAttachmentId } from '~~/server/utils/approval-attachments'
import { requireAuthContext } from '~~/server/utils/authorize'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const approvalId = await requireApprovalAttachmentId(event, 'approvalId')
  return await addApprovalAttachment(event, approvalId)
})
