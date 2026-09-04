<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- component-local callbacks are self-descriptive */
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { Selectable } from 'kysely'
import type { AgreementCloseoutReadiness, CloseoutBlocker } from '~~/shared/types/agreement-closeout'
import type { FundingCaseAgreementCloseoutTable } from '~~/shared/types/database'
import type { BusinessRecordStateFields } from '~~/shared/types/business-record-state'
import { appRouteLocations } from '~/utils/route-locations'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'

const { agreementId, canCreate } = defineProps<{ agreementId: string, canCreate: boolean }>()
const { t, locale } = useI18n()
const { formatDate } = useDateHelpers()
const localePath = useLocalePath()
const router = useRouter()
const toast = useToast()
const { showError } = useApiErrorToast()
const isCreating: Ref<boolean> = ref(false)
const isLoading: Ref<boolean> = ref(true)
const hasLoadError: Ref<boolean> = ref(false)
type CloseoutRow = Selectable<FundingCaseAgreementCloseoutTable> & BusinessRecordStateFields
const readiness: Ref<AgreementCloseoutReadiness | null> = ref(null)
const closeouts: Ref<CloseoutRow[]> = ref([])
let loadGeneration = 0
const fetchJson = async (path: string): Promise<unknown> => {
  const response = await fetch(getClientRequestUrl(path))
  if (!response.ok) await throwFetchResponseError(response)
  return await response.json()
}
const refreshAll = async () => {
  const generation = ++loadGeneration
  const requestedAgreementId = agreementId
  isLoading.value = true
  hasLoadError.value = false
  try {
    const [nextReadiness, nextCloseouts] = await Promise.all([
      fetchJson(`/api/agreements/${requestedAgreementId}/closeout-readiness`) as Promise<AgreementCloseoutReadiness>,
      fetchJson(`/api/agreements/${requestedAgreementId}/closeouts`) as Promise<CloseoutRow[]>
    ])
    if (generation !== loadGeneration || requestedAgreementId !== agreementId) return false
    readiness.value = nextReadiness
    closeouts.value = nextCloseouts
    return true
  } catch (error: unknown) {
    if (generation !== loadGeneration || requestedAgreementId !== agreementId) return false
    hasLoadError.value = true
    showError(error)
    return false
  } finally {
    if (generation === loadGeneration) isLoading.value = false
  }
}
watch(() => agreementId, () => {
  readiness.value = null
  closeouts.value = []
  void refreshAll()
}, { immediate: true })
const openCloseout = computed(() => closeouts.value.find(closeout => closeout.egcs_fc_isopen))
const isAgreementClosed = computed(() => readiness.value?.agreementTerminal === true)
const canCreateCloseout = computed(() => canCreate
  && readiness.value?.agreementTerminal === false
  && !openCloseout.value)
const statusCatalog = useStatusCatalog()
void statusCatalog.load()
const blockerStatusLabel = (blocker: CloseoutBlocker) => {
  if (blocker.category === 'workflow') return t(`enums.runtime_state.${blocker.status}`)
  const definition = statusCatalog.getById(blocker.status)
  return definition ? (locale.value === 'fr' ? definition.nameFr : definition.nameEn) : t('common.unknown')
}
const blockerLabel = (blocker: CloseoutBlocker): string =>
  locale.value === 'fr' ? blocker.labelFr : blocker.labelEn

const createCloseout = async () => {
  if (!canCreateCloseout.value || isCreating.value) return
  const requestedAgreementId = agreementId
  try {
    isCreating.value = true
    const response = await fetch(getClientRequestUrl(`/api/agreements/${requestedAgreementId}/closeouts`), { method: 'POST' })
    if (!response.ok) await throwFetchResponseError(response)
    const closeout = await response.json() as CloseoutRow
    if (requestedAgreementId !== agreementId || !await refreshAll()) return
    toast.add({ title: t('common.success'), description: t('agreement.closeout.created_success'), color: 'success' })
    await router.push(localePath(appRouteLocations.agreementCloseoutDetail(requestedAgreementId, String(closeout.id))))
  } catch (error: unknown) {
    showError(error)
  } finally {
    isCreating.value = false
  }
}
</script>

