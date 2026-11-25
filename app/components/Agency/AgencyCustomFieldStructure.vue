<script setup lang="ts">
import { computed } from 'vue'
import { nanoid } from 'nanoid'
import type { CustomFieldStructure } from '~~/shared/types/schemas/agreement-custom-fields'
import AgencyCustomFieldRepeatChild from './AgencyCustomFieldRepeatChild.vue'

const { disabled } = defineProps<{ disabled: boolean }>()
const structure = defineModel<CustomFieldStructure>({ required: true })
const { t, locale } = useI18n()
const columnKinds = computed(() => (['text', 'number', 'date'] as const)
  .map(value => ({ value, label: t(`custom_fields.${value}`) })))
const totalsOptions = computed(() => (['none', 'rows', 'columns', 'both'] as const)
  .map(value => ({ value, label: t(`custom_fields.totals_${value}`) })))

/** Adds a column or child with a stable identity scoped to this structure. */
const addItem = () => {
  if (disabled) return
  const item = { id: nanoid(), labelEn: '', labelFr: '', required: false, kind: 'text' as const }
  if (structure.value.kind === 'table') structure.value.columns.push(item)
  else structure.value.fields.push(item)
}

/**
 * Moves the column without changing the identities used by its cells.
 * @param index - The current column position.
 * @param direction - The adjacent position to move toward.
 */
const moveColumn = (index: number, direction: -1 | 1) => {
  if (disabled || structure.value.kind !== 'table') return
  const columns = structure.value.columns
  const current = columns[index]
  const next = columns[index + direction]
  if (!current || !next) return
  columns[index] = next
  columns[index + direction] = current
}
</script>

<template>
  <div class="space-y-4 border-t border-default pt-4" data-field-scope="agency.custom-field-structure">
    <p class="text-sm text-muted">
      {{ t('custom_fields.claims_and_forecasts_only') }}
    </p>
    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField
        :label="t(structure.kind === 'table' ? 'custom_fields.row_limit' : 'custom_fields.entry_limit')"
        data-field-label-en="Row or entry limit" data-field-label-fr="Limite de lignes ou d’entrées"
        name="egcs_ay_structure.maxRows" required>
        <UInput v-model.number="structure.maxRows" type="number" min="1" max="100" step="1" class="w-full" />
      </UFormField>
      <UFormField v-if="structure.kind === 'table'" :label="t('custom_fields.totals')" name="egcs_ay_structure.totals" required>
        <USelect v-model="structure.totals" :items="totalsOptions" class="w-full" />
      </UFormField>
    </div>

    <UFormField v-if="structure.kind === 'table'" name="egcs_ay_structure.columns" data-field-container="A dynamic collection of Table column settings.">
      <div class="space-y-4">
        <fieldset v-for="(column, index) in structure.columns" :key="column.id" class="min-w-0 space-y-3 rounded-md border border-default p-3">
          <legend class="max-w-full break-words px-1 font-semibold">
            {{ (locale === 'fr' ? column.labelFr : column.labelEn) || t('custom_fields.column_number', { number: index + 1 }) }}
          </legend>
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField :label="t('custom_fields.name_en')" data-ui-target="agency.custom-field-structure.column.label-en" :name="`egcs_ay_structure.columns.${index}.labelEn`" required>
              <UInput v-model="column.labelEn" maxlength="500" class="w-full" />
            </UFormField>
            <UFormField :label="t('custom_fields.name_fr')" data-ui-target="agency.custom-field-structure.column.label-fr" :name="`egcs_ay_structure.columns.${index}.labelFr`" required>
              <UInput v-model="column.labelFr" maxlength="500" class="w-full" />
            </UFormField>
            <UFormField :label="t('common.type')" data-ui-target="agency.custom-field-structure.column.kind" :name="`egcs_ay_structure.columns.${index}.kind`" required>
              <USelect v-model="column.kind" :items="columnKinds" class="w-full" />
            </UFormField>
          </div>
          <UFormField data-ui-target="agency.custom-field-structure.column.required" data-field-label-en="Required cell" data-field-label-fr="Cellule obligatoire" :name="`egcs_ay_structure.columns.${index}.required`">
            <UCheckbox v-model="column.required" :label="t('custom_fields.required_cell')" />
          </UFormField>
          <div class="flex flex-wrap justify-end gap-2">
            <CommonActionButton type="button" icon="i-lucide-arrow-up" color="neutral" variant="ghost" :aria-label="t('custom_fields.move_up')" :disabled="disabled || index === 0" @click="moveColumn(index, -1)" />
            <CommonActionButton type="button" icon="i-lucide-arrow-down" color="neutral" variant="ghost" :aria-label="t('custom_fields.move_down')" :disabled="disabled || index === structure.columns.length - 1" @click="moveColumn(index, 1)" />
            <UButton type="button" icon="i-lucide-trash" color="error" variant="ghost" :label="t('custom_fields.remove_column')" :disabled="disabled" @click="!disabled && structure.columns.splice(index, 1)" />
          </div>
        </fieldset>
        <UButton type="button" icon="i-lucide-plus" color="neutral" variant="outline" :label="t('custom_fields.add_column')" :disabled="disabled || structure.columns.length >= 30" @click="addItem" />
      </div>
    </UFormField>

    <UFormField v-else name="egcs_ay_structure.fields" data-field-container="A dynamic collection of Repeating set child field settings.">
      <div class="space-y-4">
        <AgencyCustomFieldRepeatChild
          v-for="(field, index) in structure.fields" :key="field.id"
          v-model="structure.fields[index]!" :index="index" :disabled="disabled"
          data-field-container="Composite child field editor; its controls provide individual names."
          @remove="!disabled && structure.fields.splice(index, 1)" />
        <UButton type="button" icon="i-lucide-plus" color="neutral" variant="outline" :label="t('custom_fields.add_field')" :disabled="disabled || structure.fields.length >= 30" @click="addItem" />
      </div>
    </UFormField>
  </div>
</template>
