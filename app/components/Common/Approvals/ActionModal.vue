<script setup lang="ts">
/* eslint-disable jsdoc/require-param-description, jsdoc/require-returns -- legacy local callbacks remain concise during state isolation */
import { computed, ref, useId, watch } from 'vue'
import type { Ref } from 'vue'
import type { ActionModalState, ApprovalLookupBehalfType, ApprovalStepItem } from './types'
import type { ApprovalAttachments } from './attachments'
import CommonApprovalsAttachmentFiles from './AttachmentFiles.vue'

const {
  step,
  behalfTypeOptions,
  catalogChoicesLoading = false,
  catalogChoicesFailed = false,
  requiresActual,
  approveDisabled,
  denyDisabled,
  isSubmittingAction,
  showAttachments = false,
  attachmentOpening = '',
  attachmentCollection = null,
  attachmentStatus = 'idle',
  isWritingAttachments = false,
  defaultApproverDisplay,
  assignedApproverDisplay,
  assignedApproverPositionTitle
} = defineProps<{
  step: ApprovalStepItem | null
  behalfTypeOptions: ApprovalLookupBehalfType[]
  catalogChoicesLoading?: boolean
  catalogChoicesFailed?: boolean
  requiresActual: boolean
  approveDisabled: boolean
  denyDisabled: boolean
  isSubmittingAction: boolean
  showAttachments?: boolean
  attachmentOpening?: string
  attachmentCollection?: ApprovalAttachments | null
  attachmentStatus?: 'idle' | 'pending' | 'success' | 'error'
  isWritingAttachments?: boolean
  defaultApproverDisplay: string
  assignedApproverDisplay: string
  assignedApproverPositionTitle: string
}>()

const state = defineModel<ActionModalState | null>('state', { required: true })
const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
  'check-catalog': []
  'retry-attachments': []
  'upload-attachment': [input: { file: File; attachmentTypeId: string }]
  'remove-attachment': [attachmentId: string]
  'close': []
  'submit': [decision: 'approve' | 'deny']
}>()

const { locale, t } = useI18n()
const requirementHelpId = `approval-requirement-${useId()}`
const denialAttempted: Ref<boolean> = ref(false)
const attachmentTypeId: Ref<string | null | undefined> = ref(undefined)
watch(open, isOpen => {
  if (!isOpen) {
    denialAttempted.value = false
    attachmentTypeId.value = undefined
  }
})
watch(() => attachmentOpening, () => {
  attachmentTypeId.value = undefined
})
watch(() => attachmentCollection?.types, types => {
  if (types && !types.some(type => type.id === attachmentTypeId.value)) attachmentTypeId.value = undefined
})
const attachmentInputsDisabled = computed(() => isSubmittingAction || isWritingAttachments)

/** @param event - File input change event. */
const selectAttachmentFile = (event: Event) => {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) return
  const file = input.files?.item(0)
  const typeId = attachmentTypeId.value
  input.value = ''
  if (file && typeId && !attachmentInputsDisabled.value) {
    emit('upload-attachment', { file, attachmentTypeId: typeId })
  }
}
const denialCommentError = computed(() => denialAttempted.value && !state.value?.egcs_cn_comment.trim()
  ? t('validation.comment_required')
  : undefined)

/**
 *
 * @param key
 * @param value
 */
const updateState = <Key extends keyof ActionModalState>(key: Key, value: ActionModalState[Key]) => {
  if (!state.value || isSubmittingAction) {
    return
  }

  state.value = {
    ...state.value,
    [key]: value
  }
}

const approverNameModel = computed({
  get: () => state.value?.egcs_cn_approvername ?? '',
  set: value => updateState('egcs_cn_approvername', value)
})
const positionTitleModel = computed({
  get: () => state.value?.egcs_cn_approvalpositiontitle ?? '',
  set: value => updateState('egcs_cn_approvalpositiontitle', value)
})
const decisionDateModel = computed({
  get: () => state.value?.egcs_cn_approvaldate ?? '',
  set: value => updateState('egcs_cn_approvaldate', value)
})

