<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc */
import { onScopeDispose, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { appRouteLocations } from '~/utils/route-locations'
import { useActionContext } from '~/composables/useActionContext'
import { useCommittedSettlement } from '~/composables/useCommittedSettlement'
import type { PublicationState } from '~~/shared/constants/system-lifecycle'

type WorkflowSetupItem = {
  id: string
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
  egcs_cn_riskratingrequired: boolean
  publicationId: string
  publicationState: PublicationState
  publicationVersionId: string | null
  publicationVersion: number | null
  hasUnpublishedChanges: boolean
}
const { agencyId, canUpdateChild, canDeleteChild } = defineProps<{
  agencyId: string, canUpdateChild: boolean, canDeleteChild: boolean
}>()
const updateActionContext = useActionContext({ identity: [() => agencyId], authority: () => canUpdateChild })
const deleteActionContext = useActionContext({ identity: [() => agencyId], authority: () => canDeleteChild })
const { t, locale } = useI18n()
const localePath = useLocalePath()
const router = useRouter()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const isOpen: Ref<boolean> = ref(false)
const selected: Ref<Partial<WorkflowSetupItem> | null> = ref(null)
type CatalogContext = { kind: 'active'; agencyId: string } | { kind: 'disposed' }
let context: CatalogContext = { kind: 'active', agencyId }
const isCurrentContext = (owner: CatalogContext) => owner.kind === 'active' && context === owner
const { search, pagination, items, totalRecords, refresh, status, error } = useResourceTable<WorkflowSetupItem>({
  fetchUrl: computed(() => `/api/agency/${agencyId}/workflows`)
})
watch(() => agencyId, () => {
  isOpen.value = false
  selected.value = null
}, { flush: 'sync' })
watch([() => agencyId, () => canUpdateChild, () => canDeleteChild], () => {
  context = { kind: 'active', agencyId }
}, { flush: 'sync' })
onScopeDispose(() => {
  context = { kind: 'disposed' }
})
const captureCommitted = useCommittedSettlement({
  context: updateActionContext,
  settle: async () => {
    await refresh()
    return status.value === 'success'
      ? { kind: 'available' }
      : { kind: 'unavailable', error: error.value }
  }
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
  if (context.kind !== 'active' || !canUpdateChild) return
  selected.value = {
    egcs_cn_entitytype: 'fundingcasepayment', egcs_cn_name_en: '', egcs_cn_name_fr: '',
    egcs_cn_description_en: '', egcs_cn_description_fr: '', egcs_cn_purpose: 'standard',
    egcs_cn_allowedstartstatuses: [], egcs_cn_cancellationstatus: '',
    egcs_cn_executionfailurestatus: '',
    egcs_cn_allowretry: false,
    egcs_cn_riskratingrequired: false
  }
  isOpen.value = true
}
const edit = (item: WorkflowSetupItem) => {
  if (context.kind !== 'active') return
  router.push(localePath(appRouteLocations.agencyWorkflowSetupDetail(agencyId, item.id)))
}
const remove = async (item: WorkflowSetupItem) => {
  const owner = context
  if (owner.kind !== 'active' || !canDeleteChild) return
  const id = String(item.id)
  const operation = deleteActionContext.capture()
  const shouldProceed = () => isCurrentContext(owner) && canDeleteChild
  try {
    const deleted = await confirmDeleteRequest(`/api/agency/${owner.agencyId}/workflows/${id}`, {
      operation,
      target: { id, resolve: () => items.value.find(current => String(current.id) === id), eligible: () => canDeleteChild },
      shouldProceed
    })
    if (deleted && operation?.isCurrent() && isCurrentContext(owner)) await refresh()
  } catch (error) {
    if (operation?.isCurrent() && isCurrentContext(owner)) showError(error)
  }
}
</script>

<template>
  <div>
    <CommonResourceLayout
      v-model:search="search" v-model:pagination="pagination" :data="items" :columns="columns"
      :bilingual-columns="[{ id: 'name', accessorKey: { en: 'egcs_cn_name_en', fr: 'egcs_cn_name_fr' } }]"
      :total-records="totalRecords" :loading="status === 'pending'" :show-button="canUpdateChild"
      :request-status="status" :button-label="t('workflow.add_setup')" @add="add" @retry="refresh">
      <template #name-cell="{ row }">
        <NuxtLink
          :to="localePath(appRouteLocations.agencyWorkflowSetupDetail(agencyId, row.original.id))"
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
          <CommonActionButton icon="i-lucide-arrow-right" variant="ghost" color="neutral" size="sm" class="cursor-default" :aria-label="`${t('common.open')}: ${getSetupLabel(row.original)}`" @click="edit(row.original)" />
          <CommonActionButton v-if="canDeleteChild" icon="i-lucide-trash" variant="ghost" color="error" size="sm" class="cursor-default" :aria-label="t('common.delete_named', { name: getSetupLabel(row.original) })" @click="remove(row.original)" />
        </div>
      </template>
    </CommonResourceLayout>
    <AgencyWorkflowSetupModal v-if="selected && canUpdateChild" v-model:open="isOpen" v-model:state="selected" :action-context="updateActionContext" :agency-id="agencyId" :capture-committed="captureCommitted" />
  </div>
</template>
