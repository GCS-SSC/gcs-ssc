<script setup lang="ts">
import type { AdminCommonField, AdminCommonGenericItem } from '~~/shared/types/admin-common-ui'
import { CommonRecommendationSchemaCreateSchema } from '~~/shared/types/schemas'
import { buildAdminCommonColumns } from '~/utils/admin-common-columns'

const { transferPaymentId, streamId, agencyId, canUpdateChild } = defineProps<{
  transferPaymentId: string
  streamId: string
  agencyId: string
  canUpdateChild: boolean
}>()
const { t } = useI18n()

const fields: AdminCommonField[] = [
  { key: 'egcs_cn_name_en', labelKey: 'admin_common.fields.egcs_cn_name_en', type: 'text' },
  { key: 'egcs_cn_name_fr', labelKey: 'admin_common.fields.egcs_cn_name_fr', type: 'text' },
  { key: 'egcs_cn_result', labelKey: 'admin_common.fields.egcs_cn_result', type: 'json' },
  { key: 'egcs_cn_recommendationschema', labelKey: 'admin_common.fields.egcs_cn_recommendationschema', type: 'json' }
]
const { columns, bilingualColumns } = buildAdminCommonColumns(
  ['egcs_cn_name_en', 'egcs_cn_name_fr', 'publicationState'],
  fields.map(field => field.key)
)
const initialNewItem: Partial<AdminCommonGenericItem> = {
  egcs_cn_agency: agencyId,
  egcs_cn_transferpaymentstream: streamId,
  egcs_cn_result: {}
}
const resourceUrl = `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/recommendation-schemas`
</script>

<template>
  <AdminCommonManagerTab
    :title="t('admin_common.resources.recommendation_schemas')"
    icon="i-lucide-file-output"
    resource="recommendation-schemas"
    :schema="CommonRecommendationSchemaCreateSchema"
    :columns="columns"
    :bilingual-columns="bilingualColumns"
    :fields="fields"
    :fetch-url="resourceUrl"
    :post-url="resourceUrl"
    :update-url-base="resourceUrl"
    :initial-new-item="initialNewItem"
    :read-only="!canUpdateChild" />
</template>
