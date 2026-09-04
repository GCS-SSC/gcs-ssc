<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- local dialog presentation helpers are self-documenting */
import type { FundingHistorySimilarityWarning } from '~/types/funding-history'

const { warnings } = defineProps<{
  warnings: FundingHistorySimilarityWarning[]
}>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  confirm: []
  back: []
}>()

const { t, locale } = useI18n()

const bilingualLabel = (english?: string | null, french?: string | null): string => {
  const primary = locale.value === 'fr' ? french : english
  const secondary = locale.value === 'fr' ? english : french
  return primary || secondary || t('common.none')
}

const warningLabel = (warning: FundingHistorySimilarityWarning): string => {
  if (warning.restricted) {
    return t('applicant_recipient.funding_history.similarity.restricted_candidate')
  }

  return bilingualLabel(warning.labelEn, warning.labelFr)
}

const goBack = () => {
  open.value = false
  emit('back')
}

const confirm = () => {
  open.value = false
  emit('confirm')
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('applicant_recipient.funding_history.similarity.title')"
    :description="t('applicant_recipient.funding_history.similarity.description')"
    :dismissible="false">
    <template #body>
      <div class="space-y-4">
        <UAlert
          color="warning"
          variant="soft"
          icon="i-lucide-triangle-alert"
          :title="t('applicant_recipient.funding_history.similarity.notice')" />

        <ul class="divide-y divide-amber-200 overflow-hidden rounded-lg border border-amber-200 bg-amber-50/60 dark:divide-amber-900 dark:border-amber-900 dark:bg-amber-950/20">
          <li v-for="warning in warnings" :key="warning.fingerprint" class="flex items-start gap-3 p-4">
            <UIcon name="i-lucide-scan-search" class="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div class="min-w-0">
              <p class="text-xs font-bold tracking-wider text-amber-700 uppercase dark:text-amber-300">
                {{ t(`applicant_recipient.funding_history.similarity.kind.${warning.kind}`) }}
              </p>
              <p class="break-words font-medium text-zinc-900 dark:text-zinc-100">
                {{ warningLabel(warning) }}
              </p>
            </div>
          </li>
        </ul>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full flex-col-reverse justify-end gap-2 sm:flex-row">
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-arrow-left"
          :label="t('applicant_recipient.funding_history.similarity.go_back')"
          @click="goBack" />
        <UButton
          color="warning"
          icon="i-lucide-check-check"
          :label="t('applicant_recipient.funding_history.similarity.confirm')"
          @click="confirm" />
      </div>
    </template>
  </UModal>
</template>
