<script setup lang="ts">
import { computed, ref, watch, type Ref } from 'vue'
import type { z } from 'zod'
import { AgencyCustomFieldCreateSchema, AgencyCustomFieldOptionCreateSchema } from '~~/shared/types/schemas/agreement-custom-fields'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'

type AgencyOption = z.infer<typeof AgencyCustomFieldOptionCreateSchema> & { id: string, egcs_ay_field: string }
type AgencyField = z.infer<typeof AgencyCustomFieldCreateSchema> & { id: string, options: AgencyOption[] }

const { agencyId, canCreate, canUpdate, canDelete } = defineProps<{ agencyId: string, canCreate: boolean, canUpdate: boolean, canDelete: boolean }>()
const { t, locale } = useI18n()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const { createValidator } = useZodI18n()
const url = computed(() => `/api/agency/${agencyId}/custom-fields`)
const { data, error, status, refresh } = await useAsyncData<{ items: AgencyField[] }>(url, async () => {
  const response = await fetch(getClientRequestUrl(url.value))
  if (!response.ok) await throwFetchResponseError(response)
  return await response.json() as { items: AgencyField[] }
})

const fieldModal = useCrudModal<Partial<AgencyField>>({
  createState: () => ({ egcs_ay_kind: 'text', egcs_ay_multiple: false, egcs_ay_presentation: 'single_line', egcs_ay_discriminator: false }),
  updateState: field => ({ ...field })
})
const optionModal = useCrudModal<Partial<AgencyOption>>({
  createState: () => ({ egcs_ay_category_en: null, egcs_ay_category_fr: null, egcs_ay_active: true, egcs_ay_displayorder: 0 }),
  updateState: option => ({ ...option })
})
const optionFieldId: Ref<string | null> = ref(null)
const saving = ref(false)
const multipleSelectionLocked = computed(() => Boolean(data.value?.items.find(field => field.id === fieldModal.selected.value?.id)?.egcs_ay_multiple))
const label = (item: { egcs_ay_name_en: string, egcs_ay_name_fr: string }) => locale.value === 'fr' ? item.egcs_ay_name_fr : item.egcs_ay_name_en
const category = (item: AgencyOption) => locale.value === 'fr' ? item.egcs_ay_category_fr : item.egcs_ay_category_en
const typeLabel = (field: AgencyField) => t(`custom_fields.${field.egcs_ay_kind === 'text' ? field.egcs_ay_presentation : field.egcs_ay_kind === 'relational' ? (field.egcs_ay_multiple ? 'multiple_selection' : 'single_selection') : 'number'}`)

watch(() => fieldModal.selected.value?.egcs_ay_kind, kind => {
  const selected = fieldModal.selected.value
  if (!selected) return
  if (kind !== 'text') selected.egcs_ay_presentation = 'single_line'
  if (kind !== 'relational') {
    selected.egcs_ay_multiple = false
    selected.egcs_ay_discriminator = false
  }
})
watch(url, () => {
  fieldModal.close()
  optionModal.close()
  optionFieldId.value = null
})

/**
 * Opens a relational option editor for one Agency field.
 * @param fieldId - Parent field identity.
 * @param option - Existing option when editing.
 */
const openOption = (fieldId: string, option?: AgencyOption) => {
  optionFieldId.value = fieldId
  if (option) optionModal.openUpdate(option)
  else optionModal.openCreate()
}

/**
 * Saves an Agency field definition.
 */
const saveField = async () => {
  const selected = fieldModal.selected.value
  if (!selected || saving.value) return
  const session = fieldModal.captureSession()
  const { id } = selected
  const body = {
    egcs_ay_name_en: selected.egcs_ay_name_en,
    egcs_ay_name_fr: selected.egcs_ay_name_fr,
    egcs_ay_kind: selected.egcs_ay_kind,
    egcs_ay_multiple: selected.egcs_ay_multiple,
    egcs_ay_presentation: selected.egcs_ay_presentation,
    egcs_ay_discriminator: selected.egcs_ay_discriminator
  }
  saving.value = true
  try {
    const response = await fetch(getClientRequestUrl(`${url.value}${id ? `/${id}` : ''}`), {
      method: id ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    })
    if (!response.ok) await throwFetchResponseError(response)
    fieldModal.closeSession(session)
    await refresh()
  } catch (saveError) {
    showError(saveError)
  } finally {
    saving.value = false
  }
}

