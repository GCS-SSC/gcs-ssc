<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import type { $Fetch } from 'ofetch'
import { useActionContext } from '~/composables/useActionContext'
import { useEditorMutationCoordinator } from '~/composables/useEditorMutationCoordinator'
import { useResourceRequest } from '~/composables/useResourceRequest'
import { AgreementSubmissionPayloadSchema } from '~~/shared/types/agreement-submission'
import type { AgreementSubmissionBudgetPreview, AgreementSubmissionCommand, AgreementSubmissionDetail } from '~~/shared/types/agreement-submission'
import { agreementSubmissionTargetSchemas } from '~~/shared/types/schemas/agreement-submission-targets'
import { appRouteLocations } from '~/utils/route-locations'
import { requiredSubmissionFields, submissionFieldKey, submissionFields } from '~/utils/agreement-submission-view'
import type { SubmissionObject } from '~/utils/agreement-submission-view'

type BudgetOption = { id: string; nameEn: string; nameFr: string }

const { agreementId, submissionId, currency, commandPending, sendCommand } = defineProps<{
  agreementId: string
  submissionId: string
  currency: string
  commandPending: boolean
  sendCommand: (submissionId: string, command: AgreementSubmissionCommand) => Promise<AgreementSubmissionDetail | undefined>
}>()
const { t, te, locale } = useI18n()
const localePath = useLocalePath()
const { showError, resolveDetails } = useApiErrorToast()
const toast = useLocalizedToast()
const { translateMessage } = useZodI18n()
const draft = shallowRef<SubmissionObject>({})
const payloadHeading = ref<HTMLElement | null>(null)
const description = ref('')
const returning = ref(false)
const returnError = ref(false)
const actionError = ref(false)
const amendmentId = ref('')
const confirmed = ref(false)
const apiPath = computed(() => `/api/agreements/${agreementId}/submissions/${submissionId}`)
const fetchJson: $Fetch = $fetch as $Fetch
const resource = useResourceRequest({
  identity: apiPath,
  load: signal => fetchJson<AgreementSubmissionDetail>(apiPath.value, { signal })
})
const committed = shallowRef<AgreementSubmissionDetail | null>(null)
const detail = computed(() => committed.value ?? resource.data.value)
const submission = computed(() => detail.value?.submission)
const state = computed(() => submission.value?.egcs_fc_state)
const canReview = computed(() => detail.value?.canReview === true)
const editable = computed(() => canReview.value && state.value === 'reviewing' && submission.value?.egcs_fc_formatversion === 1)
const fields = computed(() => submission.value ? submissionFields[submission.value.egcs_fc_target] : null)
const context = useActionContext({ identity: [() => agreementId, () => submissionId], authority: canReview })
const mutation = useEditorMutationCoordinator({ context, getDraft: () => draft.value })
const isPending = computed(() => commandPending || mutation.isPending.value)
const budgetMode = computed(() => editable.value && submission.value?.egcs_fc_target === 'amendment_budget')
const options = useResourceRequest({
  identity: apiPath,
  enabled: budgetMode,
  load: signal => fetchJson<{ options: BudgetOption[] }>(apiPath.value + '/budget-preview', { signal })
})
const budgetOptions = computed(() => (options.data.value?.options ?? []).map(option => ({
  label: locale.value === 'fr' ? option.nameFr || option.nameEn : option.nameEn || option.nameFr,
  value: option.id
})))
const previewIdentity = computed(() => JSON.stringify([apiPath.value, submission.value?.egcs_fc_revision, amendmentId.value, draft.value]))
const preview = useResourceRequest({
  identity: previewIdentity,
  enabled: () => budgetMode.value && amendmentId.value !== '',
  trigger: 'refresh',
  refreshData: 'clear',
  load: signal => fetchJson<AgreementSubmissionBudgetPreview>(apiPath.value + '/budget-preview', {
    method: 'POST', body: { amendmentId: amendmentId.value, payload: draft.value }, signal
  })
})
const previewDetails = computed(() => resolveDetails(preview.error.value))
const validationIssues = computed(() => {
  if (!editable.value || !submission.value) return []
  const parsed = agreementSubmissionTargetSchemas[submission.value.egcs_fc_target].safeParse(draft.value)
  return parsed.success
    ? []
    : parsed.error.issues.map(issue => ({
        path: issue.path.map(part => {
          if (typeof part === 'number') return t('submission.row', { number: part + 1 })
          const key = submissionFieldKey(String(part))
          return te(key) ? t(key) : String(part)
        }).join(' / '),
        message: translateMessage(issue.message, issue)
      }))
})
const canAccept = computed(() => editable.value && (
  !budgetMode.value || (preview.data.value !== null && confirmed.value)
))
const requiredKeys = computed(() => submission.value ? requiredSubmissionFields[submission.value.egcs_fc_target] : [])
const blockerKey = computed(() => {
  const blocker = submission.value?.egcs_fc_blocker
  const key = `submission.blocker.${blocker}`
  return blocker && te(key) ? key : 'submission.errors.blocked'
})
const latestReturn = computed(() => detail.value?.events.findLast(event => event.egcs_fc_kind === 'returned'))
const result = computed(() => {
  const record = submission.value
  if (!record?.egcs_fc_result) return null
  const id = record.egcs_fc_result
  switch (record.egcs_fc_target) {
    case 'claim': return appRouteLocations.agreementClaimDetail(agreementId, id)
    case 'forecast': return appRouteLocations.agreementForecastDetail(agreementId, id)
    case 'amendment_budget': return { ...appRouteLocations.agreementAmendmentDetail(agreementId, id), query: { section: 'budget' } }
    default: return null
  }
})

