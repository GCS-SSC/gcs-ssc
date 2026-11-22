<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- private handlers own one import modal session. */
import { computed, ref, watch } from 'vue'
import { z } from 'zod'
import { ofetch } from 'ofetch'
import {
  PortableAuthoringImportReportSchema,
  PortableAuthoringSchema,
  type PortableAuthoringImportReport,
  type PortableAuthoringKind,
  type PortableAuthoringNotice
} from '~~/shared/utils/portable-authoring-schema'
import { useActionContext } from '~/composables/useActionContext'
import { useModalSession } from '~/composables/useModalSession'
import { appRouteLocations } from '~/utils/route-locations'
import { getClientRequestUrl } from '~/utils/client-request-url'

const { agencyId, kinds, canCreate } = defineProps<{
  agencyId: string
  kinds: readonly [PortableAuthoringKind, ...PortableAuthoringKind[]]
  canCreate: boolean
}>()
type Removal = PortableAuthoringImportReport['removed'][number]
type ImportRequest = {
  envelope: unknown
  notices: PortableAuthoringNotice[]
  requestId: string
  confirmedRemovals: Removal[]
}
type ImportRetry = { action: 'retry' | 'remove' | 'rename'; request: ImportRequest }
type ImportPhase =
  | { kind: 'upload' }
  | { kind: 'pending' }
  | { kind: 'created'; report: PortableAuthoringImportReport; output: PortableAuthoringKind; name: { en: string; fr: string } }
  | { kind: 'failed'; message: string; details: Removal[]; notices: PortableAuthoringNotice[]; retry: ImportRetry | null }

const { locale, t } = useI18n()
const localePath = useLocalePath()
const available = useAuthoringGenerationAvailability(() => agencyId)
const actor = useActionContext({ identity: [() => agencyId], authority: () => canCreate })
const modal = useModalSession()
const open = modal.isOpen
const selectedKind = ref<PortableAuthoringKind>(kinds[0])
const generationOpen = ref(false)
const file = ref<File | null>(null)
const nameEn = ref('')
const nameFr = ref('')
const phase = ref<ImportPhase>({ kind: 'upload' })
const inFlight = ref(false)
const importNotices = computed(() => {
  if (phase.value.kind === 'created') return phase.value.report.notices
  if (phase.value.kind === 'failed') return phase.value.notices
  return []
})

watch(actor.version, () => {
  open.value = false
  generationOpen.value = false
}, { flush: 'sync' })

const begin = (kind: PortableAuthoringKind, mode: 'manual' | 'generate') => {
  if (!actor.capture()?.canDispatch() || inFlight.value) return
  selectedKind.value = kind
  nameEn.value = ''
  nameFr.value = ''
  if (mode === 'generate') generationOpen.value = true
  else {
    file.value = null
    phase.value = { kind: 'upload' }
    open.value = true
  }
}
const manualItems = computed(() => kinds.map(kind => ({
  label: t(`portable_authoring.kind.${kind}`),
  onSelect: () => begin(kind, 'manual')
})))
const generationItems = computed(() => kinds.map(kind => ({
  label: t(`portable_authoring.kind.${kind}`),
  onSelect: () => begin(kind, 'generate')
})))
const selectFile = (event: Event) => {
  if (event.target instanceof HTMLInputElement) file.value = event.target.files?.[0] ?? null
}

const routeNames = {
  checklist: appRouteLocations.agencyReviewSchemaDetail,
  assessment: appRouteLocations.agencyReviewSchemaDetail,
  recommendation: appRouteLocations.agencyRecommendationSchemaDetail,
  approval: appRouteLocations.agencyApprovalTemplateDetail
}
const resources = {
  checklist: 'review-schemas',
  assessment: 'review-schemas',
  recommendation: 'recommendation-schemas',
  approval: 'approval-templates'
}
const importError = z.object({
  statusCode: z.number().optional(),
  data: z.object({
    data: z.object({
      code: z.string(),
      message: z.string(),
      details: z.array(z.object({ path: z.string(), message: z.string() })).default([])
    })
  })
})
const importResponse = z.object({ importReport: PortableAuthoringImportReportSchema })
const editableEnvelope = z.looseObject({ payload: z.record(z.string(), z.unknown()) })
const nameIssue = (path: PropertyKey[]) => path.length === 2 && path[0] === 'payload'
  && (path[1] === 'egcs_cn_name_en' || path[1] === 'egcs_cn_name_fr')
const distinctDetails = (details: Removal[]) => [...new Map(details.map(detail => [
  JSON.stringify([detail.path, detail.reference]), detail
])).values()]

