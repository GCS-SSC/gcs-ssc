<script setup lang="ts">
import { computed } from 'vue'
import { formatMoneyText, isCanonicalMoney } from '~~/shared/utils/money'
import { compareClaimReference, compareSubmissionValues, pairSubmissionRows, fiscalMonthLabels, isSubmissionIdField, isSubmissionObject, submissionFieldKey } from '~/utils/agreement-submission-view'
import type { AgreementSubmissionTarget } from '~~/shared/types/agreement-submission'
import type { ClaimReferenceComparison } from '~/utils/agreement-submission-view'

const { value, field, snapshot = false, lineItem = false, previous, replacePrevious = false, claimReferences, target } = defineProps<{
  value: unknown
  field?: string
  snapshot?: boolean
  target?: AgreementSubmissionTarget
  lineItem?: boolean
  previous?: unknown
  replacePrevious?: boolean
  claimReferences?: ClaimReferenceComparison
}>()
const { t, te, locale } = useI18n()
const snapshotFieldOrder = ['periodStart', 'periodEnd', 'receivedDate', 'isFinalForYear', 'fiscalYearId', 'applicantRecipientId']
const previousObject = computed(() => isSubmissionObject(previous) ? previous : undefined)
const rows = computed(() => Array.isArray(value) ? pairSubmissionRows(Array.isArray(previous) ? previous : [], value, field, 'snapshot', target) : [])
const showReplacement = computed(() => snapshot && previous !== undefined
  && (replacePrevious || (
    !(Array.isArray(previous) && Array.isArray(value))
    && !(previousObject.value && isSubmissionObject(value) && !isCanonicalMoney(previous) && !isCanonicalMoney(value))
    && compareSubmissionValues(previous, value).length > 0
  )))
const lineDescription = computed(() => lineItem && isSubmissionObject(value)
  && typeof value.description === 'string' && value.description.trim()
  && (!previousObject.value || previousObject.value.description === value.description)
  ? value.description
  : null)
const objectEntries = computed(() => {
  if (!isSubmissionObject(value)) return []
  const fields = snapshot ? { ...previousObject.value, ...value } : value
  const entries = Object.keys(fields).map(key => {
    const current = Object.hasOwn(value, key) ? value[key] : undefined
    const prior = previousObject.value && Object.hasOwn(previousObject.value, key) ? previousObject.value[key] : undefined
    const reference = claimReferences && compareClaimReference({
      key, before: prior, after: current, evidence: claimReferences,
      locale: locale.value, unavailable: t('common.unavailable')
    })
    if (reference) {
      return {
        key,
        title: t(reference.title),
        current: reference.after,
        previous: reference.changed ? reference.before : undefined,
        replacePrevious: reference.changed
      }
    }
    if ((snapshot && isSubmissionIdField(key)) || (key === 'description' && lineDescription.value !== null)) return undefined
    return {
      key,
      title: te(submissionFieldKey(key)) ? t(submissionFieldKey(key)) : key,
      current,
      previous: prior,
      replacePrevious: false
    }
  }).filter(entry => entry !== undefined)
  if (!snapshot) return entries
  const order = (key: string) => {
    const index = snapshotFieldOrder.indexOf(key)
    return index < 0 ? snapshotFieldOrder.length : index
  }
  return entries.sort((left, right) => order(left.key) - order(right.key))
})
const money = computed(() => isCanonicalMoney(value) ? formatMoneyText(value, locale.value) : null)
const month = computed(() => typeof value === 'number' && (field === 'periodStart' || field === 'periodEnd' || field === 'month')
  ? fiscalMonthLabels[value]
  : undefined)
</script>

<template>
  <div v-if="showReplacement" class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
    <del class="text-error">
      <span class="sr-only">{{ t('submission.before') }} </span>
      <AgreementSubmissionValue :value="previous" :field="field" snapshot />
    </del>
    <ins v-if="value !== undefined" class="font-medium text-highlighted no-underline">
      <span class="sr-only">{{ t('submission.after') }} </span>
      <AgreementSubmissionValue :value="value" :field="field" snapshot />
    </ins>
  </div>
  <span v-else-if="money !== null">{{ money }}</span>
  <span v-else-if="month">{{ t(month) }}</span>
  <span v-else-if="field === 'egcs_fc_calculationmode' && typeof value === 'string' && te(`budget_calculation.${value}`)">{{ t(`budget_calculation.${value}`) }}</span>
  <span v-else-if="value === null || value === undefined" class="text-muted">{{ t('submission.blank') }}</span>
  <span v-else-if="typeof value === 'boolean'">{{ t(value ? 'submission.yes' : 'submission.no') }}</span>
  <span v-else-if="typeof value === 'string' || typeof value === 'number'" class="whitespace-pre-wrap [overflow-wrap:anywhere]">{{ value === '' ? t('submission.blank') : value }}</span>
  <ol v-else-if="snapshot && rows.length" class="divide-y divide-default border-y border-default" role="list">
    <li v-for="(row, index) in rows" :key="index" class="min-w-0 py-3">
      <AgreementSubmissionValue :value="row.after" :previous="row.before" snapshot :line-item="field === 'lineItems'" />
    </li>
  </ol>
  <ol v-else-if="Array.isArray(value) && value.length" class="list-decimal space-y-3 pl-5">
    <li v-for="(row, index) in value" :key="index">
      <AgreementSubmissionValue :value="row" />
    </li>
  </ol>
  <div v-else-if="snapshot && (objectEntries.length || lineDescription)" class="min-w-0 space-y-3">
    <p v-if="lineDescription" class="whitespace-pre-wrap font-semibold text-highlighted [overflow-wrap:anywhere]">
      {{ lineDescription }}
    </p>
    <dl v-if="objectEntries.length" class="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-x-6 gap-y-4">
      <div
        v-for="{ key, title, current: fieldValue, previous: prior, replacePrevious: replaceField } in objectEntries" :key="key" class="min-w-0"
        :class="Array.isArray(fieldValue) || (isSubmissionObject(fieldValue) && !isCanonicalMoney(fieldValue)) ? 'col-span-full' : undefined">
        <dt class="text-xs font-medium text-muted [overflow-wrap:anywhere]" :class="Array.isArray(fieldValue) ? 'mb-2 text-sm font-semibold text-highlighted' : 'mb-1'">
          {{ title }}
        </dt>
        <dd class="min-w-0 text-default">
          <AgreementSubmissionValue :value="fieldValue" :field="key" :previous="prior" :replace-previous="replaceField" :target="field === undefined ? target : undefined" snapshot />
        </dd>
      </div>
    </dl>
  </div>
  <dl v-else-if="objectEntries.length" class="space-y-2">
    <div v-for="{ key, title, current: fieldValue } in objectEntries" :key="key">
      <dt class="font-medium text-muted [overflow-wrap:anywhere]">
        {{ title }}
      </dt>
      <dd class="text-default">
        <AgreementSubmissionValue :value="fieldValue" :field="key" />
      </dd>
    </div>
  </dl>
  <span v-else class="text-muted">{{ t('submission.blank') }}</span>
</template>
