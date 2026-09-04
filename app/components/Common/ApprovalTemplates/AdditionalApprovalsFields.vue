<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- concise editor mutations are local to this configuration form */
import type { AdditionalApprovalCertification } from '~~/shared/types/schemas'
import { createAdditionalApprovalCertificationEditor } from '~/utils/approval-template-editor-additional-certifications'

type AdditionalApprovalPolicyEditorState = {
  egcs_cn_allowadditionalapprovals: boolean
  egcs_cn_defaultaddedapprovalname_en?: string
  egcs_cn_defaultaddedapprovalname_fr?: string
  egcs_cn_allowaddedapprovalnamechanges: boolean
  egcs_cn_allowaddedapprovalcertificationchanges: boolean
  additionalApprovalCertifications: Array<AdditionalApprovalCertification & { id?: string, _key?: string }>
}

const state = defineModel<AdditionalApprovalPolicyEditorState>('state', { required: true })
const { compact = false } = defineProps<{ compact?: boolean }>()

const { t } = useI18n()

const addCertification = () => {
  const nextOrder = state.value.additionalApprovalCertifications.length + 1
  state.value.additionalApprovalCertifications.push(createAdditionalApprovalCertificationEditor({
    egcs_cn_order: nextOrder,
    egcs_cn_optional: false
  }))
}

const removeCertification = (index: number) => {
  state.value.additionalApprovalCertifications.splice(index, 1)
  state.value.additionalApprovalCertifications.forEach((certification, certificationIndex) => {
    certification.egcs_cn_order = certificationIndex + 1
  })
}

const moveCertification = (index: number, direction: -1 | 1) => {
  const targetIndex = index + direction
  if (targetIndex < 0 || targetIndex >= state.value.additionalApprovalCertifications.length) {
    return
  }

  const [certification] = state.value.additionalApprovalCertifications.splice(index, 1)
  if (!certification) {
    return
  }
  state.value.additionalApprovalCertifications.splice(targetIndex, 0, certification)
  state.value.additionalApprovalCertifications.forEach((item, certificationIndex) => {
    item.egcs_cn_order = certificationIndex + 1
  })
}
</script>

