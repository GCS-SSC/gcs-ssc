<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { z } from 'zod'
import type { Correspondence } from '~/composables/useCorrespondence'
import { resolveCorrespondenceAt } from '~/composables/useCorrespondence'
import type { AdminCommonLookupResponseItem } from '~~/shared/types/admin-common-ui'
import { MAX_REQUEST_ATTACHMENTS } from '~~/shared/types/correspondence'
import type { CorrespondenceEntry, CorrespondenceThread } from '~~/shared/types/correspondence'
import { MAX_ATTACHMENT_FILE_BYTES } from '~~/shared/utils/attachment-limits'

const { correspondence, attachmentUrl, contactsUrl } = defineProps<{
  correspondence: Correspondence
  attachmentUrl: (thread: CorrespondenceThread, entry: CorrespondenceEntry, attachmentId: string) => string
  contactsUrl: string
}>()
const {
  data, loadStatus, refresh, opening, openEditor, draft, editorOpen, editorActionContext,
  pending, canSubmit, canWriteRole, writeControlsDisabled, search, statusFilter, threads,
  selectedId, selectedThread, isResponse, openingQuestions, submit, patch, setFiles
} = correspondence
const { t, locale } = useI18n()
const requestFetch = useRequestFetch()

const statusOptions = computed(() => [
  { label: t('agreement_requests.all'), value: 'all' },
  { label: t('agreement_requests.open'), value: 'open' },
  { label: t('agreement_requests.resolved'), value: 'resolved' }
])
const senderTimeSeparator = ' @ '
const actionButtonUi = { label: 'whitespace-normal break-words text-start' }

const savedContact = ref<string>()
let autofilledContact: string | undefined
watch(draft, () => {
  savedContact.value = undefined
  autofilledContact = undefined
}, { flush: 'sync' })
watch(savedContact, () => {
  autofilledContact = undefined
}, { flush: 'sync' })
const contactAccess = useResourceRequest({
  identity: () => JSON.stringify([correspondence.identity(), contactsUrl]),
  enabled: () => editorOpen.value && isResponse.value && Boolean(contactsUrl),
  load: async signal => {
    await requestFetch(contactsUrl, { query: { page: 1, limit: 1 }, signal })
    return true
  }
})
const { data: canReadContacts } = contactAccess

const editorTitle = computed(() => t(opening.value?.kind === 'start'
  ? 'agreement_requests.new_thread'
  : opening.value?.kind === 'edit'
    ? 'agreement_requests.edit_message'
    : opening.value?.kind === 'note'
      ? 'agreement_requests.add_note'
      : isResponse.value ? 'agreement_requests.reply' : 'agreement_requests.add_question'))

const formatDate = (value: string) => new Intl.DateTimeFormat(locale.value, {
  dateStyle: 'medium',
  timeStyle: 'short'
}).format(new Date(value))

const questionOptions = computed(() => openingQuestions.value.map((question, index) => ({
  value: question.id,
  label: t('agreement_requests.question_option', {
    number: index + 1,
    date: formatDate(question.correspondenceAt),
    message: question.body.replace(/\s+/g, ' ').slice(0, 100)
  })
})))

const text = (max: number) => z.string().trim().max(max, { error: 'validation.max_length' })
  .refine(value => !value.includes('\u0000'), { error: 'validation.invalid_selection' })
