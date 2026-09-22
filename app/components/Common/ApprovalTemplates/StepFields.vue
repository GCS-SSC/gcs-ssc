<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc */
import { ref, watch } from 'vue'
import type {
  ApprovalTemplateEditorCertification,
  ApprovalTemplateEditorStep
} from '~/types/approval-template-editor'
import { createApprovalTemplateEditorCertification } from '~/utils/approval-template-editor-certifications'

const step = defineModel<ApprovalTemplateEditorStep>('step', { required: true })
const { approvalTemplateId } = defineProps<{ approvalTemplateId: string }>()

const { t } = useI18n()
const { getBilingualValue } = useBilingualValue()

const addCertification = () => {
  const nextOrder = step.value.certifications.length === 0
    ? 1
    : Math.max(...step.value.certifications.map(item => item.egcs_cn_order)) + 1

  step.value.certifications.push(createApprovalTemplateEditorCertification({ egcs_cn_order: nextOrder }))
}

const removeCertification = (certificationIndex: number) => {
  step.value.certifications.splice(certificationIndex, 1)
}

const getCertificationTitle = (certification: ApprovalTemplateEditorCertification) => {
  const label = certification.egcs_cn_name_en || certification.egcs_cn_name_fr
  return `${certification.egcs_cn_order} - ${label || t('admin_common.resources.certifications')}`
}

const getCertificationActionTarget = (certification: ApprovalTemplateEditorCertification) => {
  const name = getBilingualValue(certification, 'egcs_cn_name', t('admin_common.resources.certifications'))
  return `${certification.egcs_cn_order} - ${name}`
}

const orderedCertifications = computed(() => (step.value?.certifications ?? [])
  .map((certification, sourceIndex) => ({ certification, sourceIndex }))
  .toSorted((left, right) => left.certification.egcs_cn_order - right.certification.egcs_cn_order))
const selectedAssigneeKind = ref<'user' | 'group'>(step.value?.egcs_cn_defaultgroup ? 'group' : 'user')
watch(() => step.value?.id, () => {
  selectedAssigneeKind.value = step.value?.egcs_cn_defaultgroup ? 'group' : 'user'
})
const assigneeKind = computed({
  get: () => selectedAssigneeKind.value,
  set: (kind: string) => {
    selectedAssigneeKind.value = kind === 'group' ? 'group' : 'user'
    step.value.egcs_cn_defaultuser = kind === 'user' ? '' : null
    step.value.egcs_cn_defaultgroup = kind === 'group' ? '' : null
  }
})
const selectedUser = computed({
  get: () => step.value.egcs_cn_defaultuser ?? '',
  set: (value: string) => { step.value.egcs_cn_defaultuser = value }
})
const selectedGroup = computed({
  get: () => step.value.egcs_cn_defaultgroup ?? '',
  set: (value: string) => { step.value.egcs_cn_defaultgroup = value }
})
</script>

