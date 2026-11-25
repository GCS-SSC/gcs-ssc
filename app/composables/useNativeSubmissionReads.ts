import { nextTick, watch } from 'vue'
import type { WatchSource } from 'vue'

type NativeSubmissionReads = {
  actorId: WatchSource<string | undefined>
  permissionRevision: WatchSource<string>
  reads: { clear: () => void, refresh?: () => Promise<void> }[]
}

/**
 * Retires native financial reads on actor or permission replacement while the page keeps ownership of its writes.
 * @param options Current security sources and native reads.
 * @param options.actorId Current signed-in user identifier.
 * @param options.permissionRevision Current permission revision.
 * @param options.reads Native reads to retire. Dependent reads restart from their own prerequisites.
 */
export const useNativeSubmissionReads = ({ actorId, permissionRevision, reads }: NativeSubmissionReads): void => {
  watch([actorId, permissionRevision], async ([id], _previous, onCleanup) => {
    let current = true
    onCleanup(() => {
      current = false
    })
    for (const read of reads) read.clear()
    if (!id) return

    await nextTick()
    if (!current) return
    for (const read of reads) void read.refresh?.()
  }, { flush: 'sync' })
}
