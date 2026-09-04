<script setup lang="ts">
import { computed } from 'vue'
import { AgencyProfileSchema, type AgencyProfileItem } from '~~/shared/types/schemas'

const { title, submitLabel, pending = false } = defineProps<{
  title: string
  submitLabel: string
  pending?: boolean
}>()

const open = defineModel<boolean>('open', { default: false })
const state = defineModel<Partial<AgencyProfileItem>>('state', { required: true, default: {} })

const emit = defineEmits(['submit'])

const { t } = useI18n()
const { createValidator } = useZodI18n()
const validate = createValidator(AgencyProfileSchema)
const gwcoaPermissionAction = computed(() => state.value.id ? 'update' : 'create')
const gwcoaLookupQuery = computed(() => ({
  permission_action: gwcoaPermissionAction.value,
  ...(state.value.id ? { agency_id: state.value.id } : {})
}))
const selectedGwcoaFetchUrl = computed(() => {
  if (state.value.egcs_ay_gwcoa_number === undefined || state.value.egcs_ay_gwcoa_number === '') return undefined

  const params = new URLSearchParams({ permission_action: gwcoaPermissionAction.value })
  if (state.value.id) params.set('agency_id', state.value.id)
  const gwcoaNumber = encodeURIComponent(String(state.value.egcs_ay_gwcoa_number))
  return `/api/agency/lookups/gwcoa/${gwcoaNumber}?${params.toString()}`
})

const onSubmit = () => {
  emit('submit')
}
</script>

<template>
  <UModal v-model:open="open" :title="title" :description="t('common.form_dialog_description')">
    <template #body>
      <UForm :state="state" :validate="validate" class="space-y-4" @submit="onSubmit">
        <UFormField :label="t('agency.gwcoa_number')" name="egcs_ay_gwcoa_number">
          <CommonServerLookupSelect
            v-model="state.egcs_ay_gwcoa_number"
            fetch-url="/api/agency/lookups/gwcoa"
            value-key="egcs_cn_number"
            label-en-key="egcs_cn_name_en"
            label-fr-key="egcs_cn_name_fr"
            :query="gwcoaLookupQuery"
            :selected-fetch-url="selectedGwcoaFetchUrl"
            :placeholder="t('agency.gwcoa_placeholder')"
          />
        </UFormField>
        <UFormField :label="t('agency.financial_id')" name="egcs_ay_agencyfinancialsystemid">
          <UInput v-model="state.egcs_ay_agencyfinancialsystemid" type="number" />
        </UFormField>
        <UFormField :label="t('agency.name_en')" name="egcs_ay_name_en">
          <UInput v-model="state.egcs_ay_name_en" />
        </UFormField>
        <UFormField :label="t('agency.name_fr')" name="egcs_ay_name_fr">
          <UInput v-model="state.egcs_ay_name_fr" />
        </UFormField>
        <UFormField :label="t('agency.abbreviation_en')" name="egcs_ay_abbreviation_en">
          <UInput v-model="state.egcs_ay_abbreviation_en" />
        </UFormField>
        <UFormField :label="t('agency.abbreviation_fr')" name="egcs_ay_abbreviation_fr">
          <UInput v-model="state.egcs_ay_abbreviation_fr" />
        </UFormField>
        <UFormField :label="t('common.active')" name="egcs_ay_active">
          <USwitch v-model="state.egcs_ay_active" :label="t('common.active')" />
        </UFormField>
        <div class="flex justify-end gap-2 pt-4">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="open = false" />
          <CommonSaveButton :label="submitLabel" :loading="pending" :disabled="pending" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
