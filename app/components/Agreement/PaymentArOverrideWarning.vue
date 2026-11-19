<script setup lang="ts">
import { formatMoneyText } from '~~/shared/utils/money'
import type { Money } from '~~/shared/utils/money'

const { amount, reason } = defineProps<{ amount: Money, reason?: string }>()
const { t, locale } = useI18n()
</script>

<template>
  <CommonNotice
    tone="warning"
    role="alert"
    icon="i-lucide-triangle-alert"
    data-testid="payment-ar-override-warning"
    :title="t('agreement.payments.ar_override.title')"
    :description="t('agreement.payments.ar_override.warning', { amount: formatMoneyText(amount, locale) })">
    <template v-if="reason" #description>
      <p>{{ t('agreement.payments.ar_override.warning', { amount: formatMoneyText(amount, locale) }) }}</p>
      <dl class="mt-2">
        <dt class="font-semibold">
          {{ t('agreement.payments.ar_override.recorded_reason') }}
        </dt>
        <dd class="whitespace-pre-wrap">
          {{ reason }}
        </dd>
      </dl>
    </template>
  </CommonNotice>
</template>
