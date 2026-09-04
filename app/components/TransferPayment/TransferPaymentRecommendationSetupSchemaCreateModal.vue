<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- request closure is local to the coordinated submit */
import type { FormSubmitEvent } from '#ui/types'
import type { z } from 'zod'
import { TransferPaymentStreamRecommendationSetupSchemaCreateSchema } from '~~/shared/types/schemas'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import type { EditorMutationRunner } from '~/composables/useEditorMutationCoordinator'

const emit = defineEmits<{ created: [payload: { schemaId: string }] }>()
const open = defineModel<boolean>('open', { default: false })
const state = defineModel<Partial<z.infer<typeof TransferPaymentStreamRecommendationSetupSchemaCreateSchema>> | null>('state', { required: true })
const { transferPaymentId, streamId, recommendationSetupId, mutationPending = false, runMutation } = defineProps<{
  transferPaymentId: string
  streamId: string
  recommendationSetupId: string
  mutationPending?: boolean
  runMutation?: EditorMutationRunner
}>()
const { t } = useI18n()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()
const isSubmitting = ref(false)
const validate = createValidator(TransferPaymentStreamRecommendationSetupSchemaCreateSchema)
/**
 * Creates and associates a recommendation before opening its schema editor.
 *
 * @param event - Validated member configuration for the new recommendation.
 */
const onSubmit = async (event: FormSubmitEvent<z.infer<typeof TransferPaymentStreamRecommendationSetupSchemaCreateSchema>>) => {
  if (isSubmitting.value || mutationPending) return
  try {
    isSubmitting.value = true
    const request = async () => {
      const response = await fetch(getClientRequestUrl(`/api/transfer-payments/${transferPaymentId}/streams/${streamId}/recommendation-setups/${recommendationSetupId}/items/create-schema`), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(event.data)
      })
      if (!response.ok) await throwFetchResponseError(response)
      return await response.json() as { schemaId: string }
    }
    const payload = (runMutation ? await runMutation(request) : await request()) as { schemaId: string } | undefined
    if (!payload) return
    open.value = false
    emit('created', payload)
  } catch (error) {
    showError(error)
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="t('transfer_payment.recommendation_schema_create')">
    <template #body>
      <UForm v-if="state" :state="state" :validate="validate" @submit="onSubmit">
        <fieldset :disabled="isSubmitting || mutationPending" class="space-y-4">
          <UFormField :label="t('common.order')" name="egcs_cn_order">
            <UInputNumber v-model="state.egcs_cn_order" :min="1" class="w-full" />
          </UFormField>
          <AdminCommonLookupField v-model="state.egcs_cn_approvaltemplate" :label="t('transfer_payment.approval_template_id')" name="egcs_cn_approvaltemplate" fetch-url="/api/approval-templates" value-key="id" label-en-key="egcs_cn_name_en" label-fr-key="egcs_cn_name_fr" :query="{ scopeType: 'transferpaymentstream', scopeId: streamId }" />
          <UFormField :label="t('transfer_payment.fail_on_not_recommended')" :description="t('transfer_payment.fail_on_not_recommended_help')" name="egcs_cn_failonnotrecommended">
            <USwitch v-model="state.egcs_cn_failonnotrecommended" />
          </UFormField>
          <p class="text-sm text-zinc-500 dark:text-zinc-400">
            {{ t('transfer_payment.recommendation_schema_create_help') }}
          </p>
          <div class="flex justify-end gap-2">
            <UButton :label="t('common.cancel')" color="neutral" variant="ghost" class="cursor-default" @click="open = false" />
            <CommonSaveButton :label="t('transfer_payment.continue_to_editor')" :loading="isSubmitting || mutationPending" :disabled="isSubmitting || mutationPending" />
          </div>
        </fieldset>
      </UForm>
    </template>
  </UModal>
</template>
