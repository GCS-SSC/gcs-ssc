<script setup lang="ts">
import { computed } from 'vue'
import { nanoid } from 'nanoid'
import type { CustomFieldStructure } from '~~/shared/types/schemas/agreement-custom-fields'

type Child = Extract<CustomFieldStructure, { kind: 'repeating' }>['fields'][number]
const child = defineModel<Child>({ required: true })
const { index, disabled } = defineProps<{ index: number; disabled: boolean }>()
const emit = defineEmits<{ remove: [] }>()
const { t, locale } = useI18n()
const path = computed(() => `egcs_ay_structure.fields.${index}`)
const kinds = ['single_line', 'multiline', 'email', 'number', 'date', 'currency', 'single_selection', 'multiple_selection', 'checkboxes'] as const
const kindsOptions = computed(() => kinds.map(value => ({ value, label: t(`custom_fields.${value}`) })))
const kind = computed<typeof kinds[number]>(() => {
  const { kind, presentation, multiple } = child.value
  if (kind === 'text') return presentation === 'multiline' ? 'multiline' : 'single_line'
  if (kind === 'relational') return presentation === 'checkboxes' ? 'checkboxes' : multiple ? 'multiple_selection' : 'single_selection'
  return kind
})

/**
 * Rebuilds the child settings while preserving its identity and labels.
 * @param value - The selected child type.
 */
const setKind = (value: typeof kinds[number]) => {
  if (disabled) return
  const { id, labelEn, labelFr, required, options } = child.value
  const identity = { id, labelEn, labelFr, required }
  if (value === 'single_selection' || value === 'multiple_selection' || value === 'checkboxes') {
    child.value = {
      ...identity, kind: 'relational', multiple: value !== 'single_selection',
      presentation: value === 'checkboxes' ? 'checkboxes' : undefined, options: options ?? []
    }
  } else if (value === 'single_line' || value === 'multiline') {
    child.value = { ...identity, kind: 'text', presentation: value }
  } else {
    child.value = { ...identity, kind: value }
  }
}

const addOption = () => {
  if (disabled) return
  child.value.options?.push({ id: nanoid(), labelEn: '', labelFr: '' })
}
</script>

<template>
  <fieldset class="min-w-0 space-y-3 rounded-md border border-default p-3">
    <legend class="max-w-full break-words px-1 font-semibold">
      {{ (locale === 'fr' ? child.labelFr : child.labelEn) || t('custom_fields.child_field_number', { number: index + 1 }) }}
    </legend>
    <div class="grid gap-3 sm:grid-cols-2">
      <UFormField :label="t('custom_fields.name_en')" data-ui-target="agency.custom-field-structure.child.label-en" :name="`${path}.labelEn`" required>
        <UInput v-model="child.labelEn" maxlength="500" class="w-full" />
      </UFormField>
      <UFormField :label="t('custom_fields.name_fr')" data-ui-target="agency.custom-field-structure.child.label-fr" :name="`${path}.labelFr`" required>
        <UInput v-model="child.labelFr" maxlength="500" class="w-full" />
      </UFormField>
      <UFormField :label="t('common.type')" data-ui-target="agency.custom-field-structure.child.kind" :name="`${path}.kind`" required>
        <USelect :model-value="kind" :items="kindsOptions" class="w-full" @update:model-value="setKind" />
      </UFormField>
    </div>
    <UFormField data-ui-target="agency.custom-field-structure.child.required" data-field-label-en="Required answer" data-field-label-fr="Réponse obligatoire" :name="`${path}.required`">
      <UCheckbox v-model="child.required" :label="t('custom_fields.required_answer')" />
    </UFormField>
    <div v-if="child.kind === 'number'" class="grid gap-3 sm:grid-cols-3">
      <UFormField :label="t('custom_fields.minimum')" data-ui-target="agency.custom-field-structure.child.minimum" :name="`${path}.minimum`">
        <UInput v-model.number.optional="child.minimum" type="number" step="any" class="w-full" />
      </UFormField>
      <UFormField :label="t('custom_fields.maximum')" data-ui-target="agency.custom-field-structure.child.maximum" :name="`${path}.maximum`">
        <UInput v-model.number.optional="child.maximum" type="number" step="any" class="w-full" />
      </UFormField>
      <UFormField :label="t('custom_fields.decimal_places')" data-ui-target="agency.custom-field-structure.child.decimal-places" :name="`${path}.decimalPlaces`">
        <UInput v-model.number.optional="child.decimalPlaces" type="number" min="0" max="324" step="1" class="w-full" />
      </UFormField>
    </div>
    <UFormField v-if="child.kind === 'relational'" :name="`${path}.options`" data-field-container="A dynamic collection of choice labels.">
      <div class="space-y-3 border-l border-default pl-3">
        <fieldset v-for="(option, optionIndex) in child.options" :key="option.id" class="min-w-0 space-y-3 rounded-md border border-default p-3">
          <legend class="max-w-full break-words px-1 font-semibold">
            {{ (locale === 'fr' ? option.labelFr : option.labelEn) || t('custom_fields.option_number', { number: optionIndex + 1 }) }}
          </legend>
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField :label="t('custom_fields.name_en')" data-ui-target="agency.custom-field-structure.child.option.label-en" :name="`${path}.options.${optionIndex}.labelEn`" required>
              <UInput v-model="option.labelEn" maxlength="500" class="w-full" />
            </UFormField>
            <UFormField :label="t('custom_fields.name_fr')" data-ui-target="agency.custom-field-structure.child.option.label-fr" :name="`${path}.options.${optionIndex}.labelFr`" required>
              <UInput v-model="option.labelFr" maxlength="500" class="w-full" />
            </UFormField>
          </div>
          <UButton type="button" icon="i-lucide-trash" color="error" variant="ghost" :label="t('custom_fields.remove_option')" :disabled="disabled" @click="!disabled && child.options?.splice(optionIndex, 1)" />
        </fieldset>
        <UButton type="button" icon="i-lucide-plus" color="neutral" variant="outline" :label="t('custom_fields.add_option')" :disabled="disabled || (child.options?.length ?? 0) >= 100" @click="addOption" />
      </div>
    </UFormField>
    <div class="flex justify-end">
      <UButton type="button" icon="i-lucide-trash" color="error" variant="ghost" :label="t('custom_fields.remove_field')" :disabled="disabled" @click="!disabled && emit('remove')" />
    </div>
  </fieldset>
</template>
