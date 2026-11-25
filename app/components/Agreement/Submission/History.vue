<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { claimCustomFieldEvidenceAnswers, sameClaimCustomFieldEvidence } from '~/utils/agreement-submission-view'
import type { ClaimCustomFieldSnapshot } from '~~/shared/types/schemas/agreement-custom-fields'
import type { AgreementSubmissionTarget, SubmissionEventRow } from '~~/shared/types/agreement-submission'

const { events, source, target } = defineProps<{ events: SubmissionEventRow[]; source: string; target: AgreementSubmissionTarget }>()
const { t, locale } = useI18n()
const snapshots = computed(() => events.filter(event => event.egcs_fc_payload !== null))
const evidenceAnswers = computed(() => new Map(snapshots.value.map(event => [event.id, claimCustomFieldEvidenceAnswers(event.egcs_fc_payload)])))
const earlier = ref('')
const later = ref('')
/**
 * Hides the Claim answer IDs when the pinned labels are rendered separately.
 * @param event - Submission event selected for display.
 * @returns The part of the evidence rendered by the general snapshot view.
 */
const snapshotPayload = (event?: SubmissionEventRow) => {
  const payload = event?.egcs_fc_payload
  if (!payload || !event?.egcs_fc_claimcustomfields?.length) return payload
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
  const priorField = previous?.egcs_fc_claimcustomfields?.find(item => item.key === field.key)
  if (!previous || !priorField || sameClaimCustomFieldEvidence(
    { key: field.key, displayed: priorField.value, answers: evidenceAnswers.value.get(previous.id) },
    { key: field.key, displayed: field.value, answers: evidenceAnswers.value.get(snapshots.value[index]?.id ?? '') }
  )) return undefined
  return priorField.value
}
const before = computed(() => snapshots.value.find(event => event.id === earlier.value))
const after = computed(() => snapshots.value.find(event => event.id === later.value))
const dateFormatter = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }))
const versions = computed(() => snapshots.value.map((event, index) => ({
  value: event.id,
  label: t('submission.snapshot', { version: index + 1, event: t(`submission.event.${event.egcs_fc_kind}`) })
})))
watch(snapshots, (next, previous) => {
  if (next.at(-1)?.id === previous?.at(-1)?.id) return
  earlier.value = next.at(-2)?.id ?? ''
  later.value = next.at(-1)?.id ?? ''
}, { immediate: true })

/**
 * Formats event times in the current reader's locale.
 * @param date Timestamp supplied by the API.
 * @returns A localized date and time.
 */
const dateTime = (date: string) => dateFormatter.value.format(new Date(date))
</script>

<template>
  <CommonDetailSection heading="h3" :title="t('submission.history')">
    <ol class="space-y-4 border-l border-default pl-5">
      <li v-for="event in events" :key="event.id" class="text-sm">
        <div class="flex flex-wrap items-baseline gap-x-2">
          <strong class="text-highlighted">{{ t(`submission.event.${event.egcs_fc_kind}`) }}</strong>
          <time :datetime="event.egcs_fc_createdat" class="text-muted">{{ dateTime(event.egcs_fc_createdat) }}</time>
        </div>
        <p class="text-muted">
          {{ event.egcs_fc_kind === 'received' ? source : event.actorName ?? t('submission.system') }}
          <span v-if="event.egcs_fc_kind === 'received'"> · {{ t('submission.source_revision', { revision: event.egcs_fc_sourcerevision }) }}</span>
        </p>
        <p v-if="event.egcs_fc_description" class="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]">
          {{ event.egcs_fc_description }}
        </p>
      </li>
    </ol>

    <section v-if="versions.length > 1" class="min-w-0 space-y-4">
      <h4 class="font-semibold text-highlighted">
        {{ t('submission.compare') }}
      </h4>
      <div class="grid gap-3 sm:grid-cols-2" data-field-exclude="Snapshot comparison filters do not edit business data.">
        <UFormField :label="t('submission.before')">
          <USelect v-model="earlier" :items="versions" class="w-full" />
        </UFormField>
        <UFormField :label="t('submission.after')">
          <USelect v-model="later" :items="versions" class="w-full" />
        </UFormField>
      </div>
      <AgreementSubmissionChanges
        v-if="before && after"
        :before="snapshotPayload(before)"
        :after="snapshotPayload(after)"
        :before-fields="before.egcs_fc_claimcustomfields ?? undefined"
        :before-answers="evidenceAnswers.get(before.id)"
        :after-fields="after.egcs_fc_claimcustomfields ?? undefined"
        :after-answers="evidenceAnswers.get(after.id)"
        :target="target"
        :claim-references="claimReferences(before, after)"
        history />
    </section>

    <div v-if="snapshots.length" class="divide-y divide-default overflow-hidden rounded-md border border-default">
      <details v-for="(snapshot, index) in snapshots" :key="snapshot.id" class="group/snapshot text-sm">
        <summary
          class="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-2.5 font-medium text-highlighted hover:bg-elevated focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary group-open/snapshot:bg-elevated [&::-webkit-details-marker]:hidden">
          <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-muted group-open/snapshot:rotate-90" aria-hidden="true" />
          <span class="min-w-0 [overflow-wrap:anywhere]">{{ versions[index]?.label }}</span>
        </summary>
        <div class="min-w-0 space-y-5 border-t border-default px-4 py-4 sm:px-5">
          <AgreementSubmissionValue
            :value="snapshotPayload(snapshot)"
            :previous="snapshotPayload(snapshots[index - 1])"
            :target="target"
            :claim-references="claimReferences(snapshots[index - 1], snapshot)"
            snapshot />
          <section v-if="snapshot.egcs_fc_claimcustomfields?.length" class="space-y-3 border-t border-default pt-4">
            <h4 class="font-semibold text-highlighted">
              {{ t('agreement.claims.additional_information') }}
            </h4>
            <dl class="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-x-6 gap-y-4">
              <div v-for="field in snapshot.egcs_fc_claimcustomfields" :key="field.key" class="min-w-0">
                <dt class="mb-1 text-xs font-medium text-muted [overflow-wrap:anywhere]">
                  {{ locale === 'fr' ? field.labelFr : field.labelEn }}
                </dt>
                <dd class="text-default">
                  <AgreementSubmissionCustomFieldEvidence
                    :value="field.value"
                    :previous="previousFieldAnswer(index, field)" />
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </details>
    </div>
  </CommonDetailSection>
</template>
