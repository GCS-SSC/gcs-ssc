<script setup lang="ts">
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
/* eslint-disable jsdoc/require-jsdoc */
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { ApprovalTemplateItem } from '~~/shared/types/schemas'
import { ApprovalTemplateSchema } from '~~/shared/types/schemas'
import type { ApprovalTemplateEditorTemplate } from '~/types/approval-template-editor'
import { createApprovalTemplateEditorTemplate } from '~/utils/approval-template-editor-templates'
import { buildApprovalTemplateDetailPayload, saveApprovalTemplateDetail } from '~/utils/approval-template-detail-save'
import type { EditorMutationToken } from '~/composables/useEditorMutationCoordinator'
import { useEditorMutationCoordinator } from '~/composables/useEditorMutationCoordinator'

const props = withDefaults(defineProps<{
  templateId: string
  breadcrumbItems: Array<Record<string, unknown>>
  heroCollapsedKey: string
  canManagePublication?: boolean
}>(), { canManagePublication: false })

const toast = useToast()
const { t } = useI18n()
const { getBilingualValue } = useBilingualValue()
const { showError } = useApiErrorToast()
const { createValidator } = useZodI18n()
const { getHeroCollapsed } = useDashboard()

const validate = createValidator(ApprovalTemplateSchema)

const selectedSection: Ref<string> = ref('approval-template-general')
const isHeroCollapsed = computed({
  get: () => getHeroCollapsed(props.heroCollapsedKey).value,
  set: value => { getHeroCollapsed(props.heroCollapsedKey).value = value }
})
const state: Ref<ApprovalTemplateEditorTemplate | null> = ref(null)
const stepsTableRef: Ref<{ openCreateEditor: () => void } | null> = ref(null)
const template: Ref<ApprovalTemplateItem | null> = ref(null)
const templateEndpoint = computed(() => `/api/approval-templates/${props.templateId}`)
const canEdit = computed(() => props.canManagePublication && template.value?.publicationState !== 'retired')
const mutation = useEditorMutationCoordinator({
  getDraft: () => state.value ? buildApprovalTemplateDetailPayload(state.value) : null
})
const isSaving = computed(() => mutation.isActionPending('save'))
const isPublishing = computed(() => mutation.isActionPending('publish'))
const isRetiring = computed(() => mutation.isActionPending('retire'))
const canEditFields = computed(() => canEdit.value && !mutation.isPending.value)

const fetchTemplate = async (endpoint = templateEndpoint.value) => {
  const response = await fetch(getClientRequestUrl(endpoint))
  if (!response.ok) {
    await throwFetchResponseError(response)
  }
  return await response.json() as ApprovalTemplateItem
}
const applyTemplate = (value: ApprovalTemplateItem) => {
  template.value = value
  state.value = createApprovalTemplateEditorTemplate(value)
}
const refreshForMutation = async (token: EditorMutationToken) => {
  const value = await fetchTemplate()
  return mutation.applyMutationRefresh(token, {
    apply: () => applyTemplate(value),
    mergeMetadata: () => {
      if (!template.value) return
      template.value = {
        ...template.value,
        publicationId: value.publicationId,
        publicationState: value.publicationState,
        publicationVersionId: value.publicationVersionId,
        publicationVersion: value.publicationVersion,
        hasUnpublishedChanges: value.hasUnpublishedChanges
      }
    }
  })
}
let loadGeneration = 0
watch(() => props.templateId, async () => {
  const generation = ++loadGeneration
  const endpoint = templateEndpoint.value
  template.value = null
  state.value = null
  selectedSection.value = 'approval-template-general'
  mutation.replaceSessionDraft(() => {})
  try {
    const value = await fetchTemplate(endpoint)
    if (generation !== loadGeneration || endpoint !== templateEndpoint.value) return
    mutation.replaceSessionDraft(() => applyTemplate(value))
  } catch (error) {
    if (generation === loadGeneration) showError(error)
  }
}, { immediate: true })

const sectionTabs = computed(() => [
  { key: 'agency.tabs.general', icon: 'i-lucide-info', value: 'approval-template-general' },
  { key: 'approval_templates.additional_approvals.title', icon: 'i-lucide-list-plus', value: 'approval-template-additional-approvals' },
  { key: 'admin_common.resources.approval_steps', icon: 'i-lucide-list-ordered', value: 'approval-template-steps' }
])

