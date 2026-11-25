/* eslint-disable jsdoc/require-jsdoc -- Request operations have explicit typed names and are described in the correspondence contract. */
import { createHash } from 'node:crypto'
import { getRouterParam, type H3Event } from 'h3'
import { sql, type Kysely, type Transaction } from 'kysely'
import type { z } from 'zod'
import type {
  AgreementRequestEntityType,
  AgreementRequestEntry,
  AgreementRequestEntryTable,
  AgreementRequestsOverview,
  AgreementRequestThread
} from '~~/shared/types/agreement-requests'
import { AgreementRequestEntityTypeSchema } from '~~/shared/types/schemas/agreement-requests'
import type { AgreementRequestCreateSchema, AgreementRequestEntryCreateSchema, AgreementRequestEntryEditSchema, AgreementRequestThreadEditSchema } from '~~/shared/types/schemas/agreement-requests'
import type { Database } from '~~/shared/types/database'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { badRequest, forbidden, notFound, throwApiError } from './api-errors'
import { authorizeAgreementResource } from './agreement'
import { executeFreshAuthorizedAgreementWrite, lockAgreementProfileForUpdate } from './agreement-write-transaction'
import { requireAuthContext } from './authorize'
import { resolveAssignmentCommonUserId } from './entity-assignment'
import { assertStagedFileProvider, cleanupStoredFileUploads, persistStagedFile, stageStoredFile, type StoredFileInput, type StoredFileUpload } from './file-storage'
import { resolveAssignedItemTargetGrant } from './rbac'

type RequestTarget = { entityType: AgreementRequestEntityType; entityId: string }
export type AgreementRequestFile = { filename: string; mimeType: string; bytes: Buffer }
type CreateRequest = { kind: 'start'; input: z.output<typeof AgreementRequestCreateSchema> }
  | { kind: 'append'; threadId: string; input: z.output<typeof AgreementRequestEntryCreateSchema> }
type RequestReceipt = { threadId: string; entryId: string }
type RequestReplay = { kind: 'replay'; receipt: RequestReceipt }
type EntryAdmission = RequestReplay | { kind: 'new-entry'; hash: string }
type EntryWriteOutcome = RequestReplay | { kind: 'inserted'; receipt: RequestReceipt }
type RequestConflictMessage = 'entry_locked' | 'entry_stale' | 'read_only' | 'request_conflict' | 'resolved'

