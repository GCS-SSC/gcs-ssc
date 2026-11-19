<script setup lang="ts">
const allowed = defineModel<boolean>('allowed', { default: false })
const typeIds = defineModel<string[]>('typeIds', { default: () => [] })
const { agencyId, allowedName, typeIdsName } = defineProps<{
  agencyId: string
  allowedName: string
  typeIdsName: string
}>()

const { t } = useI18n()
</script>

<template>
  <div class="space-y-3">
    <UFormField
      :name="allowedName"
      :required="false"
      data-ui-target="common.approval-templates.attachment-policy-fields.allow_attachments"
      data-field-label-en="Allow attachments"
      data-field-label-fr="Autoriser les pièces jointes">
      <USwitch v-model="allowed" :label="t('approval_templates.allow_attachments')" />
    </UFormField>
    <UFormField
      v-if="allowed"
      :name="typeIdsName"
      :required="false"
      :label="t('approval_templates.allowed_attachment_types')"
      :description="t('approval_templates.attachment_types_publish_help')"
      data-ui-target="common.approval-templates.attachment-policy-fields.allowed_attachment_types">
      <CommonServerLookupSelect
        v-model:values="typeIds"
        :fetch-url="`/api/agency/${agencyId}/attachment-types`"
        selected-values-query-key="selectedIds"
        value-key="id"
        label-en-key="egcs_cn_name_en"
        label-fr-key="egcs_cn_name_fr"
        :show-value-in-label="false"
        :include-deleted-query="false"
        multiple />
    </UFormField>
  </div>
</template>
