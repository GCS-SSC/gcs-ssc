<script setup lang="ts">
import { computed } from 'vue'
import { DataCollectionSetupCreateSchema } from '~~/shared/types/schemas/data-collection'
import { createDefaultQuestionnaireDefinition } from '~~/shared/types/schemas/questionnaire'
import type { QuestionnaireDefinition } from '~~/shared/types/schemas/questionnaire'
import type { PublicationState } from '~~/shared/constants/system-lifecycle'
import type { BilingualColumnConfig, TableColumnInput } from '~/composables/useTableColumns'
import { appRouteLocations } from '~/utils/route-locations'

const { agencyId, canUpdateChild } = defineProps<{ agencyId: string, canUpdateChild: boolean }>()
type CollectionRow = {
  id: string
  egcs_cn_name_en: string
  egcs_cn_name_fr: string
  egcs_cn_description_en: string
  egcs_cn_description_fr: string
  egcs_cn_schema: QuestionnaireDefinition
  egcs_cn_approvaltemplate: string | null
  publicationState: PublicationState
}
const { t } = useI18n()
const localePath = useLocalePath()
const endpoint = computed(() => `/api/agency/${agencyId}/data-collections`)
const initialDefinition = createDefaultQuestionnaireDefinition()
const section = initialDefinition.sections[0]!
section.label = { en: t('recommendation_schema.new_section_en'), fr: t('recommendation_schema.new_section_fr') }
const subSection = section.subSections[0]!
subSection.label = { en: t('recommendation_schema.new_subsection_en'), fr: t('recommendation_schema.new_subsection_fr') }
subSection.questions[0]!.question = { en: t('recommendation_schema.new_question_en'), fr: t('recommendation_schema.new_question_fr') }
const initialNewItem = { egcs_cn_schema: initialDefinition, egcs_cn_approvaltemplate: null }
const columns: TableColumnInput<CollectionRow>[] = [
  { id: 'name', headerKey: 'common.name' },
  { id: 'description', headerKey: 'common.description' },
  { id: 'publicationState', accessorKey: 'publicationState', headerKey: 'common.status' },
  { id: 'actions', headerKey: 'common.actions' }
]
const bilingualColumns: BilingualColumnConfig<CollectionRow>[] = [
  { id: 'name', accessorKey: { en: 'egcs_cn_name_en', fr: 'egcs_cn_name_fr' }, headerKey: 'common.name' },
  { id: 'description', accessorKey: { en: 'egcs_cn_description_en', fr: 'egcs_cn_description_fr' }, headerKey: 'common.description' }
]
</script>

<template>
  <CommonResourceCrud
    :title="t('data_collection.catalog_title')" icon="i-lucide-clipboard-list" :fetch-url="endpoint" :post-url="endpoint"
    :schema="DataCollectionSetupCreateSchema" :initial-new-item="initialNewItem" :columns="columns" :bilingual-columns="bilingualColumns"
    :can-create="canUpdateChild" :can-update="false" :can-delete="false" :show-button="canUpdateChild" :modal-title="t('data_collection.create')" :modal-ui="{ content: 'sm:max-w-2xl' }">
    <template #publicationState-cell="{ row }">
      <CommonLifecycleBadge engine="publication" :state="row.original.publicationState" />
    </template>
    <template #actions-cell="{ row }">
      <div class="flex justify-end gap-2">
        <UButton :to="localePath(appRouteLocations.agencyDataCollectionDetail(agencyId, row.original.id))" icon="i-lucide-arrow-right" color="neutral" variant="ghost" :aria-label="t('common.view_details')" />
      </div>
    </template>
    <template #form="{ state }">
      <div class="grid gap-4 md:grid-cols-2">
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
        label-en-key="egcs_cn_name_en" label-fr-key="egcs_cn_name_fr" @update:model-value="value => { state.egcs_cn_approvaltemplate = value ?? null }" />
    </template>
  </CommonResourceCrud>
</template>