/** Validates the denial comment before delegating submission to the approval section. */
const submitDenial = () => {
  denialAttempted.value = true
  if (!state.value?.egcs_cn_comment.trim()) {
    return
  }
  emit('submit', 'deny')
}

/**
 *
 * @param id
 * @param value
 */
const updateCertification = (id: string, value: boolean) => {
  if (!state.value) {
    return
  }

  updateState('certifications', state.value.certifications.map(certification => (
    certification.id === id
      ? {
          ...certification,
          egcs_cn_value: value
        }
      : certification
  )))
}

/**
 *
 * @param value
 * @param value.en
 * @param value.fr
 */
const getLocalizedText = (value: { en?: string, fr?: string }) => {
  return locale.value === 'fr'
    ? value.fr ?? value.en ?? ''
    : value.en ?? value.fr ?? ''
}
</script>

<template>
  <UModal
    v-model:open="open"
    :dismissible="!isSubmittingAction && !isWritingAttachments"
    :title="t('assessment.approvals.action_step')"
    :description="t('assessment.approvals.action_step_description')" data-field-exclude="Runtime approval actions are outside configurable field help.">
    <template #body>
      <div
        v-if="state && step"
        class="space-y-6">
        <div class="space-y-4">
          <div
            v-for="certification in state.certifications"
            :key="certification.id"
            class="rounded-md border border-zinc-200 px-3 py-3 dark:border-zinc-800">
            <UCheckbox
              :model-value="certification.egcs_cn_value"
              :aria-describedby="certification.egcs_cn_optional ? undefined : `${requirementHelpId}-${certification.id}`"
              :disabled="isSubmittingAction"
              @update:model-value="value => updateCertification(certification.id, value === true)">
              <template #label>
                <span class="text-sm text-zinc-700 dark:text-zinc-200">
                  {{ getLocalizedText({ en: certification.egcs_cn_certification_en, fr: certification.egcs_cn_certification_fr }) }}
                </span>
              </template>
            </UCheckbox>
            <p
              v-if="!certification.egcs_cn_optional"
              :id="`${requirementHelpId}-${certification.id}`"
              class="mt-1 text-sm text-muted">
              {{ t('assessment.approvals.certification_required_for_approval') }}
            </p>
          </div>

          <UFormField :label="t('assessment.approvals.default_approver')">
            <UInput
              :model-value="defaultApproverDisplay"
              readonly
              disabled />
          </UFormField>

          <UFormField :label="t('assessment.approvals.assigned_approver')">
            <UInput
              :model-value="assignedApproverDisplay"
              readonly
              disabled />
          </UFormField>

          <UFormField
            v-if="state.assignedDiffersFromDefault"
            :label="t('assessment.approvals.on_behalf_type')"
            required>
            <CommonBilingualSelectMenu
              :model-value="state.egcs_cn_onbehalf"
              :items="behalfTypeOptions"
              label-en-key="egcs_ay_name_en"
              label-fr-key="egcs_ay_name_fr"
              :disabled="isSubmittingAction || catalogChoicesLoading || catalogChoicesFailed"
              required
              aria-required="true"
              @update:open="(value: boolean) => value && emit('check-catalog')"
              @update:model-value="value => updateState('egcs_cn_onbehalf', value === undefined ? null : value)" />
          </UFormField>
          <CommonErrorNotice v-if="catalogChoicesFailed" :title="t('common.lookup_load_failed')">
            <template #actions>
              <UButton :label="t('common.retry')" @click="emit('check-catalog')" />
            </template>
          </CommonErrorNotice>

          <UFormField v-if="requiresActual" :label="t('assessment.approvals.approver_name')" name="egcs_cn_approvername" required>
            <UInput v-model="approverNameModel" name="egcs_cn_approvername" :disabled="isSubmittingAction" required aria-required="true" />
          </UFormField>

          <UFormField :label="t('assessment.approvals.position_title')" name="egcs_cn_approvalpositiontitle" :required="requiresActual">
            <UInput
              v-if="requiresActual"
              v-model="positionTitleModel"
              name="egcs_cn_approvalpositiontitle"
              :disabled="isSubmittingAction"
              required
              aria-required="true" />
            <UInput
              v-else
              :model-value="assignedApproverPositionTitle"
              readonly
              disabled />
          </UFormField>

          <UFormField
            v-if="requiresActual"
            :label="t('assessment.approvals.decision_date')"
            required>
            <UInput
              v-model="decisionDateModel"
              type="date"
              :disabled="isSubmittingAction"
              required
              aria-required="true" />
          </UFormField>

          <UFormField
            :label="t('admin_common.fields.egcs_cn_comment')"
            :error="denialCommentError"
            :help="t('assessment.approvals.comment_required_for_denial')">
            <CommonTextarea
              :model-value="state.egcs_cn_comment"
              :rows="4"
              :disabled="isSubmittingAction"
              @update:model-value="value => updateState('egcs_cn_comment', value)" />
          </UFormField>
        </div>

        <div v-if="showAttachments" :key="attachmentOpening" class="space-y-3 border-t border-default pt-4">
          <h3 class="text-sm font-semibold">
            {{ t('attachments.title') }}
          </h3>
          <div v-if="isWritingAttachments || attachmentStatus === 'pending'" role="status" class="text-sm text-muted">
            {{ t('common.loading') }}
          </div>
          <CommonErrorNotice v-if="attachmentStatus === 'error'" :title="t('attachments.load_failed')">
            <template #actions>
              <UButton type="button" :label="t('common.retry')" @click="emit('retry-attachments')" />
            </template>
          </CommonErrorNotice>
          <UAlert
            v-if="attachmentStatus === 'idle' || attachmentCollection?.canUpload === false"
            color="warning"
            :title="t('assessment.approvals.attachment_draft_unavailable')" />
          <template v-if="attachmentCollection">
            <CommonApprovalsAttachmentFiles
              v-if="attachmentCollection.items.length"
              :approval-id="step.id"
              :items="attachmentCollection.items"
              :can-remove="attachmentCollection.canUpload"
              :disabled="attachmentInputsDisabled"
              @remove="emit('remove-attachment', $event)" />
            <template v-if="attachmentCollection.canUpload">
              <div v-if="attachmentCollection.types.length" class="space-y-3">
                <p class="text-sm text-muted">
                  {{ t('assessment.approvals.attachment_draft_help') }}
                </p>
                <UFormField name="attachmentTypeId" :label="t('attachments.type')">
                  <CommonBilingualSelectMenu
                    v-model="attachmentTypeId"
                    :items="attachmentCollection.types"
                    label-en-key="nameEn"
                    label-fr-key="nameFr"
                    :disabled="attachmentInputsDisabled" />
                </UFormField>
                <UFormField
                  name="file"
                  :label="t('attachments.upload')"
                  :help="attachmentTypeId ? undefined : t('assessment.approvals.attachment_type_first')">
                  <UInput
                    type="file"
                    class="w-full"
                    :disabled="attachmentInputsDisabled || !attachmentTypeId"
                    @change="selectAttachmentFile" />
                </UFormField>
              </div>
              <UAlert
                v-else
                color="warning"
                :title="t('assessment.approvals.attachment_types_unavailable')" />
            </template>
          </template>
        </div>

        <div class="flex justify-end gap-3">
          <UButton
            color="neutral"
            variant="ghost"
            class="cursor-default"
            :disabled="isSubmittingAction || isWritingAttachments"
            @click="emit('close')">
            {{ t('common.cancel') }}
          </UButton>
          <UButton
            color="error"
            class="cursor-default"
            :disabled="denyDisabled || isSubmittingAction"
            :loading="isSubmittingAction"
            @click="submitDenial">
            {{ t('assessment.approvals.deny') }}
          </UButton>
          <UButton
            color="primary"
            class="cursor-default"
            :disabled="approveDisabled || isSubmittingAction"
            :loading="isSubmittingAction"
            @click="emit('submit', 'approve')">
            {{ t('assessment.approvals.approve') }}
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
