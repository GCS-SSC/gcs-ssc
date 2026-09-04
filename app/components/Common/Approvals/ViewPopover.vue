<script setup lang="ts">
import { computed } from 'vue'
import type { ApprovalStepItem } from './types'

const {
  step,
  runtimeState
} = defineProps<{
  step: ApprovalStepItem
  runtimeState: ApprovalStepItem['runtimeState']
}>()

const { t, locale } = useI18n()
const { formatDate } = useDateHelpers()

/**
 * Resolves bilingual approval text using the active locale with fallback.
 *
 * @param value - Bilingual approval text object.
 * @param value.en - English text.
 * @param value.fr - French text.
 * @returns Localized text string.
 */
const getLocalizedText = (value: { en?: string, fr?: string }) => {
  return locale.value === 'fr'
    ? value.fr ?? value.en ?? ''
    : value.en ?? value.fr ?? ''
}

const defaultApproverDisplay = computed(() => `${step.egcs_cn_defaultuser}: ${step.default_user_name}`)
const assignedApproverDisplay = computed(() => {
  const assignedUserId = step.egcs_cn_assigneduser ?? step.egcs_cn_defaultuser
  const assignedUserName = step.assigned_user_name || step.default_user_name
  return `${assignedUserId}: ${assignedUserName}`
})
const onBehalfTypeDisplay = computed(() => {
  if (!step.egcs_cn_onbehalf) {
    return t('common.none')
  }

  return getLocalizedText({
    en: step.onbehalf_name_en,
    fr: step.onbehalf_name_fr
  }) || t('common.none')
})
const decisionDateDisplay = computed(() => step.egcs_cn_approvaldate ? formatDate(step.egcs_cn_approvaldate) : t('common.none'))
const positionTitleDisplay = computed(() => step.egcs_cn_approvalpositiontitle || step.assigned_user_position_title || step.default_user_position_title || t('common.none'))
const commentDisplay = computed(() => step.egcs_cn_comment || t('assessment.approvals.no_comment'))
/**
 * Maps stored certification decisions to badge presentation.
 *
 * @param value - Stored certification decision.
 * @returns Badge variant and localized label.
 */
const certificationStatus = (value: boolean | null) => {
  if (value === true) {
    return {
      variant: 'true',
      label: t('common.yes')
    }
  }

  if (value === false) {
    return {
      variant: 'disabled',
      label: t('common.no')
    }
  }

  return {
    variant: 'certification',
    label: t('common.none')
  }
}
</script>

<template>
  <UPopover>
    <UButton
      icon="i-lucide-eye"
      color="neutral"
      variant="ghost"
      size="sm"
      class="cursor-default"
      :aria-label="t('assessment.approvals.view')" />

    <template #content>
      <div class="max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-[26rem] space-y-4 overflow-y-auto overscroll-contain p-4">
        <div class="space-y-1">
          <h4 class="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {{ t('assessment.approvals.details_title') }}
          </h4>
          <div class="text-sm text-zinc-700 dark:text-zinc-200">
            <CommonBilingualName
              :name-en="step.egcs_cn_name_en"
              :name-fr="step.egcs_cn_name_fr" />
          </div>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-1">
            <div class="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              {{ t('transfer_payment.name_en') }}
            </div>
            <p class="text-sm text-zinc-900 dark:text-zinc-50">
              {{ step.egcs_cn_name_en }}
            </p>
          </div>

          <div class="space-y-1">
            <div class="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              {{ t('transfer_payment.name_fr') }}
            </div>
            <p class="text-sm text-zinc-900 dark:text-zinc-50">
              {{ step.egcs_cn_name_fr }}
            </p>
          </div>

          <div class="space-y-1">
            <div class="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              {{ t('assessment.approvals.default_approver') }}
            </div>
            <p class="text-sm text-zinc-900 dark:text-zinc-50">
              {{ defaultApproverDisplay }}
            </p>
          </div>

          <div class="space-y-1">
            <div class="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              {{ t('assessment.approvals.assigned_approver') }}
            </div>
            <p class="text-sm text-zinc-900 dark:text-zinc-50">
              {{ assignedApproverDisplay }}
            </p>
          </div>

          <div class="space-y-1">
            <div class="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              {{ t('common.status') }}
            </div>
            <CommonLifecycleBadge engine="runtime" :state="runtimeState" />
          </div>

          <div class="space-y-1">
            <div class="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              {{ t('assessment.approvals.decision_date') }}
            </div>
            <p class="text-sm text-zinc-900 dark:text-zinc-50">
              {{ decisionDateDisplay }}
            </p>
          </div>

          <div class="space-y-1">
            <div class="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              {{ t('assessment.approvals.position_title') }}
            </div>
            <p class="text-sm text-zinc-900 dark:text-zinc-50">
              {{ positionTitleDisplay }}
            </p>
          </div>

          <div class="space-y-1">
            <div class="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              {{ t('assessment.approvals.on_behalf_type') }}
            </div>
            <p class="text-sm text-zinc-900 dark:text-zinc-50">
              {{ onBehalfTypeDisplay }}
            </p>
          </div>
        </div>

        <div class="space-y-1">
          <div class="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
            {{ t('admin_common.fields.egcs_cn_comment') }}
          </div>
          <p class="text-sm whitespace-pre-wrap text-zinc-900 dark:text-zinc-50">
            {{ commentDisplay }}
          </p>
        </div>

        <div class="space-y-2">
          <div class="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
            {{ t('admin_common.tabs.approval_certifications') }}
          </div>

          <div
            v-for="certification in step.certifications"
            :key="certification.id"
            class="rounded-md border border-zinc-200 px-3 py-3 dark:border-zinc-800">
            <div class="text-sm text-zinc-900 dark:text-zinc-50">
              {{ getLocalizedText({ en: certification.egcs_cn_certification_en, fr: certification.egcs_cn_certification_fr }) }}
            </div>

            <div class="mt-2">
              <CommonStatusBadge
                size="sm"
                :variant="certificationStatus(certification.egcs_cn_value).variant"
                :label="certificationStatus(certification.egcs_cn_value).label" />
            </div>
          </div>
        </div>
      </div>
    </template>
  </UPopover>
</template>
