<script setup lang="ts">
import type { Ref } from 'vue'
import { AuditAccessListResponseSchema } from '~~/shared/types/schemas/audit'
import type { AuditAccessListResponse, AuditSummary } from '~~/shared/types/schemas/audit'

const { query, contextKey } = defineProps<{ query: Record<string, string>; contextKey: unknown }>()
const emit = defineEmits<{ select: [row: AuditSummary] }>()
const { t } = useI18n()
const data: Ref<AuditAccessListResponse | null> = ref(null)
const status: Ref<'pending' | 'success' | 'error'> = ref('pending')
type Cursor = NonNullable<AuditAccessListResponse['nextCursor']>
const cursors: Ref<(Cursor | null)[]> = ref([null])
const pagination = ref({ pageIndex: 0, pageSize: 20 })
let generation = 0
let controller: AbortController | null = null
let timeWindow: { from: string; to: string } | null = null
/** Reject stale responses after filters, permissions or page selection change. */
const load = async () => {
  const current = ++generation
  controller?.abort()
  controller = new AbortController()
  data.value = null
  status.value = 'pending'
  try {
    const response = AuditAccessListResponseSchema.parse(await $fetch('/api/admin/audit/access', {
      query: { ...query, ...timeWindow, ...cursors.value[pagination.value.pageIndex], limit: pagination.value.pageSize }, signal: controller.signal
    }))
    if (current !== generation) return
    data.value = response
    timeWindow = { from: response.from, to: response.to }
    status.value = 'success'
  } catch {
    if (current === generation) status.value = 'error'
  }
}
watch(() => [query, contextKey], () => {
  cursors.value = [null]
  const firstPage = pagination.value.pageIndex === 0
  pagination.value.pageIndex = 0
  timeWindow = null
  if (firstPage) void load()
}, { immediate: true, deep: true })
watch(() => [pagination.value.pageIndex, pagination.value.pageSize] as const, ([pageIndex, pageSize], [previousPage, previousSize]) => {
  if (pageSize !== previousSize) {
    cursors.value = [null]
    if (pageIndex !== 0) {
      pagination.value.pageIndex = 0
      return
    }
  } else if (pageIndex === previousPage + 1 && data.value?.nextCursor) {
    cursors.value[pageIndex] = data.value.nextCursor
  }
  void load()
})
onBeforeUnmount(() => {
  generation++
  controller?.abort()
})
const columns = computed(() => [
  { accessorKey: 'created_at', header: t('audit.date') },
  { accessorKey: 'actor_user_id', header: t('audit.actor') },
  { accessorKey: 'table_name', header: t('audit.table') },
  { accessorKey: 'operation', header: t('audit.operation') },
  { accessorKey: 'request_id', header: t('audit.requestId') },
  { id: 'actions', header: t('common.actions') }
])
</script>

<template>
  <div class="space-y-3">
    <p class="text-sm text-muted">
      {{ t('audit.accessWindow') }}
    </p>
    <CommonResourceLayoutCard
      v-model:pagination="pagination"
      :data="data?.items ?? []"
      :columns="columns"
      :request-status="status"
      :cursor="{ availablePages: cursors.length, hasNextPage: Boolean(data?.nextCursor) }"
      :show-toolbar="false"
      @retry="load()">
      <template #actions-cell="{ row }">
        <div class="flex justify-end gap-2">
          <CommonActionButton icon="i-lucide-eye" color="neutral" variant="ghost" :aria-label="t('audit.details')" @click="emit('select', row.original)" />
        </div>
      </template>
      <template #footer-left>
        {{ t('audit.accessPageRecords', { count: data?.items.length ?? 0 }) }}
      </template>
    </CommonResourceLayoutCard>
  </div>
</template>
