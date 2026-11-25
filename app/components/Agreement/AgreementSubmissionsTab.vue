<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import type { $Fetch } from 'ofetch'
import { agreementSubmissionLocation } from '~/utils/agreement-submission-location'
import { useActionContext } from '~/composables/useActionContext'
import { useCommittedSettlement } from '~/composables/useCommittedSettlement'
import { useResourceRequest } from '~/composables/useResourceRequest'
import { PositivePostgresBigintIdSchema } from '~~/shared/types/schemas/common'
import type {
  AgreementSubmissionCommand, AgreementSubmissionDetail, AgreementSubmissionList,
  AgreementSubmissionListItem, AgreementSubmissionState
} from '~~/shared/types/agreement-submission'

const { agreementId, currency } = defineProps<{ agreementId: string; currency: string }>()
const route = useRoute()
const localePath = useLocalePath()
const { t } = useI18n()
const { user, permissionRevision } = useAuth()
const identity = computed(() => JSON.stringify([agreementId, user.value?.id, permissionRevision.value]))
const apiPath = computed(() => `/api/agreements/${agreementId}/submissions`)
const fetchJson: $Fetch = $fetch as $Fetch
const collection = useResourceRequest<AgreementSubmissionList>({
  identity,
  load: signal => fetchJson<AgreementSubmissionList>(apiPath.value, { signal })
})
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
  submitted: 'neutral', reviewing: 'info', returned: 'warning', accepted: 'success'
}
const selectionIdentity = computed(() => JSON.stringify([identity.value, selectedId.value]))
const pendingCommands = reactive(new Set<string>())
const captureSettlement = useCommittedSettlement({
  context: useActionContext({ identity: [() => agreementId], authority: () => Boolean(user.value) }),
  settle: async () => await collection.refresh()
    ? { kind: 'available' }
    : { kind: 'unavailable', error: collection.error.value }
})

/**
 * Owns the write and collection readback even if the selected submission changes.
 * @param submissionId Record to transition.
 * @param command Validated workflow command.
 * @returns The committed submission for the initiating detail.
 */
const sendCommand = async (submissionId: string, command: AgreementSubmissionCommand) => {
  if (pendingCommands.has(submissionId)) return
  const settlement = captureSettlement()
  if (!settlement?.canDispatch()) return
  const url = `${apiPath.value}/${submissionId}`
  pendingCommands.add(submissionId)
  try {
    const committed = await fetchJson<AgreementSubmissionDetail>(url, { method: 'POST', body: command })
    void settlement.settle()
    return committed
  } finally {
    pendingCommands.delete(submissionId)
  }
}

/**
 * Updates the deep link after a record is selected from the table.
 * @param item Selected Submission.
 * @returns The navigation result.
 */
const destination = (item: AgreementSubmissionListItem) => agreementSubmissionLocation({
  id: item.id, agreementId, targetId: item.targetAvailable ? item.egcs_fc_result : null, target: item.egcs_fc_target
})
const select = (item: AgreementSubmissionListItem) => navigateTo(localePath(destination(item)))
const selectedRecord = computed(() => collection.data.value?.items.find(item => item.id === selectedId.value))
const archivedFinancialRecord = computed(() => {
  const item = selectedRecord.value
  return item && item.egcs_fc_target !== 'amendment_budget' && !item.targetAvailable ? item : null
})
const evidence = useResourceRequest<AgreementSubmissionDetail>({
  identity: selectionIdentity,
  enabled: () => Boolean(archivedFinancialRecord.value),
  load: signal => fetchJson<AgreementSubmissionDetail>(`${apiPath.value}/${archivedFinancialRecord.value?.id}`, { signal })
})
watch(selectedRecord, item => {
  if (item?.targetAvailable) {
    void navigateTo(localePath(destination(item)), { replace: true })
  }
})

/**
 * Refreshes the collection after a committed review or via the retry button.
 * @returns Whether the request established current results.
 */
const refresh = () => collection.refresh()
</script>

<template>
  <section ref="workspace" tabindex="-1" :aria-label="t('submission.title')" class="w-full min-w-0 scroll-mt-20 space-y-8">
    <template v-if="!selectedId">
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
            <p v-if="item.egcs_fc_blocker && item.egcs_fc_state === 'submitted'" class="mt-1 text-xs text-muted">
              {{ t('submission.needs_attention') }}
            </p>
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
      <AgreementSubmissionDetail
        v-else-if="selectedRecord?.egcs_fc_target === 'amendment_budget'"
        :key="selectionIdentity"
        :agreement-id="agreementId"
        :submission-id="selectedId"
        :currency="currency"
        :command-pending="pendingCommands.has(selectedId)"
        :send-command="sendCommand" />
      <template v-else-if="archivedFinancialRecord">
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
      <p v-else-if="collection.status.value === 'success' && !selectedRecord" role="status" class="text-sm text-muted">
        {{ t('submission.errors.not_found') }}
      </p>
      <CommonLoadingState v-else :label="t('common.loading')" />
    </div>
  </section>
</template>
