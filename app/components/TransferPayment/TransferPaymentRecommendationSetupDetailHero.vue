<script setup lang="ts">
import type { PublicationState } from '~~/shared/constants/system-lifecycle'

const { name, publicationVersion = null, publicationState = 'draft', hasUnpublishedChanges = false, isCollapsed = false, isPublishing = false, isRetiring = false, isMutationPending = false, canManage = false } = defineProps<{
  name: string
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
  <CommonPublicationDetailHero :name="name" icon="i-lucide-message-square-quote" type-label-key="transfer_payment.recommendation_setup" :publication-state="publicationState" :publication-version="publicationVersion" :has-unpublished-changes="hasUnpublishedChanges" :is-collapsed="isCollapsed" :is-publishing="isPublishing" :is-retiring="isRetiring" :is-mutation-pending="isMutationPending" :can-manage="canManage" publish-label-key="recommendation_setup.publish" retire-label-key="recommendation_setup.retire" @publish="emit('publish')" @retire="emit('retire')" />
</template>
