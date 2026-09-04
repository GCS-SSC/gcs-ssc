<script setup lang="ts">
import type { UserDetail } from '~~/shared/types/users'

const { user, formatDate } = defineProps<{
  user: UserDetail
  formatDate: (value: Date | string | null | undefined) => string
}>()

const { t } = useI18n()
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-8 py-4">
    <CommonSection :title="t('user.detail.core_info')" badge="01">
      <CommonValueCard :label="t('user.full_name')" :value="user.name" />
      <CommonValueCard :label="t('user.email')" :value="user.email" />
      <CommonValueCard :label="t('user.member_since')" :value="formatDate(user.createdAt)" />
      <CommonValueCard :label="t('user.last_updated')" :value="formatDate(user.updatedAt)" />
    </CommonSection>
  </div>
</template>
