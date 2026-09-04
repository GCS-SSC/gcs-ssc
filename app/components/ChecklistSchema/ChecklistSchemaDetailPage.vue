<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-returns -- local visual-editor mutations are self-descriptive */
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from 'vue'
import type { Ref } from 'vue'
import type { FetchError } from 'ofetch'
import { nanoid } from 'nanoid'
import {
  toEditorResultGroup,
  toPersistedResultGroup
} from '~/types/checklist-result-policy-editor'
import type { EditorResultPolicy } from '~/types/checklist-result-policy-editor'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { appRouteLocations } from '~/utils/route-locations'
import { getAssessmentLocaleLabel } from '~/utils/assessment-schema'
import { ChecklistDefinitionSchema } from '~~/shared/types/schemas/checklist/checklist'
import type { ChecklistDefinition } from '~~/shared/types/schemas/checklist/checklist'
import type { ChecklistEditorQuestion } from '~/types/checklist-schema-editor'
import type { PublicationState } from '~~/shared/constants/system-lifecycle'
import type { Scope } from '~~/shared/utils/scopes'
import type { EditorMutationToken } from '~/composables/useEditorMutationCoordinator'
import { useEditorMutationCoordinator } from '~/composables/useEditorMutationCoordinator'
import { z } from 'zod'

type EditorSubSection = Omit<ChecklistDefinition['sections'][number]['subSections'][number], 'questions'> & {
  _key: string
  questions: ChecklistEditorQuestion[]
}
type EditorSection = Omit<ChecklistDefinition['sections'][number], 'questions' | 'subSections'> & {
  _key: string
  subSections: EditorSubSection[]
}
type EditorDefinition = Omit<ChecklistDefinition, 'sections' | 'resultPolicy'> & {
  sections: EditorSection[]
  resultPolicy: EditorResultPolicy
}
type SchemaPayload = {
  id: string
  publicationId: string
  publicationState: PublicationState
  publicationVersionId: string | null
  publicationVersion: number | null
  hasUnpublishedChanges: boolean
  egcs_cn_entitytype?: string
  egcs_cn_name_en: string
  egcs_cn_name_fr: string
  egcs_cn_outcomename_en: string
  egcs_cn_outcomename_fr: string
  egcs_cn_disablereviewers: boolean
  egcs_cn_checklistschema: ChecklistDefinition
}
type TransferPaymentNameResponse = {
  egcs_tp_name_en: string
  egcs_tp_name_fr: string
  egcs_tp_agency?: string
}

const route = useRoute()
const localePath = useLocalePath()
const { t, locale } = useI18n()
const { getBilingualValue } = useBilingualValue()
const { showError } = useApiErrorToast()
const toast = useToast()
const { can } = useCan()
const transferPaymentId = String(route.params.id)
const streamId = String(route.params.streamId)
const schemaId = String(route.params.schemaId)
const endpoint = `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/checklist-schemas/${schemaId}`
const { data: profile, error: profileError, refresh: refreshProfile } = await useFetch<TransferPaymentNameResponse, FetchError, string>(`/api/transfer-payments/${transferPaymentId}`)
const { data: stream, error: streamError, refresh: refreshStream } = await useFetch<TransferPaymentNameResponse, FetchError, string>(`/api/transfer-payments/${transferPaymentId}/streams/${streamId}`)
const state: Ref<SchemaPayload | null> = ref(null)
const definition: Ref<EditorDefinition | null> = ref(null)
const loadError: Ref<unknown | null> = ref(null)
const contextLoadError = computed(() => profileError.value ?? streamError.value ?? loadError.value)
const detailContent = useTemplateRef<HTMLElement>('detailContent')
const checklistForm = useTemplateRef<{ validate: () => Promise<void> }>('checklistForm')
const isLoadRetrying: Ref<boolean> = ref(false)
const selectedSection: Ref<string> = ref('checklist-general')
const { getHeroCollapsed } = useDashboard()
const isHeroCollapsed = getHeroCollapsed('transfer-payment-checklist-schema-detail')
const profileScope = computed<Scope>(() => ({
  type: 'entity', agencyId: String(profile.value?.egcs_tp_agency ?? ''),
  path: [{ type: 'transfer_payment', id: transferPaymentId }]
}))
const canManagePublication = computed(() => Boolean(profile.value) && can('transfer_payment', 'update', profileScope.value))
const canEdit = computed(() => canManagePublication.value && state.value?.publicationState !== 'retired')
const activeLocale = computed<'en' | 'fr'>(() => locale.value === 'fr' ? 'fr' : 'en')
const getNavigationLabel = (label: { en?: string; fr?: string }, fallback: string) => getAssessmentLocaleLabel(label, activeLocale.value, fallback)
const getQuestionNavigationLabel = (
  section: EditorSection,
  subSection: EditorSubSection,
  question: ChecklistEditorQuestion,
  optionLocale: 'en' | 'fr'
) => [
  getAssessmentLocaleLabel(section.label, optionLocale, section.key),
  getAssessmentLocaleLabel(subSection.label, optionLocale, subSection.key),
  getAssessmentLocaleLabel(question.question, optionLocale, question.key)
].join(' › ')

