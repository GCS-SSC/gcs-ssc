<script setup lang="ts">
import { AgencyAttachmentTypeSchema, type AgencyAttachmentTypeItem } from '~~/shared/types/schemas'
import type { TableColumnInput } from '~/composables/useTableColumns'

const { agencyId, canCreate, canUpdate, canDelete } = defineProps<{ agencyId: string, canCreate: boolean, canUpdate: boolean, canDelete: boolean }>()
const { t } = useI18n()

const columns: TableColumnInput<AgencyAttachmentTypeItem>[] = [
  { id: 'name', headerKey: 'common.name' },
  { id: 'description', headerKey: 'common.description' },
  { id: 'actions', headerKey: 'common.actions' }
]
</script>

<template>
  <CommonResourceCrud
    :title="t('agency.tabs.attachment_types')"
    icon="i-lucide-paperclip"
    :fetch-url="`/api/agency/${agencyId}/attachment-types`"
    :post-url="canCreate ? `/api/agency/${agencyId}/attachment-types` : undefined"
    :update-url-base="canUpdate ? '/api/agency/attachment-types' : undefined"
    :delete-url-base="canDelete ? '/api/agency/attachment-types' : undefined"
    :can-create="canCreate"
    :can-update="canUpdate"
    :can-delete="canDelete"
    :schema="AgencyAttachmentTypeSchema"
    :initial-new-item="{}"
    :columns="columns">
    <template #name-cell="{ row }">
      <CommonBilingualName :name-en="row.original.egcs_cn_name_en" :name-fr="row.original.egcs_cn_name_fr" />
    </template>

    <template #description-cell="{ row }">
      <CommonBilingualName :name-en="row.original.egcs_cn_description_en" :name-fr="row.original.egcs_cn_description_fr" />
    </template>

    <template #form="{ state }">
      <UFormField :label="t('agency.name_en')" name="egcs_cn_name_en">
        <UInput v-model="state.egcs_cn_name_en" />
      </UFormField>
      <UFormField :label="t('agency.name_fr')" name="egcs_cn_name_fr">
        <UInput v-model="state.egcs_cn_name_fr" />
      </UFormField>
      <UFormField :label="t('agency.description_en')" name="egcs_cn_description_en">
        <CommonTextarea v-model="state.egcs_cn_description_en" />
      </UFormField>
      <UFormField :label="t('agency.description_fr')" name="egcs_cn_description_fr">
        <CommonTextarea v-model="state.egcs_cn_description_fr" />
      </UFormField>
    </template>
  </CommonResourceCrud>
</template>
