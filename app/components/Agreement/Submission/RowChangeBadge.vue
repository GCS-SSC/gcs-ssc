<script setup lang="ts">
const styles = {
  added: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  changed: 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  removed: 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200'
}

defineProps<{ change?: keyof typeof styles }>()
const { t } = useI18n()
</script>

<template>
  <UBadge v-if="change" color="neutral" variant="subtle" :label="t(`submission.${change}`)" class="ms-2" :class="styles[change]" />
</template>
