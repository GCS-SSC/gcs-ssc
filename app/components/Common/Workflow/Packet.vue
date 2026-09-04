<script setup lang="ts">
const { title, packetId, icon = 'i-lucide-package-check', capturedLabel, hashLabel, hash } = defineProps<{
  title: string
  packetId: string
  icon?: string
  capturedLabel?: string
  hashLabel: string
  hash: string
}>()
</script>

<template>
  <UAccordion
    :items="[{ label: title, value: packetId, icon }]"
    type="single"
    collapsible
    :unmount-on-hide="false"
    :ui="{
      root: 'rounded-lg border border-default bg-default',
      item: 'border-b-0',
      trigger: 'px-4 py-4 text-base font-semibold sm:px-5',
      body: 'px-4 pb-5 sm:px-5',
      content: 'data-[state=open]:animate-none'
    }">
    <template #body>
      <div class="space-y-6">
        <div class="flex flex-col gap-3 border-b border-default pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div class="space-y-2">
            <p v-if="capturedLabel" class="text-sm text-muted">
              {{ capturedLabel }}
            </p>
            <slot name="summary" />
          </div>
          <details class="max-w-xl text-sm">
            <summary class="cursor-pointer font-medium text-muted">
              {{ $t('workflow.packet.integrity_details') }}
            </summary>
            <p class="mt-2 text-xs text-muted">
              {{ hashLabel }}
            </p>
            <code class="mt-1 block break-all rounded bg-muted p-2 text-xs">{{ hash }}</code>
          </details>
        </div>

        <slot />
      </div>
    </template>
  </UAccordion>
</template>
