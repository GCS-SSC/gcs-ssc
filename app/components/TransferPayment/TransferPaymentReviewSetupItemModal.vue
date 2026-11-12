<script setup lang="ts">
import { watch } from 'vue'
import { useModalSession } from '~/composables/useModalSession'
import { useFormSession } from '~/composables/useFormSession'
import type { ActionContext } from '~/composables/useActionContext'
import type { CaptureCommittedSettlement } from '~/composables/useCommittedSettlement'
import { useCrudModalPending } from '~/composables/useCrudModal'
import { withFormRequirements } from '~~/shared/utils/form-requirements'
/* eslint-disable jsdoc/require-jsdoc -- request closure is local to the coordinated submit */
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import type { FormSubmitEvent } from '#ui/types'
import type { z } from 'zod'
import {
  TransferPaymentStreamReviewSetupMemberCreateSchema,
  TransferPaymentStreamReviewSetupMemberPatchSchema
} from '~~/shared/types/schemas'
import type { EditorMutationRunner } from '~/composables/useEditorMutationCoordinator'

const emit = defineEmits<{ saved: [] }>()

const open = defineModel<boolean>('open', { default: false })
type ReviewSetupMemberState = Partial<z.input<typeof TransferPaymentStreamReviewSetupMemberCreateSchema>> & {
  id?: string
  egcs_cn_reviewtype?: 'assessment' | 'checklist'
  egcs_cn_failonchecklistfailure?: boolean
  egcs_cn_failurethreshold?: number | null
}
const state = defineModel<ReviewSetupMemberState | null>('state', { required: true })

const {
  reviewSetupId,
  agencyId,
  entityType,
  mutationPending = false,
  runMutation,
  captureCommitted,
  actionContext
} = defineProps<{
  reviewSetupId: string
  agencyId: string
  entityType: string
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
const isUpdate = computed(() => Boolean(state.value?.id))
const validateCreate = createValidator(TransferPaymentStreamReviewSetupMemberCreateSchema)
const validatePatch = createValidator(TransferPaymentStreamReviewSetupMemberPatchSchema)
const getEditablePayload = (payload: ReviewSetupMemberState) => ({
  egcs_cn_reviewschema: payload.egcs_cn_reviewschema,
  egcs_cn_order: payload.egcs_cn_order,
  egcs_cn_approvaltemplate: payload.egcs_cn_approvaltemplate,
  egcs_cn_defaultgroup: payload.egcs_cn_defaultgroup,
  egcs_cn_failonchecklistfailure: payload.egcs_cn_failonchecklistfailure,
  egcs_cn_failurethreshold: payload.egcs_cn_failurethreshold
})
/**
 * Applies the correct validator for create versus update flows.
 *
 * @param payload - Review-setup member form payload from the modal.
 * @returns Validation issues from the active schema validator.
 */
const validate = withFormRequirements(async (
  payload:
    | z.infer<typeof TransferPaymentStreamReviewSetupMemberCreateSchema>
    | z.infer<typeof TransferPaymentStreamReviewSetupMemberPatchSchema>
) => {
  const editablePayload = getEditablePayload(payload)
  if (isUpdate.value) {
    return await validatePatch(editablePayload)
  }

  return await validateCreate(editablePayload)
}, TransferPaymentStreamReviewSetupMemberCreateSchema)

const modalTitle = computed(() => (
  isUpdate.value ? t('transfer_payment.review_setup_member_update') : t('transfer_payment.review_setup_member_create')
))
const submitLabel = computed(() => (isUpdate.value ? t('common.update') : t('common.save')))
const selectedGroup = computed({
  get: (): string => typeof state.value?.egcs_cn_defaultgroup === 'string' ? state.value.egcs_cn_defaultgroup : '',
  set: (value: string) => { if (state.value) state.value.egcs_cn_defaultgroup = value || null }
})

/**
 * Persists editable review-setup member fields for the selected stream-scoped review set.
 *
 * @param event - Validated review-setup member patch payload from the modal form.
 */
const onSubmit = async (
  event: FormSubmitEvent<
    z.infer<typeof TransferPaymentStreamReviewSetupMemberCreateSchema> |
    z.infer<typeof TransferPaymentStreamReviewSetupMemberPatchSchema>
  >
) => {
  const session = modalSession.captureSession()
  const committed = captureCommitted?.()
  if (!runMutation && !committed) return
  const operation = actionContext.capture()
  if (session === null || !operation || mutationPending || !pending.begin(session)) return
  const isCurrent = () => modalSession.isCurrentSession(session) && operation.isCurrent()

  try {
    let completed: unknown
    try {
      const itemId = state.value?.id ? String(state.value.id) : null
      const body = getEditablePayload(event.data)

      const requestUrl = getClientRequestUrl(itemId
        ? `/api/agency/${agencyId}/review-sets/${reviewSetupId}/items/${itemId}`
        : `/api/agency/${agencyId}/review-sets/${reviewSetupId}/items`)
      const requestBody = JSON.stringify(body)
      const request = async () => {
        if (!isCurrent() || !operation.canDispatch() || (committed && !committed.canDispatch())) return
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
    if (readback?.kind === 'retired' || !isCurrent()) return

    open.value = false
    emit('saved')
  } finally {
    pending.end(session)
  }
}
const formSession = useFormSession({ owner: modalSession, action: { kind: 'remote', context: () => actionContext }, submit: onSubmit })
</script>

<template>
  <UModal v-model:open="open" :title="modalTitle" data-field-scope="transfer-payment.review-setup-item-modal">
    <template #body>
      <UForm v-if="state" v-bind="formSession" :state="state" :validate="validate">
        <fieldset :disabled="isSubmitting || mutationPending" class="space-y-4">
          <ReviewAssessmentSetItemFields
            v-model:state="state"
            :agency-id="agencyId"
            :entity-type="entityType"
            :review-type="typeof state.egcs_cn_reviewtype === 'string' ? state.egcs_cn_reviewtype : undefined"
            stacked-layout />
          <UFormField :label="t('groups.group')" name="egcs_cn_defaultgroup">
            <CommonServerLookupSelect
              v-model="selectedGroup"
              :fetch-url="`/api/agency/${agencyId}/review-sets/${reviewSetupId}/groups`"
              value-key="id"
              label-en-key="egcs_cn_name_en"
              label-fr-key="egcs_cn_name_fr" />
          </UFormField>
          <UFormField
            v-if="state.egcs_cn_reviewtype === 'checklist'"
            :label="t('transfer_payment.fail_on_checklist_failure')"
            :description="t('transfer_payment.fail_on_checklist_failure_help')"
            name="egcs_cn_failonchecklistfailure">
            <USwitch v-model="state.egcs_cn_failonchecklistfailure" />
          </UFormField>
          <UFormField
            v-else-if="state.egcs_cn_reviewtype === 'assessment'"
            :label="t('transfer_payment.assessment_failure_threshold')"
            :description="t('transfer_payment.assessment_failure_threshold_help')"
            name="egcs_cn_failurethreshold">
            <UInputNumber v-model="state.egcs_cn_failurethreshold" :step="0.01" class="w-full" :placeholder="t('transfer_payment.assessment_failure_threshold_placeholder')" />
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
