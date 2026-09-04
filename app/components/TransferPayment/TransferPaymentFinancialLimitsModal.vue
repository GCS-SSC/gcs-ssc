<script setup lang="ts">
import type { Ref } from 'vue'
import { TransferPaymentFinancialLimitsSchema } from '~~/shared/types/schemas/transfer-payment'
import type { TransferPaymentFinancialLimitsForm } from '~~/shared/types/transfer-payment-ui'

const emit = defineEmits<{
  (event: 'submit'): void
}>()

const isOpen: Ref<boolean> = defineModel<boolean>('open', { required: true })
const formState: Ref<TransferPaymentFinancialLimitsForm | null> = defineModel<TransferPaymentFinancialLimitsForm | null>('state', { required: true })
const { pending = false } = defineProps<{
  pending?: boolean
}>()

const { t } = useI18n()
const { createValidator } = useZodI18n()
const validate = createValidator(TransferPaymentFinancialLimitsSchema)
</script>

<template>
  <UModal
    v-if="formState"
    v-model:open="isOpen"
    :title="
      formState?.id ? t('transfer_payment.financial_limit_update') : t('transfer_payment.financial_limit_create')
    ">
    <template #body>
      <UForm :validate="validate" :state="formState" class="space-y-4" @submit="emit('submit')">
        <TransferPaymentFieldsTransferPaymentFinancialLimitFields :model="formState" />

        <div class="flex justify-end gap-2">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="isOpen = false" />
          <CommonSaveButton
            :label="formState?.id ? t('common.update') : t('common.save')"
            :loading="pending"
            :disabled="pending" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
