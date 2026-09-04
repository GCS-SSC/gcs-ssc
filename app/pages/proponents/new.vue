<script setup lang="ts">
import type { Ref } from 'vue'
import { ref } from 'vue'
import { appRouteLocations } from '~/utils/route-locations'
import type { ApplicantRecipientProfileForm } from '~~/shared/types/applicant-recipient-ui'

definePageMeta({
  i18n: {
    paths: {
      en: '/proponents/new',
      fr: '/promoteurs/nouveau'
    }
  }
})

const { t } = useI18n()
const toast = useToast()
const localePath = useLocalePath()
const { showError } = useApiErrorToast()
const { getHeroCollapsed } = useDashboard()
const { sendJson } = useJsonRequest()
const { can } = useCan()

const createForm = (): ApplicantRecipientProfileForm => ({ egcs_ar_active: false })

const form: Ref<ApplicantRecipientProfileForm | null> = ref(null)

const isSaving: Ref<boolean> = ref(false)
const canCreateProfile = computed(() => can('applicant_recipient', 'create', { type: 'global' }))
const isHeroCollapsed = getHeroCollapsed('applicant-recipient-create')

const breadcrumbItems = computed(() => [
  { label: t('applicant_recipient.title'), to: localePath(appRouteLocations.proponents()) },
  { label: t('applicant_recipient.create_title') }
])

/**
 * Creates a new applicant recipient profile and redirects to the edit page.
 */
const submit = async () => {
  if (!form.value || isSaving.value) {
    return
  }

  try {
    isSaving.value = true
    const created = await sendJson<{ id: string }>('/api/applicant-recipients', 'POST', form.value)

    toast.add({
      title: t('common.success'),
      description: t('common.added_success'),
      color: 'success'
    })

    await navigateTo(localePath(appRouteLocations.proponentEdit(created.id)))
  } catch (error: unknown) {
    showError(error)
  } finally {
    isSaving.value = false
  }
}

/**
 * Returns to the list page without saving a new profile.
 */
const cancel = async () => {
  await navigateTo(localePath(appRouteLocations.proponents()))
}

onMounted(() => {
  form.value = createForm()
})
</script>

<template>
  <UDashboardPanel id="applicant-recipient-create" class="w-full">
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
      <UAlert
        v-if="!canCreateProfile"
        role="alert"
        aria-live="assertive"
        color="error"
        icon="i-lucide-shield-alert"
        :title="t('common.error')"
        :description="t('apiErrors.auth.forbidden')">
        <template #actions>
          <UButton
            color="error"
            variant="soft"
            :label="t('applicant_recipient.title')"
            @click="cancel" />
        </template>
      </UAlert>

      <div v-else-if="form" class="flex flex-1 flex-col">
        <ApplicantRecipientProfileHero
          :profile="form"
          :is-collapsed="isHeroCollapsed"
          :title="t('applicant_recipient.create_title')"
          :subtitle="t('applicant_recipient.description')" />

        <CommonEntityEditorWorkspace>
          <ApplicantRecipientProfileFormPage
            v-model:model="form"
            compact
            :submit-label="t('common.add')"
            :cancel-label="t('common.cancel')"
            lead-agency-permission-action="create"
            :pending="isSaving"
            @submit="submit"
            @cancel="cancel" />
        </CommonEntityEditorWorkspace>
      </div>
    </template>
  </UDashboardPanel>
</template>
