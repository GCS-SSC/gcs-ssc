<script setup lang="ts">
const { nameEn, nameFr, abbreviationEn, abbreviationFr, to, extra } = defineProps<{
  nameEn?: string | null
  nameFr?: string | null
  abbreviationEn?: string | null
  abbreviationFr?: string | null
  to?: string
  extra?: string
}>()

const { locale } = useI18n()
</script>

<template>
  <div class="flex flex-col gap-0.5">
    <ULink
      v-if="to"
      :to="to"
      :lang="locale"
      class="leading-tight font-bold text-zinc-900 transition-colors hover:text-primary dark:text-white">
      {{ locale === 'en' ? nameEn : nameFr }}
    </ULink>
    <p v-else :lang="locale" class="leading-tight font-bold text-zinc-900 dark:text-white">
      {{ locale === 'en' ? nameEn : nameFr }}
    </p>
    <p :lang="locale === 'en' ? 'fr' : 'en'" class="flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
      {{ locale === 'en' ? nameFr : nameEn }}
      <template v-if="abbreviationEn || abbreviationFr || extra">
        <span class="size-1 rounded-full bg-zinc-300 dark:bg-zinc-700" />
        <span :lang="locale" class="uppercase">
          {{ locale === 'en' ? abbreviationEn : abbreviationFr }}
          {{ extra }}
        </span>
      </template>
    </p>
  </div>
</template>