/**
 * Saves a relational field option.
 */
const saveOption = async () => {
  const selected = optionModal.selected.value
  if (!selected || !optionFieldId.value || saving.value) return
  const session = optionModal.captureSession()
  const { id, egcs_ay_field: _field, ...body } = selected
  saving.value = true
  try {
    const response = await fetch(getClientRequestUrl(`${url.value}/${optionFieldId.value}/options${id ? `/${id}` : ''}`), {
      method: id ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    })
    if (!response.ok) await throwFetchResponseError(response)
    optionModal.closeSession(session)
    await refresh()
  } catch (saveError) {
    showError(saveError)
  } finally {
    saving.value = false
  }
}

/**
 * Soft-deletes an Agency field or option after confirmation and refreshes the catalog.
 * @param path - Agency catalog resource path.
 */
const remove = async (path: string) => {
  if (await confirmDeleteRequest(path)) await refresh()
}
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-xl font-semibold">
        {{ t('custom_fields.title') }}
      </h2>
      <UButton v-if="canCreate" icon="i-lucide-plus" :label="t('custom_fields.add_field')" @click="fieldModal.openCreate()" />
    </div>
    <CommonLoadingState v-if="status === 'pending' && !data" :label="t('common.loading')" />
    <UAlert v-else-if="error" color="error" icon="i-lucide-circle-alert" :title="t('common.load_failed')" :description="t('common.try_again')">
      <template #actions>
        <UButton :label="t('common.retry')" color="error" variant="soft" @click="refresh()" />
      </template>
    </UAlert>
    <div v-else class="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
      <div v-for="field in data?.items ?? []" :key="field.id" class="space-y-3 px-4 py-3">
        <div class="flex flex-wrap items-start gap-3">
          <div class="min-w-0 flex-1">
            <div class="font-medium">
              {{ label(field) }}
            </div>
            <div class="text-sm text-zinc-500">
              {{ typeLabel(field) }}
            </div>
          </div>
          <UBadge v-if="field.egcs_ay_discriminator" color="neutral" variant="subtle" :label="t('custom_fields.discriminator')" />
          <UButton v-if="canUpdate" icon="i-lucide-pencil" color="neutral" variant="ghost" :aria-label="`${t('common.edit')}: ${label(field)}`" @click="fieldModal.openUpdate(field)" />
          <UButton v-if="canDelete" icon="i-lucide-trash" color="error" variant="ghost" :aria-label="`${t('common.delete')}: ${label(field)}`" @click="remove(`${url}/${field.id}`)" />
          <UButton v-if="canCreate && field.egcs_ay_kind === 'relational'" icon="i-lucide-plus" color="neutral" variant="ghost" :aria-label="`${t('custom_fields.add_option')}: ${label(field)}`" @click="openOption(field.id)" />
        </div>
        <div v-if="field.egcs_ay_kind === 'relational' && field.options.length" class="divide-y divide-zinc-100 border-t border-zinc-100 pl-4 dark:divide-zinc-800 dark:border-zinc-800">
          <div v-for="option in field.options" :key="option.id" class="flex items-center gap-2 py-2 text-sm">
            <span class="min-w-0 flex-1">{{ label(option) }} <span v-if="category(option)" class="text-zinc-500">· {{ category(option) }}</span></span>
            <UBadge v-if="!option.egcs_ay_active" color="neutral" variant="subtle" :label="t('custom_fields.inactive')" />
            <UButton v-if="canUpdate" icon="i-lucide-pencil" size="sm" color="neutral" variant="ghost" :aria-label="`${t('common.edit')}: ${label(option)}`" @click="openOption(field.id, option)" />
            <UButton v-if="canDelete" icon="i-lucide-trash" size="sm" color="error" variant="ghost" :aria-label="`${t('common.delete')}: ${label(option)}`" @click="remove(`${url}/${field.id}/options/${option.id}`)" />
          </div>
        </div>
      </div>
      <div v-if="!data?.items.length" class="px-4 py-6 text-sm text-zinc-500">
        {{ t('common.no_data') }}
      </div>
    </div>

    <UModal v-model:open="fieldModal.isOpen.value" :title="t('custom_fields.title')" :ui="{ content: 'sm:max-w-2xl' }">
      <template #body>
        <UForm v-if="fieldModal.selected.value" :state="fieldModal.selected.value" :validate="createValidator(AgencyCustomFieldCreateSchema)" class="space-y-4" @submit="saveField">
          <UFormField :label="t('custom_fields.name_en')" name="egcs_ay_name_en" required>
            <UInput v-model="fieldModal.selected.value.egcs_ay_name_en" class="w-full" />
          </UFormField>
          <UFormField :label="t('custom_fields.name_fr')" name="egcs_ay_name_fr" required>
            <UInput v-model="fieldModal.selected.value.egcs_ay_name_fr" class="w-full" />
          </UFormField>
          <UFormField :label="t('common.type')" name="egcs_ay_kind" required>
            <USelect v-model="fieldModal.selected.value.egcs_ay_kind" :disabled="Boolean(fieldModal.selected.value.id)" :items="[{ value: 'text', label: t('custom_fields.text') }, { value: 'number', label: t('custom_fields.number') }, { value: 'relational', label: t('custom_fields.relational') }]" />
          </UFormField>
          <UFormField v-if="fieldModal.selected.value.egcs_ay_kind === 'text'" :label="t('custom_fields.presentation')" name="egcs_ay_presentation">
            <USelect v-model="fieldModal.selected.value.egcs_ay_presentation" :items="[{ value: 'single_line', label: t('custom_fields.single_line') }, { value: 'multiline', label: t('custom_fields.multiline') }]" />
          </UFormField>
          <UCheckbox v-if="fieldModal.selected.value.egcs_ay_kind === 'relational'" v-model="fieldModal.selected.value.egcs_ay_multiple" :disabled="multipleSelectionLocked" :label="t('custom_fields.allow_multiple')" :description="t('custom_fields.multiple_help')" />
          <UCheckbox v-if="fieldModal.selected.value.egcs_ay_kind === 'relational'" v-model="fieldModal.selected.value.egcs_ay_discriminator" :label="t('custom_fields.discriminator')" />
          <CommonSaveButton :label="t('common.save')" :loading="saving" />
        </UForm>
      </template>
    </UModal>
    <UModal v-model:open="optionModal.isOpen.value" :title="t('custom_fields.add_option')" :ui="{ content: 'sm:max-w-2xl' }">
      <template #body>
        <UForm v-if="optionModal.selected.value" :state="optionModal.selected.value" :validate="createValidator(AgencyCustomFieldOptionCreateSchema)" class="space-y-4" @submit="saveOption">
          <UFormField :label="t('custom_fields.name_en')" name="egcs_ay_name_en" required>
            <UInput v-model="optionModal.selected.value.egcs_ay_name_en" class="w-full" />
          </UFormField>
          <UFormField :label="t('custom_fields.name_fr')" name="egcs_ay_name_fr" required>
            <UInput v-model="optionModal.selected.value.egcs_ay_name_fr" class="w-full" />
          </UFormField>
          <UFormField :label="t('custom_fields.category_en')" name="egcs_ay_category_en" :required="Boolean(optionModal.selected.value.egcs_ay_category_fr)">
            <UInput v-model="optionModal.selected.value.egcs_ay_category_en" class="w-full" />
          </UFormField>
          <UFormField :label="t('custom_fields.category_fr')" name="egcs_ay_category_fr" :required="Boolean(optionModal.selected.value.egcs_ay_category_en)">
            <UInput v-model="optionModal.selected.value.egcs_ay_category_fr" class="w-full" />
          </UFormField>
          <UCheckbox v-model="optionModal.selected.value.egcs_ay_active" :label="t('custom_fields.active')" />
          <UFormField :label="t('custom_fields.order')" name="egcs_ay_displayorder">
            <UInput v-model.number="optionModal.selected.value.egcs_ay_displayorder" type="number" min="0" />
          </UFormField>
          <CommonSaveButton :label="t('common.save')" :loading="saving" />
        </UForm>
      </template>
    </UModal>
  </section>
</template>
