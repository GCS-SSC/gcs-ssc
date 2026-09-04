<script setup lang="ts">
/* eslint-disable jsdoc/require-param-description, jsdoc/require-returns -- legacy local callbacks remain concise during state isolation */
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { ActionModalState, ApprovalLookupBehalfType, ApprovalStepItem } from './types'

const {
  step,
  behalfTypeOptions,
  requiresActual,
  approveDisabled,
  denyDisabled,
  isSubmittingAction,
  defaultApproverDisplay,
  assignedApproverDisplay,
  assignedApproverPositionTitle
} = defineProps<{
  step: ApprovalStepItem | null
  behalfTypeOptions: ApprovalLookupBehalfType[]
  requiresActual: boolean
  approveDisabled: boolean
  denyDisabled: boolean
  isSubmittingAction: boolean
  defaultApproverDisplay: string
  assignedApproverDisplay: string
  assignedApproverPositionTitle: string
}>()

const state = defineModel<ActionModalState | null>('state', { required: true })
const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
  close: []
  submit: [decision: 'approve' | 'deny']
}>()

const { locale, t } = useI18n()
const denialAttempted: Ref<boolean> = ref(false)
watch(open, isOpen => {
  if (!isOpen) denialAttempted.value = false
})
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
    :dismissible="!isSubmittingAction"
    :title="t('assessment.approvals.action_step')"
    :description="t('assessment.approvals.action_step_description')">
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
              :disabled="isSubmittingAction"
              @update:model-value="value => updateCertification(certification.id, value === true)">
              <template #label>
                <span class="text-sm text-zinc-700 dark:text-zinc-200">
                  {{ getLocalizedText({ en: certification.egcs_cn_certification_en, fr: certification.egcs_cn_certification_fr }) }}
                </span>
              </template>
            </UCheckbox>
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
            :label="t('assessment.approvals.on_behalf_of_default_user')">
            <USwitch
              :model-value="state.isOnBehalf"
              :disabled="isSubmittingAction"
              @update:model-value="value => updateState('isOnBehalf', value === true)" />
          </UFormField>

          <UFormField
            v-if="state.isOnBehalf"
            :label="t('assessment.approvals.on_behalf_type')">
            <CommonBilingualSelectMenu
              :model-value="state.egcs_cn_onbehalf"
              :items="behalfTypeOptions"
              label-en-key="egcs_ay_name_en"
              label-fr-key="egcs_ay_name_fr"
              :disabled="isSubmittingAction"
              @update:model-value="value => updateState('egcs_cn_onbehalf', value === undefined ? null : value)" />
          </UFormField>

          <UFormField :label="t('assessment.approvals.position_title')">
            <UInput
              v-if="requiresActual"
              :model-value="state.egcs_cn_approvalpositiontitle"
              :disabled="isSubmittingAction"
              @update:model-value="value => updateState('egcs_cn_approvalpositiontitle', String(value))" />
            <UInput
              v-else
              :model-value="assignedApproverPositionTitle"
              readonly
              disabled />
          </UFormField>

          <UFormField
            v-if="requiresActual"
            :label="t('assessment.approvals.decision_date')">
            <UInput
              :model-value="state.egcs_cn_approvaldate"
              type="date"
              :disabled="isSubmittingAction"
              @update:model-value="value => updateState('egcs_cn_approvaldate', String(value))" />
          </UFormField>

          <UFormField
            :label="t('admin_common.fields.egcs_cn_comment')"
            :error="denialCommentError">
            <CommonTextarea
              :model-value="state.egcs_cn_comment"
              :rows="4"
              :disabled="isSubmittingAction"
              @update:model-value="value => updateState('egcs_cn_comment', value)" />
          </UFormField>
        </div>

        <div class="flex justify-end gap-3">
          <UButton
            color="neutral"
            variant="ghost"
            class="cursor-default"
            :disabled="isSubmittingAction"
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
