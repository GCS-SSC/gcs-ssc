<script setup lang="ts">
import { watch } from 'vue'
import type { ActionContext } from '~/composables/useActionContext'
import type { CaptureCommittedSettlement } from '~/composables/useCommittedSettlement'
import { useModalSession } from '~/composables/useModalSession'
import { useFormSession } from '~/composables/useFormSession'
import { useCrudModalPending } from '~/composables/useCrudModal'
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
const { recommendationSetupId, agencyId, mutationPending = false, runMutation, captureCommitted, actionContext } = defineProps<{
  recommendationSetupId: string
  agencyId: string
  mutationPending?: boolean
  actionContext: ActionContext
} & ({ runMutation: EditorMutationRunner; captureCommitted?: never } | { runMutation?: never; captureCommitted: CaptureCommittedSettlement })>()
const { t } = useI18n()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()
const modalSession = useModalSession()
watch([() => open.value, () => state.value, () => agencyId, () => recommendationSetupId], () => {
  modalSession.isOpen.value = false
  modalSession.isOpen.value = open.value && state.value !== null
}, { immediate: true, flush: 'sync' })
const pending = useCrudModalPending(modalSession.captureSession)
const isSubmitting = pending.isPending
const validate = createValidator(TransferPaymentStreamRecommendationSetupSchemaCreateSchema)
/**
 * Creates and associates a recommendation before opening its schema editor.
 *
 * @param event - Validated member configuration for the new recommendation.
 */
const onSubmit = async (event: FormSubmitEvent<z.infer<typeof TransferPaymentStreamRecommendationSetupSchemaCreateSchema>>) => {
  const committed = captureCommitted?.()
  if (!runMutation && !committed) return
  const operation = actionContext.capture()
  if (!operation) return
  const session = modalSession.captureSession()
  if (session === null || mutationPending || !pending.begin(session)) return
  try {
    let response: unknown
    try {
      const requestUrl = getClientRequestUrl(`/api/agency/${agencyId}/recommendation-sets/${recommendationSetupId}/items/create-schema`)
      const requestBody = JSON.stringify(event.data)
      const request = async () => {
        if (!modalSession.isCurrentSession(session) || !operation.canDispatch() || (committed && !committed.canDispatch())) return
        const response = await fetch(requestUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: requestBody
        })
        if (!response.ok) await throwFetchResponseError(response)
        return await response.json() as { schemaId: string }
      }
      response = runMutation ? await runMutation(request) : await request()
    } catch (error) {
      if (modalSession.isCurrentSession(session) && operation.isCurrent()) showError(error)
      return
    }
    if (response === undefined) return
    const readback = committed ? await committed.settle() : null
    if (readback?.kind === 'retired' || !modalSession.isCurrentSession(session) || !operation.isCurrent()) return
    const payload = response as { schemaId: string }
    open.value = false
    if (readback?.kind !== 'unavailable') emit('created', payload)
  } catch (error) {
    if (modalSession.isCurrentSession(session) && operation.isCurrent()) showError(error)
  } finally {
    pending.end(session)
  }
}
const formSession = useFormSession({ owner: modalSession, action: { kind: 'remote', context: () => actionContext }, submit: onSubmit })
</script>

<template>
  <UModal v-model:open="open" :title="t('transfer_payment.recommendation_schema_create')" data-field-scope="agency.recommendation-set-schema-create-modal">
    <template #body>
      <UForm v-if="state" v-bind="formSession" :state="state" :validate="validate">
        <fieldset :disabled="isSubmitting || mutationPending" class="space-y-4">
          <UFormField :label="t('common.order')" name="egcs_cn_order">
            <UInputNumber v-model="state.egcs_cn_order" :min="1" class="w-full" />
          </UFormField>
          <AdminCommonLookupField v-if="agencyId" v-model="state.egcs_cn_approvaltemplate" :label="t('transfer_payment.approval_template_id')" name="egcs_cn_approvaltemplate" :fetch-url="`/api/agency/${agencyId}/approval-templates`" :include-deleted-query="false" value-key="id" label-en-key="egcs_cn_name_en" label-fr-key="egcs_cn_name_fr" />
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
