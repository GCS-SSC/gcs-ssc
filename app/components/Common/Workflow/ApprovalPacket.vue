<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- local packet presentation helpers are self-documenting. */
import { computed } from 'vue'
import type { JsonValue } from '~~/shared/types/database'
import type { FundingCaseAgreementActivityRow, FundingCaseAgreementBudgetLineItemRow, FundingCaseAgreementBudgetOverviewRow } from '~~/shared/types/funding-case-agreement-ui'
import { parseMoney, type Money } from '~~/shared/utils/money'

type PacketRecord = Record<string, JsonValue>
type DisplayField = { key: string, label: string, value: string }

const { submission } = defineProps<{
  submission: { egcs_fc_submittedat: string, egcs_fc_canonicalhash: string, egcs_fc_packet: JsonValue }
}>()
const { t, locale } = useI18n()
const { formatDate } = useDateHelpers()
const asRecord = (value: JsonValue | undefined): PacketRecord =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as PacketRecord : {}
const asRecords = (value: JsonValue | undefined): PacketRecord[] =>
  Array.isArray(value) ? value.map(asRecord) : []
const packet = computed(() => asRecord(submission.egcs_fc_packet))
const agreement = computed(() => packet.value.agreement == null ? null : asRecord(packet.value.agreement))
const amendment = computed(() => packet.value.amendment == null ? null : asRecord(packet.value.amendment))
const proponents = computed(() => asRecords(packet.value.proponents))
const budget = computed(() => asRecord(packet.value.budget))
const hasBudget = computed(() => packet.value.budget !== null && packet.value.budget !== undefined)
const hasActivities = computed(() => Array.isArray(packet.value.activities))
const fiscalYears = computed(() => asRecords(budget.value.fiscalYears))
const lineItems = computed(() => asRecords(budget.value.lineItems))
const activities = computed(() => asRecords(packet.value.activities))
const amendmentTypes = computed(() => asRecords(packet.value.amendmentTypes))
const amendmentSubtypes = computed(() => asRecords(packet.value.amendmentSubtypes))
const sectionOrder = computed(() => [
  agreement.value ? 'agreement' : null,
  agreement.value ? 'proponents' : null,
  amendment.value ? 'amendment' : null,
  hasBudget.value ? 'budget' : null,
  hasActivities.value ? 'activities' : null
].filter((value): value is string => value !== null))
const sectionBadge = (section: string): string => String(sectionOrder.value.indexOf(section) + 1).padStart(2, '0')

const bilingual = (value: JsonValue | undefined): string => {
  const labels = asRecord(value)
  const preferred = locale.value === 'fr' ? labels.fr : labels.en
  const fallback = locale.value === 'fr' ? labels.en : labels.fr
  return String(preferred ?? fallback ?? t('common.none'))
}
const display = (value: JsonValue | undefined): string => {
  if (value === null || value === undefined || value === '') return t('common.none')
  if (typeof value === 'boolean') return value ? t('common.yes') : t('common.no')
  if (typeof value === 'object') return bilingual(value)
  return String(value)
}
const toAmount = (value: JsonValue | undefined): Money | undefined => {
  if (value === null || value === undefined || value === '') return undefined
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  try {
    return parseMoney(value)
  } catch {
    return undefined
  }
}
const registryLabel = (registry: PacketRecord): string =>
  `${t(`enums.registry_type.${display(registry.type)}`)}: ${display(registry.number)}`
const date = (value: JsonValue | undefined): string => value ? formatDate(String(value)) : t('common.none')
const fields = (record: PacketRecord, keys: string[]): DisplayField[] => keys.map(key => ({
  key,
  label: t(`workflow.packet.fields.${key}`),
  value: key === 'agreementType'
    ? t(`enums.agreement_type.${display(record[key])}`)
    : key === 'holdbackPercent'
      ? `${display(record[key])}%`
      : key.toLowerCase().includes('date')
        ? date(record[key])
        : display(record[key])
}))
const agreementFields = computed(() => fields(agreement.value ?? {}, [
  'agreementNumber', 'financialSystemNumber', 'title', 'description', 'agency', 'program', 'stream',
  'agreementType', 'agreementSubtype', 'furtherDistribution', 'holdbackPercent', 'holdbackBasis',
  'riskScore', 'riskRating', 'authorizedAssistanceStartDate', 'authorizedAssistanceEndDate'
]))
const amendmentFields = computed(() => amendment.value
  ? fields(amendment.value, [
      'amendmentNumber',
      'name',
      ...(Object.hasOwn(amendment.value, 'proposedAuthorizedAssistanceStartDate')
        ? ['proposedAuthorizedAssistanceStartDate', 'proposedAuthorizedAssistanceEndDate']
        : [])
    ])
  : [])
