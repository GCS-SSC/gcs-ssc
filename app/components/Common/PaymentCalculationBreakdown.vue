<script setup lang="ts">
import type { GcsPaymentAmountCalculatorResult } from '@gcs-ssc/extensions/ui'

defineProps<{ explanation: NonNullable<GcsPaymentAmountCalculatorResult['explanation']> }>()
</script>

<template>
  <div data-testid="payment-calculation-breakdown" class="grid gap-x-10 gap-y-6 text-sm sm:grid-cols-2">
    <section
      v-for="step in explanation"
      :key="step.label"
      :class="step.emphasis ? 'sm:col-span-2' : ''"
      class="min-w-0">
      <h3 class="mb-3 font-semibold text-highlighted">
        {{ step.label }}
      </h3>
      <dl>
        <div v-for="row in step.rows" :key="row.label" :class="step.emphasis ? 'grid-cols-[minmax(0,1fr)_minmax(0,auto)]' : 'grid-cols-[1rem_minmax(0,1fr)_minmax(0,auto)]'" class="grid items-baseline gap-x-2 py-1.5">
          <span v-if="!step.emphasis" aria-hidden="true" class="text-muted tabular-nums">{{ row.operator }}</span>
          <dt class="min-w-0 break-words text-muted">
            <span v-if="row.operator" class="sr-only">{{ row.operator }} </span>{{ row.label }}
          </dt>
          <dd class="min-w-0 text-right font-medium text-highlighted tabular-nums [overflow-wrap:anywhere]">
            {{ row.value }}
          </dd>
        </div>
        <div data-testid="payment-calculation-total" :class="step.emphasis ? 'mt-3' : 'mt-1'" class="grid grid-cols-[minmax(0,1fr)_minmax(0,auto)] items-baseline gap-x-2 border-t border-default pt-3">
          <dt class="min-w-0 break-words font-semibold text-highlighted">
            {{ step.total.label }}
          </dt>
          <dd :class="step.emphasis ? 'text-lg text-primary' : 'text-highlighted'" class="min-w-0 text-right font-semibold tabular-nums [overflow-wrap:anywhere]">
            {{ step.total.value }}
          </dd>
        </div>
      </dl>
      <p v-if="step.note" class="mt-2 pl-6 text-xs leading-5 text-muted">
        {{ step.note }}
      </p>
    </section>
  </div>
</template>
