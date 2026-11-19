import { defineEventHandler } from 'h3'
import { downloadApprovalAttachment, requireApprovalAttachmentId } from '~~/server/utils/approval-attachments'
import { requireAuthContext } from '~~/server/utils/authorize'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const approvalId = await requireApprovalAttachmentId(event, 'approvalId')
  const attachmentId = await requireApprovalAttachmentId(event, 'attachmentId')
  return await downloadApprovalAttachment(event, approvalId, attachmentId)
})
