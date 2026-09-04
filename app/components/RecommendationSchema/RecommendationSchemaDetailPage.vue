<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc */
import { computed, nextTick, onMounted, ref, useTemplateRef } from 'vue'
import type { Ref } from 'vue'
import { RecommendationDefinitionSchema } from '~~/shared/types/schemas/recommendation/recommendation'
import type { RecommendationDefinition } from '~~/shared/types/schemas/recommendation/recommendation'
import { appRouteLocations } from '~/utils/route-locations'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import type { PublicationState } from '~~/shared/constants/system-lifecycle'
import type { Scope } from '~~/shared/utils/scopes'
import type { EditorMutationToken } from '~/composables/useEditorMutationCoordinator'
import { useEditorMutationCoordinator } from '~/composables/useEditorMutationCoordinator'

type RecommendationSchemaPayload = {
  id: string
  publicationId: string
  publicationState: PublicationState
  publicationVersionId: string | null
  publicationVersion: number | null
  hasUnpublishedChanges: boolean
  egcs_cn_name_en: string
  egcs_cn_name_fr: string
  egcs_cn_result: Record<string, unknown>
  egcs_cn_recommendationschema: RecommendationDefinition
}
type TransferPaymentNameResponse = {
  egcs_tp_name_en: string
  egcs_tp_name_fr: string
  egcs_tp_agency?: string
}

const route = useRoute()
const localePath = useLocalePath()
const { t } = useI18n()
const { getBilingualValue } = useBilingualValue()
const { showError } = useApiErrorToast()
const toast = useToast()
const { can } = useCan()
const transferPaymentId = String(route.params.id)
const streamId = String(route.params.streamId)
const schemaId = String(route.params.schemaId)
const endpoint = `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/recommendation-schemas/${schemaId}`
const { data: profile } = await useFetch<TransferPaymentNameResponse, Error, string>(`/api/transfer-payments/${transferPaymentId}`)
const { data: stream } = await useFetch<TransferPaymentNameResponse, Error, string>(`/api/transfer-payments/${transferPaymentId}/streams/${streamId}`)
const state: Ref<RecommendationSchemaPayload | null> = ref(null)
const definition: Ref<RecommendationDefinition | null> = ref(null)
const loadError: Ref<unknown | null> = ref(null)
const detailContent = useTemplateRef<HTMLElement>('detailContent')
const isLoadRetrying: Ref<boolean> = ref(false)
const selectedSection: Ref<string> = ref('recommendation-general')
const { getHeroCollapsed } = useDashboard()
const isHeroCollapsed = getHeroCollapsed('transfer-payment-recommendation-schema-detail')
const profileScope = computed<Scope>(() => ({
  type: 'entity', agencyId: String(profile.value?.egcs_tp_agency ?? ''),
  path: [{ type: 'transfer_payment', id: transferPaymentId }]
}))
const canManagePublication = computed(() => Boolean(profile.value) && can('transfer_payment', 'update', profileScope.value))
const canEdit = computed(() => canManagePublication.value && state.value?.publicationState !== 'retired')

const title = computed(() => getBilingualValue(state.value, 'egcs_cn_name', t('recommendation_schema.title')))
const breadcrumbItems = computed(() => [
  { label: t('transfer_payment.title'), to: localePath(appRouteLocations.transferPayments()) },
  { label: getBilingualValue(profile.value, 'egcs_tp_name'), to: localePath(appRouteLocations.transferPaymentDetail(transferPaymentId)) },
  {
    label: getBilingualValue(stream.value, 'egcs_tp_name'),
    to: localePath(appRouteLocations.transferPaymentStreamDetail(transferPaymentId, streamId, { section: 'recommendation-setups' }))
  },
  { label: title.value }
])
const sectionTabs = computed(() => [
  { key: 'recommendation_schema.general', value: 'recommendation-general', icon: 'i-lucide-info' },
  { key: 'recommendation_schema.form_sections', value: 'recommendation-definition', icon: 'i-lucide-layers' }
])
const definitionValidation = computed(() => definition.value ? RecommendationDefinitionSchema.safeParse(definition.value) : null)
const definitionErrors = computed(() => definitionValidation.value && !definitionValidation.value.success
  ? [...new Set(definitionValidation.value.error.issues.map(issue => t(issue.message)))]
  : [])

const getDraft = () => state.value && definition.value
  ? {
      egcs_cn_name_en: state.value.egcs_cn_name_en,
      egcs_cn_name_fr: state.value.egcs_cn_name_fr,
      egcs_cn_recommendationschema: definition.value
    }
  : null
