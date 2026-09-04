<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc */
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
</script>

<template>
  <div v-if="step" class="space-y-6">
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <UFormField :label="t('common.order')" name="step.egcs_cn_sequence">
        <UInput v-model="step.egcs_cn_sequence" type="number" />
      </UFormField>
      <UFormField :label="t('admin_common.fields.egcs_cn_approvertitle')" name="step.egcs_cn_approvertitle">
        <UInput v-model="step.egcs_cn_approvertitle" />
      </UFormField>
      <UFormField :label="t('admin_common.fields.egcs_cn_name_en')" name="step.egcs_cn_name_en">
        <UInput v-model="step.egcs_cn_name_en" />
      </UFormField>
      <UFormField :label="t('admin_common.fields.egcs_cn_name_fr')" name="step.egcs_cn_name_fr">
        <UInput v-model="step.egcs_cn_name_fr" />
      </UFormField>
      <UFormField :label="t('admin_common.fields.egcs_cn_description_en')" name="step.egcs_cn_description_en">
        <CommonTextarea v-model="step.egcs_cn_description_en" :rows="3" />
      </UFormField>
      <UFormField :label="t('admin_common.fields.egcs_cn_description_fr')" name="step.egcs_cn_description_fr">
        <CommonTextarea v-model="step.egcs_cn_description_fr" :rows="3" />
      </UFormField>
      <UFormField :label="t('admin_common.fields.egcs_cn_defaultuser')" name="step.egcs_cn_defaultuser">
        <CommonServerLookupSelect
          v-model="step.egcs_cn_defaultuser"
          :fetch-url="`/api/users/lookups?approvalTemplateId=${approvalTemplateId}`"
          value-key="id"
          label-en-key="egcs_cn_name_en"
          label-fr-key="egcs_cn_name_fr" />
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
              <UFormField :label="t('admin_common.fields.egcs_cn_name_en')" :name="`step.certifications.${sourceIndex}.egcs_cn_name_en`">
                <UInput v-model="certification.egcs_cn_name_en" />
              </UFormField>
              <UFormField :label="t('admin_common.fields.egcs_cn_name_fr')" :name="`step.certifications.${sourceIndex}.egcs_cn_name_fr`">
                <UInput v-model="certification.egcs_cn_name_fr" />
              </UFormField>
              <UFormField :label="t('admin_common.fields.egcs_cn_description_en')" :name="`step.certifications.${sourceIndex}.egcs_cn_description_en`">
                <CommonTextarea v-model="certification.egcs_cn_description_en" :rows="2" />
              </UFormField>
              <UFormField :label="t('admin_common.fields.egcs_cn_description_fr')" :name="`step.certifications.${sourceIndex}.egcs_cn_description_fr`">
                <CommonTextarea v-model="certification.egcs_cn_description_fr" :rows="2" />
              </UFormField>
              <UFormField :label="t('admin_common.fields.egcs_cn_certification_en')" :name="`step.certifications.${sourceIndex}.egcs_cn_certification_en`">
                <CommonTextarea v-model="certification.egcs_cn_certification_en" :rows="3" />
              </UFormField>
              <UFormField :label="t('admin_common.fields.egcs_cn_certification_fr')" :name="`step.certifications.${sourceIndex}.egcs_cn_certification_fr`">
                <CommonTextarea v-model="certification.egcs_cn_certification_fr" :rows="3" />
              </UFormField>
            </div>
          </div>
        </AssessmentSchemaAccordionSection>
      </div>
    </AssessmentSchemaAccordionSection>
  </div>
</template>
