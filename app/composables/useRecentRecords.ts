/* eslint-disable jsdoc/require-jsdoc -- Device-local history has one reader and one writer composable. */
import { computed, onScopeDispose, ref, toValue, watch } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import { z } from 'zod'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { RECENT_RECORD_HEADERS, RECENT_RECORDS_LIMIT } from '~~/shared/utils/recent-records'

type RecentKind = 'agreement' | 'proponent'
const recentEntrySchema = z.object({
  id: z.string().refine(isPositivePostgresBigintText),
  openedAt: z.number().int().min(0)
})
type RecentEntry = z.infer<typeof recentEntrySchema>
const historySchema = z.array(recentEntrySchema).max(RECENT_RECORDS_LIMIT)

const historyKey = (actorId: string, kind: RecentKind) => `gcs-ssc:recent-records:${kind}:${actorId}`

const readHistory = (key: string): RecentEntry[] => {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(key) ?? '[]')
    return historySchema.safeParse(value).data ?? []
  } catch {
    return []
  }
}

export const useRecentRecords = (kinds: readonly RecentKind[], enabled: MaybeRefOrGetter<boolean> = true) => {
  const { user } = useAuth()
  const actorId = computed(() => user.value?.id)
  const revision = ref(0)
  const refreshHistory = (event: StorageEvent) => {
    const owner = actorId.value
    if (owner && (event.key === null || kinds.some(kind => historyKey(owner, kind) === event.key))) revision.value += 1
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', refreshHistory)
    onScopeDispose(() => window.removeEventListener('storage', refreshHistory))
  }

  const headers = computed<Record<string, string>>(() => {
    const owner = actorId.value
    if (!owner || !toValue(enabled)) return {}
    return readHeaders(owner, revision.value)
  })

  const readHeaders = (owner: string, _revision: number) => Object.fromEntries(kinds.flatMap(kind => {
    const ids = [...new Set(readHistory(historyKey(owner, kind)).map(record => record.id))]
    return ids.length ? [[RECENT_RECORD_HEADERS[kind], ids.join(',')]] : []
  }))

  return { actorId, headers }
}

export const useTrackRecentRecord = (kind: RecentKind, successfulId: MaybeRefOrGetter<string | undefined>) => {
  const { user } = useAuth()
  let opened: { actorId: string; id: string } | undefined
  watch([() => user.value?.id, () => toValue(successfulId)], ([actorId, id]) => {
    if (typeof window === 'undefined' || !actorId || !id || !isPositivePostgresBigintText(id) || (opened?.actorId === actorId && opened.id === id)) return
    opened = { actorId, id }
    const key = historyKey(actorId, kind)
    const records = readHistory(key).filter(record => record.id !== id)
    try {
      window.localStorage.setItem(key, JSON.stringify([{ id, openedAt: Date.now() }, ...records].slice(0, RECENT_RECORDS_LIMIT)))
    } catch {
      // A browser that blocks storage can still open records.
    }
  }, { immediate: true })
}