const requiredText = (max: number) => text(max).refine(value => value.length > 0, { error: 'validation.required' })
const draftSchema = computed(() => {
  const target = opening.value
  const reply = isResponse.value
  const questions = openingQuestions.value
  return z.object({
    subject: target?.kind === 'start' ? requiredText(255) : z.string(),
    questionId: target?.kind === 'reply'
      ? z.string().refine(id => questions.some(question => question.id === id), { error: 'validation.invalid_selection' })
      : z.string(),
    body: reply ? text(20000) : requiredText(20000),
    correspondenceAt: z.string()
      .refine(value => !value.startsWith('0000-') && Date.parse(resolveCorrespondenceAt(value, target)) <= Date.now(), { error: 'validation.request_correspondence_date' }),
    contactName: reply ? requiredText(255) : z.string(),
    contactEmail: reply ? z.string().trim().pipe(z.union([z.literal(''), z.email({ error: 'validation.invalid_email' }).max(255, { error: 'validation.max_length' })])) : z.string(),
    files: z.array(z.instanceof(File)).max(MAX_REQUEST_ATTACHMENTS, { error: 'apiErrors.agreementRequests.too_many_attachments' })
      .refine(files => files.every(file => file.size <= MAX_ATTACHMENT_FILE_BYTES), { error: 'validation.request_attachment_size' })
  }).refine(value => Boolean(value.body.trim() || value.files.length || (target?.kind === 'edit' && target.entry.attachments.length)), {
    path: ['body'],
    error: 'validation.request_reply_content'
  }).refine(value => {
    const questionId = target?.kind === 'edit' ? target.entry.questionId : value.questionId
    const question = questions.find(candidate => candidate.id === questionId)
    return !question || Date.parse(resolveCorrespondenceAt(value.correspondenceAt, target)) >= Date.parse(question.correspondenceAt)
  }, { path: ['correspondenceAt'], error: 'validation.request_reply_before_question' })
})

/**
 * Copies contact details into the draft without retaining a contact relationship.
 * @param owner - Draft that opened this lookup.
 * @param items - Resolved lookup items for the current selection.
 */
const autofillContact = (owner: NonNullable<typeof draft.value>, items: AdminCommonLookupResponseItem[]) => {
  const selected = savedContact.value
  if (!selected || autofilledContact === selected || !editorOpen.value || draft.value !== owner || pending.value) return
  const item = items.find(candidate => String(candidate.id) === selected)
  if (!item || typeof item.egcs_cn_name !== 'string') return
  autofilledContact = selected
  owner.contactName = item.egcs_cn_name
  owner.contactEmail = typeof item.egcs_cn_email === 'string' ? item.egcs_cn_email : ''
}

/**
 * Reads the current form's native file selection.
 * @param owner - Draft that rendered this picker.
 * @param event - Native file input change.
 */
const selectFiles = (owner: NonNullable<typeof draft.value>, event: Event) => {
  if (event.target instanceof HTMLInputElement) setFiles(owner, Array.from(event.target.files ?? []))
}

const threadActions = computed<DropdownMenuItem[][]>(() => {
  const thread = selectedThread.value
  if (!thread) return []
  const request = thread.entries.findLast(entry => entry.kind === 'question')
  const compose: DropdownMenuItem[] = []
  if (thread.status === 'open') compose.push({
    label: t('agreement_requests.add_question'),
    icon: 'i-lucide-plus',
    onSelect: () => openEditor({ kind: 'question', threadId: thread.id }, thread)
  })
  if (request) compose.push({
    label: t('agreement_requests.reply'),
    icon: 'i-lucide-arrow-down-left',
    onSelect: () => openEditor({ kind: 'reply', threadId: thread.id, questionId: request.id }, thread)
  })
  compose.push({
    label: t('agreement_requests.add_note'),
    icon: 'i-lucide-sticky-note',
    onSelect: () => openEditor({ kind: 'note', threadId: thread.id }, thread)
  })
  return [compose, [
    {
      label: t(thread.internal ? 'agreement_requests.make_shareable' : 'agreement_requests.make_internal'),
      icon: thread.internal ? 'i-lucide-lock-open' : 'i-lucide-lock-keyhole',
      onSelect: () => patch(thread, { internal: !thread.internal })
    },
    {
      label: t(thread.status === 'open' ? 'agreement_requests.resolve' : 'agreement_requests.reopen'),
      icon: thread.status === 'open' ? 'i-lucide-check' : 'i-lucide-rotate-ccw',
      onSelect: () => patch(thread, { status: thread.status === 'open' ? 'resolved' : 'open' })
    }
  ]]
})
</script>

