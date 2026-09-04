<script setup lang="ts">
import { computed } from 'vue'
import type { PublicationState } from '~~/shared/constants/system-lifecycle'

const {
  name, description, icon, entityType, entityTypeLabelEn, entityTypeLabelFr, typeLabelKey, publicationState, publicationVersion = null,
  hasUnpublishedChanges = false, isCollapsed = false, isPublishing = false, isRetiring = false,
  isMutationPending = false, canManage = false, publishLabelKey, retireLabelKey
} = defineProps<{
  name: string
  description?: string
  icon: string
  entityType?: string
  entityTypeLabelEn?: string
  entityTypeLabelFr?: string
  typeLabelKey: string
  publicationState: PublicationState
  publicationVersion?: number | null
  hasUnpublishedChanges?: boolean
  isCollapsed?: boolean
  isPublishing?: boolean
  isRetiring?: boolean
  isMutationPending?: boolean
  canManage?: boolean
  publishLabelKey: string
  retireLabelKey: string
}>()
const emit = defineEmits<{ publish: [], retire: [] }>()
const { locale, t } = useI18n()
const confirmRetire = useDeleteConfirm()
/** Confirms the irreversible lifecycle action before notifying the resource adapter. */
const requestRetirement = async () => {
  const confirmed = await confirmRetire({
    title: t('common.retire_confirm_title'),
    description: t('common.retire_confirm_description'),
    confirmLabel: t('common.retire')
  })
  if (confirmed) emit('retire')
}
const badges = computed(() => [
  ...(entityType
    ? [{
        variant: 'meta' as const,
        ...((locale.value === 'fr' ? entityTypeLabelFr : entityTypeLabelEn)
          ? { label: locale.value === 'fr' ? entityTypeLabelFr : entityTypeLabelEn }
          : { labelKey: `enums.entity_type.${entityType}` })
      }]
    : []),
  { lifecycleEngine: 'publication' as const, lifecycleState: publicationState },
  { variant: 'meta' as const, labelKey: typeLabelKey },
  ...(hasUnpublishedChanges ? [{ variant: 'warning' as const, labelKey: 'transfer_payment.unpublished_changes' }] : []),
  ...(publicationVersion === null ? [] : [{ variant: 'code' as const, label: String(publicationVersion), prefixLabel: t('transfer_payment.schema_version') }])
])
const actions = computed(() => [
  { label: t(publishLabelKey), icon: 'i-lucide-upload', loading: isPublishing, disabled: isMutationPending, visible: canManage && (publicationState === 'draft' || (publicationState === 'published' && hasUnpublishedChanges)), onClick: () => emit('publish') },
  { label: t(retireLabelKey), icon: 'i-lucide-archive', color: 'neutral' as const, variant: 'outline' as const, loading: isRetiring, disabled: isMutationPending, visible: canManage && publicationState === 'published', onClick: requestRetirement }
])
</script>

<template>
  <CommonEntityHero :is-collapsed="isCollapsed" :icon="icon" :title="name" :description="description" :badges="badges" :actions="actions" />
</template>