const questionOptions = computed(() => definition.value?.sections.flatMap(section => (
  section.subSections.flatMap(subSection => subSection.questions.map(question => ({
    value: question.key,
    name_en: getQuestionNavigationLabel(section, subSection, question, 'en'),
    name_fr: getQuestionNavigationLabel(section, subSection, question, 'fr')
  })))
)) ?? [])
const title = computed(() => getBilingualValue(state.value, 'egcs_cn_name', t('checklist_schema.title')))
const breadcrumbItems = computed(() => [
  { label: t('transfer_payment.title'), to: localePath(appRouteLocations.transferPayments()) },
  {
    label: getBilingualValue(profile.value, 'egcs_tp_name'),
    to: localePath(appRouteLocations.transferPaymentDetail(transferPaymentId))
  },
  {
    label: getBilingualValue(stream.value, 'egcs_tp_name'),
    to: localePath(appRouteLocations.transferPaymentStreamDetail(transferPaymentId, streamId, { section: 'review-setups' }))
  },
  { label: title.value }
])
const sectionTabs = computed(() => [
  { key: 'checklist_schema.general', value: 'checklist-general', icon: 'i-lucide-info' },
  { key: 'checklist_schema.sections', value: 'checklist-sections', icon: 'i-lucide-layers' },
  { key: 'checklist_schema.rules', value: 'checklist-rules', icon: 'i-lucide-git-branch' }
])

const toEditorDefinition = (value: ChecklistDefinition): EditorDefinition => ({
  sections: value.sections.map(section => ({
    key: section.key,
    label: section.label,
    _key: nanoid(),
    subSections: [
      ...(section.questions.length > 0
        ? [{ key: `${section.key}-general`, label: { ...section.label }, questions: section.questions }]
        : []),
      ...section.subSections
    ].map(subSection => ({
      ...subSection,
      _key: nanoid(),
      questions: subSection.questions.map(question => ({
        ...question,
        _key: nanoid(),
        help: question.help.map(helpItem => ({ ...helpItem, _key: nanoid() }))
      }))
    }))
  })),
  resultPolicy: {
    anyFailureFails: value.resultPolicy.anyFailureFails,
    groups: value.resultPolicy.groups.map(toEditorResultGroup)
  }
})

const toPersistedDefinition = (value: EditorDefinition): ChecklistDefinition => ({
  sections: value.sections.map(({ _key: _sectionEditorKey, subSections, ...section }) => ({
    ...section,
    questions: [],
    subSections: subSections.map(({ _key: _subSectionEditorKey, questions, ...subSection }) => ({
      ...subSection,
      questions: questions.map(({ _key: _questionEditorKey, help, ...question }) => ({
        ...question,
        help: help.map(({ _key: _helpEditorKey, ...helpItem }) => helpItem)
      }))
    }))
  })),
  resultPolicy: {
    anyFailureFails: value.resultPolicy.anyFailureFails,
    groups: value.resultPolicy.groups.map(toPersistedResultGroup)
  }
})
const ruleHelpDefinition = computed(() => definition.value === null ? null : toPersistedDefinition(definition.value))

