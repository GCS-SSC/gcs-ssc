<script setup lang="ts">
const { resource } = defineProps<{ resource: 'agreement' | 'applicant_recipient' }>()
const model = defineModel<string>({ required: true })
const { t } = useI18n()
const options = computed(() => [
  { value: 'all', label: t(`${resource}.list_views.all`) },
  { value: 'mine', label: t(`${resource}.list_views.mine`) }
])
</script>

<template>
  <CommonServerLookupSelect
    v-model="model"
    fetch-url="/api/list-view-agencies"
    :query="{ resource }"
    value-key="id"
    label-en-key="label_en"
    label-fr-key="label_fr"
    :show-value-in-label="false"
    :prepend-items="options"
    :aria-label="t(`${resource}.list_views.label`)"
    class="min-w-56" />
</template>
