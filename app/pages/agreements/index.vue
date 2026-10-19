<script setup lang="ts">
import GuidedHelpLauncher from '~/components/GuidedHelp/Launcher.vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { ComputedRef } from 'vue'
import { appRouteLocations } from '~/utils/route-locations'
import type { FundingCaseAgreementProfileRow } from '~~/shared/types/funding-case-agreement-ui'

definePageMeta({
  i18n: {
    paths: {
      en: '/agreements',
      fr: '/ententes'
    }
  }
})

const { t } = useI18n()
const toast = useLocalizedToast()
const { can, canAny } = useCan()
const { user, permissionRevision } = useAuth()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const confirmDelete = useDeleteConfirm()
const actionOwner = ref<{ kind: 'agreement'; agreementId: string }>()
const { check } = useAgreementChildActionPrerequisites(actionOwner)
let actionGeneration = 0
let actionPending = false
const localePath = useLocalePath()

const guidedHelpActions = useGuidedHelpActions()
const selectGuidedAgreement = (agreement: FundingCaseAgreementProfileRow) => {
  guidedHelpActions.begin({ kind: 'selected', binding: { resourceType: 'fundingcaseagreement', resourceId: String(agreement.id) } })()
}

const listView = ref('all')
const listViewQuery = computed(() => ({ list_view: listView.value }))

const {
  search,
  pagination,
  items: agreements,
  totalRecords,
  response,
  refresh,
  retry,
  status
} = useResourceTable<FundingCaseAgreementProfileRow>({
  query: listViewQuery,
  fetchUrl: '/api/agreements'
})

watch(listView, () => {
  pagination.value.pageIndex = 0
}, { flush: 'sync' })

const openCreateAgreement = async () => {
  await navigateTo(localePath(appRouteLocations.agreementCreate()))
}

/** Invalidates pending actions when their captured context changes. */
const invalidateAction = () => {
  actionGeneration += 1
  actionPending = false
  actionOwner.value = undefined
}
watch([
  () => user.value?.id,
  permissionRevision,
  listView,
  search,
  () => pagination.value.pageIndex,
  () => pagination.value.pageSize,
  () => agreements.value.map(row => `${row.id}:${row.agency_id}:${row.program_id}`).join('|')
], invalidateAction, { flush: 'sync' })
onBeforeUnmount(invalidateAction)

/**
 * Checks current Agreement prerequisites before edit or delete.
 * @param agreement Agreement selected for the action.
 * @param action Requested Agreement action.
 */
const runAgreementAction = async (agreement: FundingCaseAgreementProfileRow, action: 'update' | 'delete') => {
  if (actionPending || !can('agreement', action, { type: 'program', agencyId: agreement.agency_id, transferPaymentId: agreement.program_id })) return
  actionPending = true
  const generation = ++actionGeneration
  const agreementId = String(agreement.id)
  const agencyId = agreement.agency_id
  const programId = agreement.program_id
  actionOwner.value = { kind: 'agreement', agreementId }
  const current = () => generation === actionGeneration && agreements.value.some(row =>
    String(row.id) === agreementId && row.agency_id === agencyId && row.program_id === programId
  ) && can('agreement', action, { type: 'program', agencyId, transferPaymentId: programId })
  try {
    if (!await check(action, 'profile', current) || !current()) return
    if (action === 'update') {
      selectGuidedAgreement(agreement)
      await navigateTo(localePath(appRouteLocations.agreementDetail(agreementId)))
      return
    }
    const deleted = await confirmDeleteRequest(`/api/agreements/${agreementId}`, {
      shouldProceed: current,
      confirm: async () => Boolean(await confirmDelete()) && current() && await check('delete', 'profile', current)
    })
    if (!deleted || !current()) return
    await refresh()
    toast.add({ title: toast.localized('common.success'), description: toast.localized('common.deleted_success'), color: 'success' })
  } catch (error: unknown) {
    if (current()) showError(error)
  } finally {
    if (generation === actionGeneration) actionPending = false
  }
}

const openUpdateAgreement = (agreement: FundingCaseAgreementProfileRow) => runAgreementAction(agreement, 'update')
const deleteAgreement = (agreement: FundingCaseAgreementProfileRow) => runAgreementAction(agreement, 'delete')

const { getHeroCollapsed } = useDashboard()
const isHeroCollapsed = getHeroCollapsed('agreements')
const totalAgreements: ComputedRef<number> = computed(() => response.value?.stats?.total ?? 0)
const agreementHeroStats = computed(() => [
  {
    label: t('agreement.title'),
    value: totalAgreements.value
  }
])
const canCreateAgreement: ComputedRef<boolean> = computed(() => canAny('agreement', 'create'))

const canUpdateAgreement = (agreement: FundingCaseAgreementProfileRow) =>
  can('agreement', 'update', { type: 'program', agencyId: agreement.agency_id, transferPaymentId: agreement.program_id })
const canDeleteAgreement = (agreement: FundingCaseAgreementProfileRow) =>
  can('agreement', 'delete', { type: 'program', agencyId: agreement.agency_id, transferPaymentId: agreement.program_id })
</script>

<template>
  <UDashboardPanel id="agreements">
    <template #header>
      <UDashboardNavbar :title="t('agreement.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <div class="flex items-center gap-2">
            <GuidedHelpLauncher />
            <CommonActionButton
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
      <div class="flex flex-1 flex-col overflow-hidden">
        <CommonEntityHero
          :is-collapsed="isHeroCollapsed"
          icon="i-lucide-file-signature"
          :title="t('agreement.title')"
          :description="t('agreement.description')"
          :stats="agreementHeroStats" />

        <section class="min-h-0 flex-1 overflow-auto">
          <AgreementProfilesTable
            v-model:search="search"
            v-model:pagination="pagination"
            :agreements="agreements"
            :total-records="totalRecords"
            :loading="status === 'pending'"
            :request-status="status"
            :can-create="canCreateAgreement"
            :can-update="canUpdateAgreement"
            :can-delete="canDeleteAgreement"
            @retry="retry"
            @add="openCreateAgreement"
            @select="selectGuidedAgreement"
            @edit="openUpdateAgreement"
            @delete="deleteAgreement">
            <template #filters>
              <CommonAssignedListViewSelect v-model="listView" resource="agreement" />
            </template>
          </AgreementProfilesTable>
        </section>
      </div>
    </template>
  </UDashboardPanel>
</template>