<template>
  <div v-if="step" class="space-y-6">
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <UFormField :label="t('common.order')" name="step.egcs_cn_sequence">
        <UInput v-model="step.egcs_cn_sequence" type="number" />
      </UFormField>
      <UFormField :label="t('admin_common.fields.egcs_cn_approvertitle')" name="step.egcs_cn_approvertitle" required>
        <UInput v-model="step.egcs_cn_approvertitle" />
      </UFormField>
      <UFormField :label="t('admin_common.fields.egcs_cn_name_en')" name="step.egcs_cn_name_en" required>
        <UInput v-model="step.egcs_cn_name_en" />
      </UFormField>
      <UFormField :label="t('admin_common.fields.egcs_cn_name_fr')" name="step.egcs_cn_name_fr" required>
        <UInput v-model="step.egcs_cn_name_fr" />
      </UFormField>
      <UFormField :label="t('admin_common.fields.egcs_cn_description_en')" name="step.egcs_cn_description_en" required>
        <CommonTextarea v-model="step.egcs_cn_description_en" :rows="3" />
      </UFormField>
      <UFormField :label="t('admin_common.fields.egcs_cn_description_fr')" name="step.egcs_cn_description_fr" required>
        <CommonTextarea v-model="step.egcs_cn_description_fr" :rows="3" />
      </UFormField>
      <UFormField :label="t('groups.assignee_type')" required>
        <USelect v-model="assigneeKind" :items="[{ label: t('groups.user'), value: 'user' }, { label: t('groups.group'), value: 'group' }]" />
      </UFormField>
      <UFormField v-if="assigneeKind === 'user'" :label="t('admin_common.fields.egcs_cn_defaultuser')" name="step.egcs_cn_defaultuser" required>
        <CommonServerLookupSelect
          v-model="selectedUser"
          :fetch-url="`/api/users/lookups?approvalTemplateId=${approvalTemplateId}`"
          selected-values-query-key="selectedIds"
          value-key="id"
          label-en-key="egcs_cn_name_en"
          label-fr-key="egcs_cn_name_fr" />
      </UFormField>
      <UFormField v-else :label="t('groups.group')" name="step.egcs_cn_defaultgroup" required>
        <CommonServerLookupSelect v-model="selectedGroup" fetch-url="/api/groups/lookups" value-key="id" label-en-key="egcs_cn_name_en" label-fr-key="egcs_cn_name_fr" :query="{ approvalTemplateId }" />
      </UFormField>
    </div>

    <AssessmentSchemaAccordionSection :title="t('admin_common.resources.certifications')" default-open>
      <div class="space-y-4">
        <div class="flex justify-end">
          <UButton
            icon="i-lucide-plus"
            :label="t('common.add')"
            variant="outline"
            class="cursor-default"
            @click="addCertification" />
        </div>

        <AssessmentSchemaAccordionSection
          v-for="({ certification, sourceIndex }) in orderedCertifications"
          :key="certification._key"
          :title="getCertificationTitle(certification)"
          level="sub">
          <div class="space-y-6">
            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
              <UFormField :label="t('common.order')" :name="`step.certifications.${sourceIndex}.egcs_cn_order`">
                <UInput v-model="certification.egcs_cn_order" type="number" />
              </UFormField>
              <div class="flex items-end gap-3">
                <UFormField
                  class="flex-1"
                  :label="t('admin_common.fields.egcs_cn_optional')"
                  :name="`step.certifications.${sourceIndex}.egcs_cn_optional`">
                  <USwitch v-model="certification.egcs_cn_optional" />
                </UFormField>
                <UButton
                  icon="i-lucide-trash"
                  color="error"
                  variant="ghost"
                  class="mb-0.5 cursor-default"
                  :aria-label="t('common.delete_named', { name: getCertificationActionTarget(certification) })"
                  @click="removeCertification(sourceIndex)" />
              </div>
            </div>

            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
              <UFormField :label="t('admin_common.fields.egcs_cn_name_en')" :name="`step.certifications.${sourceIndex}.egcs_cn_name_en`" required>
                <UInput v-model="certification.egcs_cn_name_en" />
              </UFormField>
              <UFormField :label="t('admin_common.fields.egcs_cn_name_fr')" :name="`step.certifications.${sourceIndex}.egcs_cn_name_fr`" required>
                <UInput v-model="certification.egcs_cn_name_fr" />
              </UFormField>
              <UFormField :label="t('admin_common.fields.egcs_cn_description_en')" :name="`step.certifications.${sourceIndex}.egcs_cn_description_en`" required>
                <CommonTextarea v-model="certification.egcs_cn_description_en" :rows="2" />
              </UFormField>
              <UFormField :label="t('admin_common.fields.egcs_cn_description_fr')" :name="`step.certifications.${sourceIndex}.egcs_cn_description_fr`" required>
                <CommonTextarea v-model="certification.egcs_cn_description_fr" :rows="2" />
              </UFormField>
              <UFormField :label="t('admin_common.fields.egcs_cn_certification_en')" :name="`step.certifications.${sourceIndex}.egcs_cn_certification_en`" required>
                <CommonTextarea v-model="certification.egcs_cn_certification_en" :rows="3" />
              </UFormField>
              <UFormField :label="t('admin_common.fields.egcs_cn_certification_fr')" :name="`step.certifications.${sourceIndex}.egcs_cn_certification_fr`" required>
                <CommonTextarea v-model="certification.egcs_cn_certification_fr" :rows="3" />
              </UFormField>
            </div>
          </div>
        </AssessmentSchemaAccordionSection>
      </div>
    </AssessmentSchemaAccordionSection>
  </div>
</template>
