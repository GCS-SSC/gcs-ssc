<script setup lang="ts">
import { computed } from 'vue'
import { claimCustomFieldAnswerLabel } from '~/utils/agreement-submission-view'
import type { ClaimCustomFieldSnapshot } from '~~/shared/types/schemas/agreement-custom-fields'

type CapturedAnswer = ClaimCustomFieldSnapshot[number]['value']
const { value, previous } = defineProps<{ value?: CapturedAnswer; previous?: CapturedAnswer }>()
const { t, locale } = useI18n()
const rows = computed(() => value && typeof value === 'object' && 'rows' in value ? value.rows : null)
const label = computed(() => value && typeof value === 'object' && 'rows' in value
  ? null
  : claimCustomFieldAnswerLabel(value ?? null, locale.value))
</script>

<template>
  <div v-if="previous !== undefined" class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
    <del class="text-error">
      <span class="sr-only">{{ t('submission.before') }} </span>
      <AgreementSubmissionCustomFieldEvidence :value="previous" />
    </del>
    <ins v-if="value !== undefined" class="font-medium text-highlighted no-underline">
      <span class="sr-only">{{ t('submission.after') }} </span>
      <AgreementSubmissionCustomFieldEvidence :value="value" />
    </ins>
  </div>
  <ol v-else-if="rows?.length" class="list-decimal space-y-3 pl-5">
    <li v-for="(row, index) in rows" :key="index">
      <dl class="space-y-1">
        <div v-for="(cell, cellIndex) in row.cells" :key="cellIndex">
          <dt class="text-xs font-medium text-muted [overflow-wrap:anywhere]">
            {{ locale === 'fr' ? cell.labelFr : cell.labelEn }}
          </dt>
          <dd>
            <AgreementSubmissionValue :value="claimCustomFieldAnswerLabel(cell.value, locale, cell.format)" />
          </dd>
        </div>
      </dl>
    </li>
  </ol>
  <AgreementSubmissionValue v-else :value="label" />
</template>
