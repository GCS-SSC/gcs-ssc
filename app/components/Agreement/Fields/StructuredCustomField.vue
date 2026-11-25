<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { computed, useId } from 'vue'
import { nanoid } from 'nanoid'
import AgreementFieldsCustomField from './CustomField.vue'
import { customFieldTableTotals } from '~~/shared/types/schemas/agreement-custom-fields'
import type {
  AssignedAgencyCustomFieldDefinition,
  CustomFieldStructure,
  CustomFieldStructuredAnswer
} from '~~/shared/types/schemas/agreement-custom-fields'

const { field, structure, currency, readonly = false, disabled = false } = defineProps<{
  field: AssignedAgencyCustomFieldDefinition
  structure: CustomFieldStructure
  currency?: string
  readonly?: boolean
  disabled?: boolean
}>()
const model = defineModel<CustomFieldStructuredAnswer | null>()
const { locale, n, t } = useI18n()
const dateFormatter = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeZone: 'UTC' }))
const rows = computed(() => model.value?.rows ?? [])
const groupId = useId()
const labelId = `${groupId}-label`
const instructionsId = `${groupId}-instructions`
const formName = computed(() => `egcs_fc_customfields.${field.id}`)
const fieldLabel = computed(() => locale.value === 'fr' ? field.egcs_ay_name_fr : field.egcs_ay_name_en)
const table = computed(() => structure.kind === 'table' ? structure : null)
const rowTotals = computed(() => table.value?.totals === 'rows' || table.value?.totals === 'both')
const columnTotals = computed(() => table.value?.totals === 'columns' || table.value?.totals === 'both')
const totals = computed(() => table.value && (rowTotals.value || columnTotals.value)
  ? customFieldTableTotals(table.value.columns, rows.value)
  : null)

type Row = CustomFieldStructuredAnswer['rows'][number]
type Cell = Row['cells'][string]
type RepeatField = Extract<CustomFieldStructure, { kind: 'repeating' }>['fields'][number]

const label = (item: { labelEn: string; labelFr: string }) => locale.value === 'fr' ? item.labelFr : item.labelEn
const entryLabel = (index: number) => t('custom_fields.entry_number', { number: n(index + 1) })
const rowLabel = (index: number) => t('custom_fields.row_number', { number: n(index + 1) })
const cellName = (index: number, id: string) => `${formName.value}.rows.${index}.cells.${id}`

/** Adds an empty row to the owning Claim draft. */
const addRow = () => {
  if (disabled || readonly || rows.value.length >= structure.maxRows) return
  model.value = { rows: [...rows.value, { id: nanoid(), cells: {} }] }
}

/**
 * Removes a row by its draft identity.
 * @param id - Stable row identifier.
 */
const removeRow = (id: string) => {
  const remaining = rows.value.filter(row => row.id !== id)
  model.value = remaining.length ? { rows: remaining } : null
}

/**
 * Replaces the changed row and preserves the original Claim answer.
 * @param rowId - Stable row identifier.
 * @param id - Column or child field identifier.
 * @param value - New draft value or a clear.
 */
const updateCell = (rowId: string, id: string, value: Cell | null | undefined) => {
  model.value = {
    rows: rows.value.map(row => {
      if (row.id !== rowId) return row
      const cells = { ...row.cells }
      if (value == null || value === '' || (Array.isArray(value) && !value.length)) Reflect.deleteProperty(cells, id)
      else cells[id] = value
      return { ...row, cells }
    })
  }
}

/**
 * Adapts a pinned repeat child to the controls used for top-level answers.
 * @param child - Captured child definition.
 * @returns Equivalent assigned field for rendering.
 */
const toAssignedDefinition = (child: RepeatField): AssignedAgencyCustomFieldDefinition => ({
  id: child.id,
  assignmentId: field.assignmentId,
  egcs_ay_name_en: child.labelEn,
  egcs_ay_name_fr: child.labelFr,
  egcs_ay_kind: child.kind,
  egcs_ay_presentation: child.presentation ?? 'single_line',
  egcs_ay_multiple: child.multiple ?? false,
  egcs_ay_discriminator: false,
  egcs_ay_minimum: child.minimum,
  egcs_ay_maximum: child.maximum,
  egcs_ay_decimalplaces: child.decimalPlaces,
  egcs_tp_section: null,
  egcs_tp_active: true,
  egcs_tp_required: child.required,
  egcs_tp_displayorder: 0,
  options: (child.options ?? []).map((option, index) => ({
    id: option.id,
    egcs_ay_name_en: option.labelEn,
    egcs_ay_name_fr: option.labelFr,
    egcs_ay_category_en: null,
    egcs_ay_category_fr: null,
    egcs_ay_active: true,
    egcs_ay_displayorder: index
  }))
})
const repeatFields = computed(() => structure.kind === 'repeating' ? structure.fields.map(toAssignedDefinition) : [])

