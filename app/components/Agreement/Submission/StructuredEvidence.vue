<script setup lang="ts">
import { computed } from 'vue'
import AgreementSubmissionScalarEvidence from './ScalarEvidence.vue'
import type { ClaimCustomFieldSnapshot } from '~~/shared/types/schemas/agreement-custom-fields'
import AgreementSubmissionRowChangeBadge from './RowChangeBadge.vue'
import { claimCustomFieldAnswerLabel, sameClaimCustomFieldEvidence } from '~/utils/agreement-submission-view'

type Structured = Extract<ClaimCustomFieldSnapshot[number]['value'], { rows: unknown }>
type Row = Structured['rows'][number]
const { value, previous, compare, label } = defineProps<{
  value?: Structured
  previous?: Structured
  compare: boolean
  label?: string
}>()
const { locale, n, t } = useI18n()
const columns = computed(() => (value?.rows[0] ?? previous?.rows[0])?.cells ?? [])
const table = computed(() => (value?.kind ?? previous?.kind) === 'table'
  || (!value?.kind && !previous?.kind && columns.value.some(cell => cell.format === 'decimal')))
type RowChange = 'added' | 'changed' | 'removed'
type MatchedRow = { before?: Row; after?: Row; change?: RowChange }

/**
 * Compares captured cell values without considering later rendering metadata.
 * @param before - Row in the earlier snapshot.
 * @param after - Row in the later snapshot.
 * @returns Whether the captured cells are unchanged.
 */
const sameCells = (before: Row, after: Row) => sameClaimCustomFieldEvidence(
  { key: '', displayed: { rows: [before] } },
  { key: '', displayed: { rows: [after] } }
)

const rows = computed<MatchedRow[]>(() => {
  const earlier = previous?.rows ?? []
  const used = new Set<number>()
  const current = (value?.rows ?? []).map<MatchedRow>(after => {
    if (!compare) return { after }
    const index = earlier.findIndex((before, index) => !used.has(index)
      && (after.id && before.id ? after.id === before.id : sameCells(before, after)))
    const before = earlier[index]
    if (!before) return { after, change: 'added' }
    used.add(index)
    return { before, after, change: sameCells(before, after) ? undefined : 'changed' }
  })
  const removed: MatchedRow[] = earlier.filter((_, index) => !used.has(index))
    .map(before => ({ before, change: 'removed' }))
  return [...current, ...removed]
})

/**
 * Returns the prior cell only when its captured display value differs.
 * @param row - Matched captured rows.
 * @param index - Cell position in the pinned structure.
 * @returns Previous value for an inline comparison.
 */
const previousValue = (row: typeof rows.value[number], index: number) => {
  if (!row.change || row.change === 'added') return undefined
  const before = row.before?.cells[index]
  const after = row.after?.cells[index]
  const display = (cell?: Row['cells'][number]) => claimCustomFieldAnswerLabel(cell?.value ?? null, locale.value, cell?.format)
  return display(before) === display(after) ? undefined : before?.value ?? null
}
</script>

<template>
  <CommonTableSurface v-if="table">
    <table class="w-full text-left">
      <caption v-if="label" class="sr-only">
        {{ label }}
      </caption>
      <thead class="bg-elevated">
        <tr>
          <th scope="col" class="px-3 py-2">
            {{ t('custom_fields.row') }}
          </th>
          <th v-for="(cell, index) in columns" :key="index" scope="col" class="px-3 py-2">
            {{ locale === 'fr' ? cell.labelFr : cell.labelEn }}
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-default">
        <tr v-for="(row, index) in rows" :key="row.after?.id ?? row.before?.id ?? index">
          <th scope="row" class="px-3 py-2 align-top font-medium">
            {{ n(index + 1) }}
            <AgreementSubmissionRowChangeBadge :change="row.change" />
          </th>
          <td v-for="(cell, cellIndex) in columns" :key="cellIndex" class="px-3 py-2 align-top">
            <AgreementSubmissionScalarEvidence
              :value="row.after?.cells[cellIndex]?.value"
              :previous="previousValue(row, cellIndex)"
              :added="row.change === 'added'"
              :format="cell.format" />
          </td>
        </tr>
      </tbody>
    </table>
  </CommonTableSurface>
  <ol v-else role="list" class="list-none space-y-3">
    <li v-for="(row, index) in rows" :key="row.after?.id ?? row.before?.id ?? index">
      <fieldset class="min-w-0 rounded-md border border-default p-3">
        <legend class="px-1 font-medium text-highlighted">
          {{ t('custom_fields.entry_number', { number: n(index + 1) }) }}
          <AgreementSubmissionRowChangeBadge :change="row.change" />
        </legend>
        <dl class="grid gap-3 sm:grid-cols-2">
          <div v-for="(cell, cellIndex) in columns" :key="cellIndex" class="min-w-0">
            <dt class="font-bold text-highlighted">
              {{ locale === 'fr' ? cell.labelFr : cell.labelEn }}
            </dt>
            <dd>
              <AgreementSubmissionScalarEvidence
                :value="row.after?.cells[cellIndex]?.value"
                :previous="previousValue(row, cellIndex)"
                :added="row.change === 'added'"
                :format="cell.format" />
            </dd>
          </div>
        </dl>
      </fieldset>
    </li>
  </ol>
</template>
