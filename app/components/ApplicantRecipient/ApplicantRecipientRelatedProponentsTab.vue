<script setup lang="ts">
import { useActionContext } from '~/composables/useActionContext'
import type { ResourceCrudAction } from '~/composables/useResourceCrudState'
import type { BilingualColumnConfig, TableColumnInput } from '~/composables/useTableColumns'
import type { ApplicantRecipientProfileRow } from '~~/shared/types/applicant-recipient-ui'
import { ProponentRelationshipCreateSchema } from '~~/shared/types/schemas/proponent-relationship'
import type { ProponentRelationshipCreate } from '~~/shared/types/schemas/proponent-relationship'

const { applicantRecipientId, canCreateRole, canUpdateRole } = defineProps<{
  applicantRecipientId: string
  canCreateRole: boolean
  canUpdateRole: boolean
}>()

type LinkRow = ProponentRelationshipCreate & {
  id: string
  agency_name_en: string
  agency_name_fr: string
  related_proponent_legalname_en: string
  related_proponent_legalname_fr: string
  relationship_name_en: string
  relationship_name_fr: string
  can_update_role: boolean
} & Record<string, unknown>

const { t } = useI18n()
const { getBilingualValue } = useBilingualValue()
const { canAny } = useCan()
const toast = useLocalizedToast()
const { showError } = useApiErrorToast()
const url = computed(() => `/api/applicant-recipients/${applicantRecipientId}/related-proponents`)
const createContext = useActionContext({
  identity: [() => applicantRecipientId],
  authority: () => canCreateRole && canAny('applicant_recipient', 'create', ['global', 'agency'])
})
const updateContext = useActionContext({
  identity: [() => applicantRecipientId],
  authority: () => canUpdateRole && canAny('applicant_recipient', 'update', ['global', 'agency'])
})
const resourceAction: ResourceCrudAction = {
  kind: 'remote',
  create: createContext,
  update: updateContext,
  delete: updateContext
}

/**
 * Checks the current profile assignment before opening or executing a mutation.
 * @param action Requested mutation.
 * @param _row Original relationship, if editing.
 * @param current Whether the initiating operation still owns the action.
 * @returns Whether the mutation may proceed.
 */
const beforeOpen = async (action: 'create' | 'update', _row: LinkRow | null, current: () => boolean) => {
  try {
    const profile = await $fetch<Pick<ApplicantRecipientProfileRow, 'can_create_child_records' | 'can_update_child_records'>, string>(
      `/api/applicant-recipients/${applicantRecipientId}`
    )
    if (!current()) return false
    if (action === 'create' ? profile.can_create_child_records : profile.can_update_child_records) return true
    toast.add({ title: toast.localized('common.warning'), description: toast.localized('workflow.action_prerequisite_unavailable'), color: 'warning' })
  } catch (error: unknown) {
    if (current()) showError(error)
  }
  return false
}
const confirmDelete = useDeleteConfirm()
/**
 * Confirms unlinking after checking the current assignment.
 * @param _id Link to unlink.
 * @param current Whether the initiating operation still owns the action.
 * @returns Whether the link may be removed.
 */
const beforeDelete = async (_id: string, current: () => boolean) =>
  await beforeOpen('update', null, current)
  && await confirmDelete({ description: t('applicant_recipient.related_proponents.remove_confirm') })
  && current()
  && await beforeOpen('update', null, current)

const columns: TableColumnInput<LinkRow>[] = [
  { id: 'related_proponent', accessorKey: 'related_proponent_legalname_en', headerKey: 'applicant_recipient.related_proponents.proponent' },
  { id: 'relationship', accessorKey: 'relationship_name_en', headerKey: 'applicant_recipient.related_proponents.role' },
  { id: 'agency', accessorKey: 'agency_name_en', headerKey: 'notes.agency' },
  { id: 'actions', headerKey: 'common.actions' }
]
const bilingualColumns: BilingualColumnConfig<LinkRow>[] = [
  { id: 'related_proponent', accessorKey: { en: 'related_proponent_legalname_en', fr: 'related_proponent_legalname_fr' }, headerKey: 'applicant_recipient.related_proponents.proponent' },
  { id: 'relationship', accessorKey: { en: 'relationship_name_en', fr: 'relationship_name_fr' }, headerKey: 'applicant_recipient.related_proponents.role' },
  { id: 'agency', accessorKey: { en: 'agency_name_en', fr: 'agency_name_fr' }, headerKey: 'notes.agency' }
]

/**
 * Clears dependent selections when the draft changes agency.
 * @param state Current link draft.
 * @param agencyId Newly selected Agency.
 */
const setAgency = (state: Partial<LinkRow>, agencyId: string | undefined) => {
  if (state.egcs_ar_agency === agencyId) return
  state.egcs_ar_agency = agencyId
  state.egcs_ar_relatedproponent = undefined
  state.egcs_ar_relationshiptype = undefined
  state.egcs_ar_reversed = false
}

/**
 * Applies a catalog role to the relationship draft.
 * @param state Current link draft.
 * @param value Selected role identifier.
 */
