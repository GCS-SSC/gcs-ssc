<script setup lang="ts">
import { computed } from 'vue'
import { compareClaimReference, compareSubmissionValues, compareUnlabeledSubmissionReference, fiscalMonthLabels, isSubmissionIdField, isSubmissionStructuredEvidence, sameClaimCustomFieldEvidence, submissionFieldKey } from '~/utils/agreement-submission-view'
import type { ClaimReferenceComparison, SubmissionPathPart } from '~/utils/agreement-submission-view'
import type { AgreementSubmissionTarget } from '~~/shared/types/agreement-submission'
import type { AgreementCustomFieldPatch, ClaimCustomFieldSnapshot } from '~~/shared/types/schemas/agreement-custom-fields'

const { before, after, beforeFields = [], afterFields = [], beforeAnswers, afterAnswers, claimReferences, target } = defineProps<{
  before: unknown
  after: unknown
  target?: AgreementSubmissionTarget
  beforeFields?: ClaimCustomFieldSnapshot
  afterFields?: ClaimCustomFieldSnapshot
  beforeAnswers?: AgreementCustomFieldPatch
  afterAnswers?: AgreementCustomFieldPatch
  claimReferences?: ClaimReferenceComparison
}>()
const { t, te, locale } = useI18n()
/**
 * Resolves a localized field or row path for a change.
 * @param path - Field keys and row details from the snapshots.
 * @param fieldTitle - Localized title for a business reference at the end of the path.
 * @returns A readable path.
 */
const label = (path: SubmissionPathPart[], fieldTitle?: string) => path.map((part, index) => {
  if (fieldTitle && index === path.length - 1) return fieldTitle
  if (typeof part === 'string') return te(submissionFieldKey(part)) ? t(submissionFieldKey(part)) : part
  const context = [locale.value === 'fr' ? part.descriptionFr || part.description : part.description || part.descriptionFr]
  if (part.month !== undefined) context.push(t(fiscalMonthLabels[part.month]!))
  context.push(part.costCategory, part.costSubsection)
  return context.filter(Boolean).join(' · ') || t('submission.row', { number: part.row })
}).join(' / ')

/**
 * Finds the last field key so the value renderer retains field-specific formatting.
 * @param path - Change path.
 * @returns The field key for scalar formatting.
 */
const fieldName = (path: SubmissionPathPart[]) => {
  const field = path.at(-1)
  return typeof field === 'string' ? field : undefined
}
type Change = { title: string; before: unknown; after: unknown } & (
  | { kind: 'submission'; field?: string }
  | { kind: 'custom'; before: ClaimCustomFieldSnapshot[number]['value'] | undefined; after: ClaimCustomFieldSnapshot[number]['value'] | undefined }
)
const changes = computed(() => {
  const data = compareSubmissionValues(before, after, [], target).map((change): Change | undefined => {
    const field = fieldName(change.path)
    if (change.path.some(part => typeof part === 'string' && isSubmissionIdField(part))) {
      if (!field) return undefined
      const input = { key: field, before: change.before, after: change.after, unavailable: t('common.unavailable') }
      const claimReference = claimReferences && change.path.length === 1
        ? compareClaimReference({ ...input, evidence: claimReferences, locale: locale.value })
        : undefined
      const reference = claimReference ?? compareUnlabeledSubmissionReference(input)
      if (!reference?.changed) return undefined
      return {
        kind: 'submission',
        title: label(change.path, t(reference.title)),
        field,
        before: reference.before,
        after: reference.after
      }
    }
    return { kind: 'submission', title: label(change.path), field, before: change.before, after: change.after }
  }).filter(change => change !== undefined)
  const previous = new Map(beforeFields.map(field => [field.key, field]))
  const current = new Map(afterFields.map(field => [field.key, field]))
  for (const key of new Set([...current.keys(), ...previous.keys()])) {
    const from = previous.get(key)?.value ?? null
    const to = current.get(key)?.value ?? null
    if (sameClaimCustomFieldEvidence(
      { key, displayed: from, answers: beforeAnswers },
      { key, displayed: to, answers: afterAnswers }
    )) continue
    const field = current.get(key) ?? previous.get(key)
    if (!field) continue
    data.push({
      title: [t('agreement.claims.additional_information'), locale.value === 'fr' ? field.labelFr : field.labelEn].join(' / '),
      kind: 'custom',
      before: from ?? undefined,
      after: to ?? undefined
    })
  }
  return data
})
</script>

<template>
  <p v-if="!changes.length" class="text-sm text-muted">
    {{ t('submission.no_changes') }}
  </p>
  <ul v-else class="divide-y divide-default rounded-md border border-default">
    <li v-for="(change, index) in changes" :key="index" class="space-y-2 px-4 py-3">
      <div class="flex flex-wrap items-center gap-2">
        <p class="text-sm font-semibold text-highlighted [overflow-wrap:anywhere]">
          {{ change.title }}
        </p>
        <UBadge v-if="change.before === undefined" color="success" variant="subtle">
          {{ t('submission.added') }}
        </UBadge>
        <UBadge v-else-if="change.after === undefined" color="warning" variant="subtle">
          {{ t('submission.removed') }}
        </UBadge>
        <UBadge v-else color="neutral" variant="subtle">
          {{ t('submission.changed') }}
        </UBadge>
      </div>
      <AgreementSubmissionCustomFieldEvidence
        v-if="change.kind === 'custom' && (isSubmissionStructuredEvidence(change.before) || isSubmissionStructuredEvidence(change.after))"
        :value="change.after"
        :previous="change.before ?? null"
        :label="change.title" />
      <dl v-else class="grid gap-3 text-sm sm:grid-cols-2">
        <div class="min-w-0">
          <dt class="mb-1 font-medium text-muted">
            {{ t('submission.before') }}
          </dt>
          <dd>
            <AgreementSubmissionCustomFieldEvidence v-if="change.kind === 'custom'" :value="change.before" />
            <AgreementSubmissionValue v-else :value="change.before" :field="change.field" snapshot show-references />
          </dd>
        </div>
        <div class="min-w-0">
          <dt class="mb-1 font-medium text-muted">
            {{ t('submission.after') }}
          </dt>
          <dd>
            <AgreementSubmissionCustomFieldEvidence v-if="change.kind === 'custom'" :value="change.after" />
            <AgreementSubmissionValue v-else :value="change.after" :field="change.field" snapshot show-references />
          </dd>
        </div>
      </dl>
    </li>
  </ul>
</template>
