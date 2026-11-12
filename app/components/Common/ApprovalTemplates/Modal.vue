<script setup lang="ts">
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { buildApprovalTemplateModalSubmitRequest } from '~/utils/approval-template-modal'
/* eslint-disable jsdoc/require-jsdoc */
import { computed, watch } from 'vue'
import { useModalSession } from '~/composables/useModalSession'
import type { ActionContext } from '~/composables/useActionContext'
import type { CaptureCommittedSettlement } from '~/composables/useCommittedSettlement'
import { useFormSession } from '~/composables/useFormSession'
import {
  ApprovalTemplateSchema
} from '~~/shared/types/schemas'
import type { ApprovalTemplate } from '~~/shared/types/schemas'
import type { CrudModalSession } from '~/composables/useCrudModal'
import { useCrudModalPending } from '~/composables/useCrudModal'

const emit = defineEmits<{ saved: [] }>()

const open = defineModel<boolean>('open', { default: false })
const state = defineModel<(ApprovalTemplate & { id?: string }) | null>('state', { required: true })

const {
  actionContext,
  agencyId,
  captureSession,
  closeSession,
  captureCommitted
} = defineProps<{
  actionContext: ActionContext
  captureCommitted: CaptureCommittedSettlement
  agencyId: string
  captureSession: () => CrudModalSession | null
  closeSession: (session: CrudModalSession | null) => boolean
}>()

const { t } = useI18n()
const { showError } = useApiErrorToast()
const { createValidator } = useZodI18n()
const modalSession = useModalSession()
watch([() => open.value, () => state.value, () => agencyId, () => captureSession()], () => {
  modalSession.isOpen.value = false
  modalSession.isOpen.value = open.value && state.value !== null && captureSession() !== null
}, { immediate: true, flush: 'sync' })
const pending = useCrudModalPending(modalSession.captureSession)
const isSubmitting = pending.isPending
const validate = createValidator(ApprovalTemplateSchema)

const modalTitle = computed(() => state.value?.id ? t('common.edit') : t('common.add'))
const submitLabel = computed(() => state.value?.id ? t('common.update') : t('common.save'))

const onSubmit = async () => {
  if (!state.value) {
    return
  }
  const committed = captureCommitted()
  const operation = actionContext.capture()
  if (!committed || !operation) return
  const session = captureSession()
  const opening = modalSession.captureSession()
  if (session === null || opening === null || !pending.begin(opening)) return

  try {
    try {
      const request = buildApprovalTemplateModalSubmitRequest(state.value, agencyId)
      if (!committed.canDispatch() || !operation.canDispatch()) return
      const response = await fetch(getClientRequestUrl(request.url), {
        method: request.method,
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify(request.body)
      })
      if (!response.ok) {
        await throwFetchResponseError(response)
      }
    } catch (error) {
      if (operation.isCurrent() && modalSession.isCurrentSession(opening) && captureSession() === session) showError(error)
      return
    }
    const readback = await committed.settle()
    if (readback.kind !== 'retired' && operation.isCurrent() && modalSession.isCurrentSession(opening) && captureSession() === session && closeSession(session)) {
      emit('saved')
    }
  } finally {
    pending.end(opening)
  }
}
const formSession = useFormSession({ owner: modalSession, action: { kind: 'remote', context: () => actionContext }, submit: onSubmit })
</script>

<template>
  <UModal v-model:open="open" :title="modalTitle" :ui="{ content: 'sm:max-w-4xl' }" data-field-scope="common.approval-templates.modal">
    <template #body>
      <UForm v-if="state" v-bind="formSession" :state="state" :validate="validate" class="space-y-4">
        <UFormField :label="t('admin_common.fields.egcs_cn_name_en')" name="egcs_cn_name_en">
          <UInput v-model="state.egcs_cn_name_en" />
        </UFormField>
        <UFormField :label="t('admin_common.fields.egcs_cn_name_fr')" name="egcs_cn_name_fr">
          <UInput v-model="state.egcs_cn_name_fr" />
        </UFormField>
        <UFormField :label="t('admin_common.fields.egcs_cn_description_en')" name="egcs_cn_description_en">
          <CommonTextarea v-model="state.egcs_cn_description_en" :rows="3" />
        </UFormField>
        <UFormField :label="t('admin_common.fields.egcs_cn_description_fr')" name="egcs_cn_description_fr">
          <CommonTextarea v-model="state.egcs_cn_description_fr" :rows="3" />
        </UFormField>

        <CommonApprovalTemplatesAdditionalApprovalsFields v-model:state="state" compact />

        <div class="flex justify-end gap-2">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" class="cursor-default" @click="open = false" />
          <CommonSaveButton :label="submitLabel" :loading="isSubmitting" :disabled="isSubmitting" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
