<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- page-local callbacks are self-descriptive */
import { computed, onMounted, ref } from 'vue'
import { useBusinessStatusState } from '~/composables/useBusinessStatusState'
import type { Ref } from 'vue'
import type { Selectable } from 'kysely'
import type { EntityAssignmentContext } from '~~/shared/types/schemas/entity-assignment'
import type { FundingCaseAgreementCloseoutSnapshotTable, FundingCaseAgreementCloseoutTable } from '~~/shared/types/database'
import type { BusinessRecordStateFields } from '~~/shared/types/business-record-state'
import { appRouteLocations, authorizedRouteLocation } from '~/utils/route-locations'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import CommonCompletionWorkflowPreAction from '~/components/Common/Completions/WorkflowPreAction.vue'

definePageMeta({ key: route => route.fullPath, i18n: { paths: { en: '/agreements/[id]/closeouts/[closeoutId]', fr: '/ententes/[id]/clotures/[closeoutId]' } } })

type CloseoutDetail = Selectable<FundingCaseAgreementCloseoutTable> & BusinessRecordStateFields & {
  snapshots: Selectable<FundingCaseAgreementCloseoutSnapshotTable>[]
}
const route = useRoute()
const { t } = useI18n()
const localePath = useLocalePath()
const { getBilingualValue } = useBilingualValue()
const { getHeroCollapsed } = useDashboard()
const agreementId = route.params.id as string
const closeoutId = route.params.closeoutId as string
const selectedTab: Ref<string> = ref('workflow')
const isHeroCollapsed = getHeroCollapsed('agreement-closeout-detail')
const { isAssigned } = useEntityAssignmentRoster('fundingcaseagreementcloseout', closeoutId)
const { showError } = useApiErrorToast()
const { isRecordLocked, isTerminalStatus } = useBusinessStatusState()
const profile: Ref<EntityAssignmentContext | null> = ref(null)
const closeout: Ref<CloseoutDetail | null> = ref(null)
const isLoading: Ref<boolean> = ref(false)
const hasLoadError: Ref<boolean> = ref(false)
const fetchJson = async (path: string): Promise<unknown> => {
  const response = await fetch(getClientRequestUrl(path))
  if (!response.ok) await throwFetchResponseError(response)
  return await response.json()
}
const refresh = async () => {
  closeout.value = await fetchJson(`/api/agreements/${agreementId}/closeouts/${closeoutId}`) as CloseoutDetail
}
const loadDetail = async () => {
  if (isLoading.value) return
  isLoading.value = true
  hasLoadError.value = false
  try {
    const [profileData] = await Promise.all([
      fetchJson(`/api/entity-assignments/fundingcaseagreementcloseout/${closeoutId}/context`) as Promise<EntityAssignmentContext>,
      refresh()
    ])
    profile.value = profileData
  } catch (error: unknown) {
    hasLoadError.value = true
    showError(error)
  } finally {
    isLoading.value = false
  }
}
onMounted(loadDetail)
const title = computed(() => t('agreement.closeout.number', { number: closeout.value?.egcs_fc_closeoutnumber ?? closeoutId }))
const heroMetaItems = computed(() => [
  `${t('agreement.agreement_number')}: ${profile.value?.egcs_fc_agreementnumber ?? agreementId}`,
  getBilingualValue(profile.value, 'egcs_fc_title', agreementId)
])
const canPersistDocument = computed(() => isAssigned.value
  && closeout.value?.egcs_fc_isopen === true
  && !isTerminalStatus(closeout.value.egcs_fc_status))
const breadcrumbs = computed(() => [
  { label: t('agreement.title'), to: localePath(appRouteLocations.agreements()) },
  { label: getBilingualValue(profile.value, 'egcs_fc_title', agreementId), to: authorizedRouteLocation(profile.value?.can_read_agreement, localePath(appRouteLocations.agreementDetail(agreementId))) },
  { label: title.value }
])
const tabs = [
  { key: 'agreement.closeout.workflow', value: 'workflow', icon: 'i-lucide-git-pull-request-arrow' },
  { key: 'workflow.title', value: 'workflows', icon: 'i-lucide-workflow' },
  { key: 'agreement.documents.title', value: 'documents', icon: 'i-lucide-files' },
  { key: 'attachments.title', value: 'attachments', icon: 'i-lucide-paperclip' },
  { key: 'agreement.closeout.snapshot_history', value: 'snapshots', icon: 'i-lucide-shield-check' },
  { key: 'assignments.title', value: 'assignments', icon: 'i-lucide-users' }
]
</script>

