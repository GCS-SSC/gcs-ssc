<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

const ENTITY_TYPE_ICON_MAP: Record<string, string> = {
  fundingopportunity: 'i-lucide-briefcase',
  fundingcaseagreement: 'i-lucide-file-signature',
  applicantrecipient: 'i-lucide-users',
  transferpaymentstream: 'i-lucide-layers',
  commonreview: 'i-lucide-clipboard-check',
  commonrecommendation: 'i-lucide-message-square-quote',
  fundingcaseintake: 'i-lucide-inbox',
  fundingcaseamendment: 'i-lucide-file-edit',
  fundingcasemonitor: 'i-lucide-binoculars',
  fundingclaimreconcile: 'i-lucide-scale',
  fundingcaseforecast: 'i-lucide-chart-column',
  fundingcasepayment: 'i-lucide-wallet',
  fundingcaserecommendation: 'i-lucide-thumbs-up'
}

const {
  type,
  labelEn,
  labelFr,
  to,
  interactive = false,
  highlighted = false,
  selected = false,
  variant = 'pill'
} = defineProps<{
  type: string
  labelEn?: string
  labelFr?: string
  to?: RouteLocationRaw
  interactive?: boolean
  highlighted?: boolean
  selected?: boolean
  variant?: 'pill' | 'meta'
}>()

const { locale, t } = useI18n()

const icon = computed(() => ENTITY_TYPE_ICON_MAP[type] ?? 'i-lucide-shapes')
const label = computed(() => (locale.value === 'fr' ? labelFr : labelEn) || t(`enums.entity_type.${type}`))
const isAccent = computed(() => highlighted || selected)
const isMetaVariant = computed(() => variant === 'meta')
const badgeClass = computed(() => [
  'inline-flex items-center gap-2 rounded-md border px-3 py-1 text-xs font-semibold tracking-[0.12em] uppercase transition-colors',
  isAccent.value
    ? 'border-primary/30 bg-primary/10 text-primary dark:border-primary/40 dark:bg-primary/15'
    : 'border-zinc-200 bg-zinc-100/80 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-200',
  to || interactive
    ? 'cursor-pointer hover:border-primary/30 hover:bg-primary/10 hover:text-primary dark:hover:border-primary/40 dark:hover:bg-primary/15'
    : 'cursor-default'
])
const iconClass = computed(() => isMetaVariant.value ? 'size-3 shrink-0' : 'size-3.5 shrink-0')
const metaLinkClass = computed(() => [
  'inline-flex cursor-pointer rounded-md transition-colors',
  'hover:opacity-90'
])
</script>

<template>
  <ULink v-if="to && isMetaVariant" :to="to" :class="metaLinkClass">
    <UBadge color="neutral" variant="subtle" class="gap-1.5 uppercase">
      <UIcon :name="icon" :class="iconClass" />
      <span>{{ label }}</span>
      <UIcon v-if="selected" name="i-lucide-check" :class="iconClass" />
    </UBadge>
  </ULink>

  <UBadge v-else-if="isMetaVariant" color="neutral" variant="subtle" class="gap-1.5 uppercase cursor-default">
    <UIcon :name="icon" :class="iconClass" />
    <span>{{ label }}</span>
    <UIcon v-if="selected" name="i-lucide-check" :class="iconClass" />
  </UBadge>

  <ULink v-else-if="to" :to="to" :class="badgeClass">
    <UIcon :name="icon" :class="iconClass" />
    <span>{{ label }}</span>
    <UIcon v-if="selected" name="i-lucide-check" :class="iconClass" />
  </ULink>

  <span v-else :class="badgeClass">
    <UIcon :name="icon" :class="iconClass" />
    <span>{{ label }}</span>
    <UIcon v-if="selected" name="i-lucide-check" :class="iconClass" />
  </span>
</template>