const getDraft = () => state.value && definition.value
  ? {
      egcs_cn_name_en: state.value.egcs_cn_name_en,
      egcs_cn_name_fr: state.value.egcs_cn_name_fr,
      egcs_cn_outcomename_en: state.value.egcs_cn_outcomename_en,
      egcs_cn_outcomename_fr: state.value.egcs_cn_outcomename_fr,
      egcs_cn_disablereviewers: state.value.egcs_cn_disablereviewers,
      egcs_cn_checklistschema: toPersistedDefinition(definition.value)
    }
  : null
const mutation = useEditorMutationCoordinator({ getDraft })
const isSaving = computed(() => mutation.isActionPending('save'))
const isPublishing = computed(() => mutation.isActionPending('publish'))
const isRetiring = computed(() => mutation.isActionPending('retire'))
const canEditFields = computed(() => canEdit.value && !mutation.isPending.value)
const ChecklistMetadataSchema = z.object({
  egcs_cn_name_en: z.string().trim().min(1, 'validation.name_en_required'),
  egcs_cn_name_fr: z.string().trim().min(1, 'validation.name_fr_required'),
  egcs_cn_outcomename_en: z.string().trim().min(1, 'validation.required'),
  egcs_cn_outcomename_fr: z.string().trim().min(1, 'validation.required')
})
const applyPayload = (payload: SchemaPayload) => {
  state.value = structuredClone(payload)
  definition.value = toEditorDefinition(payload.egcs_cn_checklistschema ?? {
    sections: [],
    resultPolicy: { anyFailureFails: true, groups: [] }
  })
}
const mergePublicationMetadata = (payload: SchemaPayload) => {
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
  return await response.json() as SchemaPayload
}

/** Reloads the editor as a new session and creates stable editor-only row keys. */
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
    await Promise.all([refreshProfile(), refreshStream()])
    if (profileError.value) throw profileError.value
    if (streamError.value) throw streamError.value
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

const addSection = () => {
  if (!definition.value) return
  const number = definition.value.sections.length + 1
  definition.value.sections.push({
    _key: nanoid(),
    key: `section-${number}-${nanoid(6)}`,
    label: { en: `Section ${number}`, fr: `Section ${number}` },
    subSections: []
  })
}
const removeSection = (sectionIndex: number) => definition.value?.sections.splice(sectionIndex, 1)
const addSubSection = (section: EditorSection) => {
  const number = section.subSections.length + 1
  section.subSections.push({
    _key: nanoid(),
    key: `${section.key}-subsection-${number}-${nanoid(6)}`,
    label: { en: `Subsection ${number}`, fr: `Sous-section ${number}` },
    questions: []
  })
}
const removeSubSection = (section: EditorSection, subSectionIndex: number) => section.subSections.splice(subSectionIndex, 1)
const moveItem = (items: unknown[], index: number, direction: -1 | 1) => {
  const destination = index + direction
  if (destination < 0 || destination >= items.length) return
  const [item] = items.splice(index, 1)
  if (item !== undefined) items.splice(destination, 0, item)
}
watch(selectedSection, sectionId => {
  if (import.meta.client) document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
})

const persist = async (token: EditorMutationToken, showSuccess: boolean) => {
  if (!state.value || !definition.value) return false
  const persistedDefinition = ChecklistDefinitionSchema.parse(toPersistedDefinition(definition.value))
  const response = await fetch(getClientRequestUrl(endpoint), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      egcs_cn_name_en: state.value.egcs_cn_name_en,
      egcs_cn_name_fr: state.value.egcs_cn_name_fr,
      egcs_cn_outcomename_en: state.value.egcs_cn_outcomename_en,
      egcs_cn_outcomename_fr: state.value.egcs_cn_outcomename_fr,
      egcs_cn_disablereviewers: state.value.egcs_cn_disablereviewers,
      egcs_cn_checklistschema: persistedDefinition
    })
  })
  if (!response.ok) await throwFetchResponseError(response)
  if (!await refreshForMutation(token)) {
    if (mutation.isTokenCurrent(token)) showPreservedDraft()
    return false
  }
  if (showSuccess) {
    toast.add({ title: t('common.success'), description: t('checklist_schema.saved'), color: 'success' })
  }
  return true
}

