<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc */
import type { Ref } from 'vue'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { useApprovalTemplateTable } from '~/composables/useApprovalTemplateTable'
import type {
  ApprovalTemplate,
  ApprovalTemplateItem,
  ApprovalTemplateScopeType
} from '~~/shared/types/schemas'

type ApprovalTemplateRow = {
  id: string
  templateId: string
  templateNameEn: string
  templateNameFr: string
  stepCount: number
  certificationCount: number
}

const {
  scopeType,
  scopeId,
  canUpdateChild,
  canDeleteChild,
  openTemplateDetail = async () => {}
} = defineProps<{
  scopeType: ApprovalTemplateScopeType
  scopeId: string
  canUpdateChild: boolean
  canDeleteChild: boolean
  openTemplateDetail?: (templateId: string) => void | Promise<void>
}>()

const { t, locale } = useI18n()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const { showError } = useApiErrorToast()

const isDeleting: Ref<boolean> = ref(false)

const { isOpen, selected, openCreate, captureSession, closeSession } = useCrudModal<
  ApprovalTemplateItem,
  ApprovalTemplate & { id?: string }
>({
  createState: () => ({
    egcs_cn_name_en: '',
    egcs_cn_name_fr: '',
    egcs_cn_description_en: '',
    egcs_cn_description_fr: '',
    egcs_cn_allowadditionalapprovals: false,
    egcs_cn_defaultaddedapprovalname_en: undefined,
    egcs_cn_defaultaddedapprovalname_fr: undefined,
    egcs_cn_allowaddedapprovalnamechanges: false,
    egcs_cn_allowaddedapprovalcertificationchanges: false,
    additionalApprovalCertifications: [],
    steps: []
  }),
  updateState: item => ({
    id: String(item.id),
    egcs_cn_name_en: item.egcs_cn_name_en,
    egcs_cn_name_fr: item.egcs_cn_name_fr,
    egcs_cn_description_en: item.egcs_cn_description_en,
    egcs_cn_description_fr: item.egcs_cn_description_fr,
    egcs_cn_allowadditionalapprovals: item.egcs_cn_allowadditionalapprovals,
    egcs_cn_defaultaddedapprovalname_en: item.egcs_cn_defaultaddedapprovalname_en,
    egcs_cn_defaultaddedapprovalname_fr: item.egcs_cn_defaultaddedapprovalname_fr,
    egcs_cn_allowaddedapprovalnamechanges: item.egcs_cn_allowaddedapprovalnamechanges,
    egcs_cn_allowaddedapprovalcertificationchanges: item.egcs_cn_allowaddedapprovalcertificationchanges,
    additionalApprovalCertifications: item.additionalApprovalCertifications,
    steps: item.steps
  })
})

const { search, pagination, items, totalRecords, refresh, status } = useApprovalTemplateTable({
  scopeType: () => scopeType,
  scopeId: () => scopeId
})

const columns: TableColumnInput<ApprovalTemplateRow>[] = [
  { id: 'name', accessorKey: 'templateNameEn', headerKey: 'common.name' },
  { id: 'flags', accessorKey: 'stepCount', headerKey: 'common.flags' },
  { id: 'actions', headerKey: 'common.actions' }
]

const tableRows = computed<ApprovalTemplateRow[]>(() => items.value.map(item => ({
  id: `template:${item.id}`,
  templateId: String(item.id),
  templateNameEn: item.egcs_cn_name_en,
  templateNameFr: item.egcs_cn_name_fr,
  stepCount: item.steps.length,
  certificationCount: item.steps.reduce((total, step) => total + step.certifications.length, 0)
})))
const getTemplateLabel = (row: ApprovalTemplateRow) => (
  (locale.value === 'fr' ? row.templateNameFr : row.templateNameEn)
  || row.templateNameEn
  || row.templateNameFr
  || row.templateId
)

const deleteTemplate = async (templateId: string) => {
  if (!canDeleteChild || isDeleting.value) {
    return
  }

  try {
    isDeleting.value = true
    const ok = await confirmDeleteRequest(`/api/approval-templates/${templateId}`)
    if (!ok) {
      return
    }

    await refresh()
  } catch (error) {
    showError(error)
  } finally {
    isDeleting.value = false
  }
}
</script>

<template>
  <div>
    <CommonResourceLayoutCard
      v-model:search="search"
      v-model:pagination="pagination"
      :data="tableRows"
      :columns="columns"
      :total-records="totalRecords"
      :loading="status === 'pending'"
      :request-status="status"
      :button-label="canUpdateChild ? t('common.add') : undefined"
      :show-button="canUpdateChild"
      @add="openCreate"
      @retry="refresh">
      <template #name-cell="{ row }">
        <button
          type="button"
          class="group flex w-full items-center gap-3 py-1 text-left"
          @click="openTemplateDetail(row.original.templateId)">
          <span class="flex min-w-0 items-center gap-2">
            <UIcon name="i-lucide-corner-down-right" class="size-4 text-zinc-400" />
            <span class="[&_p:first-child]:transition-colors group-hover:[&_p:first-child]:text-primary">
              <CommonBilingualName
                :name-en="row.original.templateNameEn"
                :name-fr="row.original.templateNameFr" />
            </span>
          </span>
        </button>
      </template>

      <template #flags-cell="{ row }">
        <div class="flex flex-wrap items-center gap-2">
          <CommonStatusBadge variant="step" size="sm" :label="`${row.original.stepCount} ${t('admin_common.resources.approval_steps')}`" />
          <CommonStatusBadge variant="certification" size="sm" :label="`${row.original.certificationCount} ${t('admin_common.resources.certifications')}`" />
        </div>
      </template>

      <template #actions-cell="{ row }">
        <div class="flex items-center gap-2">
          <UButton
            icon="i-lucide-arrow-right"
            color="neutral"
            variant="ghost"
            size="sm"
            class="cursor-default"
            :aria-label="`${t('common.open')}: ${getTemplateLabel(row.original)}`"
            @click="openTemplateDetail(row.original.templateId)" />
          <UButton
            v-if="canDeleteChild"
            icon="i-lucide-trash"
            color="error"
            variant="ghost"
            size="sm"
            class="cursor-default"
            :aria-label="t('common.delete_named', { name: getTemplateLabel(row.original) })"
            @click="deleteTemplate(row.original.templateId)" />
        </div>
      </template>

      <template #footer-left>
        {{ totalRecords }} {{ t('common.records') }}
      </template>
    </CommonResourceLayoutCard>

    <CommonApprovalTemplatesModal
      v-model:open="isOpen"
      v-model:state="selected"
      :scope-type="scopeType"
      :scope-id="scopeId"
      :capture-session="captureSession"
      :close-session="closeSession"
      @saved="refresh" />
  </div>
</template>
