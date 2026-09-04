<script setup lang="ts">
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import type { Ref } from 'vue'
import { ref } from 'vue'
import { appRouteLocations } from '~/utils/route-locations'
import { useAgreementSimilarityConfirmation } from '~/composables/useAgreementSimilarityConfirmation'
import type { FundingCaseAgreementProfileForm } from '~~/shared/types/funding-case-agreement-ui'

definePageMeta({
  i18n: {
    paths: {
      en: '/agreements/new',
      fr: '/ententes/nouveau'
    }
  }
})

const { t } = useI18n()
const toast = useToast()
const localePath = useLocalePath()
const route = useRoute()
const { showError } = useApiErrorToast()
const { getHeroCollapsed } = useDashboard()
const {
  warnings: similarityWarnings,
  isWarningOpen: isSimilarityWarningOpen,
  requestPreview: requestSimilarityPreview,
  handleMutationError: handleSimilarityMutationError,
  confirmWarnings: confirmSimilarityWarnings,
  cancelWarnings: cancelSimilarityWarnings,
  getConfirmations: getSimilarityConfirmations
} = useAgreementSimilarityConfirmation()

/**
 * Reads the optional proponent id supplied by proponent-scoped agreement creation.
 *
 * @returns Applicant recipient ids to seed into the create form.
 */
const getInitialApplicantRecipientIds = () => {
  const value = route.query.applicant_recipient_id

  if (typeof value === 'string' && value.trim().length > 0) {
    return [value.trim()]
  }

  if (Array.isArray(value)) {
    const firstValue = value.find(item => typeof item === 'string' && item.trim().length > 0)
    return firstValue ? [firstValue.trim()] : []
  }

  return []
}

/**
 * Creates the initial agreement form state.
 *
 * @returns Default agreement create form values.
 */
const createForm = (): FundingCaseAgreementProfileForm => ({
  egcs_fc_furtherdistribution: false,
  egcs_fc_holdback: 10,
  applicant_recipient_ids: getInitialApplicantRecipientIds()
})

const form: Ref<FundingCaseAgreementProfileForm | null> = ref(null)
const isSaving: Ref<boolean> = ref(false)
const isHeroCollapsed = getHeroCollapsed('agreement-create')

const breadcrumbItems = computed(() => [
  { label: t('agreement.title'), to: localePath(appRouteLocations.agreements()) },
  { label: t('agreement.create_title') }
])

/**
 * Creates a new agreement profile and redirects to the detail page.
 */
const submit = async () => {
  if (!form.value || isSaving.value) {
    return
  }

  try {
    isSaving.value = true
    const streamId = form.value.egcs_fc_transferpaymentstream
    const agreementNumber = form.value.egcs_fc_agreementnumber
    if (streamId === undefined || typeof agreementNumber !== 'string') return
    const canContinue = await requestSimilarityPreview({ streamId, agreementNumber })
    if (!canContinue) return

    const response = await fetch(getClientRequestUrl('/api/agreements'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...form.value,
        confirmations: getSimilarityConfirmations()
      })
    })
    if (!response.ok) await throwFetchResponseError(response)
    const created = await response.json() as { id: string }

    toast.add({
      title: t('common.success'),
      description: t('common.added_success'),
      color: 'success'
    })

    await navigateTo(localePath(appRouteLocations.agreementDetail(created.id)))
  } catch (error: unknown) {
    if (handleSimilarityMutationError(error)) return
    showError(error)
  } finally {
    isSaving.value = false
  }
}

/** Confirms the visible fingerprints and retries the complete preview-and-create path. */
const confirmSimilarityAndSubmit = async () => {
  if (isSaving.value) return
  confirmSimilarityWarnings()
  await submit()
}

/**
 * Returns to the agreement list page without saving.
 */
const cancel = async () => {
  const applicantRecipientId = getInitialApplicantRecipientIds()[0]
  if (applicantRecipientId) {
    await navigateTo(localePath({
      ...appRouteLocations.proponentEdit(applicantRecipientId),
      query: {
        section: 'agreements'
      }
    }))
    return
  }

  await navigateTo(localePath(appRouteLocations.agreements()))
}

onMounted(() => {
  form.value = createForm()
})
</script>

<template>
  <UDashboardPanel id="agreement-create" class="w-full">
    <template #header>
      <UDashboardNavbar>
        <template #leading>
          <UDashboardSidebarCollapse />
          <UBreadcrumb :items="breadcrumbItems" class="ml-2" />
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
      <div v-if="form" class="flex flex-1 flex-col">
        <AgreementProfileHero
          :profile="form"
          :is-collapsed="isHeroCollapsed"
          :title="t('agreement.create_title')"
          :subtitle="t('agreement.description')" />

        <CommonEntityEditorWorkspace>
          <AgreementProfileFormPage
            v-model:model="form"
            compact
            :submit-label="t('common.add')"
            :cancel-label="t('common.cancel')"
            permission-action="create"
            :pending="isSaving"
            @submit="submit"
            @cancel="cancel" />
        </CommonEntityEditorWorkspace>
      </div>

      <ApplicantRecipientFundingHistorySimilarityDialog
        v-model:open="isSimilarityWarningOpen"
        :warnings="similarityWarnings"
        @confirm="confirmSimilarityAndSubmit"
        @back="cancelSimilarityWarnings" />
    </template>
  </UDashboardPanel>
</template>
