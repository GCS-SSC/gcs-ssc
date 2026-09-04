<script setup lang="ts">
import { computed } from 'vue'
import type { PublicationState } from '~~/shared/constants/system-lifecycle'

const {
  name = '',
  entityType,
  publicationVersion = null,
  publicationState = 'draft',
  hasUnpublishedChanges = false,
  isCollapsed = false,
  isPublishing = false,
  isRetiring = false,
  isMutationPending = false,
  canManage = false,
  reviewType = 'assessment'
} = defineProps<{
  name?: string
  entityType?: string
  publicationVersion?: number | null
  publicationState?: PublicationState
  hasUnpublishedChanges?: boolean
  isCollapsed?: boolean
  isPublishing?: boolean
  isRetiring?: boolean
  isMutationPending?: boolean
  canManage?: boolean
  reviewType?: 'assessment' | 'checklist' | 'recommendation'
}>()

const emit = defineEmits<{
  (event: 'publish' | 'retire'): void
}>()

const typeLabelKey = computed(() => reviewType === 'checklist'
  ? 'enums.review_type.checklist'
  : reviewType === 'recommendation'
    ? 'transfer_payment.recommendation_schema'
    : 'transfer_payment.assessment')
</script>

<template>
  <CommonPublicationDetailHero
    :is-collapsed="isCollapsed"
    :icon="reviewType === 'checklist' ? 'i-lucide-list-checks' : reviewType === 'recommendation' ? 'i-lucide-message-square-quote' : 'i-lucide-clipboard-check'"
    :name="name"
    :entity-type="entityType ?? ''"
    :type-label-key="typeLabelKey"
    :publication-state="publicationState"
    :publication-version="publicationVersion"
    :has-unpublished-changes="hasUnpublishedChanges"
    :is-publishing="isPublishing"
    :is-retiring="isRetiring"
    :is-mutation-pending="isMutationPending"
    :can-manage="canManage"
    publish-label-key="transfer_payment.publish_schema"
    retire-label-key="transfer_payment.retire_schema"
    @publish="emit('publish')"
    @retire="emit('retire')" />
</template>
