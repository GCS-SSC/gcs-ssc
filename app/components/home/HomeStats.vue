<script setup lang="ts">
const { t } = useI18n()

const baseStats = computed(() => [
  {
    title: t('nav.stats.programs'),
    icon: 'i-lucide-hand-coins',
    value: 54,
    color: 'blue'
  },
  {
    title: t('nav.stats.streams'),
    icon: 'i-lucide-list-end',
    value: 116,
    color: 'slate'
  },
  {
    title: t('nav.stats.agreements'),
    icon: 'i-lucide-handshake',
    value: 950,
    color: 'primary'
  },
  {
    title: t('nav.stats.stakeholders'),
    icon: 'i-lucide-users-round',
    value: 100,
    color: 'red'
  }
])
</script>

<template>
  <div class="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
    <CommonStatCard
      v-for="(stat, index) in baseStats"
      :key="index"
      :title="stat.title"
      :value="stat.value"
      :icon="stat.icon"
      :color="stat.color"
      :trend="index === 0 ? '+4%' : undefined"
      :progress="65" />
  </div>
</template>
