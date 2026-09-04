<script setup lang="ts">
import { computed } from 'vue'
import { useBilingualValue } from '~/composables/useBilingualValue'
import type {
  AddApprovalModalState,
  AdditionalApprovalCertificationState,
  ApprovalRoutingSlipItem,
  ApprovalStepItem
} from './types'

const open = defineModel<boolean>('open', { default: false })
const state = defineModel<AddApprovalModalState | null>('state', { required: true })

const {
  entityType,
  entityId,
  anchorStep,
  routingSlip,
  isSubmitting
} = defineProps<{
  entityType: string
  entityId: string
  anchorStep: ApprovalStepItem | null
  routingSlip: ApprovalRoutingSlipItem | null
  isSubmitting: boolean
}>()

const emit = defineEmits<{
  close: []
  submit: []
  addCertification: []
  removeCertification: [index: number]
  moveCertification: [index: number, direction: -1 | 1]
}>()

const { t } = useI18n()
const { getBilingualValue } = useBilingualValue()

const canEditNames = computed(() => routingSlip?.allow_added_approval_name_changes === true)
const canEditCertifications = computed(() => routingSlip?.allow_added_approval_certification_changes === true)
const orderedCertifications = computed(() => state.value?.certifications ?? [])
const submitDisabled = computed(() => {
  if (!state.value) {
    return true
  }

  if (!state.value.egcs_cn_assigneduser || !state.value.egcs_cn_name_en.trim() || !state.value.egcs_cn_name_fr.trim()) {
    return true
  }

  return state.value.certifications.some(certification => (
    !certification.egcs_cn_name_en.trim()
    || !certification.egcs_cn_name_fr.trim()
    || !certification.egcs_cn_description_en.trim()
    || !certification.egcs_cn_description_fr.trim()
    || !certification.egcs_cn_certification_en.trim()
    || !certification.egcs_cn_certification_fr.trim()
  ))
})

const getCertificationLabel = (certification: AdditionalApprovalCertificationState, index: number) => {
  return getBilingualValue(certification, 'egcs_cn_name', t('assessment.approvals.certification_number', { number: index + 1 }))
}
</script>

