/* eslint-disable jsdoc/require-jsdoc -- Typed HTTP client boundary. */
import type { GuideDraft, GuideDocument, ContractDiagnostic } from '@gcs-ssc/guided-help/contracts'
import type { PublicationState } from '~~/shared/constants/system-lifecycle'
import { getClientRequestUrl } from './client-request-url'
import { throwFetchResponseError } from './fetch-error'

export type HelpOption = { id: string, name: { en: string, fr: string } }
export type HelpAttribution = { guideId: string, ownerType: 'system' | 'agency', agencyId: string | null, agencyName: { en: string, fr: string } }
export type HelpVersion = { id: string, version: number, document: GuideDocument, actorId?: string, publishedAt?: string }
export type HelpGuide = {
  id: string
  egcs_cn_document: GuideDraft
  egcs_cn_shared: boolean
  egcs_cn_agency?: string | null
  publicationVersion?: number | null
  hasUnpublishedChanges?: boolean
  publicationState?: PublicationState
  versions: HelpVersion[]
  sourceAttribution?: HelpAttribution | null
  clonedFrom?: (HelpAttribution & { versionId: string, version: number }) | null
  compatibility?: ContractDiagnostic[]
  capabilities?: { canEdit: boolean, canPublish: boolean, canRetire: boolean, canDelete: boolean }
}
export type HelpCatalog = {
  id: string
  egcs_ay_guide: string
  egcs_ay_sourceversion: string
  egcs_ay_discoveryscreens: string[]
  egcs_ay_roles: string[]
  sourceVersions?: HelpVersion[]
  sourceVersionDocument?: GuideDocument
  latestSourceVersionId?: string
  publicationVersion?: number | null
  hasUnpublishedChanges?: boolean
  publicationState?: PublicationState
  sourceAttribution?: HelpAttribution | null
  clonedFrom?: (HelpAttribution & { versionId: string, version: number }) | null
  compatibility?: ContractDiagnostic[]
}
export const helpRequest = async <T>(url: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET', body?: unknown): Promise<T> => {
  const response = await fetch(getClientRequestUrl(url), {
    method,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  })
  if (!response.ok) await throwFetchResponseError(response)
  return response.status === 204 ? undefined as T : await response.json() as T
}
export const blankGuide = (): GuideDraft => ({ formatVersion: 1, title: { en: '', fr: '' }, description: { en: '', fr: '' }, steps: [] })
export const catalogDraft = (catalog: HelpCatalog) => ({
  egcs_ay_sourceversion: catalog.egcs_ay_sourceversion,
  egcs_ay_discoveryscreens: [...catalog.egcs_ay_discoveryscreens],
  egcs_ay_roles: [...catalog.egcs_ay_roles]
})
