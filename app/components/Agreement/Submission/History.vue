<script setup lang="ts">
import { computed } from 'vue'
import CommonSubmissionHistory from '~/components/Common/Submission/History.vue'
import { claimCustomFieldEvidenceAnswers, sameClaimCustomFieldEvidence, isSubmissionStructuredEvidence } from '~/utils/agreement-submission-view'
import type { ClaimCustomFieldSnapshot } from '~~/shared/types/schemas/agreement-custom-fields'
import type { AgreementSubmissionTarget, SubmissionEventRow } from '~~/shared/types/agreement-submission'

const { events, source, target } = defineProps<{ events: SubmissionEventRow[]; source: string; target: AgreementSubmissionTarget }>()
const { t, locale } = useI18n()
const snapshots = computed(() => events.filter(event => event.egcs_fc_payload !== null))
const evidenceAnswers = computed(() => new Map(snapshots.value.map(event => [event.id, claimCustomFieldEvidenceAnswers(event.egcs_fc_payload)])))
const fieldsBySnapshot = computed(() => new Map(snapshots.value.map(event => {
  const fields = target === 'forecast' ? event.egcs_fc_forecastcustomfields : event.egcs_fc_claimcustomfields
  const answers = evidenceAnswers.value.get(event.id)
  return [event.id, fields?.map(field => {
    const raw = answers?.[field.key]
    if (!isSubmissionStructuredEvidence(field.value) || !raw || typeof raw !== 'object' || !('rows' in raw)
      || raw.rows.length !== field.value.rows.length) return field
    return {
      ...field,
      value: { ...field.value, rows: field.value.rows.map((row, index) => ({ ...row, id: row.id ?? raw.rows[index]?.id })) }
    }
  })] as const
})))
const snapshotFields = (event?: SubmissionEventRow) => event && fieldsBySnapshot.value.get(event.id)
/**
 * Hides the custom field IDs when the pinned labels are rendered separately.
 * @param event - Submission event selected for display.
 * @returns The part of the evidence rendered by the general snapshot view.
 */
const snapshotPayload = (event?: SubmissionEventRow) => {
  const payload = event?.egcs_fc_payload
  if (!payload || !snapshotFields(event)?.length) return payload
  const { customFields: _customFields, ...snapshot } = payload
  return snapshot
}
/**
 * Supplies pinned labels for the two Claim snapshots.
 * @param beforeEvent - Previous event, when present.
 * @param afterEvent - Current event.
 * @returns Labels for Claim history only.
 */
const claimReferences = (beforeEvent: SubmissionEventRow | undefined, afterEvent: SubmissionEventRow) => target === 'claim'
  ? { before: beforeEvent?.egcs_fc_claimreferences, after: afterEvent.egcs_fc_claimreferences ?? null }
  : undefined
/**
 * Resolves a previous answer only when the underlying answer changed.
 * @param index - Index of the current snapshot.
 * @param field - Current field evidence.
 * @returns The prior display value, retaining an explicit blank.
 */
const previousFieldAnswer = (index: number, field: ClaimCustomFieldSnapshot[number]) => {
  const previous = snapshots.value[index - 1]
  const priorField = snapshotFields(previous)?.find(item => item.key === field.key)
  if (!previous || !priorField || sameClaimCustomFieldEvidence(
    { key: field.key, displayed: priorField.value, answers: evidenceAnswers.value.get(previous.id) },
    { key: field.key, displayed: field.value, answers: evidenceAnswers.value.get(snapshots.value[index]?.id ?? '') }
  )) return undefined
  return priorField.value
}
const timeline = computed(() => events.map(event => ({
  id: event.id,
  title: t(`submission.event.${event.egcs_fc_kind}`),
  datetime: event.egcs_fc_createdat,
  actor: event.egcs_fc_kind === 'received' ? source : event.actorName ?? t('submission.system'),
  revisionLabel: event.egcs_fc_kind === 'received'
    ? t('submission.source_revision', { revision: event.egcs_fc_sourcerevision })
    : undefined,
  section: event.egcs_fc_editsection?.id === null
    ? t('agreement.claims.additional_information')
    : event.egcs_fc_editsection?.[locale.value === 'fr' ? 'fr' : 'en'],
  description: event.egcs_fc_description
})))

/**
 * Formats a version picker option from its immutable event.
 * @param event - Submission event with captured evidence.
 * @param index - Zero-based version position.
 * @returns Localized version label.
 */
const snapshotLabel = (event: SubmissionEventRow, index: number) =>
  t('submission.snapshot', { version: index + 1, event: t(`submission.event.${event.egcs_fc_kind}`) })
</script>

<template>
  <CommonSubmissionHistory :events="timeline" :snapshots="snapshots" :snapshot-label="snapshotLabel">
    <template #comparison="{ before, after }">
      <AgreementSubmissionChanges
        :before="snapshotPayload(before)"
        :after="snapshotPayload(after)"
        :before-fields="snapshotFields(before) ?? undefined"
        :before-answers="evidenceAnswers.get(before.id)"
        :after-fields="snapshotFields(after) ?? undefined"
        :after-answers="evidenceAnswers.get(after.id)"
        :target="target"
        :claim-references="claimReferences(before, after)" />
    </template>

    <template #snapshot="{ snapshot, previous, index }">
      <AgreementSubmissionValue
        :value="snapshotPayload(snapshot)"
        :previous="snapshotPayload(previous)"
        :target="target"
        :claim-references="claimReferences(previous, snapshot)"
        snapshot />
      <section v-if="snapshotFields(snapshot)?.length" class="space-y-3 border-t border-default pt-4">
        <h4 class="font-semibold text-highlighted">
          {{ t('agreement.claims.additional_information') }}
        </h4>
        <dl class="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-x-6 gap-y-4">
          <div
            v-for="field in snapshotFields(snapshot)"
            :key="field.key"
            class="min-w-0"
            :class="{ 'col-span-full': field.presentation === 'multiline' || isSubmissionStructuredEvidence(field.value) || isSubmissionStructuredEvidence(previousFieldAnswer(index, field)) }">
            <dt class="mb-1 text-xs font-medium text-muted [overflow-wrap:anywhere]">
              {{ locale === 'fr' ? field.labelFr : field.labelEn }}
            </dt>
            <dd class="text-default">
              <AgreementSubmissionCustomFieldEvidence
                :value="field.value"
                :label="locale === 'fr' ? field.labelFr : field.labelEn"
                :previous="previousFieldAnswer(index, field)" />
            </dd>
          </div>
        </dl>
      </section>
    </template>
  </CommonSubmissionHistory>
</template>