watch(previewIdentity, () => {
  confirmed.value = false
}, { flush: 'sync' })
watch(() => resource.data.value, response => {
  if (!response) return
  committed.value = null
  mutation.replaceSessionDraft(() => {
    draft.value = response.submission.egcs_fc_payload
    amendmentId.value = response.submission.egcs_fc_amendment ?? ''
  })
}, { immediate: true })

/**
 * Loads a replacement preview against the currently selected draft Amendment.
 * @returns Whether the preview request established current evidence.
 */
const loadPreview = () => {
  confirmed.value = false
  return preview.refresh()
}

/**
 * Reloads only the server record after a failed request.
 * @returns Whether the reload established current evidence.
 */
const reload = () => {
  actionError.value = false
  return resource.refresh()
}

/**
 * Issues one transition against the current saved review revision.
 * @param action Requested review action.
 */
const execute = async (action: AgreementSubmissionCommand['action']) => {
  const current = submission.value
  if (!current || isPending.value) return
  const revision = current.egcs_fc_revision
  const parsed = AgreementSubmissionPayloadSchema.safeParse(draft.value)
  if (!parsed.success) return
  const payload = parsed.data
  let request: AgreementSubmissionCommand
  switch (action) {
    case 'start':
      request = { action, revision }
      break
    case 'save':
      request = { action, revision, payload }
      break
    case 'return':
      if (!description.value.trim()) {
        returnError.value = true
        return
      }
      request = { action, revision, payload, description: description.value.trim() }
      break
    case 'accept':
      if (!canAccept.value) return
      request = budgetMode.value && preview.data.value
        ? {
            action, revision, payload, amendmentId: amendmentId.value,
            expectedBudgetRevision: preview.data.value.revision,
            expectedBudgetConfirmation: preview.data.value.confirmation
          }
        : { action, revision, payload }
      break
  }
  actionError.value = false
  returnError.value = false
  await mutation.run(action, async token => {
    try {
      const response = await sendCommand(submissionId, request)
      if (!response || !mutation.isTokenCurrent(token)) return
      committed.value = response
      mutation.applyMutationRefresh(token, {
        apply: () => {
          draft.value = response.submission.egcs_fc_payload
        }
      })
      if (action === 'save') toast.add({ title: toast.localized('common.success'), description: toast.localized('submission.save_success'), color: 'success' })
      if (action === 'return') {
        returning.value = false
        description.value = ''
      }
      if (action !== 'save') {
        await nextTick()
        if (mutation.isTokenCurrent(token)) payloadHeading.value?.focus()
      }
    } catch (error) {
      if (mutation.isTokenCurrent(token)) {
        if (action === 'accept' && budgetMode.value) {
          preview.reset()
          confirmed.value = false
        }
        actionError.value = true
        showError(error)
      }
    }
  })
}
</script>

