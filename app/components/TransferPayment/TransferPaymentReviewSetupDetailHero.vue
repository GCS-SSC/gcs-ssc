<script setup lang="ts">
import type { PublicationState } from '~~/shared/constants/system-lifecycle'

const {
  name, entityType, entityTypeLabelEn, entityTypeLabelFr, publicationVersion = null, publicationState = 'draft', hasUnpublishedChanges = false,
  isCollapsed = false, isPublishing = false, isRetiring = false, isMutationPending = false, canManage = false
} = defineProps<{
  name: string
  entityType: string
  entityTypeLabelEn?: string
  entityTypeLabelFr?: string
  publicationVersion?: number | null
  publicationState?: PublicationState
  hasUnpublishedChanges?: boolean
  isCollapsed?: boolean
  isPublishing?: boolean
  isRetiring?: boolean
  isMutationPending?: boolean
  canManage?: boolean
}>()
const emit = defineEmits<{ publish: [], retire: [] }>()
</script>

<template>
  <CommonPublicationDetailHero :name="name" icon="i-lucide-list-checks" :entity-type="entityType" :entity-type-label-en="entityTypeLabelEn" :entity-type-label-fr="entityTypeLabelFr" type-label-key="review_setup.setup_type" :publication-state="publicationState" :publication-version="publicationVersion" :has-unpublished-changes="hasUnpublishedChanges" :is-collapsed="isCollapsed" :is-publishing="isPublishing" :is-retiring="isRetiring" :is-mutation-pending="isMutationPending" :can-manage="canManage" publish-label-key="review_setup.publish" retire-label-key="review_setup.retire" @publish="emit('publish')" @retire="emit('retire')" />
</template>
