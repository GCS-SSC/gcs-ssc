<script setup lang="ts">
import type { Ref } from 'vue'
import type { TransferPaymentPerformanceIndicatorItem } from '~~/shared/types/schemas'
import { TransferPaymentPerformanceIndicatorSchema } from '~~/shared/types/schemas'
import type { TransferPaymentOutcomeRow } from '~~/shared/types/transfer-payment-ui'

type IndicatorForm = Partial<TransferPaymentPerformanceIndicatorItem & { egcs_tp_transferpaymentoutcome?: string }>

const { outcomes, pending = false } = defineProps<{
  outcomes: TransferPaymentOutcomeRow[]
  pending?: boolean
}>()

const emit = defineEmits<{
  (event: 'submit'): void
}>()

const isOpen: Ref<boolean> = defineModel<boolean>('open', { required: true })
const indicatorState: Ref<IndicatorForm | null> = defineModel<IndicatorForm | null>('state', { required: true })

const { t } = useI18n()
const { createValidator } = useZodI18n()
const validateIndicator = createValidator(TransferPaymentPerformanceIndicatorSchema)
</script>

<template>
  <UModal
    v-if="indicatorState"
    v-model:open="isOpen"
    :title="indicatorState?.id ? t('common.update') : t('common.add')">
    <template #body>
      <UForm :state="indicatorState" :validate="validateIndicator" class="space-y-4" @submit="emit('submit')">
        <TransferPaymentFieldsTransferPaymentPerformanceIndicatorFields
          :model="indicatorState"
          :outcomes="outcomes"
          outcome-field="egcs_tp_transferpaymentoutcome"
          outcome-value-key="id" />
        <div class="flex justify-end gap-2 pt-4">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="isOpen = false" />
          <CommonSaveButton
            :label="indicatorState?.id ? t('common.update') : t('common.add')"
            :loading="pending"
            :disabled="pending" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
