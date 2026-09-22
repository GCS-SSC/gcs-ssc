<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- Modal-local event handlers are clear from their use. */
/* eslint-disable vue/no-mutating-props -- modal drafts update parent-owned reactive state */
import { computed, ref, watch } from 'vue'
import type { ApprovalLookupBehalfType, ApprovalStepItem, ReassignModalState } from './types'

const {
  state,
  step,
  entityType,
  entityId,
  userOptions,
  behalfTypeOptions,
  isSubmitting
} = defineProps<{
  state: ReassignModalState | null
  step: ApprovalStepItem | null
  entityType: string
  entityId: string
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
const assigneeKind = ref<'user' | 'group'>('user')
watch(() => step?.id, () => {
  assigneeKind.value = state?.egcs_cn_assignedgroup ? 'group' : 'user'
}, { immediate: true })
const chooseKind = (kind: 'user' | 'group') => {
  assigneeKind.value = kind
  if (!state) return
  state.egcs_cn_assigneduser = ''
  state.egcs_cn_assignedgroup = kind === 'group' ? '' : null
  state.egcs_cn_onbehalf = null
}
const selectedGroup = computed({
  get: () => state?.egcs_cn_assignedgroup ?? '',
  set: (value: string) => { if (state) state.egcs_cn_assignedgroup = value }
})
const assignedDiffersFromDefault = computed(() => (
  state !== null
  && step !== null
  && Boolean(step.egcs_cn_defaultuser)
  && (assigneeKind.value === 'group' || state.egcs_cn_assigneduser !== step.egcs_cn_defaultuser)
))
const canSubmit = computed(() => Boolean(state
  && (assigneeKind.value === 'group' ? state.egcs_cn_assignedgroup : state.egcs_cn_assigneduser)
  && (!assignedDiffersFromDefault.value || state.egcs_cn_onbehalf)))
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

        <UFormField :label="t('groups.assignee_type')" required>
          <USelect :model-value="assigneeKind" :items="[{ label: t('groups.user'), value: 'user' }, { label: t('groups.group'), value: 'group' }]" @update:model-value="value => chooseKind(value === 'group' ? 'group' : 'user')" />
        </UFormField>
        <UFormField v-if="assigneeKind === 'user'" :label="t('assessment.approvals.assigned_approver')" required>
          <CommonBilingualSelectMenu
            v-model="state.egcs_cn_assigneduser"
            :items="userOptions"
            value-key="id"
            label-key="name"
            :disabled="isSubmitting"
            searchable />
        </UFormField>
        <UFormField v-else :label="t('groups.group')" required>
          <CommonServerLookupSelect v-model="selectedGroup" fetch-url="/api/approvals/lookups/groups" value-key="id" label-en-key="egcs_cn_name_en" label-fr-key="egcs_cn_name_fr" :query="{ entityType, entityId }" />
        </UFormField>

        <UFormField
          v-if="assignedDiffersFromDefault"
          :label="t('assessment.approvals.on_behalf_type')"
          required>
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
            :disabled="isSubmitting || !canSubmit"
            @click="emit('submit')" />
        </div>
      </div>
    </template>
  </UModal>
</template>
