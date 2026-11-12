<script setup lang="ts">
import { watch } from 'vue'
import { useModalSession } from '~/composables/useModalSession'
import { useFormSession } from '~/composables/useFormSession'
import type { ActionContext } from '~/composables/useActionContext'
import type { CaptureCommittedSettlement } from '~/composables/useCommittedSettlement'
import { useCrudModalPending } from '~/composables/useCrudModal'
/* eslint-disable jsdoc/require-jsdoc -- request closure is local to the coordinated submit */
import type { FormSubmitEvent } from '#ui/types'
import { z } from 'zod'
import { TransferPaymentStreamReviewSetupSchemaCreateSchema } from '~~/shared/types/schemas'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import type { EditorMutationRunner } from '~/composables/useEditorMutationCoordinator'

const createdSchema = z.object({ schemaId: z.string(), reviewType: z.enum(['assessment', 'checklist']) })
const emit = defineEmits<{ created: [payload: z.infer<typeof createdSchema>] }>()
const open = defineModel<boolean>('open', { default: false })
type SchemaCreateState = Partial<z.infer<typeof TransferPaymentStreamReviewSetupSchemaCreateSchema>>
const state = defineModel<SchemaCreateState | null>('state', { required: true })
const { reviewSetupId, agencyId, mutationPending = false, runMutation, captureCommitted, actionContext } = defineProps<{
  reviewSetupId: string
  agencyId: string
  mutationPending?: boolean
  actionContext: ActionContext
} & ({ runMutation: EditorMutationRunner; captureCommitted?: never } | { runMutation?: never; captureCommitted: CaptureCommittedSettlement })>()
const { t } = useI18n()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()
const modalSession = useModalSession()
watch([() => open.value, () => state.value, () => agencyId, () => reviewSetupId], () => {
  modalSession.isOpen.value = false
  modalSession.isOpen.value = open.value && state.value !== null
}, { immediate: true, flush: 'sync' })
const pending = useCrudModalPending(modalSession.captureSession)
const isSubmitting = pending.isPending
const validate = createValidator(TransferPaymentStreamReviewSetupSchemaCreateSchema)

/**
 * Creates and associates a draft review schema before opening its editor.
 *
 * @param event - Validated setup metadata selected by the administrator.
 */
const onSubmit = async (event: FormSubmitEvent<z.infer<typeof TransferPaymentStreamReviewSetupSchemaCreateSchema>>) => {
  const session = modalSession.captureSession()
  const committed = captureCommitted?.()
  if (!runMutation && !committed) return
  const operation = actionContext.capture()
  if (session === null || !operation || mutationPending || !pending.begin(session)) return
  const isCurrent = () => modalSession.isCurrentSession(session) && operation.isCurrent()
  try {
    let response: unknown
    try {
      const requestUrl = getClientRequestUrl(`/api/agency/${agencyId}/review-sets/${reviewSetupId}/items/create-schema`)
      const requestBody = JSON.stringify(event.data)
      const request = async () => {
        if (!isCurrent() || !operation.canDispatch() || (committed && !committed.canDispatch())) return
        const response = await fetch(requestUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: requestBody
        })
        if (!response.ok) await throwFetchResponseError(response)
        return await response.json()
      }
      response = runMutation ? await runMutation(request) : await request()
    } catch (error) {
      if (isCurrent()) showError(error)
      return
    }
    if (response === undefined) return
    const readback = committed ? await committed.settle() : null
    if (readback?.kind === 'retired' || !isCurrent()) return
    const payload = createdSchema.parse(response)
    open.value = false
    if (readback?.kind !== 'unavailable') emit('created', payload)
  } catch (error) {
    if (isCurrent()) showError(error)
  } finally {
    pending.end(session)
  }
}
const formSession = useFormSession({ owner: modalSession, action: { kind: 'remote', context: () => actionContext }, submit: onSubmit })
</script>

<template>
  <UModal v-model:open="open" :title="t('transfer_payment.review_schema_create')" data-field-scope="transfer-payment.review-setup-schema-create-modal">
    <template #body>
      <UForm v-if="state" v-bind="formSession" :state="state" :validate="validate">
        <fieldset :disabled="isSubmitting || mutationPending" class="space-y-4">
          <UFormField :label="t('transfer_payment.review_type')" name="egcs_cn_reviewtype">
            <CommonEnumSelect v-model="state.egcs_cn_reviewtype" name="review_type" class="w-full" />
          </UFormField>
          <UFormField :label="t('common.order')" name="egcs_cn_order" required>
            <UInputNumber v-model="state.egcs_cn_order" :min="1" class="w-full" />
          </UFormField>
          <AdminCommonLookupField
            v-model="state.egcs_cn_approvaltemplate"
            :label="t('transfer_payment.approval_template_id')"
            name="egcs_cn_approvaltemplate"
            :fetch-url="`/api/agency/${agencyId}/approval-templates`" :include-deleted-query="false"
            value-key="id"
            label-en-key="egcs_cn_name_en"
            label-fr-key="egcs_cn_name_fr"
          />
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
