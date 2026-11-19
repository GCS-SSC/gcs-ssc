import { z } from 'zod'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'

const approvalAttachmentSchema = z.object({
  id: z.string(),
  filename: z.string(),
  attachmentTypeId: z.string(),
  typeNameEn: z.string(),
  typeNameFr: z.string()
})

const approvalAttachmentsSchema = z.object({
  items: z.array(approvalAttachmentSchema),
  types: z.array(z.object({ id: z.string(), nameEn: z.string(), nameFr: z.string() })),
  canUpload: z.boolean()
})

export type ApprovalAttachment = z.infer<typeof approvalAttachmentSchema>
export type ApprovalAttachments = z.infer<typeof approvalAttachmentsSchema>

/**
 * @param approvalId - Exact runtime approval ID.
 * @returns The step's attachment collection URL.
 */
export const approvalAttachmentsUrl = (approvalId: string) => `/api/approvals/${encodeURIComponent(approvalId)}/attachments`

/**
 * @param approvalId - Exact runtime approval ID.
 * @param attachmentId - File attached to that approval.
 * @returns The specific attachment URL within the step.
 */
export const approvalAttachmentUrl = (approvalId: string, attachmentId: string) =>
  `${approvalAttachmentsUrl(approvalId)}/${encodeURIComponent(attachmentId)}`

/**
 * @param approvalId - Exact runtime approval ID.
 * @param signal - Current read lifetime.
 * @returns The current authorized attachment collection.
 */
export const loadApprovalAttachments = async (approvalId: string, signal: AbortSignal): Promise<ApprovalAttachments> => {
  const response = await fetch(getClientRequestUrl(approvalAttachmentsUrl(approvalId)), { signal })
  if (!response.ok) await throwFetchResponseError(response)
  return approvalAttachmentsSchema.parse(await response.json())
}
