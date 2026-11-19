import { defineEventHandler } from 'h3'
import { deleteApprovalAttachment, requireApprovalAttachmentId } from '~~/server/utils/approval-attachments'
import { requireAuthContext } from '~~/server/utils/authorize'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const approvalId = await requireApprovalAttachmentId(event, 'approvalId')
  const attachmentId = await requireApprovalAttachmentId(event, 'attachmentId')
  return await deleteApprovalAttachment(event, approvalId, attachmentId)
})
