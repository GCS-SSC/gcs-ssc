import { computed, shallowRef, watch } from 'vue'
import { z } from 'zod'
import { tablePreferencesKey, type TablePreferenceSession } from '~/composables/useTablePreferences'
import { authClient } from '~/utils/auth-client'
import { TablePreferencesSchema, type TablePreferences } from '~~/shared/types/schemas/table-preferences'

const cacheSchema = z.object({ preferences: TablePreferencesSchema, pending: z.boolean() })
type CachedPreferences = z.infer<typeof cacheSchema>
const endpoint = '/api/me/table-preferences'

/** Owns one browser account's preferences and serializes whole-document writes. */
export default defineNuxtPlugin(nuxtApp => {
  const session = authClient.useSession()
  const state = shallowRef<TablePreferenceSession | null>(null)
  const writes = new Map<string, Promise<void>>()
  const cacheKey = (userId: string) => `gcs-ssc:table-preferences:v1:${userId}`
  const headers = (userId: string) => ({ 'X-GCS-Table-Preferences-User': userId })
  /**
   * Reads the account's device cache, tolerating blocked storage and stale data.
   * @param userId Account whose device copy is needed.
   * @returns The validated cached document, if present.
   */
  const readCache = (userId: string) => {
    try {
      return cacheSchema.safeParse(JSON.parse(localStorage.getItem(cacheKey(userId)) ?? 'null')).data
    } catch {
      return undefined
    }
  }
  /**
   * Stores the current draft before network I/O.
   * @param userId Account owning the draft.
   * @param draft Current document and its sync status.
   */
  const cache = (userId: string, draft: CachedPreferences) => {
    try {
      localStorage.setItem(cacheKey(userId), JSON.stringify({
        preferences: draft.preferences,
        pending: draft.pending
      }))
    } catch {
      // Account preferences can still sync when browser storage is unavailable.
    }
  }
  const current = (owner: TablePreferenceSession) => active === owner
  let active: TablePreferenceSession | null = null
  const publish = (owner: TablePreferenceSession) => {
    if (current(owner)) state.value = { ...owner }
  }

  /**
   * Sends one immutable snapshot while leaving newer edits queued.
   * @param owner Account session owning the write.
   */
  const save = (owner: TablePreferenceSession) => {
    if (!current(owner) || !owner.pending || owner.sync === 'loading' || owner.sync === 'load-error' || writes.has(owner.userId)) return
    const sent = owner.preferences
    owner.sync = 'saving'
    publish(owner)
    const write = fetch(endpoint, {
      method: 'PUT',
      headers: { ...headers(owner.userId), 'Content-Type': 'application/json' },
      body: JSON.stringify(sent)
    })
      .then(response => {
        if (!response.ok) throw new Error('Table preferences could not be saved')
        if (!current(owner)) {
          const cached = readCache(owner.userId)
          if (cached?.pending && JSON.stringify(cached.preferences) === JSON.stringify(sent)) {
            cache(owner.userId, { preferences: sent, pending: false })
          }
          return
        }
        owner.pending = owner.preferences !== sent
        owner.sync = 'ready'
        cache(owner.userId, owner)
      })
      .catch(() => {
        owner.sync = 'save-error'
      })
      .finally(() => {
        writes.delete(owner.userId)
        publish(owner)
        if (owner.sync === 'ready') save(owner)
      })
    writes.set(owner.userId, write)
  }

  /**
   * Reads one authoritative baseline for the current login.
   * @param owner Account session owning the initial read or its retry.
   */
  const load = async (owner: TablePreferenceSession) => {
    owner.sync = 'loading'
    publish(owner)
    const previousWrite = writes.get(owner.userId)
    await previousWrite
    if (!current(owner)) return
    if (previousWrite && readCache(owner.userId)?.pending === false) owner.pending = false
    try {
      const response = await fetch(endpoint, { headers: headers(owner.userId) })
      if (!response.ok) throw new Error('Table preferences could not be loaded')
      const preferences = TablePreferencesSchema.parse(await response.json())
      if (!current(owner)) return
      if (!owner.pending) owner.preferences = preferences
      owner.sync = owner.pending ? 'save-error' : 'ready'
      cache(owner.userId, owner)
      publish(owner)
    } catch {
      if (!current(owner)) return
      owner.sync = 'load-error'
      publish(owner)
    }
  }

  watch(() => session.value.data?.session.id, () => {
    const userId = session.value.data?.user.id
    if (!userId) {
      active = null
      state.value = null
      return
    }
    const cached = readCache(userId)
    active = {
      userId,
      preferences: cached?.preferences ?? {},
      pending: cached?.pending ?? false,
      sync: 'loading'
    }
    state.value = { ...active }
    void load(active)
  }, { immediate: true, flush: 'sync' })

  nuxtApp.vueApp.provide(tablePreferencesKey, {
    state: computed(() => state.value),
    /**
     * Changes a table entry in the local draft before saving the whole blob.
     * @param tableId Stable caller-provided identity.
     * @param entry Replacement preferences, or omission to reset the table.
     */
    update: (tableId: string, entry?: TablePreferences[string]) => {
      if (!active || active.sync === 'loading' || active.sync === 'load-error') return
      const preferences = entry
        ? { ...active.preferences, [tableId]: entry }
        : Object.fromEntries(Object.entries(active.preferences).filter(([key]) => key !== tableId))
      active.preferences = preferences
      active.pending = true
      cache(active.userId, active)
      publish(active)
      save(active)
    },
    retry: () => {
      if (active?.sync === 'load-error') void load(active)
      else if (active?.sync === 'save-error') save(active)
    }
  })
})