<template>
  <UModal
    :open="open"
    :dismissible="!isSubmitting"
    :title="t('assessment.approvals.add_step_title')"
    :description="t('assessment.approvals.add_step_description')"
    @update:open="value => value ? (open = true) : emit('close')">
    <template #body>
      <UForm v-if="state && anchorStep && routingSlip" :state="state" class="space-y-6" @submit.prevent="emit('submit')">
        <div class="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/60">
          <p class="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
            {{ state.position === 'before' ? t('assessment.approvals.add_before') : t('assessment.approvals.add_after') }}
          </p>
          <CommonBilingualName
            :name-en="anchorStep.egcs_cn_name_en"
            :name-fr="anchorStep.egcs_cn_name_fr" />
        </div>

        <UFormField :label="t('assessment.approvals.assigned_approver')" name="egcs_cn_assigneduser" required>
          <CommonServerLookupSelect
            v-model="state.egcs_cn_assigneduser"
            :aria-label="t('assessment.approvals.assigned_approver')"
            fetch-url="/api/approvals/lookups/users"
            value-key="id"
            label-en-key="name"
            label-fr-key="name"
            :query="{ entityType, entityId }" />
        </UFormField>

        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <UFormField :label="t('admin_common.fields.egcs_cn_name_en')" name="egcs_cn_name_en" required>
            <UInput v-model="state.egcs_cn_name_en" :disabled="!canEditNames || isSubmitting" />
          </UFormField>
          <UFormField :label="t('admin_common.fields.egcs_cn_name_fr')" name="egcs_cn_name_fr" required>
            <UInput v-model="state.egcs_cn_name_fr" :disabled="!canEditNames || isSubmitting" />
          </UFormField>
        </div>

        <section class="space-y-3" aria-labelledby="additional-approval-certifications-heading">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h3 id="additional-approval-certifications-heading" class="font-semibold text-zinc-900 dark:text-white">
                {{ t('admin_common.resources.certifications') }}
              </h3>
              <p class="text-sm text-zinc-500 dark:text-zinc-400">
                {{ canEditCertifications
                  ? t('assessment.approvals.certifications_editable_help')
                  : t('assessment.approvals.certifications_fixed_help') }}
              </p>
            </div>
            <UButton
              v-if="canEditCertifications"
              type="button"
              icon="i-lucide-plus"
              color="neutral"
              variant="outline"
              class="cursor-default"
              :disabled="isSubmitting"
              :label="t('assessment.approvals.add_certification')"
              @click="emit('addCertification')" />
          </div>

          <p v-if="orderedCertifications.length === 0" class="rounded-lg border border-dashed border-zinc-300 px-4 py-5 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            {{ t('assessment.approvals.no_certifications') }}
          </p>

          <div
            v-for="(certification, index) in orderedCertifications"
            :key="certification._key"
            class="space-y-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div class="flex items-center justify-between gap-3">
              <span class="truncate text-sm font-medium text-zinc-700 dark:text-zinc-200">
                {{ getCertificationLabel(certification, index) }}
              </span>
              <div v-if="canEditCertifications" class="flex items-center gap-1">
                <UButton
                  type="button"
                  icon="i-lucide-arrow-up"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  class="cursor-default"
                  :disabled="index === 0 || isSubmitting"
                  :aria-label="t('assessment.approvals.move_certification_up')"
                  @click="emit('moveCertification', index, -1)" />
                <UButton
                  type="button"
                  icon="i-lucide-arrow-down"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  class="cursor-default"
                  :disabled="index === orderedCertifications.length - 1 || isSubmitting"
                  :aria-label="t('assessment.approvals.move_certification_down')"
                  @click="emit('moveCertification', index, 1)" />
                <UButton
                  type="button"
                  icon="i-lucide-trash"
                  color="error"
                  variant="ghost"
                  size="sm"
                  class="cursor-default"
                  :disabled="isSubmitting"
                  :aria-label="t('common.remove')"
                  @click="emit('removeCertification', index)" />
              </div>
            </div>

            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
              <UFormField :label="t('common.order')" :name="`certifications.${index}.egcs_cn_order`" required>
                <p class="py-2 text-sm tabular-nums text-zinc-700 dark:text-zinc-300">
                  {{ certification.egcs_cn_order }}
                </p>
              </UFormField>
              <UFormField :label="t('admin_common.fields.egcs_cn_optional')" :name="`certifications.${index}.egcs_cn_optional`">
                <USwitch v-model="certification.egcs_cn_optional" :disabled="!canEditCertifications || isSubmitting" />
              </UFormField>
              <UFormField :label="t('admin_common.fields.egcs_cn_name_en')" :name="`certifications.${index}.egcs_cn_name_en`" required>
                <UInput v-model="certification.egcs_cn_name_en" :disabled="!canEditCertifications || isSubmitting" />
              </UFormField>
              <UFormField :label="t('admin_common.fields.egcs_cn_name_fr')" :name="`certifications.${index}.egcs_cn_name_fr`" required>
                <UInput v-model="certification.egcs_cn_name_fr" :disabled="!canEditCertifications || isSubmitting" />
              </UFormField>
              <UFormField :label="t('admin_common.fields.egcs_cn_description_en')" :name="`certifications.${index}.egcs_cn_description_en`" required>
                <CommonTextarea v-model="certification.egcs_cn_description_en" :rows="2" :disabled="!canEditCertifications || isSubmitting" />
              </UFormField>
              <UFormField :label="t('admin_common.fields.egcs_cn_description_fr')" :name="`certifications.${index}.egcs_cn_description_fr`" required>
                <CommonTextarea v-model="certification.egcs_cn_description_fr" :rows="2" :disabled="!canEditCertifications || isSubmitting" />
              </UFormField>
            </div>

            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
              <UFormField :label="t('admin_common.fields.egcs_cn_certification_en')" :name="`certifications.${index}.egcs_cn_certification_en`" required>
                <CommonTextarea
                  v-model="certification.egcs_cn_certification_en"
                  :rows="3"
                  :disabled="!canEditCertifications || isSubmitting" />
              </UFormField>
              <UFormField :label="t('admin_common.fields.egcs_cn_certification_fr')" :name="`certifications.${index}.egcs_cn_certification_fr`" required>
                <CommonTextarea
                  v-model="certification.egcs_cn_certification_fr"
                  :rows="3"
                  :disabled="!canEditCertifications || isSubmitting" />
              </UFormField>
            </div>
          </div>
        </section>

        <div class="flex justify-end gap-2">
          <UButton
            type="button"
            color="neutral"
            variant="ghost"
            class="cursor-default"
            :disabled="isSubmitting"
            :label="t('common.cancel')"
            @click="emit('close')" />
          <CommonSaveButton
            type="button"
            :label="t('assessment.approvals.add_step')"
            :loading="isSubmitting"
            :disabled="submitDisabled || isSubmitting"
            @click="emit('submit')" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
