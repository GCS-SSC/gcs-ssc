<script setup lang="ts">
import { useRoleModalState } from '~/composables/useRoleModalState'
import type { RoleInput } from '~~/shared/types/schemas/rbac'

const { title, submitLabel, pending = false } = defineProps<{
  title: string
  submitLabel: string
  pending?: boolean
}>()

const open = defineModel<boolean>('open', { default: false })
const state = defineModel<Partial<RoleInput>>('state', { required: true })

const emit = defineEmits(['submit'])

const {
  t,
  validate,
  lookupPageSize,
  isUpdate,
  agencySelection,
  updateAgencySelection,
  agencyPrependItems,
  agencyLookupQuery,
  selectedAgencyFetchUrl,
  transferPaymentQuery,
  selectedTransferPaymentIds,
  selectedTransferPaymentToAdd,
  selectedTransferPayments,
  addSelectedTransferPayment,
  retrySelectedTransferPayment,
  removeSelectedTransferPayment
} = useRoleModalState({ state, open })

const onSubmit = () => {
  emit('submit')
}
</script>

<template>
  <UModal v-model:open="open" :title="title">
    <template #body>
      <UForm :state="state" :validate="validate" class="space-y-4" @submit="onSubmit">
        <UFormField :label="t('role.scope.label')" name="agency_id">
          <CommonServerLookupSelect
            v-if="!isUpdate || state.agency_id"
            :model-value="agencySelection"
            fetch-url="/api/roles/lookups/agencies"
            value-key="id"
            label-en-key="egcs_ay_name_en"
            label-fr-key="egcs_ay_name_fr"
            :show-value-in-label="false"
            :limit="lookupPageSize"
            :query="agencyLookupQuery"
            :prepend-items="agencyPrependItems"
            :selected-fetch-url="selectedAgencyFetchUrl"
            :disabled="isUpdate"
            @update:model-value="updateAgencySelection" />
          <UInput
            v-else
            :model-value="t('role.scope.global')"
            disabled />
        </UFormField>

        <UFormField v-if="state.agency_id" :label="t('role.assignment.program')" name="transfer_payment_ids">
          <div class="space-y-3">
            <div class="flex items-center gap-2">
              <CommonServerLookupSelect
                :key="state.agency_id"
                v-model="selectedTransferPaymentToAdd"
                fetch-url="/api/roles/lookups/transfer-payments"
                value-key="id"
                label-en-key="egcs_tp_name_en"
                label-fr-key="egcs_tp_name_fr"
                :show-value-in-label="false"
                :limit="lookupPageSize"
                :query="transferPaymentQuery"
                :exclude-values="selectedTransferPaymentIds"
                clear />
              <UButton
                :label="t('common.add')"
                :disabled="!selectedTransferPaymentToAdd"
                @click="addSelectedTransferPayment" />
            </div>

            <div class="space-y-2">
              <div
                v-for="selectedProgram in selectedTransferPayments"
                :key="selectedProgram.id"
                class="flex items-center justify-between rounded border border-default px-3 py-2">
                <span data-testid="selected-program-name" class="text-sm">{{ selectedProgram.name }}</span>
                <div class="flex items-center gap-2">
                  <UButton
                    v-if="selectedProgram.retryable"
                    :label="t('common.retry')"
                    icon="i-lucide-refresh-cw"
                    variant="ghost"
                    @click="retrySelectedTransferPayment(selectedProgram.id)" />
                  <UButton
                    :label="t('common.delete')"
                    color="error"
                    variant="ghost"
                    @click="removeSelectedTransferPayment(selectedProgram.id)" />
                </div>
              </div>
            </div>
          </div>
        </UFormField>

        <UFormField :label="t('role.name_en')" name="name_en">
          <UInput v-model="state.name_en" />
        </UFormField>
        <UFormField :label="t('role.name_fr')" name="name_fr">
          <UInput v-model="state.name_fr" />
        </UFormField>
        <UFormField :label="t('role.description_en')" name="description_en">
          <CommonTextarea v-model="state.description_en" />
        </UFormField>
        <UFormField :label="t('role.description_fr')" name="description_fr">
          <CommonTextarea v-model="state.description_fr" />
        </UFormField>
        <div class="flex justify-end gap-2 pt-4">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="open = false" />
          <CommonSaveButton :label="submitLabel" :loading="pending" :disabled="pending" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
