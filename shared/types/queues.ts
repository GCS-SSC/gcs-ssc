import { z } from 'zod'

export const QueueHandlerStatusSchema = z.object({
  id: z.string(),
  registration: z.object({
    owner: z.string(),
    queueLevel: z.number().int().nonnegative(),
    executionScope: z.enum(['cluster', 'process']),
    eligible: z.boolean()
  }).nullable(),
  schedule: z.object({
    queueLevel: z.number().int().nonnegative(),
    executionScope: z.enum(['cluster', 'process']),
    running: z.boolean(),
    retryNotBefore: z.iso.datetime().nullable(),
    nextRunAt: z.iso.datetime(),
    lastCycleAt: z.iso.datetime().nullable(),
    leaseCycleAt: z.iso.datetime().nullable(),
    attemptCount: z.number().int().nonnegative(),
    leaseOwner: z.string().nullable(),
    leaseExpiresAt: z.iso.datetime().nullable(),
    lastError: z.string().nullable(),
    updatedAt: z.iso.datetime()
  }).nullable()
})

export const QueueLevelStatusSchema = z.object({
  level: z.number().int().nonnegative(),
  cadenceMs: z.number().int().positive(),
  retry: z.object({ initialDelayMs: z.number().int().positive(), maximumDelayMs: z.number().int().positive() }).nullable(),
  schedule: z.object({
    currentCycleAt: z.iso.datetime().nullable(),
    nextRunAt: z.iso.datetime(),
    updatedAt: z.iso.datetime()
  }).nullable()
})

export const QueueSnapshotSchema = z.object({
  observedAt: z.iso.datetime(),
  levels: z.array(QueueLevelStatusSchema),
  handlers: z.array(QueueHandlerStatusSchema)
})

export type QueueHandlerStatus = z.infer<typeof QueueHandlerStatusSchema>
export type QueueLevelStatus = z.infer<typeof QueueLevelStatusSchema>
export type QueueSnapshot = z.infer<typeof QueueSnapshotSchema>
