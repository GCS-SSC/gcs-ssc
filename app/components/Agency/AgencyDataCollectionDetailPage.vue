<script setup lang="ts">
import { provideBilingualFieldScope } from '~/utils/bilingual-field-context'
/* eslint-disable jsdoc/require-jsdoc */
import { computed, nextTick, onMounted, ref, useTemplateRef } from 'vue'
import type { Ref } from 'vue'
import { DataCollectionSetupCreateSchema, DataCollectionDefinitionSchema } from '~~/shared/types/schemas/data-collection'
import type { DataCollectionDefinition } from '~~/shared/types/schemas/data-collection'
import { appRouteLocations } from '~/utils/route-locations'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import type { PublicationState } from '~~/shared/constants/system-lifecycle'
import type { AgencyProfileItem } from '~~/shared/types/schemas'
import type { EditorMutationToken } from '~/composables/useEditorMutationCoordinator'
import { useEditorMutationCoordinator } from '~/composables/useEditorMutationCoordinator'

type DataCollectionPayload = {
  id: string
  publicationId: string
  publicationState: PublicationState
  publicationVersionId: string | null
  publicationVersion: number | null
  hasUnpublishedChanges: boolean
  egcs_cn_name_en: string
  egcs_cn_name_fr: string
  egcs_cn_description_en: string
  egcs_cn_description_fr: string
  egcs_cn_approvaltemplate: string | null
  egcs_cn_schema: DataCollectionDefinition
}
const route = useRoute()
const localePath = useLocalePath()
const { t } = useI18n()
const { getBilingualValue } = useBilingualValue()
const { showError } = useApiErrorToast()
const toast = useToast()
const { can } = useCan()
const router = useRouter()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const { createValidator } = useZodI18n()
const validate = createValidator(DataCollectionSetupCreateSchema)
const formRef = useTemplateRef<{ validate: () => Promise<unknown> }>('dataCollectionForm')
const agencyId = String(route.params.id)
provideBilingualFieldScope(() => ({ subject: 'agency', agencyId, permissionAction: 'update' }))
const schemaId = String(route.params.dataCollectionSetupId)
const endpoint = `/api/agency/${agencyId}/data-collections/${schemaId}`
const { data: agency } = await useFetch<AgencyProfileItem, Error, string>(`/api/agency/${agencyId}`)
const state: Ref<DataCollectionPayload | null> = ref(null)
const definition: Ref<DataCollectionDefinition | null> = ref(null)
const loadError: Ref<unknown | null> = ref(null)
const detailContent = useTemplateRef<HTMLElement>('detailContent')
const isLoadRetrying: Ref<boolean> = ref(false)
const selectedSection: Ref<string> = ref('data-collection-general')
const { getHeroCollapsed } = useDashboard()
const isHeroCollapsed = getHeroCollapsed('transfer-payment-data-collection-setup-detail')
const canManagePublication = computed(() => Boolean(agency.value) && can('agency', 'update', { type: 'agency', agencyId }))
const canEdit = computed(() => canManagePublication.value && state.value?.publicationState !== 'retired')

const title = computed(() => getBilingualValue(state.value, 'egcs_cn_name', t('data_collection.title')))
const breadcrumbItems = computed(() => [
  { label: t('agency.title'), to: localePath(appRouteLocations.agencies()) },
  {
    label: getBilingualValue(agency.value, 'egcs_ay_name'),
    to: localePath({ ...appRouteLocations.agencyDetail(agencyId), query: { section: 'dataCollections' } })
  },
  { label: title.value }
])
const sectionTabs = computed(() => [
  { key: 'data_collection.general', value: 'data-collection-general', icon: 'i-lucide-info' },
  { key: 'data_collection.form_sections', value: 'data-collection-definition', icon: 'i-lucide-layers' }
].map(item => ({ ...item, panelId: item.value })))
const definitionValidation = computed(() => definition.value ? DataCollectionDefinitionSchema.safeParse(definition.value) : null)
const definitionErrors = computed(() => definitionValidation.value && !definitionValidation.value.success
  ? [...new Set(definitionValidation.value.error.issues.map(issue => t(issue.message)))]
  : [])

const getDraft = () => state.value && definition.value
  ? {
      egcs_cn_name_en: state.value.egcs_cn_name_en,
      egcs_cn_name_fr: state.value.egcs_cn_name_fr,
      egcs_cn_description_en: state.value.egcs_cn_description_en,
      egcs_cn_description_fr: state.value.egcs_cn_description_fr,
      egcs_cn_approvaltemplate: state.value.egcs_cn_approvaltemplate,
      egcs_cn_schema: definition.value
    }
  : null
