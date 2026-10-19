import { GuideDocumentSchema, isGuidePath } from './contracts'
import type { GuideDocument } from './contracts'
import { GuideJourneySessionSchema } from './journey'
import type { GuideJourneySession } from './journey'

export interface GuideSessionSnapshot {
  userId: string
  agencyId: string
  publicationId: string
  versionId: string
  document: GuideDocument
  stepId: string
  path?: string[]
  journey?: GuideJourneySession
}
export type GuideSessionLaunch = Omit<GuideSessionSnapshot, 'stepId' | 'path' | 'journey'>
export type GuideSessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const STORAGE_KEY = 'gcs-ssc.guided-help.session.v1'

/**
 *
 * @returns Whether the cursor belongs to its published stage.
 * @param document Pinned document.
 * @param state Parsed journey state.
 */
const validJourney = (document: GuideDocument, state: GuideJourneySession): boolean => {
  const cursor = state.cursor
  if (!cursor) return true
  if (cursor.kind === 'tasks' && !state.binding) return false
  const stage = document.journey?.stages.find(item => item.id === cursor.stageId)
  return stage?.kind === cursor.kind && (stage.guideStepIds.includes(cursor.stepId) || (stage.kind === 'tasks' && stage.taskTemplates?.some(template => template.guideStepIds.includes(cursor.stepId)) === true))
}

/**
 * Storage is supplied by the host (normally sessionStorage), never a server API.
 * @returns Launch, restore, selection and clearing operations for this tab.
 * @param storage Tab-local browser storage adapter.
 */
export const createGuideSession = (storage: GuideSessionStorage) => {
  let memory: GuideSessionSnapshot | null = null
  let persistenceUnavailable = false
  /**
   * Remove the tab snapshot when storage is available.
   */
  const clear = () => {
    memory = null
    try {
      storage.removeItem(STORAGE_KEY)
    } catch { /* Storage may be unavailable. */ }
  }
  /**
   * Persist a pinned snapshot without making guidance depend on storage.
   * @returns The same pinned session even if browser persistence is unavailable.
   * @param snapshot Validated content and manually selected step.
   */
  const write = (snapshot: GuideSessionSnapshot) => {
    memory = snapshot
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
    } catch { persistenceUnavailable = true }
    return snapshot
  }
  /**
   * Restore only a valid snapshot belonging to the same user.
   * @returns Pinned snapshot when it belongs to this user and remains readable.
   * @param userId Current authenticated user identity.
   */
  const restore = (userId: string): GuideSessionSnapshot | null => {
    try {
      let raw: string | null = null
      try {
        raw = storage.getItem(STORAGE_KEY)
      } catch { persistenceUnavailable = true }
      const value = persistenceUnavailable ? memory : JSON.parse(raw ?? 'null')
      if (!value || value.userId !== userId || !['agencyId', 'publicationId', 'versionId', 'stepId'].every(key => typeof value[key] === 'string')) {
        clear()
        return null
      }
      const result = GuideDocumentSchema.safeParse(value.document)
      if (!result.success || !result.data.steps.some(step => step.id === value.stepId)) {
        clear()
        return null
      }
      const journey = value.journey === undefined ? { success: true, data: { binding: null, cursor: null } } : GuideJourneySessionSchema.safeParse(value.journey)
      if (!journey.success || (value.journey !== undefined && !result.data.journey) || (result.data.journey && !validJourney(result.data, journey.data))) {
        clear()
        return null
      }
      if (!result.data.journey && value.path !== undefined && !isGuidePath(result.data, value.path, value.stepId)) {
        clear()
        return null
      }
      return { ...(result.data.journey ? { journey: journey.data } : value.path ? { path: [...value.path] } : {}), userId, agencyId: value.agencyId, publicationId: value.publicationId, versionId: value.versionId, stepId: value.stepId, document: result.data }
    } catch {
      clear()
      return null
    }
  }
  return {
    clear, restore,
    launch: (input: GuideSessionLaunch) => {
      const document = GuideDocumentSchema.parse(input.document)
      return write({ ...input, document, stepId: document.steps[0]!.id, ...(document.journey ? { journey: { binding: null, cursor: null } } : { path: [document.steps[0]!.id] }) })
    },
    /** Update instance-local navigation without changing the pinned publication.
     * @returns Updated snapshot, or null for invalid state or an unknown user.
     * @param userId Current authenticated identity.
     * @param state Requested binding and cursor.
     */
    updateJourney: (userId: string, state: GuideJourneySession) => {
      const snapshot = restore(userId)
      const parsed = GuideJourneySessionSchema.safeParse(state)
      if (!snapshot?.document.journey || !parsed.success || !validJourney(snapshot.document, parsed.data)) return null
      const previousBinding = snapshot.journey?.binding
      const binding = parsed.data.binding
      const changed = previousBinding?.resourceType !== binding?.resourceType || previousBinding?.resourceId !== binding?.resourceId
      const journey = { ...parsed.data, cursor: changed ? null : parsed.data.cursor }
      if (!validJourney(snapshot.document, journey)) return null
      const { path: _path, ...pinned } = snapshot
      return write({ ...pinned, journey, stepId: journey.cursor?.stepId ?? snapshot.stepId })
    },
    /** Select a step in an ordinary guide.
     * @returns Updated snapshot, or null for an invalid selection.
     * @param userId Current authenticated identity.
     * @param stepId Requested step identity.
     * @param path Actual visited path.
     */
    select: (userId: string, stepId: string, path?: string[]) => {
      const snapshot = restore(userId)
      if (!snapshot || !snapshot.document.steps.some(step => step.id === stepId)) return null
      if (snapshot.document.journey) return null
      if (path && !isGuidePath(snapshot.document, path, stepId)) return null
      const { path: previousPath, ...pinned } = snapshot
      const nextPath = path ?? (previousPath?.at(-1) === stepId ? previousPath : undefined)
      return write({ ...pinned, stepId, ...(nextPath ? { path: [...nextPath] } : {}) })
    }
  }
}
