<script setup lang="ts">
/* eslint-disable jsdoc/require-param, jsdoc/require-returns -- concise local editor mutations are self-describing */
import { nanoid } from 'nanoid'
import type { ReviewSchemaHelpEditorItem } from '~/types/review-schema-editor'

const helpItems = defineModel<ReviewSchemaHelpEditorItem[]>({ default: () => [] })
const { t } = useI18n()

/** Adds an empty bilingual help entry to the shared review-schema editor. */
const addHelp = () => {
  helpItems.value.push({
    _key: nanoid(),
    title: { en: '', fr: '' },
    description: { en: '', fr: '' }
  })
}
/** Removes a help entry by its displayed position. */
const removeHelp = (helpIndex: number) => helpItems.value.splice(helpIndex, 1)
</script>

<template>
  <AssessmentSchemaAccordionSection :title="t('transfer_payment.help_text')">
    <div class="space-y-4">
      <div class="flex justify-end">
        <UButton
          icon="i-lucide-plus"
          :label="t('common.add')"
          variant="outline"
          class="cursor-default"
          @click="addHelp" />
      </div>

      <div
        v-for="(helpItem, helpIndex) in helpItems"
        :key="helpItem._key"
        class="border-default space-y-4 border-t pt-4">
        <div class="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <UFormField :label="t('transfer_payment.name_en')" :name="`item.help.${helpIndex}.title.en`">
            <UInput v-model="helpItem.title.en" />
          </UFormField>

          <UFormField :label="t('transfer_payment.name_fr')" :name="`item.help.${helpIndex}.title.fr`">
            <UInput v-model="helpItem.title.fr" />
          </UFormField>

          <div class="flex items-end xl:pb-1.5">
            <UButton
              icon="i-lucide-trash"
              color="error"
              variant="ghost"
              class="cursor-default"
              :aria-label="t('common.delete_named', { name: helpItem.title.en || helpItem.title.fr || String(helpIndex + 1) })"
              @click="removeHelp(helpIndex)" />
          </div>
        </div>

        <UFormField :label="t('transfer_payment.description_en')" :name="`item.help.${helpIndex}.description.en`">
          <CommonTextarea v-model="helpItem.description.en" :rows="3" />
        </UFormField>

        <UFormField :label="t('transfer_payment.description_fr')" :name="`item.help.${helpIndex}.description.fr`">
          <CommonTextarea v-model="helpItem.description.fr" :rows="3" />
        </UFormField>
      </div>
    </div>
  </AssessmentSchemaAccordionSection>
</template>
