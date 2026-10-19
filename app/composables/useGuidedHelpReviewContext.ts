import { computed, ref, toValue, useId, watch } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { GuideObservedContext } from '@gcs-ssc/guided-help/runtime'

type LoadedReview = {
  id: string
  runtimeId: string
  egcs_cn_entitytype: string
  egcs_cn_entityid: string
}

/** Publishes only the loaded review's identity and the current local draft.
 * @param options Loaded record and current draft observations.
 * @param options.view Registered view key.
 * @param options.record Authorized loaded record.
 * @param options.reviewId Current route identity.
 * @param options.draft Local editable business draft.
 * @param options.facts Facts established by the selected section.
 * @returns Current task context and draft revision.
 */
export const useGuidedHelpReviewContext = (options: {
  view: string
  record: MaybeRefOrGetter<LoadedReview | null | undefined>
  reviewId: MaybeRefOrGetter<string>
  draft: MaybeRefOrGetter<unknown>
  facts: MaybeRefOrGetter<string[]>
}) => {
  const visitId = useId()
  const draftRevision = ref(0)
  watch(() => JSON.stringify(toValue(options.draft)), () => {
    draftRevision.value += 1
  }, { flush: 'sync' })
  const context = computed<GuideObservedContext>(() => {
    const record = toValue(options.record)
    if (!record || record.id !== toValue(options.reviewId) || !record.runtimeId) return { kind: 'pending' }
    return {
      kind: 'task',
      execution: {
        binding: {
          resourceType: record.egcs_cn_entitytype,
          resourceId: record.egcs_cn_entityid
        },
        executionId: record.runtimeId
      },
      taskId: `review:${record.id}`,
      view: options.view,
      facts: ['task.arrived', ...toValue(options.facts)],
      visitId,
      draftRevision: draftRevision.value
    }
  })
  return { context, draftRevision }
}