const withNames = (envelope: unknown, names: { en: string; fr: string }): unknown => {
  if (!names.en && !names.fr) return envelope
  const editable = editableEnvelope.safeParse(envelope)
  if (!editable.success) return envelope
  return {
    ...editable.data,
    payload: {
      ...editable.data.payload,
      ...(names.en ? { egcs_cn_name_en: names.en } : {}),
      ...(names.fr ? { egcs_cn_name_fr: names.fr } : {})
    }
  }
}

const runImport = async (resolve: () => Promise<ImportRequest>) => {
  const permission = actor.capture()
  const session = modal.captureSession()
  if (!permission?.canDispatch() || !session || inFlight.value) return
  const current = () => permission.isCurrent() && modal.isCurrentSession(session)
  const output = selectedKind.value
  const url = getClientRequestUrl(`/api/agency/${agencyId}/${resources[output]}`)
  inFlight.value = true
  phase.value = { kind: 'pending' }
  let request: ImportRequest | null = null
  try {
    request = await resolve()
    if (!current() || !permission.canDispatch()) return
    const parsed = PortableAuthoringSchema.safeParse(request.envelope)
    if (!parsed.success || parsed.data.kind !== output) {
      phase.value = {
        kind: 'failed',
        message: t('portable_authoring.invalid_schema'),
        details: parsed.success
          ? []
          : distinctDetails(parsed.error.issues.map(issue => ({
              path: issue.path.join('.'),
              reference: issue.message.startsWith('validation.') ? t(issue.message) : issue.message
            }))),
        notices: request.notices,
        retry: !parsed.success && parsed.error.issues.every(issue => nameIssue(issue.path))
          ? { action: 'rename', request }
          : null
      }
      return
    }
    const response = await ofetch<unknown>(url.toString(), {
      method: 'POST',
      retry: false,
      body: {
        portable: parsed.data,
        importOptions: {
          requestId: request.requestId,
          confirmedRemovals: request.confirmedRemovals,
          notices: request.notices
        }
      }
    })
    if (!current()) return
    phase.value = {
      kind: 'created',
      report: importResponse.parse(response).importReport,
      output,
      name: { en: parsed.data.payload.egcs_cn_name_en, fr: parsed.data.payload.egcs_cn_name_fr }
    }
  } catch (error) {
    if (!current()) return
    const parsedError = importError.safeParse(error).data
    const api = parsedError?.data.data
    const details = distinctDetails(api?.details.map(item => ({ path: item.path, reference: item.message })) ?? [])
    let retry: ImportRetry | null = null
    if (request) {
      if (api?.code === 'AUTHORING_IMPORT_MISSING_REFERENCES') {
        retry = { action: 'remove', request: { ...request, confirmedRemovals: details } }
      } else if (api?.code === 'AUTHORING_IMPORT_DUPLICATE_NAME') {
        retry = { action: 'rename', request }
      } else if (!api || (parsedError?.statusCode ?? 0) >= 500) {
        retry = { action: 'retry', request }
      }
    }
    phase.value = {
      kind: 'failed',
      message: api?.message ?? t(request ? 'portable_authoring.import_failed' : 'portable_authoring.invalid_file'),
      details,
      notices: request?.notices ?? [],
      retry
    }
  } finally {
    inFlight.value = false
  }
}

const newRequest = (envelope: unknown, notices: PortableAuthoringNotice[] = []): ImportRequest => ({
  envelope,
  notices,
  requestId: crypto.randomUUID(),
  confirmedRemovals: []
})
const importFile = async () => {
  const selected = file.value
  if (!selected) return
  const names = { en: nameEn.value.trim(), fr: nameFr.value.trim() }
  await runImport(async () => {
    if (selected.size > 10 * 1024 * 1024) throw new Error('Schema file too large')
    const envelope: unknown = JSON.parse(await selected.text())
    return newRequest(withNames(envelope, names))
  })
}
const importGenerated = async (envelope: unknown, notices: PortableAuthoringNotice[]) => {
  if (!actor.capture()?.canDispatch()) return
  phase.value = { kind: 'upload' }
  open.value = true
  await runImport(async () => newRequest(envelope, notices))
}
const retryImport = async () => {
  if (phase.value.kind !== 'failed' || !phase.value.retry) return
  const { action, request } = phase.value.retry
  const names = { en: nameEn.value.trim(), fr: nameFr.value.trim() }
  if (action === 'rename' && (!names.en && !names.fr)) return
  await runImport(async () => action === 'rename'
    ? { ...request, envelope: withNames(request.envelope, names) }
    : request)
}
</script>

