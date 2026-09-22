<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param -- Page-local request and form handlers are clear from their names. */
import type { Ref } from 'vue'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { GroupCreateSchema, GroupMemberSchema } from '~~/shared/types/schemas/group'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'

definePageMeta({ i18n: { paths: { en: '/groups', fr: '/groupes' } } })

type Group = { id: string; egcs_cn_agency: string; egcs_cn_name_en: string; egcs_cn_name_fr: string; egcs_cn_email: string }
type Agency = { id: string; egcs_ay_name_en: string; egcs_ay_name_fr: string }
type Member = { egcs_cn_user: string; egcs_cn_name: string }
type UserOption = { id: string; egcs_cn_name_en: string; egcs_cn_name_fr: string }
type GroupRow = { id: string; group: Group; member: Member | null; placeholder: boolean; name: string; email: string }
const { t } = useI18n()
const { showError } = useApiErrorToast()
const { getBilingualValue } = useBilingualValue()
const { createValidator } = useZodI18n()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const { canAny, can } = useCan()
const canCreate = computed(() => canAny('group', 'create', ['global', 'agency']))
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions -- Generic arrow syntax conflicts with Vue SFC parsing.
async function loadJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(getClientRequestUrl(path), init)
  if (!response.ok) await throwFetchResponseError(response)
  return await response.json() as T
}
const agencyResponse: Ref<{ items: Agency[] } | null> = ref(null)
const selectedAgency: Ref<string> = ref('all')
const { search, pagination, items: groups, totalRecords, refresh: refreshGroups, status } = useResourceTable<Group>({
  fetchUrl: '/api/groups',
  query: computed(() => ({ agency: selectedAgency.value === 'all' ? undefined : selectedAgency.value }))
})
watch(selectedAgency, () => {
  pagination.value.pageIndex = 0
})
void loadJson<{ items: Agency[] }>('/api/groups/agencies').then(value => {
  agencyResponse.value = value
}).catch(showError)
const selectedGroup: Ref<Group | null> = ref(null)
const expandedGroupIds: Ref<string[]> = ref([])
const membersByGroup: Ref<Record<string, Member[]>> = ref({})
const userResponse: Ref<{ items: UserOption[] } | null> = ref(null)
const memberModalOpen: Ref<boolean> = ref(false)
const memberForm = reactive({ egcs_cn_user: '' })
const validateMember = createValidator(GroupMemberSchema)
const availableUsers = computed(() => (userResponse.value?.items ?? [])
  .filter(user => !(membersByGroup.value[selectedGroup.value?.id ?? ''] ?? []).some(member => member.egcs_cn_user === user.id))
  .map(user => ({ label: getBilingualValue(user, 'egcs_cn_name', user.id), value: user.id })))
const refreshMembers = async (groupId: string) => {
  const response = await loadJson<{ items: Member[] }>(`/api/groups/${groupId}/members`)
  membersByGroup.value = { ...membersByGroup.value, [groupId]: response.items }
}
const refreshUsers = async (groupId: string) => {
  const response = await loadJson<{ items: UserOption[] }>(`/api/groups/${groupId}/members/lookups`)
  if (selectedGroup.value?.id === groupId) userResponse.value = response
}
watch(selectedGroup, async group => {
  if (!group) return
  try {
    userResponse.value = null
    await refreshMembers(group.id)
    if (can('group', 'update', { type: 'agency', agencyId: group.egcs_cn_agency })) await refreshUsers(group.id)
  } catch (error) {
    showError(error)
  }
})
const toggleGroup = (group: Group) => {
  if (expandedGroupIds.value.includes(group.id)) {
    expandedGroupIds.value = expandedGroupIds.value.filter(id => id !== group.id)
    return
  }
  expandedGroupIds.value = [...expandedGroupIds.value, group.id]
  selectedGroup.value = group
}
const openMemberPicker = (group: Group) => {
  selectedGroup.value = group
  memberForm.egcs_cn_user = ''
  memberModalOpen.value = true
  if (!expandedGroupIds.value.includes(group.id)) expandedGroupIds.value = [...expandedGroupIds.value, group.id]
}
const rows = computed<GroupRow[]>(() => groups.value.flatMap(group => [
  { id: `group:${group.id}`, group, member: null, placeholder: false, name: getBilingualValue(group, 'egcs_cn_name', group.id), email: group.egcs_cn_email },
  ...(expandedGroupIds.value.includes(group.id)
    ? (membersByGroup.value[group.id]?.length
        ? membersByGroup.value[group.id]!.map(member => ({ id: `member:${group.id}:${member.egcs_cn_user}`, group, member, placeholder: false, name: member.egcs_cn_name, email: '' }))
        : [{ id: `empty:${group.id}`, group, member: null, placeholder: true, name: t('common.no_data'), email: '' }])
    : [])
]))
const columns: TableColumnInput<GroupRow>[] = [
  { id: 'name', accessorKey: 'name', headerKey: 'common.name' },
  { id: 'email', accessorKey: 'email', headerKey: 'groups.email' },
  { id: 'actions', headerKey: 'common.actions' }
]
const { getGroupedDisclosureControlsId } = useGroupedDisclosureIds()
const isHeroCollapsed = useDashboard().getHeroCollapsed('groups')
const heroStats = computed(() => [{ label: t('admin_common.total'), value: totalRecords.value }])
const agencyOptions = computed(() => [
  { label: t('groups.all_agencies'), value: 'all' },
  ...(agencyResponse.value?.items ?? []).map(agency => ({ label: getBilingualValue(agency, 'egcs_ay_name', agency.id), value: agency.id }))
])
const modalOpen: Ref<boolean> = ref(false)
const editing: Ref<Group | null> = ref(null)
const saving: Ref<boolean> = ref(false)
const form = reactive({ egcs_cn_agency: '', egcs_cn_name_en: '', egcs_cn_name_fr: '', egcs_cn_email: '' })
const validate = createValidator(GroupCreateSchema)
/**
 *
 */