<template>
  <div class="min-w-0 space-y-5" data-field-scope="agreement.submission.requests" data-scope-label-en="Agreements > Submission > Requests" data-scope-label-fr="Ententes > Soumission > Demandes">
    <CommonErrorNotice
      v-if="loadStatus === 'error'"
      :title="t('agreement_requests.load_error')"
      :actions="[{ label: t('common.retry'), onClick: () => refresh() }]" />
    <p v-if="loadStatus === 'pending' && !data" role="status" class="text-muted">
      {{ t('common.loading_records') }}
    </p>
    <template v-if="data">
      <CommonNotice
        v-if="data.writeBlock === 'terminal'"
        tone="info"
        icon="i-lucide-lock-keyhole"
        :title="t('agreement_requests.read_only')" />

      <div class="flex flex-wrap items-end gap-3">
        <UFormField :label="t('agreement_requests.search')" class="w-auto min-w-40 flex-1" :required="false" data-field-exclude="This control filters the inbox and is not submitted.">
          <UInput v-model="search" icon="i-lucide-search" class="w-full" />
        </UFormField>
        <UFormField :label="t('agreement_requests.filter')" class="w-auto shrink-0" :required="false" data-field-exclude="This control filters the inbox and is not submitted.">
          <USelect v-model="statusFilter" :items="statusOptions" class="min-w-32" />
        </UFormField>
        <UButton
          v-if="canWriteRole"
          :ui="actionButtonUi"
          class="min-w-0 max-w-full"
          :label="t('agreement_requests.new_thread')"
          icon="i-lucide-plus"
          :disabled="writeControlsDisabled"
          @click="openEditor({ kind: 'start' })" />
      </div>

      <div class="grid min-w-0 gap-6" :class="selectedThread ? 'lg:grid-cols-[minmax(14rem,1fr)_minmax(0,2fr)]' : ''">
        <ul v-if="threads.length" class="min-w-0 divide-y divide-default self-start rounded-md border border-default">
          <li v-for="thread in threads" :key="thread.id">
            <button
              type="button"
              class="flex w-full min-w-0 flex-col gap-1 px-4 py-3 text-start hover:bg-elevated focus-visible:outline-primary"
              :class="selectedId === thread.id ? 'bg-elevated' : ''"
              :aria-current="selectedId === thread.id ? 'true' : undefined"
              @click="selectedId = thread.id">
              <span class="w-full break-words font-semibold text-highlighted">{{ thread.subject }}</span>
              <span class="flex flex-wrap items-center gap-2 text-sm text-muted">
                <UBadge :color="thread.status === 'open' ? 'primary' : 'neutral'" variant="subtle" :label="t(`agreement_requests.${thread.status}`)" />
                <UBadge :color="thread.internal ? 'neutral' : 'warning'" variant="subtle" :label="t(thread.internal ? 'agreement_requests.internal' : 'agreement_requests.external')" />
                <time :datetime="thread.latestCorrespondenceAt">{{ formatDate(thread.latestCorrespondenceAt) }}</time>
              </span>
            </button>
          </li>
        </ul>
        <p v-else class="text-sm text-muted">
          {{ t(data.threads.length ? 'agreement_requests.no_matches' : 'agreement_requests.no_threads') }}
        </p>

        <CommonDetailSection v-if="selectedThread" :title="selectedThread.subject" heading="h3" class="rounded-md border border-default p-4 sm:p-5">
          <template v-if="selectedThread.internal" #title-trailing>
            <UBadge color="neutral" variant="subtle" :label="t('agreement_requests.internal_thread')" />
          </template>
          <template v-if="canWriteRole" #actions>
            <UDropdownMenu :items="threadActions" :content="{ align: 'end' }">
              <UButton
                :label="t('common.actions')"
                trailing-icon="i-lucide-chevron-down"
                color="neutral"
                variant="outline"
                :disabled="writeControlsDisabled" />
            </UDropdownMenu>
          </template>
          <ol :aria-label="selectedThread.subject" class="divide-y divide-default">
            <li v-for="entry in selectedThread.entries" :key="entry.id" class="space-y-2 py-4 first:pt-0 last:pb-0">
              <div class="flex flex-wrap items-center gap-2">
                <span class="min-w-0 break-words text-sm text-muted">
                  {{ entry.kind === 'reply' ? entry.contactName : entry.loggedBy || t('agreement_requests.unknown_author') }}
                  <span v-if="entry.contactEmail">({{ entry.contactEmail }})</span>
                  {{ senderTimeSeparator }}<time :datetime="entry.correspondenceAt">{{ formatDate(entry.correspondenceAt) }}</time>
                </span>
                <UBadge
                  v-if="entry.kind === 'reply'"
                  color="info"
                  variant="subtle"
                  icon="i-lucide-arrow-down-left"
                  :label="t('agreement_requests.response_tag')" />
                <UBadge
                  v-else
                  :color="entry.kind === 'note' ? 'success' : 'neutral'"
                  variant="subtle"
                  :icon="entry.kind === 'note' ? 'i-lucide-sticky-note' : 'i-lucide-arrow-up-right'"
                  :label="t(entry.kind === 'note' ? 'agreement_requests.note_tag' : 'agreement_requests.request_tag')" />
              </div>
              <p v-if="entry.body" class="whitespace-pre-wrap break-words text-sm">
                {{ entry.body }}
              </p>
              <ul v-if="entry.attachments.length" class="flex flex-wrap gap-x-3 gap-y-1">
                <li v-for="attachment in entry.attachments" :key="attachment.id" class="min-w-0 max-w-full">
                  <a
                    :href="attachmentUrl(selectedThread, entry, attachment.id)"
                    :aria-label="t('agreement_requests.download', { name: attachment.name })"
                    class="inline-flex items-center gap-1.5 break-all text-sm text-primary underline">
                    <UIcon name="i-lucide-paperclip" class="size-4 shrink-0" aria-hidden="true" />
                    {{ attachment.name }}
                  </a>
                </li>
              </ul>
              <UButton
                v-if="canWriteRole && entry.canEdit"
                :label="t('agreement_requests.edit_message')"
                color="neutral"
                variant="ghost"
                size="sm"
                :disabled="writeControlsDisabled"
                @click="openEditor({ kind: 'edit', threadId: selectedThread.id, entry }, selectedThread)" />
            </li>
          </ol>
        </CommonDetailSection>
      </div>
    </template>

    <CommonFormDialog
      v-model:open="editorOpen"
      :action-context="editorActionContext"
      :state="draft"
      :schema="draftSchema"
      :title="editorTitle"
      :submit-label="t('common.save')"
      :pending="pending"
      :submit-disabled="!canSubmit"
      @submit="submit">
      <template #default="{ state }">
        <UFormField v-if="opening?.kind === 'start'" name="subject" :label="t('agreement_requests.subject')" required>
          <UInput v-model="state.subject" class="w-full" />
        </UFormField>
        <UFormField
          v-if="opening?.kind === 'reply' && questionOptions.length > 1"
          name="questionId"
          :label="t('agreement_requests.question_to_answer')"
          required>
          <USelect v-model="state.questionId" :items="questionOptions" required class="w-full" />
        </UFormField>
        <UFormField name="body" :label="t('agreement_requests.message')" :required="!isResponse">
          <UTextarea v-model="state.body" :rows="4" class="w-full" />
        </UFormField>
        <template v-if="isResponse">
          <UFormField v-if="canReadContacts" :label="t('agreement_requests.contact')" :required="false" data-field-exclude="This helper copies values into the contact fields and is not submitted.">
            <CommonServerLookupSelect
              v-model="savedContact"
              :fetch-url="contactsUrl"
              value-key="id"
              label-en-key="egcs_cn_name"
              label-fr-key="egcs_cn_name"
              :include-deleted-query="false"
              :show-value-in-label="false"
              :disabled="pending"
              close-on-select
              class="w-full"
              @resolved-items="items => autofillContact(state, items)" />
          </UFormField>
          <UFormField name="contactName" :label="t('agreement_requests.contact_name')" required>
            <UInput v-model="state.contactName" class="w-full" />
          </UFormField>
          <UFormField name="contactEmail" :required="false" :label="t('agreement_requests.contact_email')">
            <UInput v-model="state.contactEmail" type="email" class="w-full" />
          </UFormField>
        </template>
        <UFormField name="correspondenceAt" :label="t('agreement_requests.correspondence_at')" required>
          <UInput v-model="state.correspondenceAt" type="datetime-local" step="0.001" class="w-full" />
        </UFormField>
        <UFormField v-if="opening?.kind !== 'edit'" name="files" :required="false" :label="t('agreement_requests.attachments')">
          <UInput type="file" multiple class="w-full" @change="event => selectFiles(state, event)" />
        </UFormField>
        <UFormField v-if="opening?.kind === 'start'" name="internal" :required="false" :description="t('agreement_requests.internal_help')">
          <UCheckbox v-model="state.internal" :label="t('agreement_requests.internal_thread')" />
        </UFormField>
      </template>
    </CommonFormDialog>
  </div>
</template>