/** Validates and saves the visual editor state. */
const save = async () => {
  if (!state.value || !definition.value || !canEdit.value || mutation.isPending.value) return false
  try {
    await checklistForm.value?.validate()
  } catch {
    return false
  }
  return await mutation.run('save', async token => {
    try {
      return await persist(token, true)
    } catch (error) {
      showError(error)
      return false
    }
  }) === true
}

/** Saves and publishes the current checklist schema. */
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
      toast.add({ title: t('common.success'), description: t('checklist_schema.published'), color: 'success' })
    } catch (error) {
      showError(error)
    }
  })
}

/** Permanently retires the current published checklist schema. */
const retire = async () => {
  if (!state.value || !canManagePublication.value || state.value.publicationState !== 'published' || mutation.isPending.value) return
  if (blockDirtyAction()) return
  await mutation.run('retire', async token => {
    try {
      const response = await fetch(getClientRequestUrl(`${endpoint}/retire`), { method: 'POST' })
      if (!response.ok) await throwFetchResponseError(response)
      if (!await refreshForMutation(token)) return
      toast.add({ title: t('common.success'), description: t('checklist_schema.retired'), color: 'success' })
    } catch (error) {
      showError(error)
    }
  })
}
</script>

<template>
  <UDashboardPanel id="checklist-schema-detail">
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
      <div
        v-if="contextLoadError"
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
          :entity-type="state.egcs_cn_entitytype"
          :publication-version="state.publicationVersion"
          :publication-state="state.publicationState"
          :has-unpublished-changes="state.hasUnpublishedChanges"
          :is-collapsed="isHeroCollapsed"
          :is-publishing="isPublishing"
          :is-retiring="isRetiring"
          :is-mutation-pending="mutation.isPending.value"
          :can-manage="canManagePublication"
          review-type="checklist"
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
            <UForm ref="checklistForm" :state="state" :schema="ChecklistMetadataSchema">
              <fieldset :disabled="!canEditFields">
                <div class="w-full space-y-10 pb-12">
                  <AssessmentSchemaPageSection section-id="checklist-general" :title="t('checklist_schema.general')">
                    <div class="grid gap-5 md:grid-cols-2">
                      <UFormField :label="t('transfer_payment.name_en')" name="egcs_cn_name_en">
                        <UInput v-model="state.egcs_cn_name_en" class="w-full" />
                      </UFormField>
                      <UFormField :label="t('transfer_payment.name_fr')" name="egcs_cn_name_fr">
                        <UInput v-model="state.egcs_cn_name_fr" class="w-full" />
                      </UFormField>
                      <UFormField :label="t('checklist_schema.result_name_en')" name="egcs_cn_outcomename_en">
                        <UInput v-model="state.egcs_cn_outcomename_en" class="w-full" />
                      </UFormField>
                      <UFormField :label="t('checklist_schema.result_name_fr')" name="egcs_cn_outcomename_fr">
                        <UInput v-model="state.egcs_cn_outcomename_fr" class="w-full" />
                      </UFormField>
                    </div>
                    <UCheckbox v-model="state.egcs_cn_disablereviewers" :label="t('checklist_schema.disable_reviewers')" />
                  </AssessmentSchemaPageSection>

                  <AssessmentSchemaPageSection section-id="checklist-sections" :title="t('checklist_schema.sections')">
                    <template #actions>
                      <UButton icon="i-lucide-plus" :label="t('checklist_schema.add_section')" variant="outline" class="cursor-default" @click="addSection" />
                    </template>
                    <div v-if="definition.sections.length === 0" class="border-default border-t pt-4 text-sm text-zinc-500 dark:text-zinc-400">
                      {{ t('checklist_schema.no_sections') }}
                    </div>
                    <div v-for="(section, sectionIndex) in definition.sections" :key="section._key" class="space-y-0">
                      <AssessmentSchemaAccordionSection
                        :title="getNavigationLabel(section.label, t('checklist_schema.section'))"
                        :persistence-key="`checklist:${section.key}`">
                        <div class="space-y-6">
                          <div class="flex justify-end gap-1">
                            <UButton icon="i-lucide-arrow-up" color="neutral" variant="ghost" class="cursor-default" :disabled="sectionIndex === 0" @click="moveItem(definition.sections, sectionIndex, -1)" />
                            <UButton icon="i-lucide-arrow-down" color="neutral" variant="ghost" class="cursor-default" :disabled="sectionIndex === definition.sections.length - 1" @click="moveItem(definition.sections, sectionIndex, 1)" />
                            <UButton icon="i-lucide-trash" color="error" variant="ghost" class="cursor-default" @click="removeSection(sectionIndex)" />
                          </div>
                          <div class="grid gap-4 md:grid-cols-2">
                            <UFormField :label="t('checklist_schema.section_name_en')">
                              <UInput v-model="section.label.en" />
                            </UFormField>
                            <UFormField :label="t('checklist_schema.section_name_fr')">
                              <UInput v-model="section.label.fr" />
                            </UFormField>
                            <UFormField :label="t('checklist_schema.language_independent_code')">
                              <UInput v-model="section.key" class="font-mono" />
                            </UFormField>
                          </div>

                          <AssessmentSchemaAccordionSection
                            :title="t('checklist_schema.subsections')"
                            :persistence-key="`checklist:${section.key}:subsections`"
                            default-open
                            level="sub">
                            <div class="space-y-4">
                              <div class="flex justify-end">
                                <UButton icon="i-lucide-plus" :label="t('checklist_schema.add_subsection')" variant="outline" class="cursor-default" @click="addSubSection(section)" />
                              </div>
                              <AssessmentSchemaAccordionSection
                                v-for="(subSection, subSectionIndex) in section.subSections"
                                :key="subSection._key"
                                :title="getNavigationLabel(subSection.label, t('checklist_schema.subsection'))"
                                :persistence-key="`checklist:${section.key}:${subSection.key}`"
                                level="sub">
                                <div class="space-y-6">
                                  <div class="flex justify-end gap-1">
                                    <UButton icon="i-lucide-arrow-up" color="neutral" variant="ghost" class="cursor-default" :disabled="subSectionIndex === 0" @click="moveItem(section.subSections, subSectionIndex, -1)" />
                                    <UButton icon="i-lucide-arrow-down" color="neutral" variant="ghost" class="cursor-default" :disabled="subSectionIndex === section.subSections.length - 1" @click="moveItem(section.subSections, subSectionIndex, 1)" />
                                    <UButton icon="i-lucide-trash" color="error" variant="ghost" class="cursor-default" @click="removeSubSection(section, subSectionIndex)" />
                                  </div>
                                  <div class="grid gap-4 md:grid-cols-2">
                                    <UFormField :label="t('checklist_schema.subsection_name_en')">
                                      <UInput v-model="subSection.label.en" />
                                    </UFormField>
                                    <UFormField :label="t('checklist_schema.subsection_name_fr')">
                                      <UInput v-model="subSection.label.fr" />
                                    </UFormField>
                                    <UFormField :label="t('checklist_schema.language_independent_code')">
                                      <UInput v-model="subSection.key" class="font-mono" />
                                    </UFormField>
                                  </div>

                                  <AssessmentSchemaAccordionSection
                                    :title="t('checklist_schema.checklist_questions')"
                                    :persistence-key="`checklist:${section.key}:${subSection.key}:questions`"
                                    default-open
                                    level="sub">
                                    <ChecklistSchemaQuestionsTable v-model:questions="subSection.questions" />
                                  </AssessmentSchemaAccordionSection>
                                </div>
                              </AssessmentSchemaAccordionSection>
                            </div>
                          </AssessmentSchemaAccordionSection>
                        </div>
                      </AssessmentSchemaAccordionSection>
                    </div>
                  </AssessmentSchemaPageSection>

                  <AssessmentSchemaPageSection section-id="checklist-rules" :title="t('checklist_schema.rules')">
                    <template #actions>
                      <ChecklistResultRulesHelp
                        v-if="ruleHelpDefinition"
                        :definition="ruleHelpDefinition"
                        context="setup" />
                    </template>
                    <p class="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                      {{ t('checklist_schema.policy.help') }}
                    </p>
                    <ChecklistSchemaResultPolicyEditor
                      v-model="definition.resultPolicy"
                      :question-options="questionOptions" />
                  </AssessmentSchemaPageSection>
                </div>
              </fieldset>
            </UForm>
          </main>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
