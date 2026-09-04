<script setup lang="ts">
/* eslint-disable jsdoc/require-param-description, jsdoc/require-returns -- page-local exact-money helpers are self-documenting */
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { AgreementClaimReconciliationTableLine } from '~~/shared/types/agreement-claim-reconciliation-ui'
import { formatMoneyText, parseMoney, subtractMoney, sumMoney, type Money } from '~~/shared/utils/money'

const { lines = [], totalSubmitted = parseMoney('0'), totalReconciled = parseMoney('0'), totalSampled = parseMoney('0'), editMode = 'inline' } = defineProps<{
  lines?: AgreementClaimReconciliationTableLine[]
  totalSubmitted?: Money
  totalReconciled?: Money
  totalSampled?: Money
  editMode?: 'inline' | 'action'
}>()

const emit = defineEmits<{
  (event: 'update:reconciled' | 'update:sampled', id: string, value: string | null | undefined): void
  (event: 'update:rationale', id: string, value: string): void
  (event: 'edit', line: AgreementClaimReconciliationTableLine): void
}>()

const { locale, t } = useI18n()
const { getGroupedDisclosureControlsId } = useGroupedDisclosureIds()
const formatMoney = (value: Money): string => formatMoneyText(value, locale.value, 'CAD')
/**
 *
 * @param value
 */
const tryParseMoney = (value: string | null | undefined): Money | null => {
  try {
    return value == null || value === '' ? null : parseMoney(value)
  } catch {
    return null
  }
}
type ReconciliationSubsectionGroup = { key: string; label: string; lines: AgreementClaimReconciliationTableLine[] }
type ReconciliationCategoryGroup = { key: string; label: string; subsections: ReconciliationSubsectionGroup[] }
const getCategoryGroupKey = (category: string) => JSON.stringify(['category', category])
const getSubsectionGroupKey = (category: string, subsection: string) => JSON.stringify(['category', category, 'subsection', subsection])
const groupedLines = computed<ReconciliationCategoryGroup[]>(() => {
  const categories = new Map<string, Map<string, AgreementClaimReconciliationTableLine[]>>()
  for (const line of lines) {
    const category = line.costCategory || t('common.all')
    const subsection = line.costSubsection || t('common.all')
    const subsections = categories.get(category) ?? new Map<string, AgreementClaimReconciliationTableLine[]>()
    const grouped = subsections.get(subsection) ?? []
    grouped.push(line)
    subsections.set(subsection, grouped)
    categories.set(category, subsections)
  }
  return [...categories.entries()].map(([category, subsections]) => ({
    key: getCategoryGroupKey(category),
    label: category,
    subsections: [...subsections.entries()].map(([subsection, grouped]) => ({
      key: getSubsectionGroupKey(category, subsection),
      label: subsection,
      lines: grouped
    }))
  }))
})
const expandedGroups: Ref<Set<string>> = ref(new Set())
let knownGroupKeys = new Set<string>()
watch(groupedLines, groups => {
  const next = new Set(expandedGroups.value)
  const currentKeys = new Set<string>()
  for (const category of groups) {
    currentKeys.add(category.key)
    if (!knownGroupKeys.has(category.key)) next.add(category.key)
    for (const subsection of category.subsections) {
      currentKeys.add(subsection.key)
      if (!knownGroupKeys.has(subsection.key)) next.add(subsection.key)
    }
  }
  for (const key of next) if (!currentKeys.has(key)) next.delete(key)
  knownGroupKeys = currentKeys
  expandedGroups.value = next
}, { immediate: true })
const isExpanded = (key: string) => expandedGroups.value.has(key)
/**
 * Toggles one category or subsection group.
 *
 * @param key - Stable group key.
 */