<template>
  <div v-if="canCreate" class="flex flex-wrap gap-2">
    <UDropdownMenu v-if="kinds.length > 1" :items="manualItems">
      <UButton color="neutral" variant="outline" icon="i-lucide-import" :label="t('portable_authoring.import')" />
    </UDropdownMenu>
    <UButton
      v-else
      color="neutral"
      variant="outline"
      icon="i-lucide-import"
      :label="t('portable_authoring.import')"
      @click="begin(kinds[0], 'manual')" />
    <template v-if="available">
      <UDropdownMenu v-if="kinds.length > 1" :items="generationItems">
        <UButton color="neutral" variant="outline" icon="i-lucide-sparkles" :label="t('portable_authoring.generate')" />
      </UDropdownMenu>
      <UButton
        v-else
        color="neutral"
        variant="outline"
        icon="i-lucide-sparkles"
        :label="t('portable_authoring.generate')"
        @click="begin(kinds[0], 'generate')" />
      <CommonAuthoringGenerationModal
        v-model:open="generationOpen"
        :agency-id="agencyId"
        :kind="selectedKind"
        :can-generate="canCreate && available"
        @generated="importGenerated" />
    </template>

    <UModal
      v-model:open="open"
      :title="phase.kind === 'upload' ? t('portable_authoring.import') : t('portable_authoring.report')"
      :description="t(`portable_authoring.kind.${selectedKind}`)"
      :ui="{ content: 'sm:max-w-3xl' }"
      :dismissible="!inFlight"
      :close="!inFlight">
      <template #body>
        <div v-if="phase.kind === 'upload'" class="space-y-4">
          <UFormField :label="t('portable_authoring.file')" required data-field-exclude="Portable schema upload">
            <UInput type="file" accept=".json,application/json" class="w-full" @change="selectFile" />
          </UFormField>
        </div>
        <p v-else-if="phase.kind === 'pending'" role="status">
          {{ t('portable_authoring.pending') }}
        </p>
        <div v-else-if="phase.kind === 'failed'" class="space-y-4">
          <UAlert color="error" :title="phase.message" role="alert" />
          <ul v-if="phase.details.length" class="list-disc space-y-1 ps-5">
            <li v-for="(detail, index) in phase.details" :key="index">
              {{ detail.path }} · {{ detail.reference }}
            </li>
          </ul>
        </div>
        <div v-else class="space-y-4">
          <UAlert
            color="success"
            icon="i-lucide-circle-check"
            :title="t('portable_authoring.created')"
            :description="locale === 'fr' ? phase.name.fr : phase.name.en" />
          <div v-if="phase.report.removed.length">
            <h3 class="font-semibold">
              {{ t('portable_authoring.removed') }}
            </h3>
            <ul class="list-disc space-y-1 ps-5">
              <li v-for="(item, index) in phase.report.removed" :key="index">
                {{ item.path }} · {{ item.reference }}
              </li>
            </ul>
          </div>
        </div>
        <div
          v-if="phase.kind === 'upload' || (phase.kind === 'failed' && phase.retry?.action === 'rename')"
          class="mt-4 space-y-3">
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="space-y-2">
              <span class="block font-medium">{{ t('portable_authoring.name_en') }}</span>
              <input v-model="nameEn" class="w-full rounded-md border border-default px-3 py-2" data-field-exclude="Optional import name override" :required="false" type="text">
            </label>
            <label class="space-y-2">
              <span class="block font-medium">{{ t('portable_authoring.name_fr') }}</span>
              <input v-model="nameFr" class="w-full rounded-md border border-default px-3 py-2" data-field-exclude="Optional import name override" :required="false" type="text">
            </label>
          </div>
          <p class="text-sm text-muted">
            {{ t('portable_authoring.names_hint') }}
          </p>
        </div>
        <div v-if="importNotices.length">
          <h3 class="mt-4 font-semibold">
            {{ t('portable_authoring.notices') }}
          </h3>
          <ul class="list-disc space-y-1 ps-5">
            <li v-for="(notice, index) in importNotices" :key="index">
              {{ notice.message }}
              <p v-if="notice.source" class="text-sm text-muted">
                {{ notice.source }}
              </p>
            </li>
          </ul>
        </div>
      </template>
      <template #footer>
        <UButton
          v-if="phase.kind === 'upload'"
          :label="t('portable_authoring.import')"
          :disabled="!file || inFlight"
          @click="importFile" />
        <UButton
          v-if="phase.kind === 'failed' && phase.retry"
          :label="phase.retry.action === 'remove' ? t('portable_authoring.remove_retry') : t('common.retry')"
          :disabled="inFlight || (phase.retry.action === 'rename' && !nameEn.trim() && !nameFr.trim())"
          @click="retryImport" />
        <UButton
          v-if="phase.kind === 'created'"
          :label="t('portable_authoring.open_draft')"
          :to="localePath(routeNames[phase.output](agencyId, phase.report.id))"
          @click="open = false" />
      </template>
    </UModal>
  </div>
</template>