const mutation = useEditorMutationCoordinator({ getDraft })
const isSaving = computed(() => mutation.isActionPending('save'))
const isPublishing = computed(() => mutation.isActionPending('publish'))
const isRetiring = computed(() => mutation.isActionPending('retire'))
const canEditFields = computed(() => canEdit.value && !mutation.isPending.value)
const applyPayload = (payload: DataCollectionPayload) => {
  state.value = structuredClone(payload)
  definition.value = structuredClone(payload.egcs_cn_schema)
}
const mergePublicationMetadata = (payload: DataCollectionPayload) => {
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
  return await response.json() as DataCollectionPayload
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
  await formRef.value?.validate()
  const persistedDefinition = DataCollectionDefinitionSchema.parse(definition.value)
  const response = await fetch(getClientRequestUrl(endpoint), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      egcs_cn_name_en: state.value.egcs_cn_name_en,
      egcs_cn_name_fr: state.value.egcs_cn_name_fr,
      egcs_cn_description_en: state.value.egcs_cn_description_en,
      egcs_cn_description_fr: state.value.egcs_cn_description_fr,
      egcs_cn_approvaltemplate: state.value.egcs_cn_approvaltemplate,
      egcs_cn_schema: persistedDefinition
    })
  })
  if (!response.ok) await throwFetchResponseError(response)
  if (!await refreshForMutation(token)) {
    if (mutation.isTokenCurrent(token)) showPreservedDraft()
    return false
  }
  if (showSuccess) {
    toast.add({ title: t('common.success'), description: t('data_collection.saved'), color: 'success' })
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
      toast.add({ title: t('common.success'), description: t('data_collection.published'), color: 'success' })
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
      toast.add({ title: t('common.success'), description: t('data_collection.retired'), color: 'success' })
    } catch (error) {
      showError(error)
    }
  })
}
const deleteDraft = async () => {
  if (!state.value || state.value.publicationState !== 'draft' || !canManagePublication.value || mutation.isPending.value) return
  await mutation.run('delete', async () => {
    try {
      if (await confirmDeleteRequest(endpoint)) await router.push(localePath({ ...appRouteLocations.agencyDetail(agencyId), query: { section: 'dataCollections' } }))
    } catch (error) { showError(error) }
  })
}
</script>

<template>
  <CommonDetailPage id="data-collection-setup-detail" v-model:collapsed="isHeroCollapsed" :breadcrumb-items="breadcrumbItems">
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
        <CommonPublicationDetailHero
          :name="title"
          :description="getBilingualValue(state, 'egcs_cn_description')"
          icon="i-lucide-clipboard-list"
          type-label-key="data_collection.title"
          publish-label-key="data_collection.publish"
          retire-label-key="data_collection.retire"
          :publication-version="state.publicationVersion"
          :publication-state="state.publicationState"
          :has-unpublished-changes="state.hasUnpublishedChanges"
          :is-collapsed="isHeroCollapsed"
          :is-publishing="isPublishing"
          :is-retiring="isRetiring"
          :is-mutation-pending="mutation.isPending.value"
          :can-manage="canManagePublication"
          @publish="publish"
          @retire="retire" />

        <CommonDesignTimeEditorShell>
          <template #sidebar>
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
          </template>

          <UForm ref="dataCollectionForm" :state="{ egcs_cn_name_en: state.egcs_cn_name_en, egcs_cn_name_fr: state.egcs_cn_name_fr, egcs_cn_description_en: state.egcs_cn_description_en, egcs_cn_description_fr: state.egcs_cn_description_fr, egcs_cn_approvaltemplate: state.egcs_cn_approvaltemplate, egcs_cn_schema: definition }" :validate="validate" @submit="async () => { await save() }">
            <fieldset :disabled="!canEditFields">
              <CommonDesignTimeEditorSections>
                <AssessmentSchemaPageSection section-id="data-collection-general" :title="t('data_collection.general')" role="tabpanel" :aria-label="t('data_collection.general')">
                  <div class="grid gap-5 md:grid-cols-2">
                    <UFormField :label="t('transfer_payment.name_en')" name="egcs_cn_name_en">
                      <UInput v-model="state.egcs_cn_name_en" class="w-full" />
                    </UFormField>
                    <UFormField :label="t('transfer_payment.name_fr')" name="egcs_cn_name_fr">
                      <UInput v-model="state.egcs_cn_name_fr" class="w-full" />
                    </UFormField>
                    <UFormField :label="t('transfer_payment.description_en')" name="egcs_cn_description_en">
                      <CommonTextarea v-model="state.egcs_cn_description_en" />
                    </UFormField>
                    <UFormField :label="t('transfer_payment.description_fr')" name="egcs_cn_description_fr">
                      <CommonTextarea v-model="state.egcs_cn_description_fr" />
                    </UFormField>
                  </div>
                  <AdminCommonLookupField
                    :model-value="state.egcs_cn_approvaltemplate ?? undefined" :label="t('workflow.approval_template')" name="egcs_cn_approvaltemplate" :fetch-url="`/api/agency/${agencyId}/approval-templates`"
                    :include-deleted-query="false" :query="{ state: 'published' }" value-key="id"
                    label-en-key="egcs_cn_name_en" label-fr-key="egcs_cn_name_fr" class="mt-5" @update:model-value="value => { state!.egcs_cn_approvaltemplate = value ?? null }" />
                </AssessmentSchemaPageSection>

                <AssessmentSchemaPageSection section-id="data-collection-definition" :title="t('data_collection.form_sections')" role="tabpanel" :aria-label="t('data_collection.form_sections')">
                  <UAlert
                    v-if="definitionErrors.length > 0"
                    icon="i-lucide-circle-alert" color="warning" variant="subtle"
                    :title="t('data_collection.validation_title')"
                    :description="definitionErrors.join(' ')" class="mb-5" />
                  <CommonQuestionnaireDefinitionEditor v-model="definition" :persistence-key="`data-collection:${schemaId}`" />
                </AssessmentSchemaPageSection>
              </CommonDesignTimeEditorSections>
            </fieldset>
          </UForm>
        </CommonDesignTimeEditorShell>
        <div v-if="canManagePublication && state.publicationState === 'draft'" class="flex justify-end px-6 py-4">
          <UButton color="error" variant="outline" icon="i-lucide-trash" :label="t('common.delete')" :disabled="mutation.isPending.value" @click="deleteDraft" />
        </div>
      </div>
    </template>
  </CommonDetailPage>
</template>