const setRole = (state: Partial<LinkRow>, value: string | undefined) => {
  const [typeId, direction] = value?.split(':') ?? []
  state.egcs_ar_relationshiptype = typeId
  state.egcs_ar_reversed = direction === 'reverse'
}
</script>

<template>
  <CommonResourceCrud
    table-id="applicant-recipient.related-proponents"
    data-field-scope="applicant-recipient.related-proponents"
    :action="resourceAction"
    :title="t('applicant_recipient.related_proponents.title')"
    icon="i-lucide-link"
    :fetch-url="url"
    :post-url="url"
    :update-url-base="url"
    :delete-url-base="url"
    :can-create="canCreateRole"
    :can-update="canUpdateRole"
    :can-delete="canUpdateRole"
    :schema="ProponentRelationshipCreateSchema"
    :initial-new-item="{ egcs_ar_reversed: false }"
    :before-open="beforeOpen"
    :before-save="(_state, original, current) => beforeOpen(original ? 'update' : 'create', original, current)"
    :before-delete="beforeDelete"
    :build-update-payload="state => ({ egcs_ar_relationshiptype: state.egcs_ar_relationshiptype, egcs_ar_reversed: state.egcs_ar_reversed })"
    :columns="columns"
    :bilingual-columns="bilingualColumns"
    :button-label="t('common.add')"
    :modal-title="t('applicant_recipient.related_proponents.add')"
    :update-title="t('applicant_recipient.related_proponents.edit')"
    :search-placeholder="t('applicant_recipient.related_proponents.search')">
    <template #actions-cell="{ row, openUpdate, deleteItem }">
      <div v-if="canUpdateRole && row.original.can_update_role" class="flex items-center gap-2">
        <CommonActionButton
          icon="i-lucide-edit-3"
          color="neutral"
          variant="ghost"
          size="sm"
          :aria-label="t('common.edit_named', { name: getBilingualValue(row.original, 'related_proponent_legalname') })"
          @click="openUpdate(row.original)" />
        <CommonActionButton
          icon="i-lucide-unlink"
          color="error"
          variant="ghost"
          size="sm"
          :aria-label="t('applicant_recipient.related_proponents.remove_named', { name: getBilingualValue(row.original, 'related_proponent_legalname') })"
          @click="deleteItem(row.original.id)" />
      </div>
    </template>
    <template #form="{ state }">
      <dl v-if="state.id" class="space-y-3">
        <div>
          <dt class="text-sm font-medium">
            {{ t('notes.agency') }}
          </dt>
          <dd>{{ getBilingualValue(state, 'agency_name') }}</dd>
        </div>
        <div>
          <dt class="text-sm font-medium">
            {{ t('applicant_recipient.related_proponents.proponent') }}
          </dt>
          <dd>{{ getBilingualValue(state, 'related_proponent_legalname') }}</dd>
        </div>
      </dl>
      <template v-else>
        <UFormField :label="t('notes.agency')" name="egcs_ar_agency" required>
          <CommonServerLookupSelect
            :model-value="state.egcs_ar_agency"
            :fetch-url="`${url}/lookups/agencies`"
            value-key="id"
            label-en-key="label_en"
            label-fr-key="label_fr"
            :show-value-in-label="false"
            close-on-select
            @update:model-value="value => setAgency(state, typeof value === 'string' ? value : undefined)" />
        </UFormField>
        <UFormField :label="t('applicant_recipient.related_proponents.proponent')" name="egcs_ar_relatedproponent" required>
          <CommonServerLookupSelect
            v-if="state.egcs_ar_agency"
            :key="state.egcs_ar_agency"
            v-model="state.egcs_ar_relatedproponent"
            :fetch-url="`${url}/lookups/proponents`"
            :query="{ agency_id: state.egcs_ar_agency }"
            selected-values-query-key="selected_ids"
            value-key="id"
            label-en-key="label_en"
            label-fr-key="label_fr"
            :show-value-in-label="false"
            close-on-select />
        </UFormField>
      </template>
      <UFormField
        :label="t('applicant_recipient.related_proponents.role')"
        :hint="t('applicant_recipient.related_proponents.role_hint')"
        name="egcs_ar_relationshiptype"
        required>
        <CommonServerLookupSelect
          v-if="state.egcs_ar_agency"
          :key="state.egcs_ar_agency"
          :model-value="state.egcs_ar_relationshiptype ? `${state.egcs_ar_relationshiptype}:${state.egcs_ar_reversed ? 'reverse' : 'forward'}` : undefined"
          :fetch-url="`${url}/lookups/roles`"
          :query="{ agency_id: state.egcs_ar_agency, permission_action: state.id ? 'update' : 'create' }"
          selected-values-query-key="selected_ids"
          value-key="id"
          label-en-key="label_en"
          label-fr-key="label_fr"
          :show-value-in-label="false"
          close-on-select
          @update:model-value="value => setRole(state, typeof value === 'string' ? value : undefined)" />
      </UFormField>
    </template>
  </CommonResourceCrud>
</template>
