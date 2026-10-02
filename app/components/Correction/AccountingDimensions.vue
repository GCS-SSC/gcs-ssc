<script setup lang="ts">
import type { TransferPaymentStreamChartOfAccountDimension } from '~~/shared/types/schemas/transfer-payment'

const { dimensions } = defineProps<{ dimensions: TransferPaymentStreamChartOfAccountDimension[] }>()
const { locale } = useI18n()
</script>

<template>
  <dl class="grid min-w-0 grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
    <div v-for="(dimension, index) in dimensions" :key="index" class="min-w-0">
      <dt class="text-xs text-muted [overflow-wrap:anywhere]">
        {{ locale === 'fr' ? dimension.label_fr : dimension.label_en }}
      </dt>
      <dd class="mt-1 font-medium [overflow-wrap:anywhere]">
        {{ dimension.value }}
      </dd>
    </div>
  </dl>
</template>
