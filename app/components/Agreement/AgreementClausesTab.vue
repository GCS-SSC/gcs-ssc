<script setup lang="ts">
import type { ResourceCrudAction } from '~/composables/useResourceCrudState'
import { useActionContext } from '~/composables/useActionContext'
import { useAgreementChildActionPrerequisites } from '~/composables/useAgreementChildActionPrerequisites'
import { AgreementClauseSelectionSchema } from '~~/shared/types/schemas/agreement-clause'

const { agreementId, canCreate, canUpdate, canDelete } = defineProps<{
  agreementId: string
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
}>()
const { t, locale } = useI18n()
const { check } = useAgreementChildActionPrerequisites(() => ({ kind: 'agreement', agreementId }))
const confirmDelete = useDeleteConfirm()
const url = computed(() => `/api/agreements/${agreementId}/clauses`)
const action: ResourceCrudAction = {
  kind: 'remote',
  create: useActionContext({ identity: [() => agreementId], authority: () => canCreate }),
  update: useActionContext({ identity: [() => agreementId], authority: () => canUpdate }),
  delete: useActionContext({ identity: [() => agreementId], authority: () => canDelete })
}

type ClauseSelection = {
  id: string
  egcs_fc_clause: string
  code: string
  nameEn: string
  nameFr: string
  texts: { textEn: string; textFr: string; displayOrder: number }[]
  outOfDate: boolean
  canUpgrade: boolean
} & Record<string, unknown>

/**
 * Maps the pinned selection to the shared table row shape.
 * @param selection The Agreement selection returned by the list endpoint.
 * @returns The group and its pinned bilingual clause rows.
 */
const toGroup = (selection: ClauseSelection) => ({
  ...selection,
  egcs_ay_name_en: selection.nameEn,
  egcs_ay_name_fr: selection.nameFr,
  egcs_ay_languageindependentcode: selection.code,
  rows: selection.texts.map(text => ({
    egcs_ay_clause_en: text.textEn,
    egcs_ay_clause_fr: text.textFr,
    egcs_ay_displayorder: text.displayOrder
  }))
})

const beforeOpen = (kind: 'create' | 'update', _item: unknown, current: () => boolean) =>
  check(kind, 'clause', current)

const beforeSave = (_state: unknown, original: unknown, current: () => boolean) =>
  beforeOpen(original ? 'update' : 'create', original, current)

/**
 * Rechecks Agreement access after the user confirms removal.
 * @param _id Selection identity captured by the resource table.
 * @param current Whether the table still owns this action.
 * @returns Whether the table can dispatch removal.
 */
const beforeDelete = async (_id: string, current: () => boolean) => {
  if (!await check('delete', 'clause', current)) return false
  if (!await confirmDelete({ description: t('agreement.clauses.remove_confirm') }) || !current()) return false
  return await check('delete', 'clause', current)
}
</script>

<template>
  <!-- @vue-generic {ClauseSelection} -->
  <CommonResourceCrud
    table-id="agreement.clauses"
    data-field-scope="agreement.clauses"
    :title="t('agreement.clauses.title')"
    icon="i-lucide-list-ordered"
    :action="action"
    :fetch-url="url"
    :post-url="canCreate ? url : undefined"
    :update-url-base="canUpdate ? url : undefined"
    :delete-url-base="canDelete ? url : undefined"
    :can-create="canCreate"
    :can-update="canUpdate"
    :show-button="canCreate"
    :schema="AgreementClauseSelectionSchema"
    :columns="[]"
    :button-label="t('agreement.clauses.add')"
    :modal-title="t('agreement.clauses.add')"
    :update-title="t('agreement.clauses.upgrade')"
    :before-open="beforeOpen"
    :before-save="beforeSave"
    :before-delete="beforeDelete"
    :build-update-payload="() => ({})">
    <template #table="{ state, setSearch, setPagination, openCreate, openUpdate, deleteItem, retry }">
      <CommonClauseGroupTable
        :key="agreementId"
        table-id="agreement.clauses"
        :items="state.items.map(toGroup)"
        :status="state.status"
        :total-records="state.totalRecords"
        :search="state.search"
        :pagination="state.pagination"
        :can-add="canCreate"
        :busy="state.busy"
        :button-label="t('agreement.clauses.add')"
        @update:search="setSearch"
        @update:pagination="setPagination"
        @add="openCreate"
        @retry="retry">
        <template #actions="{ item }">
          <div v-if="item.kind === 'group'" class="flex items-center gap-2">
            <CommonActionButton
              v-if="canUpdate && item.group.canUpgrade"
              icon="i-lucide-refresh-cw"
              variant="ghost"
              :aria-label="t('agreement.clauses.upgrade')"
              @click="openUpdate(item.group)">
              {{ t('agreement.clauses.upgrade') }}
            </CommonActionButton>
            <CommonActionButton
              v-if="canDelete"
              icon="i-lucide-trash-2"
              variant="ghost"
              color="error"
              :aria-label="t('common.delete_named', { name: locale === 'fr' ? item.group.nameFr : item.group.nameEn })"
              @click="deleteItem(item.group.id)" />
          </div>
        </template>
      </CommonClauseGroupTable>
    </template>
    <template #form="{ state }">
      <p v-if="state.id">
        {{ t('agreement.clauses.upgrade_confirm') }}
      </p>
      <UFormField v-else :label="t('clauses.group')" name="egcs_fc_clause" required>
        <CommonServerLookupSelect
          v-model="state.egcs_fc_clause"
          :fetch-url="`${url}/lookups/available`"
          selected-values-query-key="selected_ids"
          value-key="id"
          label-en-key="label_en"
          label-fr-key="label_fr"
          close-on-select
          searchable />
      </UFormField>
    </template>
  </CommonResourceCrud>
</template>
