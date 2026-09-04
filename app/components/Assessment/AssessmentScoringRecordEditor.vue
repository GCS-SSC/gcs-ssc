<script setup lang="ts">
import type { KeyValueScoreRow } from '~/composables/useAssessmentSchemaEditorState'
import { createKeyValueScoreRow } from '~/composables/useAssessmentSchemaEditorState'

const rows = defineModel<KeyValueScoreRow[]>({ required: true, default: () => [] })
const { title } = defineProps<{ title: string }>()
const { t } = useI18n()

const addRow = () => {
  rows.value.push(createKeyValueScoreRow())
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

    <div v-for="(row, index) in rows" :key="row._key" class="border-default grid grid-cols-1 gap-3 border-t pt-4 md:grid-cols-[1fr_180px_auto]">
      <UFormField :label="t('common.name')" :name="`scoring.${index}.key`">
        <UInput v-model="row.key" />
      </UFormField>

      <UFormField :label="t('common.value')" :name="`scoring.${index}.value`">
        <UInput v-model.number="row.value" type="number" />
      </UFormField>

      <div class="flex items-end">
        <UButton
          icon="i-lucide-trash"
          color="error"
          variant="ghost"
          class="cursor-default"
          :aria-label="t('transfer_payment.remove_scoring_row_named', { position: index + 1, name: row.key || t('common.none') })"
          @click="removeRow(index)" />
      </div>
    </div>
  </div>
</template>
