<script setup lang="ts">
import { watch } from 'vue'
import type { ActionContext } from '~/composables/useActionContext'
import type { CaptureCommittedSettlement } from '~/composables/useCommittedSettlement'
import { useModalSession } from '~/composables/useModalSession'
import { useFormSession } from '~/composables/useFormSession'
import { useCrudModalPending } from '~/composables/useCrudModal'
import { withFormRequirements } from '~~/shared/utils/form-requirements'
/* eslint-disable jsdoc/require-jsdoc */
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import type { FormSubmitEvent } from '#ui/types'
import type { z } from 'zod'
import {
  TransferPaymentStreamRecommendationSetupMemberCreateSchema,
  TransferPaymentStreamRecommendationSetupMemberPatchSchema
} from '~~/shared/types/schemas'
import type { EditorMutationRunner } from '~/composables/useEditorMutationCoordinator'

const emit = defineEmits<{ saved: [] }>()
const open = defineModel<boolean>('open', { default: false })
type RecommendationSetupItemState = {
  id?: string
  egcs_cn_recommendationschema?: string
  egcs_cn_order?: number
  egcs_cn_approvaltemplate?: string
  egcs_cn_failonnotrecommended?: boolean
}
const state = defineModel<RecommendationSetupItemState | null>('state', { required: true })

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
const isUpdate = computed(() => Boolean(state.value?.id))
const validateCreate = createValidator(TransferPaymentStreamRecommendationSetupMemberCreateSchema)
const validatePatch = createValidator(TransferPaymentStreamRecommendationSetupMemberPatchSchema)
const validate = withFormRequirements(async (payload: z.infer<typeof TransferPaymentStreamRecommendationSetupMemberCreateSchema> | z.infer<typeof TransferPaymentStreamRecommendationSetupMemberPatchSchema>) => (
  isUpdate.value
    ? await validatePatch(payload as z.infer<typeof TransferPaymentStreamRecommendationSetupMemberPatchSchema>)
    : await validateCreate(payload as z.infer<typeof TransferPaymentStreamRecommendationSetupMemberCreateSchema>)
), TransferPaymentStreamRecommendationSetupMemberCreateSchema)

const modalTitle = computed(() => isUpdate.value
  ? t('transfer_payment.recommendation_setup_member_update')
  : t('transfer_payment.recommendation_setup_member_create'))
const submitLabel = computed(() => isUpdate.value ? t('common.update') : t('common.save'))
const recommendationSchemasUrl = computed(() =>
  `/api/agency/${agencyId}/recommendation-schemas`
)
const approvalTemplateFetchUrl = computed(() => agencyId ? `/api/agency/${agencyId}/approval-templates` : null)

const onSubmit = async (event: FormSubmitEvent<z.infer<typeof TransferPaymentStreamRecommendationSetupMemberCreateSchema> | z.infer<typeof TransferPaymentStreamRecommendationSetupMemberPatchSchema>>) => {
  const committed = captureCommitted?.()
  if (!runMutation && !committed) return
  const operation = actionContext.capture()
  if (!operation) return
  const session = modalSession.captureSession()
  if (session === null || mutationPending || !pending.begin(session)) return
  try {
    let completed: unknown
    try {
      const itemId = state.value?.id ? String(state.value.id) : null
      const baseUrl = `/api/agency/${agencyId}/recommendation-sets/${recommendationSetupId}/items`
      const requestUrl = getClientRequestUrl(itemId ? `${baseUrl}/${itemId}` : baseUrl)
      const requestBody = JSON.stringify(event.data)
      const request = async () => {
        if (!modalSession.isCurrentSession(session) || !operation.canDispatch() || (committed && !committed.canDispatch())) return
        const response = await fetch(requestUrl, {
          method: itemId ? 'PATCH' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: requestBody
        })
        if (!response.ok) await throwFetchResponseError(response)
        return true
      }
      completed = runMutation ? await runMutation(request) : await request()
    } catch (error) {
      if (modalSession.isCurrentSession(session) && operation.isCurrent()) showError(error)
      return
    }
    if (completed === undefined) return
    const readback = committed ? await committed.settle() : null
    if (readback?.kind === 'retired' || !modalSession.isCurrentSession(session) || !operation.isCurrent()) return
    open.value = false
    emit('saved')
  } finally {
    pending.end(session)
  }
}
const formSession = useFormSession({ owner: modalSession, action: { kind: 'remote', context: () => actionContext }, submit: onSubmit })
</script>

<template>
  <UModal v-model:open="open" :title="modalTitle" data-field-scope="agency.recommendation-set-item-modal">
    <template #body>
      <UForm v-if="state" v-bind="formSession" :state="state" :validate="validate">
        <fieldset :disabled="isSubmitting || mutationPending" class="space-y-4">
          <AdminCommonLookupField
            v-model="state.egcs_cn_recommendationschema"
            :label="t('transfer_payment.recommendation_schema')"
            name="egcs_cn_recommendationschema"
            :fetch-url="recommendationSchemasUrl"
            value-key="id"
            label-en-key="egcs_cn_name_en"
            label-fr-key="egcs_cn_name_fr" />
          <UFormField :label="t('common.order')" name="egcs_cn_order">
            <UInput v-model.number="state.egcs_cn_order" type="number" :min="1" />
          </UFormField>
          <AdminCommonLookupField
            v-if="approvalTemplateFetchUrl"
            v-model="state.egcs_cn_approvaltemplate"
            :label="t('transfer_payment.approval_template_id')"
            name="egcs_cn_approvaltemplate"
            :fetch-url="approvalTemplateFetchUrl" :include-deleted-query="false"
            value-key="id"
            label-en-key="egcs_cn_name_en"
            label-fr-key="egcs_cn_name_fr"
          />
          <UFormField
            :label="t('transfer_payment.fail_on_not_recommended')"
            :description="t('transfer_payment.fail_on_not_recommended_help')"
            name="egcs_cn_failonnotrecommended">
            <USwitch v-model="state.egcs_cn_failonnotrecommended" />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton :label="t('common.cancel')" color="neutral" variant="ghost" class="cursor-default" @click="open = false" />
            <CommonSaveButton :label="submitLabel" :loading="isSubmitting || mutationPending" :disabled="isSubmitting || mutationPending" />
          </div>
        </fieldset>
      </UForm>
    </template>
  </UModal>
</template>