const editableEntryColumns = ['egcs_fc_body', 'egcs_fc_contactname', 'egcs_fc_contactemail'] as const
// Keep database precision when hashing timestamps and reopening an edit.
const exactCorrespondenceAt = sql<string>`to_char(egcs_fc_correspondenceat AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
  .as('correspondenceAt')

const entryEditDigest = (entry: Pick<AgreementRequestEntryTable, typeof editableEntryColumns[number]> & { correspondenceAt: string }) =>
  createHash('sha256').update(JSON.stringify([
    entry.egcs_fc_body, entry.correspondenceAt, entry.egcs_fc_contactname, entry.egcs_fc_contactemail
  ])).digest('hex')

const requestNotFound = async (event: H3Event) =>
  await notFound(event, 'AGREEMENT_REQUEST_NOT_FOUND', 'apiErrors.agreementRequests.not_found')

const requestConflict = async (event: H3Event, code: string, message: RequestConflictMessage) =>
  await throwApiError(event, { statusCode: 409, code, key: `apiErrors.agreementRequests.${message}` })

export const requireAgreementRequestId = async (event: H3Event, param: 'threadId' | 'entryId' | 'attachmentId') => {
  const id = getRouterParam(event, param) ?? ''
  return isPositivePostgresBigintText(id) ? id : await requestNotFound(event)
}

const resolveProponentId = async (db: Kysely<Database>, agreementId: string, target: RequestTarget) => {
  const table = target.entityType === 'fundingcaseagreementclaim'
    ? 'Funding_Case_Agreement_Claim'
    : 'Funding_Case_Agreement_Forecast'
  const record = await db.selectFrom(table).select('egcs_fc_applicantrecipient')
    .where('id', '=', target.entityId).where('egcs_fc_fundingagreement', '=', agreementId).where('_deleted', '=', false)
    .executeTakeFirst()
  return record ? String(record.egcs_fc_applicantrecipient) : null
}

const requestTargetEligibility = async (db: Kysely<Database>, target: RequestTarget) => {
  // Withdrawal and cancellation share the workflow action. A later run supersedes the cancelled attempt.
  const runtime = await db.selectFrom('Common_Runtime')
    .select('egcs_cn_state')
    .where('egcs_cn_entityid', '=', target.entityId).where('egcs_cn_entitytype', '=', target.entityType)
    .where('egcs_cn_kind', '=', 'workflow')
    .orderBy('id', 'desc').executeTakeFirst()
  return runtime?.egcs_cn_state === 'cancelled' ? 'cancelled' : 'writable'
}

export const authorizeAgreementRequests = async (event: H3Event, action: 'read' | 'update') => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id') ?? ''
  const entityId = getRouterParam(event, 'entityId') ?? ''
  const entityType = AgreementRequestEntityTypeSchema.safeParse(getRouterParam(event, 'entityType'))
  if (!isPositivePostgresBigintText(agreementId) || !isPositivePostgresBigintText(entityId) || !entityType.success) {
    return await requestNotFound(event)
  }
  const target: RequestTarget = { entityType: entityType.data, entityId }
  const agreement = await authorizeAgreementResource(event, action, agreementId, db, { assignmentTarget: target })
  if (!agreement) return await requestNotFound(event)
  const proponentId = await resolveProponentId(db, agreementId, target)
  if (!proponentId) return await requestNotFound(event)
  return { db, agreementId, agreement, target, proponentId }
}

type PreparedRequest = Awaited<ReturnType<typeof authorizeAgreementRequests>>

const threadsForTarget = (db: Kysely<Database>, target: RequestTarget) => db
  .selectFrom('Funding_Case_Agreement_Request_Thread as thread')
  .where('thread.egcs_fc_entityid', '=', target.entityId)
  .where('thread.egcs_fc_entitytype', '=', target.entityType)
  .where('thread._deleted', '=', false)

const entriesForTarget = (db: Kysely<Database>, target: RequestTarget) => threadsForTarget(db, target)
  .innerJoin('Funding_Case_Agreement_Request_Entry as entry', 'entry.egcs_fc_thread', 'thread.id')
  .where('entry._deleted', '=', false)

export const requestFilesForTarget = (db: Kysely<Database>, target: RequestTarget, agencyId: string) => entriesForTarget(db, target)
  .innerJoin('Funding_Case_Agreement_Request_Attachment as link', 'link.egcs_fc_entry', 'entry.id')
  .innerJoin('Common_Attachment as file', 'file.id', 'link.egcs_fc_attachment')
  .innerJoin('Common_Attachment_Types as type', 'type.id', 'file.egcs_cn_attachmenttype')
  .where('type.egcs_cn_agency', '=', agencyId)
  .where('link._deleted', '=', false)
  .where('file._deleted', '=', false)

export const listAgreementRequests = async (event: H3Event, prepared: PreparedRequest): Promise<AgreementRequestsOverview> => {
  const { db, agreement, target, proponentId } = prepared
  const auth = await requireAuthContext(event)
  const canWriteRole = auth.userAbilities.authorize('agreement', 'update', agreement.scope)
  const assigned = canWriteRole && (await resolveAssignedItemTargetGrant(auth.userId, target, db))?.actions.has('update')
  const eligibility = await requestTargetEligibility(db, target)
  const [threads, entries, files] = await Promise.all([
    threadsForTarget(db, target).select(['thread.id', 'thread.egcs_fc_subject', 'thread.egcs_fc_status', 'thread.egcs_fc_internal']).execute(),
    entriesForTarget(db, target).leftJoin('Common_User as actor', 'actor.id', 'entry.egcs_fc_loggedby')
      .select([
        'entry.id', 'entry.egcs_fc_thread', 'entry.egcs_fc_kind', 'entry.egcs_fc_question', 'entry.egcs_fc_body',
        exactCorrespondenceAt, 'entry.egcs_fc_loggedat',
        'entry.egcs_fc_contactname', 'entry.egcs_fc_contactemail', 'actor.egcs_cn_name as actorName'
      ])
      .orderBy('entry.egcs_fc_correspondenceat').orderBy('entry.id').execute(),
    requestFilesForTarget(db, target, agreement.agencyId)
      .select(['entry.id as entryId', 'link.id', 'file.egcs_cn_filename as name']).orderBy('link.id').execute()
  ])
  const filesByEntry = Map.groupBy(files, row => String(row.entryId))
  const entriesByThread = Map.groupBy(entries, row => String(row.egcs_fc_thread))
  const result: AgreementRequestThread[] = []
  for (const thread of threads) {
    const id = String(thread.id)
    const entries = entriesByThread.get(id) ?? []
    const answered = new Set(entries.filter(entry => entry.egcs_fc_question !== null).map(entry => String(entry.egcs_fc_question)))
    const conversation = entries.map((entry): AgreementRequestEntry => {
      const entryId = String(entry.id)
      const fields = {
        id: entryId,
        canEdit: entry === entries.at(-1) && !answered.has(entryId),
        editDigest: entryEditDigest(entry),
        body: entry.egcs_fc_body,
        loggedBy: entry.actorName,
        correspondenceAt: entry.correspondenceAt,
        loggedAt: new Date(entry.egcs_fc_loggedat).toISOString(),
        attachments: (filesByEntry.get(entryId) ?? []).map(file => ({ id: String(file.id), name: file.name }))
      }
      if (entry.egcs_fc_kind === 'reply') {
        if (entry.egcs_fc_question === null || entry.egcs_fc_contactname === null) throw new Error('Invalid proponent reply evidence')
        return { ...fields, kind: 'reply', questionId: String(entry.egcs_fc_question), contactName: entry.egcs_fc_contactname, contactEmail: entry.egcs_fc_contactemail }
      }
      return { ...fields, kind: entry.egcs_fc_kind, questionId: null, contactName: null, contactEmail: null }
    })
    const latest = conversation.at(-1)
    if (latest) result.push({ id, subject: thread.egcs_fc_subject, status: thread.egcs_fc_status, internal: thread.egcs_fc_internal, latestCorrespondenceAt: latest.correspondenceAt, entries: conversation })
  }
  result.sort((left, right) => left.status.localeCompare(right.status) || right.latestCorrespondenceAt.localeCompare(left.latestCorrespondenceAt))
  const admission = eligibility === 'cancelled'
    ? 'terminal'
    : !canWriteRole
        ? 'role'
        : !assigned ? 'assignment' : 'writable'
  const writeBlock = admission === 'terminal' || admission === 'assignment' ? admission : null
  return { threads: result, proponentId, canWriteRole, canWrite: admission === 'writable', writeBlock }
}

const assertRequestTargetWritable = async (event: H3Event, trx: Transaction<Database>, target: RequestTarget) => {
  if (await requestTargetEligibility(trx, target) === 'cancelled') {
    return await requestConflict(event, 'AGREEMENT_REQUEST_READ_ONLY', 'read_only')
  }
}

const executeRequestWrite = async <T>(event: H3Event, prepared: PreparedRequest, callback: (
  trx: Transaction<Database>, actorId: string, agencyId: string
) => Promise<T>, admission: 'mutation' | 'check-replay-first' = 'mutation') => await executeFreshAuthorizedAgreementWrite(event, prepared.db, prepared.agreementId, prepared.agreement,
  async (trx, scope, auth) => {
    const actorId = await resolveAssignmentCommonUserId(trx, auth.userId)
    if (!actorId) return await forbidden(event)
    if (admission === 'mutation') await assertRequestTargetWritable(event, trx, prepared.target)
    return await callback(trx, actorId, scope.agencyId)
  }, { assignmentTarget: prepared.target, businessStatusMode: 'correspondence', allowDuringCloseout: true })

const threadToUpdate = async (event: H3Event, db: Transaction<Database>, target: RequestTarget, threadId: string) => {
  const thread = await threadsForTarget(db, target).select(['thread.id', 'thread.egcs_fc_status', 'thread.egcs_fc_internal']).where('thread.id', '=', threadId)
    .forUpdate().executeTakeFirst()
  if (!thread) return await requestNotFound(event)
  return thread
}

const findUnreferencedRequestUploads = async ({ db, agreementId }: PreparedRequest, uploads: StoredFileUpload[]) => {
  try {
    if (db.isTransaction) throw new Error('Upload verification requires a root database')
    // Read attachment references after the previous writer releases the Agreement lock.
    return await db.transaction().setIsolationLevel('read committed').execute(async trx => {
      if (!await lockAgreementProfileForUpdate(trx, agreementId)) throw new Error('Agreement lock unavailable')
      const unreferenced: StoredFileUpload[] = []
      for (const upload of uploads) {
        const reference = await trx.selectFrom('Common_Attachment').select('id')
          .where('egcs_cn_provider', '=', upload.providerId)
          .where('egcs_cn_providerobjectid', '=', upload.objectId)
          .executeTakeFirst()
        if (!reference) unreferenced.push(upload)
      }
      return unreferenced
    })
  } catch {
    console.error('Request upload cleanup skipped after an uncertain commit.', { agreementId, uploadCount: uploads.length })
    return []
  }
}

export const saveAgreementRequest = async (event: H3Event, prepared: PreparedRequest, command: CreateRequest, files: AgreementRequestFile[]): Promise<RequestReceipt> => {
  const { input } = command
  const reply = command.kind === 'append' && command.input.kind === 'reply' ? command.input : null
  if (reply && !reply.body && !files.length) {
    return await badRequest(event, 'AGREEMENT_REQUEST_REPLY_CONTENT_REQUIRED', 'validation.request_reply_content')
  }
  type StagedRequestFile = { input: StoredFileInput; staged: Awaited<ReturnType<typeof stageStoredFile>> }
  const filesToPersist: StagedRequestFile[] = []
  const persistence: { phase: 'before-commit' | 'commit-unconfirmed' } = { phase: 'before-commit' }
  const fileDigests = files.map(file => ({
    filename: file.filename, mimeType: file.mimeType, hash: createHash('sha256').update(file.bytes).digest('hex')
  }))
  const requestHash = (actorId: string) => createHash('sha256')
    .update(JSON.stringify({ command, actorId, files: fileDigests })).digest('hex')
  const checkWrite = async (trx: Transaction<Database>, actorId: string): Promise<EntryAdmission> => {
    const hash = requestHash(actorId)
    const replayQuery = entriesForTarget(trx, prepared.target)
      .select(['thread.id as threadId', 'entry.id as entryId', 'entry.egcs_fc_requesthash as hash'])
      .where('entry.egcs_fc_requestkey', '=', input.clientRequestId)
    const replay = await (command.kind === 'append'
      ? replayQuery.where('thread.id', '=', command.threadId)
      : replayQuery.where('entry.egcs_fc_opening', '=', true)).executeTakeFirst()
    if (replay?.hash === hash) {
      return { kind: 'replay', receipt: { threadId: String(replay.threadId), entryId: String(replay.entryId) } }
    }
    await assertRequestTargetWritable(event, trx, prepared.target)
    if (replay) return await requestConflict(event, 'AGREEMENT_REQUEST_REPLAY_CONFLICT', 'request_conflict')
    if (command.kind === 'append') {
      const thread = await threadToUpdate(event, trx, prepared.target, command.threadId)
      if (command.input.kind === 'question' && thread.egcs_fc_status === 'resolved') {
        return await requestConflict(event, 'AGREEMENT_REQUEST_RESOLVED', 'resolved')
      }
    }
    if (reply && command.kind === 'append') {
      const question = await trx.selectFrom('Funding_Case_Agreement_Request_Entry').select(sql<boolean>`egcs_fc_correspondenceat > CAST(${new Date(input.correspondenceAt).toISOString()} AS timestamptz)`.as('replyPrecedesQuestion'))
        .where('id', '=', reply.questionId).where('egcs_fc_thread', '=', command.threadId)
        .where('egcs_fc_kind', '=', 'question').where('_deleted', '=', false).executeTakeFirst()
      if (!question) return await notFound(event, 'AGREEMENT_REQUEST_QUESTION_NOT_FOUND', 'apiErrors.agreementRequests.question_not_found')
      if (question.replyPrecedesQuestion) {
        return await badRequest(event, 'AGREEMENT_REQUEST_REPLY_PRECEDES_QUESTION', 'validation.request_reply_before_question')
      }
    }
    return { kind: 'new-entry', hash }
  }
  try {
    if (files.length) {
      const { admission, agencyId } = await executeRequestWrite(event, prepared, async (trx, actorId, agencyId) =>
        ({ admission: await checkWrite(trx, actorId), agencyId }), 'check-replay-first')
      if (admission.kind === 'replay') return admission.receipt
      for (const file of files) {
        const fileInput: StoredFileInput = {
          agencyId,
          ...file,
          nameEn: file.filename,
          nameFr: file.filename,
          descriptionEn: '',
          descriptionFr: '',
          folder: 'requests',
          purpose: 'attachment',
          target: prepared.target,
          attachmentTypeNameEn: 'Request correspondence',
          attachmentTypeNameFr: 'Correspondance de demande',
          attachmentTypeDescriptionEn: 'Files attached to questions and replies in Requests.',
          attachmentTypeDescriptionFr: 'Fichiers joints aux questions et aux réponses dans les demandes.'
        }
        const staged = await stageStoredFile(prepared.db, fileInput).catch(async () => await throwApiError(event, {
          statusCode: 503, code: 'STORAGE_PROVIDER_WRITE_FAILED', key: 'apiErrors.attachments.provider_unavailable'
        }))
        filesToPersist.push({ input: fileInput, staged })
      }
    }
    const result = await executeRequestWrite<EntryWriteOutcome>(event, prepared, async (trx, actorId, agencyId) => {
      const admission = await checkWrite(trx, actorId)
      if (admission.kind === 'replay') return admission
      for (const { staged } of filesToPersist) {
        await assertStagedFileProvider(trx, agencyId, staged).catch(async () => await throwApiError(event, {
          statusCode: 409, code: 'STORAGE_PROVIDER_CHANGED', key: 'apiErrors.attachments.provider_changed'
        }))
      }
      const threadId = command.kind === 'append'
        ? command.threadId
        : String((await trx.insertInto('Funding_Case_Agreement_Request_Thread').values({
            egcs_fc_entityid: prepared.target.entityId,
            egcs_fc_entitytype: prepared.target.entityType,
            egcs_fc_subject: command.input.subject,
            egcs_fc_internal: command.input.internal
          }).returning('id').executeTakeFirstOrThrow()).id)
      const entry = await trx.insertInto('Funding_Case_Agreement_Request_Entry').values({
        egcs_fc_thread: threadId,
        egcs_fc_kind: command.kind === 'start' ? 'question' : command.input.kind,
        egcs_fc_opening: command.kind === 'start',
        egcs_fc_question: reply?.questionId ?? null,
        egcs_fc_body: input.body,
        egcs_fc_correspondenceat: new Date(input.correspondenceAt),
        egcs_fc_loggedby: actorId,
        egcs_fc_contactname: reply?.contactName ?? null,
        egcs_fc_contactemail: reply?.contactEmail ?? null,
        egcs_fc_requestkey: input.clientRequestId,
        egcs_fc_requesthash: admission.hash
      }).returning('id').executeTakeFirstOrThrow()
      for (const { input: fileInput, staged } of filesToPersist) {
        const attachment = await persistStagedFile(trx, fileInput, staged)
        await trx.insertInto('Funding_Case_Agreement_Request_Attachment')
          .values({ egcs_fc_entry: String(entry.id), egcs_fc_attachment: attachment.id }).execute()
      }
      const result = { threadId, entryId: String(entry.id) }
      // Once the callback returns, a rejected transaction can still have committed.
      persistence.phase = 'commit-unconfirmed'
      return { kind: 'inserted', receipt: result }
    }, 'check-replay-first')
    if (result.kind === 'replay' && filesToPersist.length) {
      await cleanupStoredFileUploads(prepared.db, filesToPersist.map(file => file.staged.upload))
    }
    return result.receipt
  } catch (error: unknown) {
    if (filesToPersist.length) {
      const uploads = filesToPersist.map(file => file.staged.upload)
      const unreferenced = persistence.phase === 'commit-unconfirmed' ? await findUnreferencedRequestUploads(prepared, uploads) : uploads
      if (unreferenced.length) await cleanupStoredFileUploads(prepared.db, unreferenced)
    }
    throw error
  }
}

export const updateAgreementRequestThread = async (
  event: H3Event, prepared: PreparedRequest, threadId: string, input: z.output<typeof AgreementRequestThreadEditSchema>
) => await executeRequestWrite(event, prepared, async trx => {
  const thread = await threadToUpdate(event, trx, prepared.target, threadId)
  const changes = 'status' in input ? { egcs_fc_status: input.status } : { egcs_fc_internal: input.internal }
  const changed = 'status' in input ? thread.egcs_fc_status !== input.status : thread.egcs_fc_internal !== input.internal
  if (changed) {
    await trx.updateTable('Funding_Case_Agreement_Request_Thread').set(changes).where('id', '=', threadId).execute()
  }
  return { threadId, ...input }
})

export const updateAgreementRequestEntry = async (
  event: H3Event, prepared: PreparedRequest, threadId: string, entryId: string, input: z.output<typeof AgreementRequestEntryEditSchema>
) => await executeRequestWrite(event, prepared, async (trx, _actorId, agencyId) => {
  await threadToUpdate(event, trx, prepared.target, threadId)
  const entries = trx.selectFrom('Funding_Case_Agreement_Request_Entry')
    .where('egcs_fc_thread', '=', threadId).where('_deleted', '=', false)
  const correspondenceAt = sql<Date>`CAST(${input.correspondenceAt} AS timestamptz)`
  const entry = await entries.select([
    'egcs_fc_kind', 'egcs_fc_question', ...editableEntryColumns, exactCorrespondenceAt,
    sql<boolean>`egcs_fc_correspondenceat = ${correspondenceAt}`.as('sameTime')
  ]).where('id', '=', entryId).executeTakeFirst()
  if (!entry) return await requestNotFound(event)
  const sameState = entry.sameTime && entry.egcs_fc_body === input.body
    && entry.egcs_fc_contactname === (input.contactName ?? null)
    && entry.egcs_fc_contactemail === (input.contactEmail ?? null)
  if (sameState) return { threadId, entryId }
  const latest = await entries.select('id').orderBy('egcs_fc_correspondenceat', 'desc').orderBy('id', 'desc').executeTakeFirst()
  const response = entry.egcs_fc_kind === 'question'
    ? await entries.select('id').where('egcs_fc_question', '=', entryId).executeTakeFirst()
    : undefined
  if (String(latest?.id) !== entryId || response) {
    return await requestConflict(event, 'AGREEMENT_REQUEST_ENTRY_LOCKED', 'entry_locked')
  }
  if (entryEditDigest(entry) !== input.editDigest) {
    return await requestConflict(event, 'AGREEMENT_REQUEST_ENTRY_STALE', 'entry_stale')
  }
  if (entry.egcs_fc_kind === 'reply') {
    if (!input.contactName) return await badRequest(event, 'AGREEMENT_REQUEST_CONTACT_REQUIRED', 'validation.required')
    const question = entry.egcs_fc_question === null
      ? undefined
      : await entries.select(sql<boolean>`egcs_fc_correspondenceat > ${correspondenceAt}`.as('replyPrecedesQuestion'))
          .where('id', '=', entry.egcs_fc_question).executeTakeFirst()
    if (question?.replyPrecedesQuestion) {
      return await badRequest(event, 'AGREEMENT_REQUEST_REPLY_PRECEDES_QUESTION', 'validation.request_reply_before_question')
    }
    if (!input.body) {
      const file = await requestFilesForTarget(trx, prepared.target, agencyId).select('link.id')
        .where('entry.id', '=', entryId).executeTakeFirst()
      if (!file) return await badRequest(event, 'AGREEMENT_REQUEST_REPLY_CONTENT_REQUIRED', 'validation.request_reply_content')
    }
  } else if (!input.body || input.contactName !== undefined || input.contactEmail !== undefined) {
    return await badRequest(event, 'AGREEMENT_REQUEST_QUESTION_INVALID', 'validation.invalid_selection')
  }
  await trx.updateTable('Funding_Case_Agreement_Request_Entry').set({
    egcs_fc_body: input.body,
    egcs_fc_correspondenceat: correspondenceAt,
    egcs_fc_contactname: input.contactName ?? null,
    egcs_fc_contactemail: input.contactEmail ?? null
  }).where('id', '=', entryId).execute()
  return { threadId, entryId }
})
