<script setup lang="ts">
import { computed } from 'vue'
import { TransferPaymentStreamChartOfAccountDimensionSchema } from '~~/shared/types/schemas/transfer-payment'

const { label, dimensions } = defineProps<{ label: string; dimensions: unknown }>()
const { locale } = useI18n()
const parsedDimensions = computed(() => TransferPaymentStreamChartOfAccountDimensionSchema.array().safeParse(dimensions))
</script>

<template>
  <span class="block wrap-anywhere whitespace-pre-line">
    <template v-if="parsedDimensions.success">
      <strong class="block">{{ label.split('\n', 1)[0] }}</strong>
      <span v-for="(dimension, index) in parsedDimensions.data" :key="index" class="block">
        <strong>{{ locale === 'fr' ? dimension.label_fr : dimension.label_en }}:</strong> {{ dimension.value }}
      </span>
    </template>
    <template v-else>{{ label }}</template>
  </span>
</template>
