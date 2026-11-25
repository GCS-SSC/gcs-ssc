<script setup lang="ts">
import { claimCustomFieldAnswerLabel } from '~/utils/agreement-submission-view'
import type { ClaimCustomFieldSnapshot } from '~~/shared/types/schemas/agreement-custom-fields'

type Value = Exclude<ClaimCustomFieldSnapshot[number]['value'], { rows: unknown }>
const { value, previous, format, added = false } = defineProps<{ value?: Value; previous?: Value; format?: 'decimal'; added?: boolean }>()
const { t, locale } = useI18n()
</script>

<template>
  <ins v-if="added && value != null" class="font-medium text-emerald-800 no-underline dark:text-emerald-200">
    <span class="sr-only">{{ t('submission.after') }} </span>
    <AgreementSubmissionValue :value="claimCustomFieldAnswerLabel(value, locale, format)" />
  </ins>
  <div v-else-if="previous !== undefined" class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
    <del class="text-red-800 dark:text-red-200">
      <span class="sr-only">{{ t('submission.before') }} </span>
      <AgreementSubmissionValue :value="claimCustomFieldAnswerLabel(previous, locale, format)" />
    </del>
    <ins v-if="value !== undefined" class="font-medium text-highlighted no-underline">
      <span class="sr-only">{{ t('submission.after') }} </span>
      <AgreementSubmissionValue :value="claimCustomFieldAnswerLabel(value, locale, format)" />
    </ins>
  </div>
  <AgreementSubmissionValue v-else :value="claimCustomFieldAnswerLabel(value ?? null, locale, format)" />
</template>
