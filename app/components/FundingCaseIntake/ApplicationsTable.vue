<script setup lang="ts">
import type { Ref } from 'vue'
import { CommonResourceLayoutCard, CommonResourceLayoutPage } from '#components'
import { appRouteLocations } from '~/utils/route-locations'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import type { TableColumnInput } from '~/composables/useTableColumns'
import type { IntakeForm } from '~/components/FundingCaseIntake/IntakeModal.vue'

type Row = {
  id: string; egcs_fi_externalsourceid: string | null; egcs_fi_fundingopportunity: string
  egcs_fi_applicantrecipient: string; egcs_fi_status: string
  opportunity_name_en: string; opportunity_name_fr: string
  proponent_name_en: string | null; proponent_name_fr: string | null
}
const { t } = useI18n()
const localePath = useLocalePath()
const { getBilingualValue } = useBilingualValue()
const { showError } = useApiErrorToast()
const props = defineProps<{ opportunityId?: string; canCreate: boolean }>()
const { search, pagination, items, totalRecords, refresh, retry, status } = useResourceTable<Row>({
  fetchUrl: '/api/funding-case-intakes',
  query: computed(() => ({ egcs_fi_fundingopportunity: props.opportunityId }))
})
const columns = computed<TableColumnInput<Row>[]>(() => [
  { accessorKey: 'id', headerKey: 'funding_case_intake.application_id' },
  ...(props.opportunityId ? [] : [{ id: 'opportunity', headerKey: 'funding_case_intake.opportunity' }]),
  { id: 'proponent', headerKey: 'funding_case_intake.proponent' },
  { accessorKey: 'egcs_fi_externalsourceid', headerKey: 'funding_case_intake.external_source_id' },
  { id: 'status', headerKey: 'funding_opportunity.status' },
  { id: 'actions', headerKey: 'common.actions' }
])
const modalOpen = ref(false)
const pending = ref(false)
const toast = useToast()
const form: Ref<IntakeForm> = ref({ attachments: [] })
/**
 *
 */
const openCreate = () => {
  if (!props.canCreate) return
  form.value = {
    egcs_fi_fundingopportunity: props.opportunityId,
    attachments: []
  }
  modalOpen.value = true
}
/**
 *
 */
const submit = async () => {
  if (pending.value || !props.canCreate) return
  pending.value = true
  let createdId: string | undefined
  try {
    const response = await fetch(getClientRequestUrl('/api/funding-case-intakes'), {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        egcs_fi_fundingopportunity: props.opportunityId ?? form.value.egcs_fi_fundingopportunity,
        egcs_fi_applicantrecipient: form.value.egcs_fi_applicantrecipient
      })
    })
    if (!response.ok) await throwFetchResponseError(response)
    const created = await response.json() as { id: string }
    createdId = String(created.id)
    let uploadError: unknown
    for (const draft of form.value.attachments) {
      const body = new FormData()
      body.set('file', draft.file)
      body.set('attachmentTypeId', draft.attachmentTypeId ?? '')
      body.set('nameEn', draft.nameEn)
      body.set('nameFr', draft.nameFr)
      body.set('descriptionEn', draft.descriptionEn)
      body.set('descriptionFr', draft.descriptionFr)
      body.set('providerMetadata', JSON.stringify(draft.providerMetadata))
      try {
        const upload = await fetch(getClientRequestUrl(`/api/attachments/fundingcaseintake/${createdId}`), {
          method: 'POST', body
        })
        if (!upload.ok) await throwFetchResponseError(upload)
      } catch (error) {
        uploadError = error
        break
      }
    }
    modalOpen.value = false
    await refresh()
    await navigateTo(localePath({ ...appRouteLocations.fundingCaseIntakeDetail(createdId), query: { section: 'attachments' } }))
    if (uploadError) {
      toast.add({ title: t('funding_case_intake.attachment_upload_failed'), color: 'error' })
    }
  } catch (error: unknown) {
    if (createdId) {
      modalOpen.value = false
      await navigateTo(localePath({ ...appRouteLocations.fundingCaseIntakeDetail(createdId), query: { section: 'attachments' } }))
    }
    showError(error)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="space-y-5">
    <component :is="opportunityId ? CommonResourceLayoutCard : CommonResourceLayoutPage" v-model:search="search" v-model:pagination="pagination" :data="items" :columns="columns" :total-records="totalRecords" :request-status="status" :show-button="canCreate" :button-label="t(opportunityId ? 'funding_opportunity.add_application' : 'funding_case_intake.create')" @add="openCreate" @retry="retry">
      <template #id-cell="{ row }">
        <UButton variant="link" :label="String(row.original.id)" :to="localePath(appRouteLocations.fundingCaseIntakeDetail(String(row.original.id)))" />
      </template>
      <template #opportunity-cell="{ row }">
        {{ getBilingualValue(row.original, 'opportunity_name', row.original.egcs_fi_fundingopportunity) }}
      </template>
      <template #proponent-cell="{ row }">
        {{ getBilingualValue(row.original, 'proponent_name', row.original.egcs_fi_applicantrecipient) }}
      </template>
      <template #egcs_fi_externalsourceid-cell="{ row }">
        <span class="text-muted">{{ row.original.egcs_fi_externalsourceid || '—' }}</span>
      </template>
      <template #status-cell="{ row }">
        <CommonStatusBadge :status-id="row.original.egcs_fi_status" />
      </template>
      <template #actions-cell="{ row }">
        <div class="flex justify-end gap-2">
          <UButton icon="i-lucide-arrow-right" color="neutral" variant="ghost" :aria-label="t('funding_case_intake.view_details')" :to="localePath(appRouteLocations.fundingCaseIntakeDetail(String(row.original.id)))" />
        </div>
      </template>
    </component>
    <FundingCaseIntakeModal v-model:open="modalOpen" v-model:state="form" :pending="pending" :lock-opportunity="!!opportunityId" @submit="submit" />
  </div>
</template>