<template>
  <div v-if="state" class="space-y-6">
    <div class="flex items-start justify-between gap-6 rounded-lg border border-zinc-200 px-4 py-4 dark:border-zinc-800">
      <div class="space-y-1">
        <p class="font-medium text-zinc-900 dark:text-white">
          {{ t('approval_templates.additional_approvals.allow') }}
        </p>
        <p class="max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
          {{ t('approval_templates.additional_approvals.allow_help') }}
        </p>
      </div>
      <USwitch v-model="state.egcs_cn_allowadditionalapprovals" />
    </div>

    <div v-if="state.egcs_cn_allowadditionalapprovals" class="space-y-6">
      <div :class="compact ? 'space-y-4' : 'grid grid-cols-1 gap-6 md:grid-cols-2'">
        <UFormField
          :label="t('approval_templates.additional_approvals.default_name_en')"
          name="egcs_cn_defaultaddedapprovalname_en"
          required>
          <UInput v-model="state.egcs_cn_defaultaddedapprovalname_en" />
        </UFormField>
        <UFormField
          :label="t('approval_templates.additional_approvals.default_name_fr')"
          name="egcs_cn_defaultaddedapprovalname_fr"
          required>
          <UInput v-model="state.egcs_cn_defaultaddedapprovalname_fr" />
        </UFormField>
      </div>

      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label class="flex items-start justify-between gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <span>
            <span class="block font-medium text-zinc-900 dark:text-white">
              {{ t('approval_templates.additional_approvals.allow_name_changes') }}
            </span>
            <span class="mt-1 block text-sm text-zinc-500 dark:text-zinc-400">
              {{ t('approval_templates.additional_approvals.allow_name_changes_help') }}
            </span>
          </span>
          <USwitch v-model="state.egcs_cn_allowaddedapprovalnamechanges" />
        </label>
        <label class="flex items-start justify-between gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <span>
            <span class="block font-medium text-zinc-900 dark:text-white">
              {{ t('approval_templates.additional_approvals.allow_certification_changes') }}
            </span>
            <span class="mt-1 block text-sm text-zinc-500 dark:text-zinc-400">
              {{ t('approval_templates.additional_approvals.allow_certification_changes_help') }}
            </span>
          </span>
          <USwitch v-model="state.egcs_cn_allowaddedapprovalcertificationchanges" />
        </label>
      </div>

      <section class="space-y-4" aria-labelledby="template-additional-certifications-heading">
        <div class="flex items-center justify-between gap-4">
          <div>
            <h3 id="template-additional-certifications-heading" class="font-semibold text-zinc-900 dark:text-white">
              {{ t('approval_templates.additional_approvals.default_certifications') }}
            </h3>
            <p class="text-sm text-zinc-500 dark:text-zinc-400">
              {{ t('approval_templates.additional_approvals.default_certifications_help') }}
            </p>
          </div>
          <UButton
            type="button"
            icon="i-lucide-plus"
            color="neutral"
            variant="outline"
            class="cursor-default"
            :label="t('assessment.approvals.add_certification')"
            @click="addCertification" />
        </div>

        <p
          v-if="state.additionalApprovalCertifications.length === 0"
          class="rounded-lg border border-dashed border-zinc-300 px-4 py-5 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          {{ t('approval_templates.additional_approvals.no_default_certifications') }}
        </p>

        <div
          v-for="(certification, index) in state.additionalApprovalCertifications"
          :key="certification._key || certification.id"
          class="space-y-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <div class="flex items-center justify-between gap-3">
            <span class="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              {{ t('assessment.approvals.certification_number', { number: index + 1 }) }}
            </span>
            <div class="flex items-center gap-1">
              <UButton
                type="button"
                icon="i-lucide-arrow-up"
                color="neutral"
                variant="ghost"
                size="sm"
                class="cursor-default"
                :disabled="index === 0"
                :aria-label="t('assessment.approvals.move_certification_up')"
                @click="moveCertification(index, -1)" />
              <UButton
                type="button"
                icon="i-lucide-arrow-down"
                color="neutral"
                variant="ghost"
                size="sm"
                class="cursor-default"
                :disabled="index === state.additionalApprovalCertifications.length - 1"
                :aria-label="t('assessment.approvals.move_certification_down')"
                @click="moveCertification(index, 1)" />
              <UButton
                type="button"
                icon="i-lucide-trash"
                color="error"
                variant="ghost"
                size="sm"
                class="cursor-default"
                :aria-label="t('common.remove')"
                @click="removeCertification(index)" />
            </div>
          </div>

          <div :class="compact ? 'space-y-4' : 'grid grid-cols-1 gap-4 md:grid-cols-2'">
            <UFormField :label="t('common.order')" :name="`additionalApprovalCertifications.${index}.egcs_cn_order`" required>
              <p class="py-2 text-sm tabular-nums text-zinc-700 dark:text-zinc-300">
                {{ certification.egcs_cn_order }}
              </p>
            </UFormField>
            <UFormField
              :label="t('admin_common.fields.egcs_cn_optional')"
              :name="`additionalApprovalCertifications.${index}.egcs_cn_optional`">
              <USwitch v-model="certification.egcs_cn_optional" />
            </UFormField>
            <UFormField :label="t('admin_common.fields.egcs_cn_name_en')" :name="`additionalApprovalCertifications.${index}.egcs_cn_name_en`" required>
              <UInput v-model="certification.egcs_cn_name_en" />
            </UFormField>
            <UFormField :label="t('admin_common.fields.egcs_cn_name_fr')" :name="`additionalApprovalCertifications.${index}.egcs_cn_name_fr`" required>
              <UInput v-model="certification.egcs_cn_name_fr" />
            </UFormField>
            <UFormField :label="t('admin_common.fields.egcs_cn_description_en')" :name="`additionalApprovalCertifications.${index}.egcs_cn_description_en`" required>
              <CommonTextarea v-model="certification.egcs_cn_description_en" :rows="2" />
            </UFormField>
            <UFormField :label="t('admin_common.fields.egcs_cn_description_fr')" :name="`additionalApprovalCertifications.${index}.egcs_cn_description_fr`" required>
              <CommonTextarea v-model="certification.egcs_cn_description_fr" :rows="2" />
            </UFormField>
          </div>

          <div :class="compact ? 'space-y-4' : 'grid grid-cols-1 gap-4 md:grid-cols-2'">
            <UFormField
              :label="t('admin_common.fields.egcs_cn_certification_en')"
              :name="`additionalApprovalCertifications.${index}.egcs_cn_certification_en`"
              required>
              <CommonTextarea v-model="certification.egcs_cn_certification_en" :rows="3" />
            </UFormField>
            <UFormField
              :label="t('admin_common.fields.egcs_cn_certification_fr')"
              :name="`additionalApprovalCertifications.${index}.egcs_cn_certification_fr`"
              required>
              <CommonTextarea v-model="certification.egcs_cn_certification_fr" :rows="3" />
            </UFormField>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
