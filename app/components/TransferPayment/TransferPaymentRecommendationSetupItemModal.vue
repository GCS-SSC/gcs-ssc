<script setup lang="ts">
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

const { transferPaymentId, streamId, recommendationSetupId, mutationPending = false, runMutation } = defineProps<{
  transferPaymentId: string
  streamId: string
  recommendationSetupId: string
  agencyId?: string
  mutationPending?: boolean
  runMutation?: EditorMutationRunner
}>()

const { t } = useI18n()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()
const isSubmitting = ref(false)
const isUpdate = computed(() => Boolean(state.value?.id))
const validateCreate = createValidator(TransferPaymentStreamRecommendationSetupMemberCreateSchema)
const validatePatch = createValidator(TransferPaymentStreamRecommendationSetupMemberPatchSchema)
const validate = async (payload: z.infer<typeof TransferPaymentStreamRecommendationSetupMemberCreateSchema> | z.infer<typeof TransferPaymentStreamRecommendationSetupMemberPatchSchema>) => (
  isUpdate.value
    ? await validatePatch(payload as z.infer<typeof TransferPaymentStreamRecommendationSetupMemberPatchSchema>)
    : await validateCreate(payload as z.infer<typeof TransferPaymentStreamRecommendationSetupMemberCreateSchema>)
)
const modalTitle = computed(() => isUpdate.value
  ? t('transfer_payment.recommendation_setup_member_update')
  : t('transfer_payment.recommendation_setup_member_create'))
const submitLabel = computed(() => isUpdate.value ? t('common.update') : t('common.save'))
const recommendationSchemasUrl = computed(() =>
  `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/recommendation-schemas`
)
const approvalTemplateQuery = computed(() => ({
  scopeType: 'transferpaymentstream',
  scopeId: streamId
}))

const onSubmit = async (event: FormSubmitEvent<z.infer<typeof TransferPaymentStreamRecommendationSetupMemberCreateSchema> | z.infer<typeof TransferPaymentStreamRecommendationSetupMemberPatchSchema>>) => {
  if (isSubmitting.value || mutationPending) return
  try {
    isSubmitting.value = true
    const itemId = state.value?.id ? String(state.value.id) : null
    const baseUrl = `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/recommendation-setups/${recommendationSetupId}/items`
    const request = async () => {
      const response = await fetch(getClientRequestUrl(itemId ? `${baseUrl}/${itemId}` : baseUrl), {
        method: itemId ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(event.data)
      })
      if (!response.ok) await throwFetchResponseError(response)
      return true
    }
    const completed = runMutation ? await runMutation(request) : await request()
    if (completed === undefined) return
    open.value = false
    emit('saved')
  } catch (error) {
    showError(error)
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="modalTitle">
    <template #body>
      <UForm v-if="state" :state="state" :validate="validate" @submit="onSubmit">
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
            v-model="state.egcs_cn_approvaltemplate"
            :label="t('transfer_payment.approval_template_id')"
            name="egcs_cn_approvaltemplate"
            fetch-url="/api/approval-templates"
            value-key="id"
            label-en-key="egcs_cn_name_en"
            label-fr-key="egcs_cn_name_fr"
            :query="approvalTemplateQuery" />
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