const showPreservedDraft = () => toast.add({
  title: t('common.warning'),
  description: t('common.newer_changes_preserved'),
  color: 'warning'
})
const showSynchronizationWarning = () => toast.add({
  title: t('common.warning'),
  description: t('common.saved_refresh_failed'),
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
const persistTemplate = async (token: EditorMutationToken, showSuccess: boolean) => {
  const saved = await saveApprovalTemplateDetail({
    state: state.value,
    requestUrl: getClientRequestUrl(templateEndpoint.value),
    validate,
    toast,
    t,
    showError,
    showSuccess: false
  })
  if (!saved) return false
  try {
    if (!await refreshForMutation(token)) {
      if (mutation.isTokenCurrent(token)) showPreservedDraft()
      return true
    }
  } catch {
    if (mutation.isTokenCurrent(token)) showSynchronizationWarning()
    if (showSuccess) {
      toast.add({ title: t('common.success'), description: t('common.updated_success'), color: 'success' })
    }
    return true
  }
  if (showSuccess) {
    toast.add({ title: t('common.success'), description: t('common.updated_success'), color: 'success' })
  }
  return true
}
const saveTemplate = async () => {
  if (!canEdit.value || mutation.isPending.value) return false
  return await mutation.run('save', async token => {
    try {
      return await persistTemplate(token, true)
    } catch (error) {
      showError(error)
      return false
    }
  }) === true
}

const hasUnsavedChanges = () => {
  return mutation.isDirty.value
}

const performPublicationAction = async (action: 'publish' | 'retire') => {
  if (mutation.isPending.value || !props.canManagePublication || template.value?.publicationState === 'retired') return
  if (action === 'retire' && blockDirtyAction()) return
  await mutation.run(action, async token => {
    try {
      if (action === 'publish' && hasUnsavedChanges() && !await persistTemplate(token, false)) return
      const response = await fetch(getClientRequestUrl(`${templateEndpoint.value}/${action}`), { method: 'POST' })
      if (!response.ok) await throwFetchResponseError(response)
      try {
        if (!await refreshForMutation(token)) {
          if (mutation.isTokenCurrent(token)) showPreservedDraft()
          return
        }
      } catch {
        if (mutation.isTokenCurrent(token)) showSynchronizationWarning()
      }
      toast.add({ title: t('common.success'), description: t(`approval_templates.${action === 'publish' ? 'published' : 'retired'}`), color: 'success' })
    } catch (error) {
      showError(error)
    }
  })
}
const publish = () => performPublicationAction('publish')
const retire = () => performPublicationAction('retire')

watch(selectedSection, value => {
  if (!import.meta.client) {
    return
  }

  document.getElementById(value)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
})
</script>

<template>
  <UDashboardPanel id="approval-template-detail">
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
      <div class="flex flex-1 flex-col">
        <CommonApprovalTemplatesDetailHero
          v-if="template"
          :name="getBilingualValue(state, 'egcs_cn_name')"
          :description="getBilingualValue(state, 'egcs_cn_description')"
          :step-count="state?.steps.length ?? 0"
          :certification-count="state?.steps.reduce((total, step) => total + step.certifications.length, 0) ?? 0"
          :is-collapsed="isHeroCollapsed"
          :publication-state="template.publicationState"
          :publication-version="template.publicationVersion"
          :has-unpublished-changes="template.hasUnpublishedChanges"
          :can-manage="props.canManagePublication"
          :is-publishing="isPublishing"
          :is-retiring="isRetiring"
          :is-mutation-pending="mutation.isPending.value"
          @publish="publish"
          @retire="retire" />

        <CommonEntityEditorWorkspace content-test-id="approval-template-detail-content">
          <template #sidebar>
            <AssessmentSchemaDetailSidebar
              v-if="canEdit"
              v-model="selectedSection"
              :section-tabs="sectionTabs"
              :is-saving="isSaving"
              :disabled="mutation.isPending.value"
              :ui="{
                trigger: 'w-full justify-start whitespace-normal break-words text-left'
              }"
              @save="saveTemplate" />
            <aside v-else class="w-full shrink-0 lg:sticky lg:top-6 lg:self-start lg:w-72 lg:border-r lg:border-zinc-200 lg:pr-4 dark:lg:border-zinc-800">
              <div class="pt-6">
                <CommonRouteTabs v-model="selectedSection" :items="sectionTabs" orientation="vertical" />
              </div>
            </aside>
          </template>

          <UForm
            v-if="state"
            :state="state"
            :validate="validate"
            class="space-y-10"
            @submit.prevent="() => { void saveTemplate() }">
            <fieldset :disabled="!canEditFields">
              <AssessmentSchemaPageSection section-id="approval-template-general" :title="t('agency.tabs.general')">
                <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <UFormField :label="t('admin_common.fields.egcs_cn_name_en')" name="egcs_cn_name_en">
                    <UInput v-model="state.egcs_cn_name_en" />
                  </UFormField>
                  <UFormField :label="t('admin_common.fields.egcs_cn_name_fr')" name="egcs_cn_name_fr">
                    <UInput v-model="state.egcs_cn_name_fr" />
                  </UFormField>
                  <UFormField :label="t('admin_common.fields.egcs_cn_description_en')" name="egcs_cn_description_en">
                    <CommonTextarea v-model="state.egcs_cn_description_en" :rows="4" />
                  </UFormField>
                  <UFormField :label="t('admin_common.fields.egcs_cn_description_fr')" name="egcs_cn_description_fr">
                    <CommonTextarea v-model="state.egcs_cn_description_fr" :rows="4" />
                  </UFormField>
                </div>
              </AssessmentSchemaPageSection>

              <AssessmentSchemaPageSection
                section-id="approval-template-additional-approvals"
                :title="t('approval_templates.additional_approvals.title')">
                <CommonApprovalTemplatesAdditionalApprovalsFields v-model:state="state" />
              </AssessmentSchemaPageSection>

              <AssessmentSchemaPageSection
                section-id="approval-template-steps"
                :title="t('admin_common.resources.approval_steps')">
                <template #actions>
                  <UButton
                    icon="i-lucide-plus"
                    :label="t('common.add')"
                    variant="outline"
                    class="cursor-default"
                    @click="stepsTableRef?.openCreateEditor()" />
                </template>

                <CommonApprovalTemplatesStepsTable
                  ref="stepsTableRef"
                  v-model:steps="state.steps"
                  :approval-template-id="props.templateId"
                  @save="saveTemplate" />
              </AssessmentSchemaPageSection>
            </fieldset>
          </UForm>
        </CommonEntityEditorWorkspace>
      </div>
    </template>
  </UDashboardPanel>
</template>
