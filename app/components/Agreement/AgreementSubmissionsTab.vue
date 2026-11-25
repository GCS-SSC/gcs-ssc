<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { $Fetch } from 'ofetch'
import { agreementSubmissionLocation } from '~/utils/agreement-submission-location'
import type { useAgreementSubmissionCollection } from '~/composables/useAgreementSubmissionCollection'
import { useResourceRequest } from '~/composables/useResourceRequest'
import { PositivePostgresBigintIdSchema } from '~~/shared/types/schemas/common'
import type {
  AgreementSubmissionDetail,
  AgreementSubmissionListItem, AgreementSubmissionState
} from '~~/shared/types/agreement-submission'

const { agreementId, owner } = defineProps<{
  agreementId: string
  owner: ReturnType<typeof useAgreementSubmissionCollection>
}>()
const route = useRoute()
const localePath = useLocalePath()
const { t } = useI18n()
const fetchJson: $Fetch = $fetch as $Fetch
const { collection, identity, apiPath } = owner
const selectedId = computed(() => {
  const id = PositivePostgresBigintIdSchema.safeParse(route.query.submission)
  return id.success ? id.data : null
})
const workspace = ref<HTMLElement | null>(null)
const listLocation = computed(() => ({
  path: route.path,
  query: Object.fromEntries(Object.entries(route.query).filter(([key]) => key !== 'submission'))
}))
watch(selectedId, async (selection, previous) => {
  if (!selection && !previous) return
  await nextTick()
  if (selectedId.value === selection) workspace.value?.focus()
}, { immediate: true, flush: 'post' })

const states: Record<AgreementSubmissionState, 'neutral' | 'info' | 'warning' | 'success'> = {
  submitted: 'neutral', reviewing: 'info', returned: 'warning', proponent_editing: 'warning', accepted: 'success'
}
const selectionIdentity = computed(() => JSON.stringify([identity.value, selectedId.value]))

/**
 * Updates the deep link after a record is selected from the table.
 * @param item Selected Submission.
 * @returns The navigation result.
 */
const destination = (item: AgreementSubmissionListItem) => agreementSubmissionLocation({
  id: item.id, agreementId, targetId: item.targetAvailable ? item.egcs_fc_result : null, target: item.egcs_fc_target
})
const select = (item: AgreementSubmissionListItem) => navigateTo(localePath(destination(item)))
type Selection =
  | { kind: 'list' }
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'history' }
  | { kind: 'linked'; item: AgreementSubmissionListItem }
const selection = computed<Selection>(() => {
  const id = selectedId.value
  if (!id) return { kind: 'list' }
  const item = collection.data.value?.items.find(item => item.id === id)
  if (!item) return { kind: collection.status.value === 'success' ? 'missing' : 'loading' }
  return item.targetAvailable ? { kind: 'linked', item } : { kind: 'history' }
})
const evidence = useResourceRequest<AgreementSubmissionDetail>({
  identity: selectionIdentity,
  enabled: () => selection.value.kind === 'history',
  load: signal => fetchJson<AgreementSubmissionDetail>(`${apiPath.value}/${selectedId.value}`, { signal })
})
watch(selection, current => {
  if (current.kind === 'linked' && collection.status.value === 'success') {
    void navigateTo(localePath(destination(current.item)), { replace: true })
  }
}, { immediate: true })

/**
 * Refreshes the collection after a committed review or via the retry button.
 * @returns Whether the request established current results.
 */
const refresh = () => collection.refresh()
</script>

<template>
  <section ref="workspace" tabindex="-1" :aria-label="t('submission.title')" class="w-full min-w-0 scroll-mt-20 space-y-8">
    <template v-if="selection.kind === 'list'">
      <CommonLoadingState v-if="collection.status.value === 'pending' && !collection.data.value" :label="t('common.loading')" />
      <CommonErrorNotice v-if="collection.error.value" :title="t('submission.list_failed')">
        <template #actions>
          <UButton color="error" variant="outline" @click="refresh">
            {{ t('common.retry') }}
          </UButton>
        </template>
      </CommonErrorNotice>
      <p v-if="collection.data.value?.items.length === 0" class="text-sm text-muted">
        {{ t('submission.empty') }}
      </p>
      <CommonSelectableTable
        v-if="collection.data.value?.items.length"
        :items="collection.data.value.items"
        :caption="t('submission.title')"
        @select="select">
        <template #header>
          <th scope="col" class="px-4 py-3">
            {{ t('submission.reference') }}
          </th>
          <th scope="col" class="px-4 py-3">
            {{ t('submission.destination') }}
          </th>
          <th scope="col" class="px-4 py-3">
            {{ t('submission.status') }}
          </th>
          <th scope="col" class="px-4 py-3">
            <span class="sr-only">{{ t('common.actions') }}</span>
          </th>
        </template>
        <template #row="{ item, select: selectRow }">
          <th scope="row" class="px-4 py-3 text-left font-medium [overflow-wrap:anywhere]">
            {{ item.egcs_fc_sourceid }}
            <span class="block text-xs font-normal text-muted">{{ item.egcs_fc_sourcesystem }}</span>
          </th>
          <td class="px-4 py-3">
            {{ t(`submission.target.${item.egcs_fc_target}`) }}
          </td>
          <td class="px-4 py-3">
            <UBadge :color="states[item.egcs_fc_state]" variant="subtle">
              {{ t(`submission.state.${item.egcs_fc_state}`) }}
            </UBadge>
          </td>
          <td class="px-4 py-3 text-right">
            <UButton
              size="sm" color="neutral" variant="ghost" trailing-icon="i-lucide-arrow-right"
              :aria-label="t('submission.open_named', { name: item.egcs_fc_sourceid })" @click="selectRow">
              {{ t('common.open') }}
            </UButton>
          </td>
        </template>
      </CommonSelectableTable>
    </template>
    <div v-else class="space-y-6">
      <UButton :to="listLocation" variant="ghost" color="neutral" icon="i-lucide-arrow-left">
        {{ t('submission.back_to_list') }}
      </UButton>
      <CommonErrorNotice v-if="collection.error.value" :title="t('submission.list_failed')">
        <template #actions>
          <UButton color="error" variant="outline" @click="refresh">
            {{ t('common.retry') }}
          </UButton>
        </template>
      </CommonErrorNotice>
      <template v-if="selection.kind === 'history' && !collection.error.value">
        <CommonErrorNotice v-if="evidence.error.value" :title="t('submission.detail_failed')">
          <template #actions>
            <UButton color="error" variant="outline" @click="evidence.refresh">
              {{ t('common.retry') }}
            </UButton>
          </template>
        </CommonErrorNotice>
        <CommonLoadingState v-else-if="!evidence.data.value" :label="t('common.loading')" />
        <AgreementSubmissionHistory
          v-else
          :events="evidence.data.value.events"
          :target="evidence.data.value.submission.egcs_fc_target"
          :source="evidence.data.value.submission.egcs_fc_sourcesystem" />
      </template>
      <p v-else-if="selection.kind === 'missing'" role="status" class="text-sm text-muted">
        {{ t('submission.errors.not_found') }}
      </p>
      <CommonLoadingState v-else-if="!collection.error.value" :label="t('common.loading')" />
    </div>
  </section>
</template>
