<script setup lang="ts">
import type { FormSubmitEvent } from '#ui/types'
import type { z } from 'zod'
import type { BilingualColumnConfig, TableColumnInput } from '~/composables/useTableColumns'
import { appRouteLocations } from '~/utils/route-locations'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { AgencyReviewSchemaCreateSchema } from '~~/shared/types/schemas'
import { REVIEW_TYPE_ENUM, REVIEW_TARGET_ENTITY_TYPE_ENUM } from '~~/shared/constants/enums'

const { agencyId, canUpdateChild } = defineProps<{ agencyId: string, canUpdateChild: boolean }>()
type ReviewSchemaRow = {
  id: string
  egcs_cn_name_en: string
  egcs_cn_name_fr: string
  egcs_cn_reviewtype: 'assessment' | 'checklist'
  publicationState: 'draft' | 'published' | 'retired'
}
const { t } = useI18n()
const router = useRouter()
const localePath = useLocalePath()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()
const isCreateOpen = ref(false)
const isSaving = ref(false)
const createState = ref<Partial<z.infer<typeof AgencyReviewSchemaCreateSchema>>>({})
const validateCreate = createValidator(AgencyReviewSchemaCreateSchema)
const reviewTypeItems = computed(() => REVIEW_TYPE_ENUM.map(value => ({ label: t(`enums.review_type.${value}`), value })))
const entityTypeItems = computed(() => REVIEW_TARGET_ENTITY_TYPE_ENUM.map(value => ({ label: t(`enums.entity_type.${value}`), value })))
const { search, pagination, items, totalRecords, refresh, status } = useResourceTable<ReviewSchemaRow>({
  fetchUrl: `/api/agency/${agencyId}/review-schemas`
})
const columns: TableColumnInput<ReviewSchemaRow>[] = [
  { id: 'name', accessorKey: 'egcs_cn_name_en', headerKey: 'common.name' },
  { id: 'type', accessorKey: 'egcs_cn_reviewtype', headerKey: 'transfer_payment.review_type' },
  { id: 'status', accessorKey: 'publicationState', headerKey: 'common.status' },
  { id: 'actions', headerKey: 'common.actions' }
]
const bilingualColumns: BilingualColumnConfig<ReviewSchemaRow>[] = [{
  id: 'name', accessorKey: { en: 'egcs_cn_name_en', fr: 'egcs_cn_name_fr' }, headerKey: 'common.name'
}]
const open = async (row: ReviewSchemaRow) => await router.push(localePath(appRouteLocations.agencyReviewSchemaDetail(agencyId, String(row.id))))
const openCreate = () => {
  createState.value = {}
  isCreateOpen.value = true
}
/** Creates a draft Agency Review Schema and opens its editor.
 * @param event - Validated bilingual catalog metadata.
 */
const create = async (event: FormSubmitEvent<z.infer<typeof AgencyReviewSchemaCreateSchema>>) => {
  if (isSaving.value) return
  isSaving.value = true
  try {
    const response = await fetch(getClientRequestUrl(`/api/agency/${agencyId}/review-schemas`), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(event.data)
    })
    if (!response.ok) await throwFetchResponseError(response)
    const row = await response.json() as ReviewSchemaRow
    isCreateOpen.value = false
    await refresh()
    await open(row)
  } catch (error) {
    showError(error)
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <CommonResourceLayoutCard
    v-model:search="search" v-model:pagination="pagination"
    :data="items" :columns="columns" :bilingual-columns="bilingualColumns"
    :total-records="totalRecords" :loading="status === 'pending'"
    :show-button="canUpdateChild" :button-label="t('common.add')" @add="openCreate">
    <template #type-cell="{ row }">
      {{ t(`enums.review_type.${row.original.egcs_cn_reviewtype}`) }}
    </template>
    <template #status-cell="{ row }">
      <CommonStatusBadge variant="meta" :label="t(`enums.publication_state.${row.original.publicationState}`)" />
    </template>
    <template #actions-cell="{ row }">
      <UButton color="neutral" variant="ghost" icon="i-lucide-arrow-up-right" :label="t('common.open')" @click="open(row.original)" />
    </template>
  </CommonResourceLayoutCard>
  <UModal v-model:open="isCreateOpen" :title="t('transfer_payment.review_schema_create')">
    <template #body>
      <UForm :state="createState" :validate="validateCreate" @submit="create">
        <fieldset :disabled="isSaving" class="space-y-4">
          <UFormField :label="t('admin_common.fields.egcs_cn_reviewtype')" name="egcs_cn_reviewtype" required>
            <USelect v-model="createState.egcs_cn_reviewtype" :items="reviewTypeItems" class="w-full" />
          </UFormField>
          <UFormField :label="t('admin_common.fields.egcs_cn_entitytype')" name="egcs_cn_entitytype" required>
            <CommonEnumSelect v-model="createState.egcs_cn_entitytype" name="execution_entity_type" :items="entityTypeItems" class="w-full" />
          </UFormField>
          <UFormField :label="t('admin_common.fields.egcs_cn_name_en')" name="egcs_cn_name_en" required>
            <UInput v-model="createState.egcs_cn_name_en" class="w-full" />
          </UFormField>
          <UFormField :label="t('admin_common.fields.egcs_cn_name_fr')" name="egcs_cn_name_fr" required>
            <UInput v-model="createState.egcs_cn_name_fr" class="w-full" />
          </UFormField>
          <UFormField :label="t('admin_common.fields.egcs_cn_outcomename_en')" name="egcs_cn_outcomename_en" required>
            <UInput v-model="createState.egcs_cn_outcomename_en" class="w-full" />
          </UFormField>
          <UFormField :label="t('admin_common.fields.egcs_cn_outcomename_fr')" name="egcs_cn_outcomename_fr" required>
            <UInput v-model="createState.egcs_cn_outcomename_fr" class="w-full" />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="isCreateOpen = false" />
            <CommonSaveButton :label="t('common.save')" :loading="isSaving" :disabled="isSaving" />
          </div>
        </fieldset>
      </UForm>
    </template>
  </UModal>
</template>