<template>
  <UDashboardPanel id="agreement-closeout-detail" class="w-full">
    <template #header>
      <UDashboardNavbar>
        <template #leading>
          <UDashboardSidebarCollapse />
          <UBreadcrumb :items="breadcrumbs" class="ml-2" />
        </template>
        <template #right>
          <div class="flex items-center gap-2">
            <UButton
              class="cursor-default"
              color="neutral"
              variant="ghost"
              :icon="isHeroCollapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'"
              :aria-label="t(isHeroCollapsed ? 'common.expand' : 'common.collapse')"
              @click="isHeroCollapsed = !isHeroCollapsed" />
            <CommonNavbarSide />
          </div>
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <div v-if="hasLoadError" class="p-6">
        <UAlert color="error" icon="i-lucide-circle-alert" :title="t('agreement.closeout.load_failed')" :description="t('common.resource_table_load_failed_description')">
          <template #actions>
            <UButton color="error" variant="soft" icon="i-lucide-refresh-cw" :label="t('common.retry')" :loading="isLoading" @click="loadDetail" />
          </template>
        </UAlert>
      </div>

      <div v-else-if="closeout" class="flex flex-1 flex-col">
        <CommonEntityHero
          :is-collapsed="isHeroCollapsed"
          icon="i-lucide-package-check"
          :title="title"
          :description="t('agreement.closeout.detail_help')"
          :meta-items="heroMetaItems"
          :badges="[{
            statusId: closeout.egcs_fc_status,
            isCompleted: closeout.isCompleted
          }]" />

        <CommonEntityEditorWorkspace content-test-id="agreement-closeout-detail-content">
          <template #sidebar>
            <CommonRouteTabs
              v-model="selectedTab"
              :items="tabs"
              orientation="vertical"
              :ui="{ root: 'w-full', list: 'w-full flex-col items-stretch p-0', trigger: 'w-full justify-start' }" />
          </template>

          <section v-if="selectedTab === 'workflow'" class="space-y-6">
            <CommonCompletionWorkflowPreAction
              entity-type="fundingcaseagreementcloseout"
              :entity-id="closeoutId"
              :can-edit="isAssigned"
              :is-locked="!isAssigned || isRecordLocked(closeout)"
              completed-success-key="agreement.closeout.completion.completed_success"
              @changed="refresh">
              <template #notices>
                <UAlert color="warning" icon="i-lucide-lock" :title="t('agreement.closeout.lock_notice')" :description="t('agreement.closeout.lock_notice_help')" />
              </template>
            </CommonCompletionWorkflowPreAction>
          </section>

          <CommonWorkflowSection
            v-else-if="selectedTab === 'workflows'"
            entity-type="fundingcaseagreementcloseout"
            :entity-id="closeoutId"
            purpose="standard"
            :can-edit="isAssigned"
            @changed="refresh" />

          <section v-else-if="selectedTab === 'documents'" class="space-y-6">
            <h2 class="text-lg font-semibold">
              {{ t('agreement.documents.title') }}
            </h2>
            <AgreementCloseoutDocuments
              :agreement-id="agreementId"
              :closeout-id="closeoutId"
              :can-persist="canPersistDocument" />
          </section>

          <section v-else-if="selectedTab === 'snapshots'" class="space-y-6">
            <div>
              <h2 class="text-lg font-semibold">
                {{ t('agreement.closeout.snapshot_history') }}
              </h2>
              <p class="text-sm text-zinc-500 dark:text-zinc-400">
                {{ t('agreement.closeout.snapshot_history_help') }}
              </p>
            </div>
            <div v-if="closeout.snapshots.length" class="space-y-3">
              <AgreementCloseoutSnapshot
                v-for="snapshot in closeout.snapshots"
                :key="String(snapshot.id)"
                :snapshot="snapshot" />
            </div>
            <p v-else class="rounded-lg border border-default px-4 py-5 text-sm text-muted">
              {{ t('agreement.closeout.no_snapshots') }}
            </p>
          </section>

          <CommonAttachmentsTab
            v-else-if="selectedTab === 'attachments'"
            entity-type="fundingcaseagreementcloseout"
            :entity-id="closeoutId" />

          <CommonAssignedUsers
            v-else-if="selectedTab === 'assignments'"
            entity-type="fundingcaseagreementcloseout"
            :entity-id="closeoutId" />
        </CommonEntityEditorWorkspace>
      </div>

      <div v-else-if="isLoading" class="flex flex-1 items-center justify-center p-8">
        <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin text-primary" />
      </div>
    </template>
  </UDashboardPanel>
</template>
