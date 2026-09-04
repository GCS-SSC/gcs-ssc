<script setup lang="ts">
import type { PublicationState } from '~~/shared/constants/system-lifecycle'

const {
  name = '',
  description = '',
  isCollapsed = false,
  publicationState = 'draft',
  publicationVersion = null,
  hasUnpublishedChanges = false,
  canManage = false,
  isPublishing = false,
  isRetiring = false,
  isMutationPending = false,
  stepCount = 0,
  certificationCount = 0
} = defineProps<{
  name?: string
  description?: string
  stepCount?: number
  certificationCount?: number
  isCollapsed?: boolean
  publicationState?: PublicationState
  publicationVersion?: number | null
  hasUnpublishedChanges?: boolean
  canManage?: boolean
  isPublishing?: boolean
  isRetiring?: boolean
  isMutationPending?: boolean
}>()
const emit = defineEmits<{ publish: [], retire: [] }>()
</script>

<template>
  <div class="space-y-3">
    <CommonPublicationDetailHero
      :name="name"
      :description="description"
      icon="i-lucide-clipboard-list"
      type-label-key="approval_templates.template_type"
      :publication-state="publicationState"
      :publication-version="publicationVersion"
      :has-unpublished-changes="hasUnpublishedChanges"
      :can-manage="canManage"
      :is-collapsed="isCollapsed"
      :is-publishing="isPublishing"
      :is-retiring="isRetiring"
      :is-mutation-pending="isMutationPending"
      publish-label-key="approval_templates.publish"
      retire-label-key="approval_templates.retire"
      @publish="emit('publish')"
      @retire="emit('retire')" />
    <div class="flex flex-wrap gap-2 px-1">
      <CommonStatusBadge variant="step" :label="`${stepCount} ${$t('admin_common.resources.approval_steps')}`" />
      <CommonStatusBadge variant="certification" :label="`${certificationCount} ${$t('admin_common.resources.certifications')}`" />
    </div>
  </div>
</template>