const decimalSeparator = computed(() =>
  new Intl.NumberFormat(locale.value).formatToParts(1.1).find(part => part.type === 'decimal')?.value ?? '.'
)
const decimalLabel = (value: string | null | undefined) => value?.replace('.', decimalSeparator.value) ?? '—'
const incompleteDate = 'invalid-date'
const cellInputValue = (kind: string, value: Cell | undefined) =>
  kind === 'date' && value === incompleteDate ? '' : kind === 'number' ? decimalLabel(String(value ?? '')) : String(value ?? '')

/**
 * Preserves incomplete browser dates and converts localized decimals to their stored form.
 * @param event - Native input event.
 * @param rowId - Stable row identifier.
 * @param column - Edited table column.
 */
const updateTableInput = (event: Event, rowId: string, column: NonNullable<typeof table.value>['columns'][number]) => {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) return
  if (column.kind === 'date' && input.validity.badInput) updateCell(rowId, column.id, incompleteDate)
  else updateCell(rowId, column.id, column.kind === 'number' ? input.value.replace(decimalSeparator.value, '.') : input.value)
}
/**
 * Formats a stored table cell for Claim readback.
 * @param kind - Column value type.
 * @param value - Captured row value.
 * @returns Localized display value.
 */
const cellLabel = (kind: string, value: Cell | undefined) => {
  if (typeof value !== 'string' || !value) return '—'
  if (kind === 'number') return decimalLabel(value)
  if (kind === 'date') {
    const date = new Date(`${value}T00:00:00Z`)
    return Number.isNaN(date.getTime()) ? '—' : dateFormatter.value.format(date)
  }
  return value
}
const tableColumns = computed<TableColumn<Row>[]>(() => {
  const columns: TableColumn<Row>[] = [{ id: 'row', header: t('custom_fields.row'), ...(columnTotals.value ? { footer: t('custom_fields.column_totals') } : {}) }]
  for (const column of table.value?.columns ?? []) {
    columns.push({ id: `cell_${column.id}`, header: label(column), meta: { class: { th: 'min-w-36', td: 'align-top' } } })
  }
  if (rowTotals.value) columns.push({ id: 'rowTotal', header: t('custom_fields.row_total') })
  if (!readonly) columns.push({ id: 'actions', header: t('common.actions'), meta: { class: { th: '[&>div]:sr-only' } } })
  return columns
})
</script>

