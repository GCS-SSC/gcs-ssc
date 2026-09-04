<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc */
import { ref } from 'vue'
import type { Ref } from 'vue'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { appRouteLocations } from '~/utils/route-locations'
import type { PublicationState } from '~~/shared/constants/system-lifecycle'

type WorkflowSetupItem = {
  id: string
  egcs_cn_scopetype: 'transferpaymentstream'
  egcs_cn_scopeid: string
  egcs_cn_entitytype: string
  entityTypeLabelEn?: string
  entityTypeLabelFr?: string
  egcs_cn_name_en: string
  egcs_cn_name_fr: string
  egcs_cn_description_en: string
  egcs_cn_description_fr: string
  egcs_cn_purpose: 'standard' | 'approval_submission' | 'risk_rating'
  egcs_cn_allowedstartstatuses: string[]
  egcs_cn_cancellationstatus: string
  egcs_cn_executionfailurestatus: string
  egcs_cn_allowretry: boolean
  publicationId: string
  publicationState: PublicationState
  publicationVersionId: string | null
  publicationVersion: number | null
  hasUnpublishedChanges: boolean
}
const { transferPaymentId, streamId, agencyId, canUpdateChild, canDeleteChild } = defineProps<{
  transferPaymentId: string, streamId: string, agencyId: string, canUpdateChild: boolean, canDeleteChild: boolean
}>()
const { t, locale } = useI18n()
const localePath = useLocalePath()
const router = useRouter()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const isOpen: Ref<boolean> = ref(false)
const selected: Ref<WorkflowSetupItem | null> = ref(null)
const { search, pagination, items, totalRecords, refresh, status } = useResourceTable<WorkflowSetupItem>({
  fetchUrl: computed(() => `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/workflow-setups`)
})
watch([() => transferPaymentId, () => streamId], () => {
  isOpen.value = false
  selected.value = null
})
const getSetupLabel = (item: WorkflowSetupItem) => (
  (locale.value === 'fr' ? item.egcs_cn_name_fr : item.egcs_cn_name_en)
  || item.egcs_cn_name_en
  || item.egcs_cn_name_fr
  || item.id
)
const columns: TableColumnInput<WorkflowSetupItem>[] = [
  { id: 'name', accessorKey: 'egcs_cn_name_en', headerKey: 'common.name' },
  { id: 'entityType', accessorKey: 'egcs_cn_entitytype', headerKey: 'transfer_payment.entity_type' },
  { id: 'purpose', accessorKey: 'egcs_cn_purpose', headerKey: 'workflow.purpose' },
  { id: 'publicationState', accessorKey: 'publicationState', headerKey: 'common.status' },
  { id: 'actions', headerKey: 'common.actions' }
]
const add = () => {
  selected.value = {
    id: '', egcs_cn_scopetype: 'transferpaymentstream', egcs_cn_scopeid: streamId,
    egcs_cn_entitytype: 'fundingcasepayment', egcs_cn_name_en: '', egcs_cn_name_fr: '',
    egcs_cn_description_en: '', egcs_cn_description_fr: '', egcs_cn_purpose: 'standard',
    egcs_cn_allowedstartstatuses: [], egcs_cn_cancellationstatus: '',
    egcs_cn_executionfailurestatus: '',
    egcs_cn_allowretry: false,
    publicationId: '', publicationState: 'draft', publicationVersionId: null,
    publicationVersion: null, hasUnpublishedChanges: true
  }
  isOpen.value = true
}
const edit = (item: WorkflowSetupItem) => {
  router.push(localePath(appRouteLocations.transferPaymentWorkflowSetupDetail(transferPaymentId, streamId, item.id)))
}
const remove = async (item: WorkflowSetupItem) => {
  try {
    if (await confirmDeleteRequest(`/api/transfer-payments/${transferPaymentId}/streams/${streamId}/workflow-setups/${item.id}`)) await refresh()
  } catch (error) {
    showError(error)
  }
}
</script>

<template>
  <div>
    <CommonResourceLayoutCard
      v-model:search="search" v-model:pagination="pagination" :data="items" :columns="columns"
      :bilingual-columns="[{ id: 'name', accessorKey: { en: 'egcs_cn_name_en', fr: 'egcs_cn_name_fr' } }]"
      :total-records="totalRecords" :loading="status === 'pending'" :show-button="canUpdateChild"
      :request-status="status" :button-label="t('workflow.add_setup')" @add="add" @retry="refresh">
      <template #name-cell="{ row }">
        <NuxtLink
          :to="localePath(appRouteLocations.transferPaymentWorkflowSetupDetail(transferPaymentId, streamId, row.original.id))"
          class="font-bold text-zinc-900 transition-colors hover:text-primary dark:text-white">
          <CommonBilingualName :name-en="row.original.egcs_cn_name_en" :name-fr="row.original.egcs_cn_name_fr" />
        </NuxtLink>
      </template>
      <template #entityType-cell="{ row }">
        <CommonEntityTypeBadge :type="row.original.egcs_cn_entitytype" :label-en="row.original.entityTypeLabelEn" :label-fr="row.original.entityTypeLabelFr" />
      </template>
      <template #purpose-cell="{ row }">
        {{ t(`workflow.purposes.${row.original.egcs_cn_purpose}`) }}
      </template>
      <template #publicationState-cell="{ row }">
        <CommonLifecycleBadge engine="publication" :state="row.original.publicationState" />
      </template>
      <template #actions-cell="{ row }">
        <div class="flex items-center gap-2">
          <UButton icon="i-lucide-arrow-right" variant="ghost" color="neutral" size="sm" class="cursor-default" :aria-label="`${t('common.open')}: ${getSetupLabel(row.original)}`" @click="edit(row.original)" />
          <UButton v-if="canDeleteChild" icon="i-lucide-trash" variant="ghost" color="error" size="sm" class="cursor-default" :aria-label="t('common.delete_named', { name: getSetupLabel(row.original) })" @click="remove(row.original)" />
        </div>
      </template>
    </CommonResourceLayoutCard>
    <TransferPaymentWorkflowSetupModal v-if="selected" v-model:open="isOpen" v-model:state="selected" :transfer-payment-id="transferPaymentId" :stream-id="streamId" :agency-id="agencyId" @saved="refresh" />
  </div>
</template>