const mutation = useEditorMutationCoordinator({ getDraft })
const isSaving = computed(() => mutation.isActionPending('save'))
const isPublishing = computed(() => mutation.isActionPending('publish'))
const isRetiring = computed(() => mutation.isActionPending('retire'))
const canEditFields = computed(() => canEdit.value && !mutation.isPending.value)
const applyPayload = (payload: RecommendationSchemaPayload) => {
  state.value = structuredClone(payload)
  definition.value = structuredClone(payload.egcs_cn_recommendationschema)
}
const mergePublicationMetadata = (payload: RecommendationSchemaPayload) => {
  if (!state.value) return
  state.value.publicationId = payload.publicationId
  state.value.publicationState = payload.publicationState
  state.value.publicationVersionId = payload.publicationVersionId
  state.value.publicationVersion = payload.publicationVersion
  state.value.hasUnpublishedChanges = payload.hasUnpublishedChanges
}
const fetchPayload = async () => {
  const response = await fetch(getClientRequestUrl(endpoint))
  if (!response.ok) await throwFetchResponseError(response)
  return await response.json() as RecommendationSchemaPayload
}
const loadSession = async () => {
  isLoadRetrying.value = true
  try {
    const payload = await fetchPayload()
    mutation.replaceSessionDraft(() => applyPayload(payload))
    loadError.value = null
  } catch (error) {
    state.value = null
    definition.value = null
    loadError.value = error
    throw error
  } finally {
    isLoadRetrying.value = false
  }
}
const retryLoad = async () => {
  try {
    await loadSession()
    await nextTick()
    detailContent.value?.focus()
  } catch (error) {
    showError(error)
  }
}
onMounted(retryLoad)

const showPreservedDraft = () => toast.add({
  title: t('common.warning'),
  description: t('common.newer_changes_preserved'),
  color: 'warning'
})
const blockDirtyAction = () => {
  if (!mutation.isDirty.value) return false
  toast.add({
    title: t('common.warning'),
    description: t('common.save_changes_before_action'),
    color: 'warning'
  })
  return true
}
const refreshForMutation = async (token: EditorMutationToken) => {
  const payload = await fetchPayload()
  return mutation.applyMutationRefresh(token, {
    apply: () => applyPayload(payload),
    mergeMetadata: () => mergePublicationMetadata(payload)
  })
}

const persist = async (token: EditorMutationToken, showSuccess: boolean) => {
  if (!state.value || !definition.value) return false
  const persistedDefinition = RecommendationDefinitionSchema.parse(definition.value)
  const response = await fetch(getClientRequestUrl(endpoint), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      egcs_cn_name_en: state.value.egcs_cn_name_en,
      egcs_cn_name_fr: state.value.egcs_cn_name_fr,
      egcs_cn_recommendationschema: persistedDefinition
    })
  })
  if (!response.ok) await throwFetchResponseError(response)
  if (!await refreshForMutation(token)) {
    if (mutation.isTokenCurrent(token)) showPreservedDraft()
    return false
  }
  if (showSuccess) {
    toast.add({ title: t('common.success'), description: t('recommendation_schema.saved'), color: 'success' })
  }
  return true
}

const save = async () => {
  if (!state.value || !definition.value || !canEdit.value || mutation.isPending.value) return false
  return await mutation.run('save', async token => {
    try {
      return await persist(token, true)
    } catch (error) {
      showError(error)
      return false
    }
  }) === true
}
const publish = async () => {
  if (!state.value || !canEdit.value || mutation.isPending.value) return
  await mutation.run('publish', async token => {
    try {
      if (mutation.isDirty.value && !await persist(token, false)) return
      const response = await fetch(getClientRequestUrl(`${endpoint}/publish`), { method: 'POST' })
      if (!response.ok) await throwFetchResponseError(response)
      if (!await refreshForMutation(token)) {
        if (mutation.isTokenCurrent(token)) showPreservedDraft()
        return
      }
      toast.add({ title: t('common.success'), description: t('recommendation_schema.published'), color: 'success' })
    } catch (error) {
      showError(error)
    }
  })
}
const retire = async () => {
  if (!state.value || !canManagePublication.value || state.value.publicationState !== 'published' || mutation.isPending.value) return
  if (blockDirtyAction()) return
  await mutation.run('retire', async token => {
    try {
      const response = await fetch(getClientRequestUrl(`${endpoint}/retire`), { method: 'POST' })
      if (!response.ok) await throwFetchResponseError(response)
      if (!await refreshForMutation(token)) return
      toast.add({ title: t('common.success'), description: t('recommendation_schema.retired'), color: 'success' })
    } catch (error) {
      showError(error)
    }
  })
}
</script>

