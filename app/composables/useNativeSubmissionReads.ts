import { nextTick, watch } from 'vue'
import type { WatchSource } from 'vue'
import type { CommittedReadbackResult } from '~/composables/useCommittedSettlement'

type NativeSubmissionOverview = {
  isLinked: () => boolean
  refreshLinked: () => Promise<unknown>
  refresh: () => Promise<unknown>
  status: () => string
  error: () => unknown
}

type NativeSubmissionReads = {
  actorId: WatchSource<string | undefined>
  permissionRevision: WatchSource<string>
  overview: NativeSubmissionOverview
  reads: { clear: () => void, refresh?: () => Promise<void> }[]
}

/**
 * Retires native financial reads on actor or permission replacement while the page keeps ownership of its writes.
 * @param options Current security sources and native reads.
 * @param options.actorId Current signed-in user identifier.
 * @param options.permissionRevision Current permission revision.
 * @param options.overview Native overview and linked refresh policy.
 * @param options.reads Native reads to retire. Dependent reads restart from their own prerequisites.
 * @returns Readback for acknowledged native edits.
 */
export const useNativeSubmissionReads = ({ actorId, permissionRevision, overview, reads }: NativeSubmissionReads) => {
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

  /** @returns Evidence from the owning overview after native or linked refresh. */
  const readback = async (): Promise<CommittedReadbackResult> => {
    if (overview.isLinked()) await overview.refreshLinked()
    else await overview.refresh()
    return overview.status() === 'success'
      ? { kind: 'available' }
      : { kind: 'unavailable', error: overview.error() }
  }

  return { readback }
}
