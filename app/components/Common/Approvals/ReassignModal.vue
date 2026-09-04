<script setup lang="ts">
/* eslint-disable vue/no-mutating-props -- modal drafts update parent-owned reactive state */
import { computed } from 'vue'
import type { ApprovalLookupBehalfType, ApprovalStepItem, ReassignModalState } from './types'

const {
  state,
  step,
  userOptions,
  behalfTypeOptions,
  isSubmitting
} = defineProps<{
  state: ReassignModalState | null
  step: ApprovalStepItem | null
  userOptions: Array<{ id: string, name: string }>
  behalfTypeOptions: ApprovalLookupBehalfType[]
  isSubmitting: boolean
}>()

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{
  close: []
  submit: []
}>()

const { t } = useI18n()
const assignedDiffersFromDefault = computed(() => (
  state !== null
  && step !== null
  && state.egcs_cn_assigneduser !== step.egcs_cn_defaultuser
))
</script>

<template>
  <UModal
    v-model:open="open"
    :dismissible="!isSubmitting"
    :title="t('assessment.approvals.reassign')"
    :description="t('assessment.approvals.reassign_description')">
    <template #content>
      <div
        v-if="state && step"
        class="space-y-6 p-6">
        <div class="space-y-1">
          <h3 class="text-lg font-semibold text-zinc-900 dark:text-white">
            {{ t('assessment.approvals.reassign') }}
          </h3>
          <p class="text-sm text-zinc-600 dark:text-zinc-300">
            {{ t('assessment.approvals.reassign_description') }}
          </p>
        </div>

        <UFormField :label="t('assessment.approvals.assigned_approver')">
          <CommonBilingualSelectMenu
            v-model="state.egcs_cn_assigneduser"
            :items="userOptions"
            value-key="id"
            label-key="name"
            :disabled="isSubmitting"
            searchable />
        </UFormField>

        <UFormField
          v-if="assignedDiffersFromDefault"
          :label="t('assessment.approvals.on_behalf_type')">
          <CommonBilingualSelectMenu
            v-model="state.egcs_cn_onbehalf"
            :items="behalfTypeOptions"
            :disabled="isSubmitting"
            label-en-key="egcs_ay_name_en"
            label-fr-key="egcs_ay_name_fr" />
        </UFormField>

        <div class="flex justify-end gap-3">
          <UButton color="neutral" variant="ghost" class="cursor-default" :disabled="isSubmitting" @click="emit('close')">
            {{ t('common.cancel') }}
          </UButton>
          <CommonSaveButton
            :label="t('assessment.approvals.reassign')"
            :loading="isSubmitting"
            :disabled="isSubmitting"
            @click="emit('submit')" />
        </div>
      </div>
    </template>
  </UModal>
</template>
