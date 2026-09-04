/* eslint-disable jsdoc/require-jsdoc -- Durable outbox primitives are exercised through focused worker and route tests. */
import type { Insertable, Kysely, Transaction } from 'kysely'
import type { Database, JsonValue, StorageCleanupOutboxTable } from '~~/shared/types/database'
import { deleteProviderObject, resolveAgencyStorageProvider } from './file-storage-provider'
import type { GcsFileStorageProviderManagedMetadataAdapter, GcsFileStorageTarget } from '@gcs-ssc/extensions/server'
import { createFileStorageSecretReader } from './extensions'
import { runBoundedExtensionOperation } from './extension-admission'

const MAX_ATTEMPTS = 8
const BASE_RETRY_MS = 30_000

export type StorageCleanupRequest = Pick<Insertable<StorageCleanupOutboxTable>,
  'provider_key' | 'agency_id' | 'purpose' | 'object_id' | 'locator'>

export const enqueueStorageCleanup = async (
  trx: Transaction<Database>,
  request: StorageCleanupRequest
): Promise<void> => {
  await trx.insertInto('storage_cleanup_outbox').values(request).execute()
}

export const claimStorageCleanupJobs = async (
  db: Kysely<Database>,
  workerId: string,
  limit = 20,
  leaseMs = 60_000,
  now = new Date()
) => await db.transaction().execute(async trx => {
  const rows = await trx.selectFrom('storage_cleanup_outbox').selectAll()
    .where(eb => eb.or([
      eb.and([eb('status', '=', 'pending'), eb('next_attempt_at', '<=', now)]),
      eb.and([eb('status', '=', 'processing'), eb('lease_expires_at', '<=', now)])
    ]))
    .orderBy('id').forUpdate().skipLocked().limit(limit).execute()
  if (rows.length === 0) return []
  const ids = rows.map(row => String(row.id))
  const leaseExpiresAt = new Date(now.getTime() + leaseMs)
  await trx.updateTable('storage_cleanup_outbox').set({
    status: 'processing', lease_owner: workerId, lease_expires_at: leaseExpiresAt, updated_at: now
  }).where('id', 'in', ids).execute()
  return rows.map(row => ({ ...row, status: 'processing' as const, lease_owner: workerId, lease_expires_at: leaseExpiresAt }))
})

export const processStorageCleanupBatch = async (
  db: Kysely<Database>,
  workerId: string,
  limit = 20,
  now = new Date()
): Promise<{ claimed: number; completed: number; retried: number; deadLettered: number }> => {
  const jobs = await claimStorageCleanupJobs(db, workerId, limit, 60_000, now)
  let completed = 0
  let retried = 0
  let deadLettered = 0
  for (const job of jobs) {
    try {
      const provider = await resolveAgencyStorageProvider(db, String(job.agency_id), job.provider_key)
      if (!provider) throw new Error('Recorded storage provider is unavailable')
      if (job.operation === 'restore_metadata') {
        const payload = job.payload as null | {
          metadata: Record<string, never>
          target: GcsFileStorageTarget
          contractVersion: number
        }
        if (!payload) throw new Error('Metadata restoration payload is unavailable')
        const adapter = provider.adapter as GcsFileStorageProviderManagedMetadataAdapter
        await runBoundedExtensionOperation('storage:restore-metadata', async signal => {
          if (signal.aborted) throw signal.reason
          await adapter.updateProviderMetadata({
            objectId: job.object_id, locator: job.locator as Record<string, never>,
            agencyId: String(job.agency_id), purpose: job.purpose as 'attachment',
            target: payload.target, agencyConfig: provider.config,
            secrets: createFileStorageSecretReader(db, provider.extension.key, String(job.agency_id), process.env.GCS_EXTENSION_SECRETS_KEY ?? ''),
            contractVersion: payload.contractVersion, metadata: payload.metadata
          })
        })
      } else {
        await deleteProviderObject({
          provider,
          reference: { objectId: job.object_id, locator: job.locator as Record<string, never> },
          purpose: job.purpose as 'attachment'
        })
      }
      await db.updateTable('storage_cleanup_outbox').set({
        status: 'completed', completed_at: now, updated_at: now,
        lease_owner: null, lease_expires_at: null, last_error: null
      }).where('id', '=', String(job.id)).where('status', '=', 'processing')
        .where('lease_owner', '=', workerId).execute()
      completed++
    } catch (error: unknown) {
      const attempts = job.attempt_count + 1
      const dead = attempts >= MAX_ATTEMPTS
      await db.updateTable('storage_cleanup_outbox').set({
        status: dead ? 'dead_letter' : 'pending', attempt_count: attempts,
        next_attempt_at: new Date(now.getTime() + BASE_RETRY_MS * 2 ** Math.min(attempts - 1, 10)),
        lease_owner: null, lease_expires_at: null, updated_at: now,
        last_error: (error instanceof Error ? error.message : String(error)).slice(0, 1000)
      }).where('id', '=', String(job.id)).where('status', '=', 'processing')
        .where('lease_owner', '=', workerId).execute()
      if (dead) deadLettered++
      else retried++
    }
  }
  return { claimed: jobs.length, completed, retried, deadLettered }
}

export const pruneCompletedStorageCleanupJobs = async (
  db: Kysely<Database>, completedBefore: Date, limit = 500
): Promise<number> => await db.transaction().execute(async trx => {
  const rows = await trx.selectFrom('storage_cleanup_outbox').select('id')
    .where('status', '=', 'completed').where('completed_at', '<', completedBefore)
    .orderBy('id').forUpdate().skipLocked().limit(Math.max(1, Math.min(limit, 5_000))).execute()
  if (rows.length === 0) return 0
  await trx.deleteFrom('storage_cleanup_outbox').where('id', 'in', rows.map(row => String(row.id))).execute()
  return rows.length
})

export const storageCleanupLocator = (locator: unknown): JsonValue => locator as JsonValue

export const reserveStorageMetadataRestoration = async (
  db: Kysely<Database>, workerId: string, request: StorageCleanupRequest,
  payload: JsonValue, leaseMs = 300_000
): Promise<string> => await db.transaction().execute(async trx => String((await trx
  .insertInto('storage_cleanup_outbox').values({
    ...request, operation: 'restore_metadata', payload, status: 'processing',
    lease_owner: workerId, lease_expires_at: new Date(Date.now() + leaseMs)
  }).returning('id').executeTakeFirstOrThrow()).id))

export const completeReservedStorageCleanup = async (
  db: Kysely<Database>, id: string, workerId: string
): Promise<void> => {
  await db.updateTable('storage_cleanup_outbox').set({
    status: 'completed', completed_at: new Date(), updated_at: new Date(),
    lease_owner: null, lease_expires_at: null
  }).where('id', '=', id).where('lease_owner', '=', workerId).execute()
}

export const releaseReservedStorageCleanup = async (
  db: Kysely<Database>, id: string, workerId: string
): Promise<void> => {
  await db.updateTable('storage_cleanup_outbox').set({
    status: 'pending', next_attempt_at: new Date(), updated_at: new Date(),
    lease_owner: null, lease_expires_at: null
  }).where('id', '=', id).where('lease_owner', '=', workerId).execute()
}