const amendmentDisplayFields = computed<DisplayField[]>(() => [
  ...amendmentFields.value,
  {
    key: 'amendmentTypes',
    label: t('workflow.packet.fields.amendmentTypes'),
    value: amendmentTypes.value.map(item => bilingual(item.name)).join(', ') || t('workflow.packet.none')
  },
  {
    key: 'amendmentSubtypes',
    label: t('workflow.packet.fields.amendmentSubtypes'),
    value: amendmentSubtypes.value.map(item => bilingual(item.name)).join(', ') || t('workflow.packet.none')
  }
])
const packetBudgetOverview = computed<FundingCaseAgreementBudgetOverviewRow>(() => {
  const fiscalYearIdByDisplay = new Map<string, string>()
  const mappedFiscalYears = fiscalYears.value.map((fiscalYear, index) => {
    const id = `packet-fiscal-year-${index}`
    fiscalYearIdByDisplay.set(display(fiscalYear.display), id)
    return { id, egcs_fc_fiscalyear: id, fiscal_year_display: display(fiscalYear.display) }
  })
  return {
    fiscalYears: mappedFiscalYears,
    lineItems: lineItems.value.map((line, index) => {
      const fiscalYearId = fiscalYearIdByDisplay.get(display(line.fiscalYear)) ?? `packet-fiscal-year-missing-${index}`
      const category = asRecord(line.organizationCostCategory)
      const item = asRecord(line.lineItem)
      return {
        id: `packet-line-${index}`,
        fiscal_year_id: fiscalYearId,
        fiscal_year_display: display(line.fiscalYear),
        egcs_fc_fundingagreementbudgetfiscalyear: fiscalYearId,
        egcs_fc_organizationcostcategory: `packet-category-${index}`,
        organization_cost_category_name_en: String(category.en ?? ''),
        organization_cost_category_name_fr: String(category.fr ?? ''),
        line_item_name_en: String(item.en ?? ''),
        line_item_name_fr: String(item.fr ?? ''),
        egcs_fc_costsubsection: display(line.costSubsection),
        egcs_fc_description: display(line.description),
        egcs_fc_totalamount: toAmount(line.totalAmount) ?? parseMoney('0'),
        egcs_fc_programfunding: toAmount(line.programFunding) ?? parseMoney('0'),
        egcs_fc_otherfederalfunding: toAmount(line.otherFederalFunding),
        egcs_fc_othergovfunding: toAmount(line.otherGovernmentFunding),
        egcs_fc_otherfunding: toAmount(line.otherFunding),
        egcs_fc_currency: String(line.currency || 'cad') as FundingCaseAgreementBudgetLineItemRow['egcs_fc_currency']
      }
    })
  }
})
const packetActivityRows = computed<FundingCaseAgreementActivityRow[]>(() => activities.value.map((activity, index) => {
  const name = asRecord(activity.name)
  const description = asRecord(activity.description)
  const expectedResults = asRecord(activity.expectedResults)
  const outcomes = asRecords(activity.outcomes).map((outcome, outcomeIndex) => ({
    id: `packet-outcome-${index}-${outcomeIndex}`,
    label_en: String(outcome.en ?? ''),
    label_fr: String(outcome.fr ?? '')
  }))
  const responsibleParties = asRecords(activity.responsibleParties).map((party, partyIndex) => ({
    id: `packet-party-${index}-${partyIndex}`,
    label_en: String(party.en ?? ''),
    label_fr: String(party.fr ?? '')
  }))
  return {
    id: `packet-activity-${index}`,
    egcs_fc_fundingagreement: 'packet',
    egcs_fc_name_en: String(name.en ?? ''),
    egcs_fc_name_fr: String(name.fr ?? ''),
    egcs_fc_description_en: String(description.en ?? ''),
    egcs_fc_description_fr: String(description.fr ?? ''),
    egcs_fc_expectedresults_en: String(expectedResults.en ?? ''),
    egcs_fc_expectedresults_fr: String(expectedResults.fr ?? ''),
    egcs_fc_startdate: String(activity.startDate ?? ''),
    egcs_fc_enddate: String(activity.endDate ?? ''),
    outcome_ids: outcomes.map(outcome => outcome.id),
    responsible_party_ids: responsibleParties.map(party => party.id),
    outcomes,
    responsible_parties: responsibleParties
  }
}))
</script>