<template>
  <CommonPreActionReport
    :title="t('agreement.closeout.title')"
    :description="t('agreement.closeout.description')">
    <template #action>
      <UButton
        v-if="canCreate && !isAgreementClosed"
        icon="i-lucide-package-check"
        :label="t('agreement.closeout.create')"
        :loading="isCreating"
        :disabled="!canCreateCloseout"
        @click="createCloseout" />
    </template>

    <template #notices>
      <UAlert
        v-if="hasLoadError"
        color="error"
        icon="i-lucide-circle-alert"
        :title="t('agreement.closeout.load_failed')">
        <template #actions>
          <UButton color="error" variant="soft" size="sm" icon="i-lucide-refresh-cw" :label="t('common.retry')" @click="() => { void refreshAll() }" />
        </template>
      </UAlert>
      <UAlert
        v-else-if="readiness"
        :color="isAgreementClosed || readiness?.ready ? 'success' : 'warning'"
        :icon="isAgreementClosed || readiness?.ready ? 'i-lucide-circle-check' : 'i-lucide-triangle-alert'"
        :title="isAgreementClosed ? t('agreement.closeout.closed') : readiness?.ready ? t('agreement.closeout.ready') : t('agreement.closeout.not_ready')"
        :description="isAgreementClosed ? t('agreement.closeout.closed_help') : readiness?.ready ? t('agreement.closeout.ready_help') : t('agreement.closeout.not_ready_help')" />
    </template>

    <CommonNumberedSection v-if="!hasLoadError && closeouts.length" :number="1" :title="t('agreement.closeout.history')">
      <div class="divide-y divide-default overflow-hidden rounded-lg border border-default text-sm">
        <div
          v-for="closeout in closeouts"
          :key="String(closeout.id)"
          class="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div class="flex flex-wrap items-center gap-3">
            <span>{{ t('agreement.closeout.number', { number: closeout.egcs_fc_closeoutnumber }) }}</span>
            <CommonRecordState
              :status-id="closeout.egcs_fc_status"
              :is-completed="closeout.isCompleted" />
          </div>
          <UButton
            :to="localePath(appRouteLocations.agreementCloseoutDetail(agreementId, String(closeout.id)))"
            color="neutral"
            variant="soft"
            size="sm"
            icon="i-lucide-arrow-right"
            :label="t('common.view_details')" />
        </div>
      </div>
    </CommonNumberedSection>

    <div v-if="isLoading && !hasLoadError" class="h-32 animate-pulse rounded-lg bg-muted" />

    <CommonNumberedSection v-if="readiness?.financial && !hasLoadError" :number="closeouts.length ? 2 : 1" :title="t('agreement.closeout.financial_situation')">
      <AgreementCloseoutFinancialTable :rows="readiness.financial.rows" :totals="readiness.financial.totals" />
    </CommonNumberedSection>

    <CommonNumberedSection v-if="readiness && !hasLoadError" :number="closeouts.length ? 3 : 2" :title="t('agreement.closeout.outstanding_followups')">
      <div v-if="readiness?.outstandingFollowups?.length" class="divide-y divide-default overflow-hidden rounded-lg border border-default text-sm">
        <div v-for="item in readiness.outstandingFollowups" :key="item.id" class="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <p class="font-medium text-highlighted">
              {{ item.name }}
            </p>
            <p class="text-sm text-muted">
              {{ t(`enums.monitor_responsible_party.${item.responsibleParty}`) }} ·
              {{ t(`enums.follow_up_status.${item.status}`) }} · {{ formatDate(item.dueDate) }}
            </p>
          </div>
          <UButton :to="localePath(item.route)" color="neutral" variant="soft" size="sm" icon="i-lucide-external-link" :label="t('agreement.closeout.open_monitor')" />
        </div>
      </div>
      <p v-else class="rounded-lg border border-default px-4 py-5 text-sm text-muted">
        {{ t('agreement.closeout.no_outstanding_followups') }}
      </p>
    </CommonNumberedSection>

    <CommonNumberedSection v-if="readiness && !hasLoadError" :number="closeouts.length ? 4 : 3" :title="t('agreement.closeout.child_readiness')">
      <div v-if="readiness?.blockers?.length" class="divide-y divide-default overflow-hidden rounded-lg border border-default text-sm">
        <div v-for="blocker in readiness.blockers" :key="`${blocker.entityType}-${blocker.entityId}-${blocker.reason}`" class="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <p class="font-medium text-highlighted">
              {{ blockerLabel(blocker) }}
            </p>
            <p class="text-sm text-muted">
              {{ t(`assignments.entity_types.${blocker.entityType}`) }} · {{ blockerStatusLabel(blocker) }} · {{ t(`agreement.closeout.blocker_reasons.${blocker.reason}`) }}
            </p>
          </div>
          <UButton :to="localePath(blocker.route)" color="neutral" variant="soft" size="sm" icon="i-lucide-arrow-right" :label="t('common.view_details')" />
        </div>
      </div>
      <p v-else class="rounded-lg border border-default px-4 py-5 text-sm text-muted">
        {{ t('agreement.closeout.all_children_terminal') }}
      </p>
    </CommonNumberedSection>
  </CommonPreActionReport>
</template>
