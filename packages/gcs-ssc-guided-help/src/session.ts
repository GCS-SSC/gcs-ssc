import { GuideDocumentSchema, isGuidePath } from './contracts'
import type { GuideDocument } from './contracts'

export interface GuideSessionSnapshot {
  userId: string
  agencyId: string
  publicationId: string
  versionId: string
  document: GuideDocument
  stepId: string
  path?: string[]
}
export type GuideSessionLaunch = Omit<GuideSessionSnapshot, 'stepId' | 'path'>
export type GuideSessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const STORAGE_KEY = 'gcs-ssc.guided-help.session.v1'

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
      if (value.path !== undefined && !isGuidePath(result.data, value.path, value.stepId)) {
        clear()
        return null
      }
      return { ...(value.path ? { path: [...value.path] } : {}), userId, agencyId: value.agencyId, publicationId: value.publicationId, versionId: value.versionId, stepId: value.stepId, document: result.data }
    } catch {
      clear()
      return null
    }
  }
  return {
    clear, restore,
    launch: (input: GuideSessionLaunch) => {
      const document = GuideDocumentSchema.parse(input.document)
      return write({ ...input, document, stepId: document.steps[0]!.id, path: [document.steps[0]!.id] })
    },
    /**
     *
     * @returns Updated snapshot, or null for an unknown user or step.
     * @param userId Current authenticated user identity.
     * @param stepId Stable identity of the selected step.
     * @param path Actual visited path, without business field values.
     */
    select: (userId: string, stepId: string, path?: string[]) => {
      const snapshot = restore(userId)
      if (!snapshot || !snapshot.document.steps.some(step => step.id === stepId)) return null
      if (path && !isGuidePath(snapshot.document, path, stepId)) return null
      const { path: previousPath, ...pinned } = snapshot
      const nextPath = path ?? (previousPath?.at(-1) === stepId ? previousPath : undefined)
      return write({ ...pinned, stepId, ...(nextPath ? { path: [...nextPath] } : {}) })
    }
  }
}
