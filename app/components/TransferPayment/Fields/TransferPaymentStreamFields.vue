<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import type { Ref } from 'vue'
import type { TransferPaymentStreamRow } from '~~/shared/types/transfer-payment-ui'
import type { TransferPaymentStreamItem } from '~~/shared/types/schemas'

const model = defineModel<Partial<TransferPaymentStreamItem>>('model', { required: true })

const {
  programId,
  persistedStream,
  persistedProgramId,
  namePrefix = '',
  isStacked = false
} = defineProps<{
  programId: string
  persistedStream?: TransferPaymentStreamRow
  persistedProgramId?: string
  namePrefix?: string
  isStacked?: boolean
}>()

const { t } = useI18n()
const { getBilingualValue } = useBilingualValue()
// The native combobox reserves empty string for clearing, not an option value.
const noParentValue = 'none'
const parentOptions = computed(() => {
  const options = [{ label: t('common.none'), value: noParentValue }]
  const parentId = persistedStream?.egcs_tp_parentstream
  if (parentId && persistedProgramId === programId && model.value.id === persistedStream?.id
    && model.value.egcs_tp_parentstream === parentId) {
    options.push({ label: getBilingualValue(persistedStream, 'parent_name', String(parentId)), value: parentId })
  }
  return options
})
const field = useFormFieldPath(() => namePrefix)
const confirm = useConfirmDialog()
const confirmingConsistency: Ref<boolean> = ref(false)
let mounted = true
onBeforeUnmount(() => {
  mounted = false
})

/**
 * Confirm the prospective scope before changing local form state.
 *
 * @param value - Requested setting after the user toggles the switch.
 */
const changeConsistency = async (value: boolean) => {
  if (confirmingConsistency.value || value === Boolean(model.value.egcs_tp_requireconsistentproponenttype)) return
  const state = model.value
  const owner = programId
  const streamId = state.id
  confirmingConsistency.value = true
  try {
    const accepted = await confirm({
      title: t('transfer_payment.proponent_consistency_confirm_title'),
      description: t(value ? 'transfer_payment.proponent_consistency_enable_description' : 'transfer_payment.proponent_consistency_disable_description'),
      confirmLabel: t('transfer_payment.proponent_consistency_confirm'),
      cancelLabel: t('common.cancel'),
      confirmColor: 'warning'
    })
    if (accepted && mounted && model.value === state && programId === owner && model.value.id === streamId) {
      model.value.egcs_tp_requireconsistentproponenttype = value
    }
  } finally {
    confirmingConsistency.value = false
  }
}
</script>

<template>
  <div class="grid grid-cols-1 gap-4" :class="{ 'md:grid-cols-2': isStacked }">
    <UFormField :label="t('transfer_payment.name_en')" :name="field('egcs_tp_name_en')">
      <UInput v-model="model.egcs_tp_name_en" />
    </UFormField>
    <UFormField :label="t('transfer_payment.name_fr')" :name="field('egcs_tp_name_fr')">
      <UInput v-model="model.egcs_tp_name_fr" />
    </UFormField>
  </div>

  <div class="grid grid-cols-1 gap-4" :class="{ 'md:grid-cols-2': isStacked }">
    <UFormField :label="t('transfer_payment.abbreviation_en')" :name="field('egcs_tp_abbreviation_en')">
      <UInput v-model="model.egcs_tp_abbreviation_en" />
    </UFormField>
    <UFormField :label="t('transfer_payment.abbreviation_fr')" :name="field('egcs_tp_abbreviation_fr')">
      <UInput v-model="model.egcs_tp_abbreviation_fr" />
    </UFormField>
  </div>

  <UFormField :label="t('transfer_payment.parent_stream')" :name="field('egcs_tp_parentstream')">
    <CommonServerLookupSelect
      :model-value="model.egcs_tp_parentstream ?? undefined"
      :fetch-url="`/api/transfer-payments/${programId}/streams`"
      :selected-fetch-url="model.egcs_tp_parentstream ? `/api/transfer-payments/${programId}/streams/${model.egcs_tp_parentstream}` : undefined"
      value-key="id"
      label-en-key="egcs_tp_name_en"
      label-fr-key="egcs_tp_name_fr"
      :prepend-items="parentOptions"
      :placeholder="t('common.none')"
      :show-value-in-label="false"
      :exclude-values="model.id ? [model.id] : []"
      @update:model-value="model.egcs_tp_parentstream = $event === noParentValue ? null : $event ?? null" />
  </UFormField>

  <div class="grid grid-cols-1 gap-4" :class="{ 'md:grid-cols-2': isStacked }">
    <UFormField :label="t('transfer_payment.objective_en')" :name="field('egcs_tp_objective_en')">
      <CommonTextarea v-model="model.egcs_tp_objective_en" />
    </UFormField>
    <UFormField :label="t('transfer_payment.objective_fr')" :name="field('egcs_tp_objective_fr')">
      <CommonTextarea v-model="model.egcs_tp_objective_fr" />
    </UFormField>
  </div>

  <UFormField :label="t('transfer_payment.require_consistent_proponent_type')" :name="field('egcs_tp_requireconsistentproponenttype')">
    <USwitch
      :model-value="model.egcs_tp_requireconsistentproponenttype ?? false"
      :disabled="confirmingConsistency"
      @update:model-value="changeConsistency" />
  </UFormField>
  <UFormField :label="t('transfer_payment.allows_further_distribution')" :name="field('egcs_tp_allowsfurtherdistribution')">
    <USwitch v-model="model.egcs_tp_allowsfurtherdistribution" />
  </UFormField>

  <div class="grid grid-cols-1 gap-4" :class="{ 'md:grid-cols-2': isStacked }">
    <UFormField :label="t('transfer_payment.description_en')" :name="field('egcs_tp_description_en')">
      <CommonTextarea v-model="model.egcs_tp_description_en" />
    </UFormField>
    <UFormField :label="t('transfer_payment.description_fr')" :name="field('egcs_tp_description_fr')">
      <CommonTextarea v-model="model.egcs_tp_description_fr" />
    </UFormField>
  </div>

  <UFormField :label="t('common.active')" :name="field('egcs_tp_active')">
    <USwitch v-model="model.egcs_tp_active" :label="t('common.active')" />
  </UFormField>
</template>
