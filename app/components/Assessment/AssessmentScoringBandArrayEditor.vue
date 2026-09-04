<script setup lang="ts">
import type { AssessmentBandRow } from '~/composables/useAssessmentSchemaEditorState'
import { createAssessmentBandRow } from '~/composables/useAssessmentSchemaEditorState'
import { getAssessmentLocaleLabel } from '~/utils/assessment-schema'

const rows = defineModel<AssessmentBandRow[]>({ required: true, default: () => [] })
const { title, fieldPath } = defineProps<{ title: string, fieldPath: string }>()
const { t, locale } = useI18n()
const activeLocale = computed<'en' | 'fr'>(() => locale.value === 'fr' ? 'fr' : 'en')

/**
 * Returns the localized display name for an assessment scoring band.
 *
 * @param row - Assessment scoring band row.
 * @returns Localized display name.
 */
const getBandName = (row: AssessmentBandRow) => getAssessmentLocaleLabel(
  row.label,
  activeLocale.value,
  t('common.none')
)

const addRow = () => {
  rows.value.push(createAssessmentBandRow())
}

const removeRow = (index: number) => {
  rows.value.splice(index, 1)
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-3">
      <h3 class="text-base font-semibold">
        {{ title }}
      </h3>
      <UButton icon="i-lucide-plus" :label="t('common.add')" variant="outline" class="cursor-default" @click="addRow" />
    </div>

    <div v-if="rows.length === 0" class="border-default border-t pt-4 text-sm text-zinc-500 dark:text-zinc-400">
      {{ t('common.no_records') }}
    </div>

    <div v-for="(row, index) in rows" :key="row._key" class="border-default space-y-3 border-t pt-4">
      <div class="grid grid-cols-1 gap-3 md:grid-cols-[160px_1fr_1fr_220px_auto]">
        <UFormField :label="t('common.max')" :name="`${fieldPath}.${index}.max`">
          <UInput v-model.number="row.max" type="number" />
        </UFormField>

        <UFormField :label="t('transfer_payment.name_en')" :name="`${fieldPath}.${index}.label.en`">
          <UInput v-model="row.label.en" />
        </UFormField>

        <UFormField :label="t('transfer_payment.name_fr')" :name="`${fieldPath}.${index}.label.fr`">
          <UInput v-model="row.label.fr" />
        </UFormField>

        <UFormField :label="t('transfer_payment.indicator_color')" :name="`${fieldPath}.${index}.indicator`">
          <UPopover>
            <UButton color="neutral" variant="outline" class="w-full cursor-default justify-start">
              <template #leading>
                <span :style="{ backgroundColor: row.indicator }" class="size-3 rounded-full" />
              </template>
              <span class="font-mono text-xs">
                {{ row.indicator }}
              </span>
            </UButton>

            <template #content>
              <UColorPicker v-model="row.indicator" class="p-2" />
            </template>
          </UPopover>
        </UFormField>

        <div class="flex items-end">
          <UButton
            icon="i-lucide-trash"
            color="error"
            variant="ghost"
            class="cursor-default"
            :aria-label="t('transfer_payment.remove_scoring_band_named', { position: index + 1, name: getBandName(row) })"
            @click="removeRow(index)" />
        </div>
      </div>
    </div>
  </div>
</template>
