<script setup lang="ts">
import type { RoleAbilitySubject } from '~~/shared/utils/abilities'
import { canSubjectManageAssignments, type RoleScopeType } from '~~/shared/utils/role-scope'

const { subject, scope, levels } = defineProps<{
  subject: RoleAbilitySubject
  scope: RoleScopeType
  levels: readonly { label: string, value: string }[]
}>()

const { t } = useI18n()
const subjectLabel = computed(() => t(`role.subjects.${subject}`))
const helpItems = computed(() => [
  ...levels.map(({ label, value }) => ({
    label,
    value,
    content: t(value === 'none' ? 'role.permission_help.none' : `role.permission_help.subjects.${subject}.${value}`)
  })),
  ...(canSubjectManageAssignments(subject)
    ? [{
        label: t('role.manage_assignments'),
        value: 'assignments',
        content: t('role.permission_help.assignments')
      }]
    : [])
])
</script>

<template>
  <USlideover
    :title="t('role.permission_help.title')"
    :description="subjectLabel"
    side="right"
    :ui="{ content: 'sm:max-w-xl', body: 'space-y-4' }">
    <CommonActionButton
      type="button"
      icon="i-lucide-circle-help"
      color="primary"
      variant="solid"
      size="xs"
      class="rounded-full shadow-sm transition-colors hover:bg-primary/90"
      :aria-label="t('role.permission_help.open', { subject: subjectLabel })"
      :ui="{ leadingIcon: 'size-4' }" />

    <template #body>
      <p class="text-sm leading-6 text-muted">
        {{ t(`role.permission_help.scope.${scope}`) }}
      </p>
      <UAccordion
        type="multiple"
        :items="helpItems"
        :default-value="[]"
        :unmount-on-hide="false"
        :ui="{
          root: 'space-y-2',
          item: 'border-0',
          header: 'm-0',
          trigger: 'w-full rounded-md border border-primary/30 bg-primary/10 px-4 py-2.5 text-left text-sm font-semibold text-primary transition-colors hover:border-primary/45 hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-primary/30 dark:border-primary/35 dark:bg-primary/15 dark:text-primary dark:hover:border-primary/50 dark:hover:bg-primary/20',
          body: 'px-2 pb-3 pt-2 text-sm leading-6 text-muted',
          content: 'data-[state=open]:animate-none'
        }" />
      <p v-if="canSubjectManageAssignments(subject)" class="text-sm leading-6 text-muted">
        {{ t(subject === 'agreement' ? 'role.permission_help.agreement_prerequisites' : 'role.permission_help.record_prerequisites') }}
      </p>
      <p v-if="subject !== 'audit' && subject !== 'help' && subject !== 'debt_management'" class="text-sm leading-6 text-muted">
        {{ t('role.permission_help.extensions') }}
      </p>
    </template>
  </USlideover>
</template>
