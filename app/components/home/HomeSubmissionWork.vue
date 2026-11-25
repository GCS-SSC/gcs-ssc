<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AgreementSubmissionState, AgreementSubmissionTarget } from '~~/shared/types/agreement-submission'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { agreementSubmissionLocation } from '~/utils/agreement-submission-location'

type SubmissionWorkItem = {
  id: string
  agreementId: string
  agreementNumber: string
  sourceId: string
  state: AgreementSubmissionState
  target: AgreementSubmissionTarget
  targetId: string | null
}

const { t } = useI18n()
const localePath = useLocalePath()
const { user, permissionRevision } = useAuth()
const page = ref(1)
watch([() => user.value?.id, permissionRevision], () => {
  page.value = 1
}, { flush: 'sync' })
const identity = computed(() => JSON.stringify([user.value?.id, permissionRevision.value, page.value]))
const { data, status, error, refresh } = useResourceRequest({
  identity,
  enabled: () => !!user.value?.id,
  /**
   * Reads the current actor's page of open Submission tasks.
   * @param signal - Cancellation for the initiating task page.
   * @returns Rows and the availability of a next page.
   */
  load: async signal => {
    const url = getClientRequestUrl('/api/submission-work')
    url.searchParams.set('page', String(page.value))
    url.searchParams.set('limit', '5')
    const response = await fetch(url, { signal })
    if (!response.ok) await throwFetchResponseError(response)
    return await response.json() as { items: SubmissionWorkItem[], hasNext: boolean }
  }
})
</script>

<template>
  <section
    v-if="error || data?.items.length || page > 1"
    aria-labelledby="submission-work-heading"
    class="min-w-0 border-t-4 border-primary pt-4 lg:col-span-2">
    <h2 id="submission-work-heading" class="text-xl font-semibold text-highlighted">
      {{ t('submission.tasks.title') }}
    </h2>
    <CommonErrorNotice v-if="error" class="mt-3" :title="t('submission.tasks.load_failed')">
      <template #actions>
        <UButton :label="t('common.retry')" @click="refresh" />
      </template>
    </CommonErrorNotice>
    <CommonLoadingState v-else-if="status === 'pending'" :label="t('common.loading')" />
    <ul v-if="data?.items.length" class="mt-3 divide-y divide-default">
      <li v-for="item in data.items" :key="item.id">
        <NuxtLink
          :to="localePath(agreementSubmissionLocation(item))"
          class="flex flex-wrap items-center justify-between gap-2 rounded px-2 py-3 hover:bg-elevated focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          <span class="min-w-0 break-words">
            <span class="block text-sm font-semibold text-highlighted">{{ t(`submission.target.${item.target}`) }} · {{ item.agreementNumber }}</span>
            <span class="block text-xs text-muted">{{ item.sourceId }}</span>
          </span>
          <UBadge color="neutral" variant="subtle">{{ t(`submission.state.${item.state}`) }}</UBadge>
        </NuxtLink>
      </li>
    </ul>
    <HomeWorkPager
      v-if="page > 1 || data?.hasNext"
      :title="t('submission.tasks.title')"
      :page="page"
      :has-next="data?.hasNext ?? false"
      :loading="status === 'pending'"
      @previous="page -= 1"
      @next="page += 1" />
  </section>
</template>
