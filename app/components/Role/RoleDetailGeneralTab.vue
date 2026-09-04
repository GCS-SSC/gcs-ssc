<script setup lang="ts">
import type { RoleDetail } from '~~/shared/types/roles'

const { role } = defineProps<{
  role: RoleDetail
}>()

const { t } = useI18n()
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-8 py-4">
    <CommonSection :title="t('role.detail.core_info')" badge="01">
      <CommonValueCard :label="t('role.name_en')" :value="role.name_en" />
      <CommonValueCard :label="t('role.name_fr')" :value="role.name_fr" />
      <CommonValueCard :label="t('role.description_en')" :value="role.description_en || '-'" />
      <CommonValueCard :label="t('role.description_fr')" :value="role.description_fr || '-'" />
    </CommonSection>
  </div>
</template>
