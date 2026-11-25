export const MAX_REQUEST_ATTACHMENTS = 5
export const CORRESPONDENCE_STATUSES = ['open', 'resolved'] as const
export type CorrespondenceStatus = typeof CORRESPONDENCE_STATUSES[number]

interface CorrespondenceEntryFields {
  canEdit: boolean
  editDigest: string
  id: string
  body: string
  correspondenceAt: string
  loggedAt: string
  loggedBy: string | null
  attachments: Array<{ id: string; name: string }>
}

export type CorrespondenceEntry = CorrespondenceEntryFields & (
  | { kind: 'question' | 'note'; questionId: null; contactName: null; contactEmail: null }
  | { kind: 'reply'; questionId: string; contactName: string; contactEmail: string | null }
)

export interface CorrespondenceThread {
  id: string
  subject: string
  internal: boolean
  status: CorrespondenceStatus
  latestCorrespondenceAt: string
  entries: CorrespondenceEntry[]
}

export interface CorrespondenceOverview {
  threads: CorrespondenceThread[]
  canWriteRole: boolean
  canWrite: boolean
  writeBlock: 'assignment' | 'terminal' | null
}
