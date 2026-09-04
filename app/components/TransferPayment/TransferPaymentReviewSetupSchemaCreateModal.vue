<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- request closure is local to the coordinated submit */
import type { Ref } from 'vue'
import type { FormSubmitEvent } from '#ui/types'
import type { z } from 'zod'
import { TransferPaymentStreamReviewSetupSchemaCreateSchema } from '~~/shared/types/schemas'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import type { EditorMutationRunner } from '~/composables/useEditorMutationCoordinator'

const emit = defineEmits<{
  created: [payload: { schemaId: string; reviewType: 'assessment' | 'checklist' }]
}>()
const open = defineModel<boolean>('open', { default: false })
type SchemaCreateState = Partial<z.infer<typeof TransferPaymentStreamReviewSetupSchemaCreateSchema>>
const state = defineModel<SchemaCreateState | null>('state', { required: true })
const { transferPaymentId, streamId, reviewSetupId, mutationPending = false, runMutation } = defineProps<{
  transferPaymentId: string
  streamId: string
  reviewSetupId: string
  mutationPending?: boolean
  runMutation?: EditorMutationRunner
}>()
const { t } = useI18n()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()
const isSubmitting: Ref<boolean> = ref(false)
const validate = createValidator(TransferPaymentStreamReviewSetupSchemaCreateSchema)

/**
 * Creates and associates a draft review schema before opening its editor.
 *
 * @param event - Validated setup metadata selected by the administrator.
 */
const onSubmit = async (event: FormSubmitEvent<z.infer<typeof TransferPaymentStreamReviewSetupSchemaCreateSchema>>) => {
  if (isSubmitting.value || mutationPending) return
  try {
    isSubmitting.value = true
    const request = async () => {
      const response = await fetch(getClientRequestUrl(`/api/transfer-payments/${transferPaymentId}/streams/${streamId}/review-setups/${reviewSetupId}/items/create-schema`), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(event.data)
      })
      if (!response.ok) await throwFetchResponseError(response)
      return await response.json() as { schemaId: string; reviewType: 'assessment' | 'checklist' }
    }
    const payload = (runMutation ? await runMutation(request) : await request()) as
      | { schemaId: string; reviewType: 'assessment' | 'checklist' }
      | undefined
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
  <UModal v-model:open="open" :title="t('transfer_payment.review_schema_create')">
    <template #body>
      <UForm v-if="state" :state="state" :validate="validate" @submit="onSubmit">
        <fieldset :disabled="isSubmitting || mutationPending" class="space-y-4">
          <UFormField :label="t('transfer_payment.review_type')" name="egcs_cn_reviewtype">
            <CommonEnumSelect v-model="state.egcs_cn_reviewtype" name="review_type" class="w-full" />
          </UFormField>
          <UFormField :label="t('common.order')" name="egcs_cn_order">
            <UInputNumber v-model="state.egcs_cn_order" :min="1" class="w-full" />
          </UFormField>
          <AdminCommonLookupField
            v-model="state.egcs_cn_approvaltemplate"
            :label="t('transfer_payment.approval_template_id')"
            name="egcs_cn_approvaltemplate"
            fetch-url="/api/approval-templates"
            value-key="id"
            label-en-key="egcs_cn_name_en"
            label-fr-key="egcs_cn_name_fr"
            :query="{ scopeType: 'transferpaymentstream', scopeId: streamId }" />
          <p class="text-sm text-zinc-500 dark:text-zinc-400">
            {{ t('transfer_payment.review_schema_create_help') }}
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