<template>
  <CommonLoadingState v-if="resource.status.value === 'pending' && !detail" :label="t('common.loading')" />
  <CommonErrorNotice v-if="resource.error.value" :title="t('submission.detail_failed')">
    <template #actions>
      <UButton color="error" variant="outline" @click="reload">
        {{ t('common.retry') }}
      </UButton>
    </template>
  </CommonErrorNotice>
  <template v-if="detail && submission">
    <CommonDetailSection
      :title="t('submission.record', { reference: submission.egcs_fc_sourceid })"
      :description="t('submission.record_description', {
        target: t(`submission.target.${submission.egcs_fc_target}`),
        source: submission.egcs_fc_sourcesystem,
        state: t(`submission.state.${submission.egcs_fc_state}`)
      })">
      <template v-if="state === 'submitted' && canReview" #actions>
        <UButton icon="i-lucide-play" :loading="mutation.isActionPending('start')" :disabled="isPending" @click="execute('start')">
          {{ t('submission.start') }}
        </UButton>
      </template>
      <template #notices>
        <CommonNotice
          v-if="submission.egcs_fc_blocker && state !== 'accepted'"
          tone="warning" :title="t('submission.needs_attention')" :description="t(blockerKey)" />
        <CommonNotice
          v-if="state === 'returned'"
          tone="warning" icon="i-lucide-undo-2" :title="t('submission.waiting')" :description="latestReturn?.egcs_fc_description ?? undefined" />
        <CommonNotice v-if="submission.egcs_fc_formatversion !== 1" tone="warning" :title="t('submission.errors.format')" />
        <CommonErrorNotice v-if="actionError" :title="t('submission.action_failed')">
          <template #actions>
            <UButton color="error" variant="outline" :loading="resource.status.value === 'pending'" @click="reload">
              {{ t('submission.reload') }}
            </UButton>
          </template>
        </CommonErrorNotice>
      </template>
      <UButton v-if="result" :to="localePath(result)" variant="outline" trailing-icon="i-lucide-arrow-right">
        {{ t('submission.open_result', { target: t(`submission.target.${submission.egcs_fc_target}`) }) }}
      </UButton>
      <section class="min-w-0 space-y-4">
        <h4 ref="payloadHeading" tabindex="-1" class="scroll-mt-20 font-semibold text-highlighted">
          {{ t(editable ? 'submission.working_copy' : 'submission.payload') }}
        </h4>
        <p v-if="editable && detail.updatedByName" class="text-sm text-muted">
          {{ t('submission.last_updated_by', { name: detail.updatedByName }) }}
        </p>
        <AgreementSubmissionFields v-if="editable && fields" v-model="draft" data-field-exclude="Versioned source field configuration." :fields="fields" :required-keys="requiredKeys" :currency="currency" :disabled="isPending" />
        <AgreementSubmissionValue v-else :value="submission.egcs_fc_payload" />
      </section>

      <CommonNotice v-if="validationIssues.length" tone="warning" :title="t('submission.validation_issues')">
        <template #description>
          <ul class="list-disc pl-4">
            <li v-for="(issue, index) in validationIssues" :key="index">
              <strong v-if="issue.path">{{ issue.path }}</strong> {{ issue.message }}
            </li>
          </ul>
        </template>
      </CommonNotice>

      <section v-if="budgetMode" class="min-w-0 space-y-4 rounded-md border border-default p-4">
        <h4 class="font-semibold text-highlighted">
          {{ t('submission.budget_preview') }}
        </h4>
        <p class="text-sm text-muted">
          {{ t('submission.replacement_notice') }}
        </p>
        <CommonErrorNotice v-if="options.error.value" :title="t('submission.amendments_failed')">
          <template #actions>
            <UButton color="error" variant="outline" @click="options.refresh">
              {{ t('common.retry') }}
            </UButton>
          </template>
        </CommonErrorNotice>
        <p v-else-if="options.status.value === 'success' && !budgetOptions.length" class="text-sm text-muted">
          {{ t('submission.no_eligible_amendments') }}
        </p>
        <UFormField v-if="options.status.value === 'pending' || budgetOptions.length" data-field-exclude="Transient selection for a replacement preview." required :label="t('submission.select_amendment')">
          <USelect
            v-model="amendmentId" :items="budgetOptions" class="w-full sm:w-auto" :loading="options.status.value === 'pending'"
            required :disabled="isPending" :placeholder="t('common.select')" />
        </UFormField>
        <UButton
          v-if="budgetOptions.some(option => option.value === amendmentId)"
          variant="outline" :disabled="isPending" :loading="preview.status.value === 'pending'"
          icon="i-lucide-eye" @click="loadPreview">
          {{ t('submission.preview') }}
        </UButton>
        <CommonErrorNotice v-if="preview.error.value" :title="t('submission.preview_failed')">
          <template v-if="previewDetails.length" #description>
            <ul class="list-disc pl-4">
              <li v-for="message in previewDetails" :key="message">
                {{ message }}
              </li>
            </ul>
          </template>
        </CommonErrorNotice>
        <div v-if="preview.data.value" class="space-y-4">
          <AgreementSubmissionChanges :before="preview.data.value.current" :after="preview.data.value.replacement" />
          <UCheckbox v-model="confirmed" data-field-exclude="Transient confirmation of the previewed replacement." required :disabled="isPending" :label="t('submission.confirm_replacement')" />
        </div>
      </section>

      <div v-if="state === 'reviewing' && canReview" class="flex flex-wrap gap-3">
        <UButton
          v-if="editable" color="neutral" variant="outline" :disabled="isPending" :loading="mutation.isActionPending('save')"
          @click="execute('save')">
          {{ t('submission.save') }}
        </UButton>
        <UButton color="warning" variant="outline" :disabled="isPending" @click="returning = true">
          {{ t('submission.return') }}
        </UButton>
        <UButton
          v-if="editable" color="success" icon="i-lucide-check" :disabled="!canAccept || isPending" :loading="mutation.isActionPending('accept')"
          @click="execute('accept')">
          {{ t('submission.accept') }}
        </UButton>
      </div>

      <section v-if="returning && state === 'reviewing' && canReview" class="space-y-4 rounded-md border border-default p-4">
        <h4 class="font-semibold text-highlighted">
          {{ t('submission.return') }}
        </h4>
        <UFormField data-field-scope="agreement.submission" name="description" required :label="t('submission.return_description')" :error="returnError ? t('validation.required') : undefined">
          <UTextarea v-model="description" class="w-full" required :maxlength="500" :disabled="isPending" />
        </UFormField>
        <div class="flex flex-wrap gap-3">
          <UButton color="warning" :loading="mutation.isActionPending('return')" @click="execute('return')">
            {{ t('submission.confirm_return') }}
          </UButton>
          <UButton color="neutral" variant="outline" :disabled="isPending" @click="returning = false">
            {{ t('common.cancel') }}
          </UButton>
        </div>
      </section>
    </CommonDetailSection>
    <AgreementSubmissionHistory :events="detail.events" :source="submission.egcs_fc_sourcesystem" :target="submission.egcs_fc_target" />
  </template>
</template>
