<script setup lang="ts">
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
const toast = useToast()
const { canAny } = useCan()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const { isRecordLocked } = useBusinessStatusState()
const localePath = useLocalePath()

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
  fetchUrl: '/api/agreements'
})

const openCreateAgreement = async () => {
  await navigateTo(localePath(appRouteLocations.agreementCreate()))
}

const openUpdateAgreement = async (agreement: FundingCaseAgreementProfileRow) => {
  await navigateTo(localePath(appRouteLocations.agreementDetail(String(agreement.id))))
}

/**
 * Soft deletes the selected agreement profile.
 *
 * @param agreement - Agreement to delete.
 */
const deleteAgreement = async (agreement: FundingCaseAgreementProfileRow) => {
  try {
    const deleted = await confirmDeleteRequest(`/api/agreements/${agreement.id}`)
    if (!deleted) return
    await refresh()
    toast.add({
      title: t('common.success'),
      description: t('common.deleted_success'),
      color: 'success'
    })
  } catch (error: unknown) {
    showError(error)
  }
}

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

/**
 * Evaluates whether the current user can update the provided agreement.
 *
 * @param agreement - Agreement row rendered in the table.
 * @returns True when update actions should be enabled.
 */
const canUpdateAgreement = (agreement: FundingCaseAgreementProfileRow) => Boolean(agreement.can_update)

/**
 * Evaluates whether the current user can delete the provided agreement.
 *
 * @param agreement - Agreement row rendered in the table.
 * @returns True when delete actions should be enabled.
 */
const canDeleteAgreement = (agreement: FundingCaseAgreementProfileRow) =>
  Boolean(agreement.can_delete) && !isRecordLocked(agreement)
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
            <UButton
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
          @edit="openUpdateAgreement"
          @delete="deleteAgreement" />
      </div>
    </template>
  </UDashboardPanel>
</template>