<template>
  <div class="min-w-0 space-y-3" data-field-exclude="Agency-defined Claim structures receive identity and labels from captured definitions.">
    <div
      class="min-w-0"
      :role="readonly ? undefined : 'group'"
      :aria-labelledby="readonly ? undefined : labelId"
      :aria-describedby="readonly ? undefined : instructionsId">
      <template v-if="!readonly">
        <div :id="labelId" class="text-sm font-medium text-highlighted">
          {{ fieldLabel }}
          <span v-if="field.egcs_tp_required" class="text-xs font-normal text-muted" aria-hidden="true">({{ t('common.field_required') }})</span>
        </div>
        <p :id="instructionsId" class="text-sm text-muted">
          <span v-if="field.egcs_tp_required">
            {{ t(table ? 'custom_fields.row_required_note' : 'custom_fields.entry_required_note') }}
          </span>
          {{ t(table ? 'custom_fields.row_limit_note' : 'custom_fields.entry_limit_note', { maximum: n(structure.maxRows) }) }}
        </p>
        <UFormField :name="formName" :required="field.egcs_tp_required" />
      </template>
      <p v-if="readonly && !rows.length" class="text-sm text-default">
        {{ t('supplementary_information.no_answer') }}
      </p>
      <CommonCompactTable
        v-if="table && rows.length"
        :data="rows"
        :columns="tableColumns"
        :get-row-id="row => row.id"
        :ui="{ caption: 'sr-only', thead: 'bg-elevated', tfoot: 'bg-elevated' }"
        class="mt-3"
        role="region"
        :aria-label="fieldLabel">
        <template #caption>
          {{ fieldLabel }}
        </template>
        <template #row-cell="{ row }">
          {{ n(row.index + 1) }}
        </template>
        <template v-for="column in table.columns" :key="column.id" #[`cell_${column.id}-header`]>
          {{ label(column) }}
          <span v-if="!readonly && column.required" class="text-xs font-normal text-muted" aria-hidden="true">({{ t('common.field_required') }})</span>
        </template>
        <template v-for="column in table.columns" :key="column.id" #[`cell_${column.id}-cell`]="{ row }">
          <span v-if="readonly" class="whitespace-pre-wrap [overflow-wrap:anywhere]">{{ cellLabel(column.kind, row.original.cells[column.id]) }}</span>
          <UFormField
            v-else
            :name="cellName(row.index, column.id)"
            :label="`${rowLabel(row.index)}, ${label(column)}`"
            :required="column.required"
            :ui="{ wrapper: 'sr-only', container: 'mt-0' }">
            <UInput
              :type="column.kind === 'date' ? 'date' : 'text'"
              :inputmode="column.kind === 'number' ? 'decimal' : undefined"
              :model-value="cellInputValue(column.kind, row.original.cells[column.id])"
              :required="column.required"
              :disabled="disabled"
              class="w-full"
              @input="updateTableInput($event, row.original.id, column)" />
          </UFormField>
        </template>
        <template v-for="column in table.columns" :key="column.id" #[`cell_${column.id}-footer`]>
          <span class="block text-end tabular-nums">{{ column.kind === 'number' ? decimalLabel(totals?.columns[column.id]) : '' }}</span>
        </template>
        <template #rowTotal-cell="{ row }">
          <span class="block text-end tabular-nums">{{ decimalLabel(totals?.rows[row.original.id]) }}</span>
        </template>
        <template #actions-header>
          <span class="sr-only">{{ t('common.actions') }}</span>
        </template>
        <template #actions-cell="{ row }">
          <CommonActionButton
            variant="ghost"
            color="neutral"
            icon="i-lucide-trash-2"
            :aria-label="t('custom_fields.remove_row', { number: n(row.index + 1) })"
            :disabled="disabled"
            @click="removeRow(row.original.id)" />
        </template>
      </CommonCompactTable>
      <div v-else-if="structure.kind === 'repeating' && rows.length" class="mt-3 space-y-3">
        <fieldset v-for="(row, index) in rows" :key="row.id" class="min-w-0 rounded-md border border-default p-3">
          <legend class="px-1 text-sm font-medium text-highlighted">
            {{ entryLabel(index) }}
          </legend>
          <div v-if="!readonly" class="flex justify-end">
            <UButton
              type="button"
              size="sm"
              variant="ghost"
              color="neutral"
              icon="i-lucide-trash-2"
              :label="t('custom_fields.remove_entry', { number: n(index + 1) })"
              :disabled="disabled"
              @click="removeRow(row.id)" />
          </div>
          <dl v-if="readonly" class="grid gap-4 sm:grid-cols-2">
            <AgreementFieldsCustomField
              v-for="child in repeatFields"
              :key="child.id"
              :field="child"
              :currency="currency"
              :options="child.options"
              :model-value="row.cells[child.id]"
              readonly>
              <template #answer="{ label: childLabel, answer }">
                <dt class="text-sm font-medium text-highlighted">
                  {{ childLabel }}
                </dt>
                <dd class="whitespace-pre-wrap text-sm text-default [overflow-wrap:anywhere]">
                  {{ answer || t('supplementary_information.no_answer') }}
                </dd>
              </template>
            </AgreementFieldsCustomField>
          </dl>
          <div v-else class="grid gap-4 sm:grid-cols-2">
            <AgreementFieldsCustomField
              v-for="child in repeatFields"
              :key="child.id"
              :field="child"
              :currency="currency"
              :options="child.options"
              :name="cellName(index, child.id)"
              :model-value="row.cells[child.id]"
              :disabled="disabled"
              @update:model-value="value => updateCell(row.id, child.id, value && typeof value === 'object' && 'rows' in value ? null : value)" />
          </div>
        </fieldset>
      </div>
      <UButton
        v-if="!readonly"
        type="button"
        variant="soft"
        color="neutral"
        icon="i-lucide-plus"
        class="mt-3"
        :label="table ? t('custom_fields.add_row') : t('custom_fields.add_entry')"
        :aria-describedby="`${labelId} ${instructionsId}`"
        :disabled="disabled || rows.length >= structure.maxRows"
        @click="addRow" />
    </div>
  </div>
</template>
