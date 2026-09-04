<script setup lang="ts">
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { buildApprovalTemplateModalSubmitRequest } from '~/utils/approval-template-modal'
/* eslint-disable jsdoc/require-jsdoc */
import { computed } from 'vue'
import {
  ApprovalTemplateSchema
} from '~~/shared/types/schemas'
import type {
  ApprovalTemplate,
  ApprovalTemplateScopeType
} from '~~/shared/types/schemas'
import type { CrudModalSession } from '~/composables/useCrudModal'
import { useCrudModalPending } from '~/composables/useCrudModal'

const emit = defineEmits<{ saved: [] }>()

const open = defineModel<boolean>('open', { default: false })
const state = defineModel<(ApprovalTemplate & { id?: string }) | null>('state', { required: true })

const {
  scopeType,
  scopeId,
  captureSession,
  closeSession
} = defineProps<{
  scopeType: ApprovalTemplateScopeType
  scopeId: string
  captureSession: () => CrudModalSession | null
  closeSession: (session: CrudModalSession | null) => boolean
}>()

const { t } = useI18n()
const { showError } = useApiErrorToast()
const { createValidator } = useZodI18n()
const pending = useCrudModalPending(captureSession)
const isSubmitting = pending.isPending
const validate = createValidator(ApprovalTemplateSchema)

const modalTitle = computed(() => state.value?.id ? t('common.edit') : t('common.add'))
const submitLabel = computed(() => state.value?.id ? t('common.update') : t('common.save'))

const onSubmit = async () => {
  if (!state.value) {
    return
  }
  const session = captureSession()
  if (!pending.begin(session)) return

  try {
    const request = buildApprovalTemplateModalSubmitRequest(state.value, scopeType, scopeId)
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
    if (closeSession(session)) {
      emit('saved')
    }
  } catch (error) {
    if (session !== null && captureSession() === session) {
      showError(error)
    }
  } finally {
    pending.end(session)
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="modalTitle">
    <template #body>
      <UForm v-if="state" :state="state" :validate="validate" class="space-y-4" @submit="onSubmit">
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
