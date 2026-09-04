<script setup lang="ts">
import { computed, watch } from 'vue'
import { getBadgeVariantConfig, getStatusConfig } from '~/utils/status'
import { useStatusCatalog } from '~/composables/useStatusCatalog'

const { enumName, status, statusId, variant, labelKey, label, uiVariant = 'subtle' } = defineProps<{
  enumName?: string
  status?: string
  statusId?: string
  variant?: string
  labelKey?: string
  label?: string
  uiVariant?: 'solid' | 'outline' | 'soft' | 'subtle'
}>()

const { locale, t } = useI18n()
const catalog = useStatusCatalog()
const isCatalogStatus = computed(() => statusId !== undefined && /^\d+$/.test(statusId))
watch(isCatalogStatus, value => {
  if (value) void catalog.load()
}, { immediate: true })
const definition = computed(() => isCatalogStatus.value ? catalog.getById(statusId) : undefined)

const resolvedBadgeConfig = computed(() => {
  if (definition.value) return { color: 'neutral' as const, icon: definition.value.icon }
  if (variant) {
    return getBadgeVariantConfig(variant)
  }

  return getStatusConfig(enumName ?? '', status ?? '')
})

const resolvedLabel = computed(() => {
  if (label) return label
  if (definition.value) return locale.value === 'fr' ? definition.value.nameFr : definition.value.nameEn
  if (labelKey) return t(labelKey)
  if (variant) return t(getBadgeVariantConfig(variant).labelKey)
  if (isCatalogStatus.value) return catalog.state.value.status === 'pending' ? t('common.loading') : t('common.unknown')
  if (!enumName || !status) return ''
  return t(`enums.${enumName}.${status}`)
})
</script>

<template>
  <UBadge
    :variant="uiVariant"
    :color="resolvedBadgeConfig.color"
    :icon="resolvedBadgeConfig.icon"
    :style="definition ? { borderColor: definition.color, color: definition.color } : undefined">
    <slot>{{ resolvedLabel }}</slot>
  </UBadge>
</template>