<template>
  <UDashboardPanel id="recommendation-schema-detail">
    <template #header>
      <UDashboardNavbar>
        <template #leading>
          <UDashboardSidebarCollapse />
          <UBreadcrumb :items="breadcrumbItems" class="ml-2" />
        </template>
        <template #right>
          <div class="flex items-center gap-2">
            <UButton
              color="neutral" variant="ghost" :icon="isHeroCollapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'"
              :aria-label="t(isHeroCollapsed ? 'common.expand' : 'common.collapse')" class="cursor-default" @click="isHeroCollapsed = !isHeroCollapsed" />
            <CommonNavbarSide />
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div
        v-if="loadError"
        class="p-6"
        data-testid="design-time-detail-load-error"
        role="alert"
        :aria-label="t('common.configuration_load_failed')">
        <UAlert
          color="error"
          icon="i-lucide-circle-alert"
          :title="t('common.configuration_load_failed')"
          :description="t('common.configuration_load_failed_description')">
          <template #actions>
            <UButton
              color="error"
              variant="soft"
              size="sm"
              icon="i-lucide-refresh-cw"
              :label="t('common.retry')"
              :loading="isLoadRetrying"
              :disabled="isLoadRetrying"
              @click="retryLoad" />
          </template>
        </UAlert>
      </div>
      <div
        v-else-if="state && definition"
        ref="detailContent"
        class="flex flex-1 flex-col"
        data-testid="design-time-detail-content"
        role="region"
        :aria-label="title"
        tabindex="-1">
        <AssessmentSchemaDetailHero
          :name="title"
          :publication-version="state.publicationVersion"
          :publication-state="state.publicationState"
          :has-unpublished-changes="state.hasUnpublishedChanges"
          :is-collapsed="isHeroCollapsed"
          :is-publishing="isPublishing"
          :is-retiring="isRetiring"
          :is-mutation-pending="mutation.isPending.value"
          :can-manage="canManagePublication"
          review-type="recommendation"
          @publish="publish"
          @retire="retire" />

        <div class="flex min-h-0 flex-1 flex-col gap-6 overflow-visible px-6 pt-0 pb-6 lg:flex-row lg:gap-0">
          <AssessmentSchemaDetailSidebar
            v-if="canEdit"
            v-model="selectedSection"
            :section-tabs="sectionTabs"
            :is-saving="isSaving"
            :disabled="mutation.isPending.value"
            :ui="{ trigger: 'w-full justify-start whitespace-normal break-words text-left' }"
            @save="save" />
          <aside v-else class="w-full shrink-0 lg:sticky lg:top-6 lg:self-start lg:w-72 lg:border-r lg:border-zinc-200 lg:pr-4 dark:lg:border-zinc-800">
            <div class="pt-6">
              <CommonRouteTabs v-model="selectedSection" :items="sectionTabs" orientation="vertical" />
            </div>
          </aside>

          <main class="min-h-0 min-w-0 flex-1 pt-6 lg:pl-6">
            <fieldset :disabled="!canEditFields">
              <div class="w-full space-y-10 pb-12">
                <AssessmentSchemaPageSection section-id="recommendation-general" :title="t('recommendation_schema.general')">
                  <div class="grid gap-5 md:grid-cols-2">
                    <UFormField :label="t('transfer_payment.name_en')">
                      <UInput v-model="state.egcs_cn_name_en" class="w-full" />
                    </UFormField>
                    <UFormField :label="t('transfer_payment.name_fr')">
                      <UInput v-model="state.egcs_cn_name_fr" class="w-full" />
                    </UFormField>
                  </div>
                </AssessmentSchemaPageSection>

                <AssessmentSchemaPageSection section-id="recommendation-definition" :title="t('recommendation_schema.form_sections')">
                  <UAlert
                    v-if="definitionErrors.length > 0"
                    icon="i-lucide-circle-alert" color="warning" variant="subtle"
                    :title="t('recommendation_schema.validation_title')"
                    :description="definitionErrors.join(' ')" class="mb-5" />
                  <RecommendationSchemaRecommendationDefinitionEditor v-model="definition" />
                </AssessmentSchemaPageSection>
              </div>
            </fieldset>
          </main>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