const openCreate = () => {
  editing.value = null
  Object.assign(form, { egcs_cn_agency: '', egcs_cn_name_en: '', egcs_cn_name_fr: '', egcs_cn_email: '' })
  modalOpen.value = true
}
/**
 *
 */
const openEdit = (group: Group) => {
  editing.value = group
  Object.assign(form, group)
  modalOpen.value = true
}
/**
 *
 */
const save = async () => {
  try {
    saving.value = true
    const body = editing.value
      ? { egcs_cn_name_en: form.egcs_cn_name_en, egcs_cn_name_fr: form.egcs_cn_name_fr, egcs_cn_email: form.egcs_cn_email }
      : { ...form }
    await loadJson(editing.value ? `/api/groups/${editing.value.id}` : '/api/groups', { method: editing.value ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    modalOpen.value = false
    await refreshGroups()
  } catch (error) {
    showError(error)
  } finally {
    saving.value = false
  }
}
/**
 *
 */
const remove = async (group: Group) => {
  try {
    const deleted = await confirmDeleteRequest(`/api/groups/${group.id}`, { description: t('groups.delete_confirm') })
    if (!deleted) return
    if (selectedGroup.value?.id === group.id) selectedGroup.value = null
    expandedGroupIds.value = expandedGroupIds.value.filter(id => id !== group.id)
    await refreshGroups()
  } catch (error) { showError(error) }
}
/**
 *
 */
const addMember = async () => {
  if (!selectedGroup.value || !memberForm.egcs_cn_user) return
  try {
    const groupId = selectedGroup.value.id
    await loadJson(`/api/groups/${groupId}/members`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(memberForm) })
    memberForm.egcs_cn_user = ''
    await refreshMembers(groupId)
    memberModalOpen.value = false
  } catch (error) { showError(error) }
}
/**
 *
 */
const removeMember = async (group: Group, member: Member) => {
  try {
    await loadJson(`/api/groups/${group.id}/members/${member.egcs_cn_user}`, { method: 'DELETE' })
    await refreshMembers(group.id)
  } catch (error) { showError(error) }
}
</script>

<template>
  <UDashboardPanel id="groups">
    <template #header>
      <UDashboardNavbar :title="t('groups.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <div class="flex items-center gap-2">
            <UButton color="neutral" variant="ghost" :icon="isHeroCollapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'" :aria-label="t(isHeroCollapsed ? 'common.expand' : 'common.collapse')" @click="isHeroCollapsed = !isHeroCollapsed" />
            <CommonNavbarSide />
          </div>
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <div class="flex flex-1 flex-col">
        <CommonEntityHero :is-collapsed="isHeroCollapsed" icon="i-lucide-users" :title="t('groups.title')" :description="t('groups.description')" :stats="heroStats" />
        <CommonResourceLayoutPage v-model:search="search" v-model:pagination="pagination" :data="rows" :columns="columns" :total-records="totalRecords" :request-status="status" :show-button="canCreate" :button-label="t('common.add')" :get-row-id="(row: GroupRow) => row.id" @add="openCreate" @retry="refreshGroups">
          <template #filters>
            <USelect v-model="selectedAgency" :items="agencyOptions" :aria-label="t('groups.agency_filter')" class="min-w-48" />
          </template>
          <template #name-cell="{ row }">
            <div v-if="row.original.member || row.original.placeholder" :id="row.original.placeholder || membersByGroup[row.original.group.id]?.[0]?.egcs_cn_user === row.original.member?.egcs_cn_user ? getGroupedDisclosureControlsId(`group:${row.original.group.id}`) : undefined" class="flex items-center gap-2 pl-8">
              <UIcon name="i-lucide-corner-down-right" class="size-4 text-muted" />
              <span>{{ row.original.member?.egcs_cn_name ?? t('common.no_data') }}</span>
            </div>
            <CommonGroupedDisclosureButton v-else class="flex items-center gap-2 text-left" :expanded="expandedGroupIds.includes(row.original.group.id)" :controls="getGroupedDisclosureControlsId(row.original.id)" :label-en="row.original.group.egcs_cn_name_en" :label-fr="row.original.group.egcs_cn_name_fr" @toggle="toggleGroup(row.original.group)">
              <UIcon :name="expandedGroupIds.includes(row.original.group.id) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4" />
              <CommonBilingualName :name-en="row.original.group.egcs_cn_name_en" :name-fr="row.original.group.egcs_cn_name_fr" />
              <CommonStatusBadge v-if="membersByGroup[row.original.group.id]" variant="count" size="sm" :label="String(membersByGroup[row.original.group.id]?.length ?? 0)" />
            </CommonGroupedDisclosureButton>
          </template>
          <template #email-cell="{ row }">
            <span v-if="!row.original.member && !row.original.placeholder">{{ row.original.email }}</span>
          </template>
          <template #actions-cell="{ row }">
            <div class="flex justify-end gap-2">
              <template v-if="!row.original.member && !row.original.placeholder">
                <UButton v-if="can('group', 'update', { type: 'agency', agencyId: row.original.group.egcs_cn_agency })" icon="i-lucide-user-plus" color="neutral" variant="ghost" :aria-label="t('groups.add_member')" @click="openMemberPicker(row.original.group)" />
                <UButton v-if="can('group', 'update', { type: 'agency', agencyId: row.original.group.egcs_cn_agency })" icon="i-lucide-pencil" color="neutral" variant="ghost" :aria-label="t('common.edit')" @click="openEdit(row.original.group)" />
                <UButton v-if="can('group', 'delete', { type: 'agency', agencyId: row.original.group.egcs_cn_agency })" icon="i-lucide-trash" color="error" variant="ghost" :aria-label="t('common.delete')" @click="remove(row.original.group)" />
              </template>
              <UButton v-else-if="row.original.member && can('group', 'update', { type: 'agency', agencyId: row.original.group.egcs_cn_agency })" icon="i-lucide-trash" color="error" variant="ghost" :aria-label="t('common.delete')" @click="removeMember(row.original.group, row.original.member)" />
            </div>
          </template>
        </CommonResourceLayoutPage>
      </div>
      <UModal v-model:open="memberModalOpen" :title="t('groups.add_member')">
        <template #body>
          <UForm :state="memberForm" :validate="validateMember" class="space-y-4" @submit="addMember">
            <UFormField :label="t('groups.user')" name="egcs_cn_user" required>
              <USelectMenu
                v-model="memberForm.egcs_cn_user"
                :items="availableUsers"
                value-key="value"
                label-key="label"
                :placeholder="t('assignments.select_user')"
                :search-input="{ placeholder: t('assignments.search_users') }"
                virtualize
                required
                aria-required="true"
                class="w-full" />
            </UFormField>
            <div class="flex justify-end">
              <CommonSaveButton type="submit" :label="t('common.add')" :disabled="!memberForm.egcs_cn_user" />
            </div>
          </UForm>
        </template>
      </UModal>
      <UModal v-model:open="modalOpen" :title="t('groups.title')">
        <template #body>
          <UForm :state="form" :validate="validate" class="space-y-4" @submit="save">
            <UFormField v-if="!editing" :label="t('nav.agencies')" name="egcs_cn_agency" required>
              <USelect v-model="form.egcs_cn_agency" :items="(agencyResponse?.items ?? []).map(agency => ({ label: getBilingualValue(agency, 'egcs_ay_name', agency.id), value: agency.id }))" required />
            </UFormField>
            <UFormField :label="t('admin_common.fields.egcs_cn_name_en')" name="egcs_cn_name_en" required>
              <UInput v-model="form.egcs_cn_name_en" required />
            </UFormField>
            <UFormField :label="t('admin_common.fields.egcs_cn_name_fr')" name="egcs_cn_name_fr" required>
              <UInput v-model="form.egcs_cn_name_fr" required />
            </UFormField>
            <UFormField :label="t('groups.email')" name="egcs_cn_email" required>
              <UInput v-model="form.egcs_cn_email" type="email" required />
            </UFormField>
            <div class="flex justify-end">
              <CommonSaveButton type="submit" :label="t('common.save')" :loading="saving" />
            </div>
          </UForm>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
