<script setup lang="ts">
const {
  code,
  nameEn,
  nameFr
} = defineProps<{
  code: string
  nameEn?: string
  nameFr?: string
}>()

const { t } = useI18n()

const hasPopoverContent = computed(() => Boolean(nameEn || nameFr))
</script>

<template>
  <UPopover v-if="hasPopoverContent">
    <UButton
      color="neutral"
      variant="soft"
      size="sm"
      class="cursor-default justify-start rounded-md px-2.5 text-left font-medium normal-case tracking-normal transition-colors hover:bg-primary/10 hover:text-primary">
      <template #leading>
        <UIcon name="i-lucide-code-xml" class="size-4" />
      </template>
      {{ code }}
      <template #trailing>
        <UIcon name="i-lucide-chevrons-up-down" class="size-4" />
      </template>
    </UButton>

    <template #content>
      <div class="w-80 space-y-3 p-4">
        <div class="space-y-1">
          <div class="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
            {{ t('transfer_payment.name_en') }}
          </div>
          <p class="text-sm text-zinc-900 dark:text-zinc-50">
            {{ nameEn || code }}
          </p>
        </div>

        <div class="space-y-1">
          <div class="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
            {{ t('transfer_payment.name_fr') }}
          </div>
          <p class="text-sm text-zinc-900 dark:text-zinc-50">
            {{ nameFr || code }}
          </p>
        </div>
      </div>
    </template>
  </UPopover>

  <span
    v-else
    class="inline-flex items-center gap-1.5 rounded-md bg-zinc-100 px-2.5 py-1.5 text-left text-sm font-medium normal-case tracking-normal text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
    <UIcon name="i-lucide-code-xml" class="size-4" aria-hidden="true" />
    {{ code }}
  </span>
</template>