<template>
  <CommonWorkflowPacket
    :title="t('workflow.packet.title')"
    packet-id="approval-packet"
    :captured-label="t('workflow.packet.submitted_at', { date: formatDate(submission.egcs_fc_submittedat) })"
    :hash-label="t('workflow.packet.hash')"
    :hash="submission.egcs_fc_canonicalhash">
    <CommonSection v-if="agreement" :title="t('workflow.packet.agreement')" :badge="sectionBadge('agreement')">
      <dl class="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:col-span-2 lg:grid-cols-3">
        <div v-for="field in agreementFields" :key="field.key">
          <dt class="text-xs font-medium tracking-wide text-muted uppercase">
            {{ field.label }}
          </dt>
          <dd class="mt-1 whitespace-pre-wrap text-sm text-default">
            {{ field.value }}
          </dd>
        </div>
      </dl>
    </CommonSection>

    <CommonSection v-if="agreement" :title="t('workflow.packet.proponents')" :badge="sectionBadge('proponents')">
      <div v-if="proponents.length === 0" class="text-sm text-muted">
        {{ t('workflow.packet.none') }}
      </div>
      <div class="space-y-6 md:col-span-2">
        <article
          v-for="(proponent, index) in proponents"
          :key="index"
          class="border-t border-default pt-5 first:border-t-0 first:pt-0">
          <h4 class="mb-4 font-semibold">
            {{ bilingual(proponent.legalName) }}
          </h4>
          <dl class="grid gap-4 sm:grid-cols-2">
            <div v-for="field in fields(proponent, ['operatingName', 'subtype', 'leadAgency', 'researchOrganization', 'description'])" :key="field.key">
              <dt class="text-xs font-medium tracking-wide text-muted uppercase">
                {{ field.label }}
              </dt>
              <dd class="mt-1 text-sm">
                {{ field.value }}
              </dd>
            </div>
          </dl>
          <div v-if="asRecords(proponent.registries).length" class="mt-4 border-t border-default pt-4">
            <h5 class="mb-2 text-sm font-medium">
              {{ t('workflow.packet.fields.registries') }}
            </h5>
            <div class="flex flex-wrap gap-2">
              <CommonStatusBadge
                v-for="(registry, registryIndex) in asRecords(proponent.registries)"
                :key="registryIndex"
                variant="meta"
                :label="registryLabel(registry)" />
            </div>
          </div>
        </article>
      </div>
    </CommonSection>

    <CommonSection v-if="amendment" :title="t('workflow.packet.amendment')" :badge="sectionBadge('amendment')">
      <dl class="grid gap-x-6 gap-y-4 sm:grid-cols-2 md:col-span-2 lg:grid-cols-3">
        <div v-for="field in amendmentDisplayFields" :key="field.key">
          <dt class="text-xs font-medium tracking-wide text-muted uppercase">
            {{ field.label }}
          </dt>
          <dd class="mt-1 whitespace-pre-wrap text-sm text-default">
            {{ field.value }}
          </dd>
        </div>
      </dl>
    </CommonSection>

    <CommonSection v-if="hasBudget" :title="t('workflow.packet.budget')" :badge="sectionBadge('budget')" :grid-cols="1">
      <AgreementBudgetTab
        agreement-id="packet"
        embedded
        static-mode
        :can-create="false"
        :can-update="false"
        :can-delete="false"
        :can-create-fiscal-year="false"
        :can-update-fiscal-year="false"
        :can-delete-fiscal-year="false"
        :snapshot-overview="packetBudgetOverview" />
    </CommonSection>

    <CommonSection v-if="hasActivities" :title="t('workflow.packet.activities')" :badge="sectionBadge('activities')" :grid-cols="1">
      <AgreementActivitiesTab
        agreement-id="packet"
        embedded
        static-mode
        :can-create="false"
        :can-update="false"
        :can-delete="false"
        :snapshot-items="packetActivityRows" />
    </CommonSection>
    <CommonSection v-if="agreement && asRecords(agreement.customFields).length" :title="t('custom_fields.title')" :grid-cols="1">
      <div v-for="field in asRecords(agreement.customFields)" :key="String(field.fieldId)" class="space-y-1">
        <dt class="text-sm text-muted">
          {{ bilingual(field.label) }}
        </dt>
        <dd class="whitespace-pre-wrap">
          {{ display(field.display) }}
        </dd>
      </div>
    </CommonSection>
  </CommonWorkflowPacket>
</template>
