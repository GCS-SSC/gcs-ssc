<script setup lang="ts">
import { FetchError } from 'ofetch'
import CommonCorrespondence from '~/components/Common/Correspondence.vue'
import { useCorrespondence } from '~/composables/useCorrespondence'
import type { CorrespondenceCommand } from '~/composables/useCorrespondence'
import type { AgreementRequestEntityType, AgreementRequestsOverview } from '~~/shared/types/agreement-requests'
import type { CorrespondenceEntry, CorrespondenceThread } from '~~/shared/types/correspondence'

const { agreementId, entityType, entityId, active } = defineProps<{
  agreementId: string
  entityType: AgreementRequestEntityType
  entityId: string
  active: boolean
}>()

const { locale } = useI18n()
const requestFetch = useRequestFetch()
const url = computed(() => `/api/agreements/${agreementId}/requests/${entityType}/${entityId}`)

const discardsOverview = (error: unknown) => error instanceof FetchError && [401, 403, 404].includes(error.statusCode ?? 0)
const invalidatesOverview = (error: unknown) => discardsOverview(error)
  || (error instanceof FetchError && error.statusCode === 409 && error.data?.data?.code !== 'AGREEMENT_REQUEST_REPLAY_CONFLICT')

/**
 * Maps a correspondence command to the existing Agreement request protocol.
 * @param base - Captured Agreement/financial target URL.
 * @param command - Validated editor or thread command.
 * @returns The receipt for the saved thread.
 */
const write = (base: string, command: CorrespondenceCommand) => {
  if (command.kind === 'thread') {
    return requestFetch<{ threadId: string }>(`${base}/${command.threadId}`, { method: 'PATCH', body: command.input })
  }
  if (command.kind === 'edit') {
    return requestFetch<{ threadId: string }>(`${base}/${command.threadId}/entries/${command.entryId}`, { method: 'PATCH', body: command.input })
  }
  const body = new FormData()
  body.append('data', JSON.stringify({ ...command.input, clientRequestId: command.clientRequestId }))
  for (const file of command.files) body.append('file', file)
  const path = command.kind === 'start' ? base : `${base}/${command.threadId}/entries`
  return requestFetch<{ threadId: string }>(path, { method: 'POST', body })
}
const correspondence = useCorrespondence({
  target: url,
  active: () => active,
  locale,
  load: (target, signal) => requestFetch<AgreementRequestsOverview>(target, { signal }),
  write,
  discardsOverview,
  invalidatesOverview
})
const contactsUrl = computed(() => {
  const proponentId = correspondence.data.value?.proponentId
  return proponentId ? `/api/applicant-recipients/${proponentId}/contacts` : ''
})
const attachmentUrl = (thread: CorrespondenceThread, entry: CorrespondenceEntry, attachmentId: string) =>
  `${url.value}/${thread.id}/entries/${entry.id}/attachments/${attachmentId}`
</script>

<template>
  <CommonCorrespondence
    :correspondence="correspondence"
    :attachment-url="attachmentUrl"
    :contacts-url="contactsUrl" />
</template>
