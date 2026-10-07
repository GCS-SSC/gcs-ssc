import type { AssignableEntityType } from './database'

export type SearchRecordType = 'agreement' | 'proponent' | 'opportunity' | 'intake' | 'program' | 'stream' | 'agency'

/** Minimal palette projection. Destinations are application-relative and unlocalized. */
export interface SearchResult {
  id: string
  type: SearchRecordType | AssignableEntityType
  name_en: string
  name_fr: string
  reference: string | null
  parent_en: string | null
  parent_fr: string | null
  status: string | null
  url: string
}

export interface SearchResponse {
  records: SearchResult[]
  myWork: SearchResult[]
  hasMore: { records: boolean; myWork: boolean }
}
