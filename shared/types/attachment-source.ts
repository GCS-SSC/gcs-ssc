export interface ApprovalAttachmentSource {
  kind: 'approval'
  approvalId: string
  attachmentId: string
  workflowNameEn: string
  workflowNameFr: string
  stepNameEn: string
  stepNameFr: string
  attempt: number
  approved: boolean
  decidedAt: string | null
  approverName: string | null
}

export type AttachmentSource = { kind: 'direct' } | ApprovalAttachmentSource
