<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { renderSafeMarkdown } from '@gcs-ssc/guided-help/markdown'
import type { TableColumn } from '@nuxt/ui'
import type { GuideDraft } from '@gcs-ssc/guided-help/contracts'
import type { HelpVersion } from '~/utils/guided-help-client'

const { versions } = defineProps<{ versions: HelpVersion[] }>()
const emit = defineEmits<{ preview: [document: GuideDraft] }>()
const { t, locale } = useI18n()
const selected: Ref<HelpVersion | null> = ref(null)
const open = ref(false)
const columns = computed<TableColumn<HelpVersion>[]>(() => [
  { accessorKey: 'version', header: t('guided_help.source_version'), meta: { class: { th: 'w-[14%]' } } },
  { id: 'title', header: t('common.name'), meta: { class: { th: 'w-[36%]' } } },
  { id: 'publishedAt', header: t('guided_help.published_at'), meta: { class: { th: 'w-[24%]' } } },
  { accessorKey: 'actorId', header: t('guided_help.publisher'), meta: { class: { th: 'w-[14%]' } } },
  { id: 'actions', header: t('common.actions'), meta: { class: { th: 'w-[12%]' } } }
])
const label = (value: { en: string, fr: string }) => value[locale.value === 'fr' ? 'fr' : 'en']
const publishedAt = (value?: string) => value ? new Date(value).toLocaleString(locale.value) : t('common.unknown')
/**
 * Opens captured content without mixing it with the current working draft.
 * @param version Captured publication to inspect.
 */
const inspect = (version: HelpVersion) => {
  selected.value = version
  open.value = true
}
</script>

<template>
  <div class="space-y-4">
    <CommonCompactTable :data="versions" :columns="columns" :ui="{ table: 'w-full min-w-[36rem] table-fixed', th: 'whitespace-normal break-words', td: 'align-top whitespace-normal break-words' }">
      <template #title-cell="{ row }">
        <CommonBilingualName :name-en="row.original.document.title.en" :name-fr="row.original.document.title.fr" />
      </template>
      <template #publishedAt-cell="{ row }">
        {{ publishedAt(row.original.publishedAt) }}
      </template>
      <template #actions-cell="{ row }">
        <UButton icon="i-lucide-arrow-right" color="neutral" variant="ghost" size="sm" :aria-label="t('common.open')" @click="inspect(row.original)" />
      </template>
    </CommonCompactTable>
    <UModal v-model:open="open" :title="selected ? `${label(selected.document.title)} · ${t('guided_help.version_number', { number: selected.version })}` : t('guided_help.version_history')" :description="t('guided_help.published_evidence')" :ui="{ content: 'sm:max-w-4xl' }">
      <template #body>
        <div v-if="selected" class="space-y-8">
          <dl class="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt class="font-semibold">
                {{ t('guided_help.source_version') }}
              </dt><dd>{{ selected.version }}</dd>
            </div>
            <div>
              <dt class="font-semibold">
                {{ t('guided_help.published_at') }}
              </dt><dd>{{ publishedAt(selected.publishedAt) }}</dd>
            </div>
            <div>
              <dt class="font-semibold">
                {{ t('guided_help.publisher') }}
              </dt><dd>{{ selected.actorId || t('common.unknown') }}</dd>
            </div>
          </dl>
          <p class="whitespace-pre-wrap text-muted">
            {{ label(selected.document.description) }}
          </p>
          <ol class="space-y-6">
            <li v-for="(step, index) in selected.document.steps" :key="step.id" class="space-y-2">
              <h3 class="font-semibold">
                {{ index + 1 }}. {{ label(step.title) }}
              </h3><!-- eslint-disable-next-line vue/no-v-html -- Restricted renderer escapes every authored token and validates link protocols. -->
              <div class="leading-relaxed [&_a]:text-primary [&_a]:underline" v-html="renderSafeMarkdown(label(step.instructions))" />
            </li>
          </ol>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton :label="t('common.close')" color="neutral" variant="ghost" @click="open = false" /><UButton v-if="selected" :label="t('guided_help.preview')" icon="i-lucide-play" @click="emit('preview', selected.document)" />
        </div>
      </template>
    </UModal>
  </div>
</template>