const toggleGroup = (key: string) => {
  const next = new Set(expandedGroups.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedGroups.value = next
}
/**
 *
 * @param groupLines
 * @param key
 */
const sumLines = (groupLines: AgreementClaimReconciliationTableLine[], key: 'submittedAmount' | 'reconciledAmount' | 'sampledAmount') =>
  sumMoney(groupLines.flatMap(line => {
    const amount = tryParseMoney(line[key])
    return amount === null ? [] : [amount]
  }))
const getLineBalance = (line: AgreementClaimReconciliationTableLine) => line.balance
  ?? subtractMoney(line.submittedAmount, tryParseMoney(line.reconciledAmount) ?? parseMoney('0'))
const sumBalances = (groupLines: AgreementClaimReconciliationTableLine[]) => sumMoney(groupLines.map(getLineBalance))
const getCategoryLines = (category: ReconciliationCategoryGroup) => category.subsections.flatMap(subsection => subsection.lines)
</script>

<template>
  <CommonTableSurface>
    <table class="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
      <caption class="sr-only">
        {{ t('agreement.claims.reconcile_breakdown_caption') }}
      </caption>
      <thead>
        <tr class="bg-zinc-100 text-left text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:bg-zinc-900 dark:text-zinc-400">
          <th class="min-w-72 px-4 py-4">
            {{ t('agreement.budget.line_item') }}
          </th>
          <th class="min-w-40 px-4 py-4">
            {{ t('agreement.claims.submitted_amount') }}
          </th>
          <th class="min-w-44 px-4 py-4">
            {{ t('agreement.claims.reconciled_amount') }}
          </th>
          <th class="min-w-44 px-4 py-4">
            {{ t('agreement.claims.sampled_amount') }}
          </th>
          <th v-if="editMode === 'inline'" class="min-w-72 px-4 py-4">
            {{ t('agreement.claims.rationale') }}
          </th>
          <th v-else class="min-w-40 px-4 py-4">
            {{ t('agreement.claims.balance') }}
          </th>
          <th v-if="editMode === 'action'" class="w-24 px-4 py-4">
            {{ t('common.actions') }}
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
        <template v-for="category in groupedLines" :key="category.key">
          <tr class="bg-zinc-50 dark:bg-zinc-900/70">
            <th scope="rowgroup" class="px-4 py-3 text-left">
              <CommonGroupedDisclosureButton
                class="flex items-center gap-2 font-semibold"
                :expanded="isExpanded(category.key)"
                :controls="getGroupedDisclosureControlsId(category.key)"
                :label="category.label"
                @toggle="toggleGroup(category.key)">
                <UIcon :name="isExpanded(category.key) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4" />
                {{ category.label }}
                <CommonStatusBadge variant="count" size="sm" :label="String(category.subsections.reduce((count, subsection) => count + subsection.lines.length, 0))" />
              </CommonGroupedDisclosureButton>
            </th>
            <td class="px-4 py-3 font-medium">
              {{ formatMoney(sumLines(getCategoryLines(category), 'submittedAmount')) }}
            </td>
            <td class="px-4 py-3 font-medium">
              {{ formatMoney(sumLines(getCategoryLines(category), 'reconciledAmount')) }}
            </td>
            <td class="px-4 py-3 font-medium">
              {{ formatMoney(sumLines(getCategoryLines(category), 'sampledAmount')) }}
            </td>
            <td class="px-4 py-3 font-medium">
              <template v-if="editMode === 'action'">
                {{ formatMoney(sumBalances(getCategoryLines(category))) }}
              </template>
            </td>
            <td v-if="editMode === 'action'" class="px-4 py-3" />
          </tr>
          <template v-if="isExpanded(category.key)">
            <template v-for="(subsection, subsectionIndex) in category.subsections" :key="subsection.key">
              <tr
                :id="subsectionIndex === 0 ? getGroupedDisclosureControlsId(category.key) : undefined"
                class="bg-zinc-50/60 dark:bg-zinc-900/30">
                <th scope="rowgroup" class="px-4 py-3 text-left">
                  <CommonGroupedDisclosureButton
                    class="flex items-center gap-2 pl-6 font-medium"
                    :expanded="isExpanded(subsection.key)"
                    :controls="getGroupedDisclosureControlsId(subsection.key)"
                    :label="subsection.label"
                    @toggle="toggleGroup(subsection.key)">
                    <UIcon :name="isExpanded(subsection.key) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4" />
                    {{ subsection.label }}
                    <CommonStatusBadge variant="count" size="sm" :label="String(subsection.lines.length)" />
                  </CommonGroupedDisclosureButton>
                </th>
                <td class="px-4 py-3 font-medium">
                  {{ formatMoney(sumLines(subsection.lines, 'submittedAmount')) }}
                </td>
                <td class="px-4 py-3 font-medium">
                  {{ formatMoney(sumLines(subsection.lines, 'reconciledAmount')) }}
                </td>
                <td class="px-4 py-3 font-medium">
                  {{ formatMoney(sumLines(subsection.lines, 'sampledAmount')) }}
                </td>
                <td class="px-4 py-3 font-medium">
                  <template v-if="editMode === 'action'">
                    {{ formatMoney(sumBalances(subsection.lines)) }}
                  </template>
                </td>
                <td v-if="editMode === 'action'" class="px-4 py-3" />
              </tr>
              <tr
                v-for="(line, lineIndex) in subsection.lines"
                v-show="isExpanded(subsection.key)"
                :id="isExpanded(subsection.key) && lineIndex === 0 ? getGroupedDisclosureControlsId(subsection.key) : undefined"
                :key="line.id">
                <th scope="row" class="px-4 py-4 text-left">
                  <div class="pl-12">
                    <p class="font-semibold text-highlighted">
                      {{ line.name }}
                    </p>
                    <p v-if="line.description && line.description !== line.name" class="mt-1 text-xs font-normal text-muted">
                      {{ line.description }}
                    </p>
                  </div>
                </th>
                <td class="px-4 py-4 font-semibold">
                  {{ formatMoney(line.submittedAmount) }}
                </td>
                <td class="px-4 py-4">
                  <UInput
                    v-if="line.editable && editMode === 'inline'"
                    :model-value="line.reconciledAmount"
                    inputmode="decimal"
                    :aria-label="t('agreement.claims.reconciled_amount_for', { name: line.name })"
                    class="w-40"
                    @update:model-value="value => emit('update:reconciled', line.id, value)" />
                  <span v-else>{{ formatMoney(tryParseMoney(line.reconciledAmount) ?? parseMoney('0')) }}</span>
                </td>
                <td class="px-4 py-4">
                  <UInput
                    v-if="line.editable && editMode === 'inline'"
                    :model-value="line.sampledAmount"
                    inputmode="decimal"
                    :aria-label="t('agreement.claims.sampled_amount_for', { name: line.name })"
                    class="w-40"
                    @update:model-value="value => emit('update:sampled', line.id, value)" />
                  <span v-else>{{ formatMoney(tryParseMoney(line.sampledAmount) ?? parseMoney('0')) }}</span>
                </td>
                <td class="px-4 py-4">
                  <template v-if="editMode === 'inline'">
                    <UInput
                      v-if="line.editable"
                      :model-value="line.rationale"
                      :aria-label="t('agreement.claims.rationale_for', { name: line.name })"
                      class="min-w-64"
                      @update:model-value="value => emit('update:rationale', line.id, value)" />
                    <span v-else>{{ line.rationale || t('common.none') }}</span>
                  </template>
                  <span v-else class="font-semibold text-primary">
                    {{ formatMoney(getLineBalance(line)) }}
                  </span>
                </td>
                <td v-if="editMode === 'action'" class="px-4 py-4">
                  <UButton
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    :icon="line.editable ? 'i-lucide-pencil' : 'i-lucide-eye'"
                    class="cursor-default"
                    :aria-label="t(line.editable ? 'agreement.claims.edit_reconcile_line_for' : 'agreement.claims.view_reconcile_line_for', { name: line.name })"
                    @click="emit('edit', line)" />
                </td>
              </tr>
            </template>
          </template>
        </template>
        <tr v-if="lines.length === 0">
          <td :colspan="editMode === 'action' ? 6 : 5" class="px-4 py-10 text-center text-muted">
            {{ t('agreement.claims.no_reconcile_lines') }}
          </td>
        </tr>
      </tbody>
      <tfoot>
        <tr class="border-t-2 border-primary/20 font-bold text-highlighted">
          <th scope="row" class="px-4 py-4 text-left">
            {{ t('agreement.claims.total') }}
          </th>
          <td class="px-4 py-4">
            {{ formatMoney(totalSubmitted) }}
          </td>
          <td class="px-4 py-4">
            {{ formatMoney(totalReconciled) }}
          </td>
          <td class="px-4 py-4">
            {{ formatMoney(totalSampled) }}
          </td>
          <td class="px-4 py-4">
            <template v-if="editMode === 'action'">
              {{ formatMoney(sumBalances(lines)) }}
            </template>
          </td>
          <td v-if="editMode === 'action'" class="px-4 py-4" />
        </tr>
      </tfoot>
    </table>
  </CommonTableSurface>
</template>
