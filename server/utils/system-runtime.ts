/* eslint-disable jsdoc/require-param, jsdoc/require-returns -- typed signatures document canonical lifecycle helpers */
import type { Insertable, Selectable, Transaction } from 'kysely'
import {
  RUNTIME_TERMINAL_STATES,
  type RuntimeKind,
  type RuntimeState
} from '~~/shared/constants/system-lifecycle'
import type { Database } from '~~/shared/types/database'

type RuntimeRow = Selectable<Database['Common_Runtime']>
type RuntimeItemInsert = Insertable<Database['Common_Runtime_Item']>

export type RuntimeMetadata = {
  runtimeId: string
  runtimeState: RuntimeState
  attempt: number
  previousRuntimeId: string | null
}

export type RuntimeItemMetadata = RuntimeMetadata & {
  runtimeItemId: string
}

/** Maps a runtime persistence row to its stable API metadata. */
const toRuntimeMetadata = (runtime: RuntimeRow): RuntimeMetadata => ({
  runtimeId: String(runtime.id),
  runtimeState: runtime.egcs_cn_state,
  attempt: Number(runtime.egcs_cn_attempt),
  previousRuntimeId: runtime.egcs_cn_previousruntime === null ? null : String(runtime.egcs_cn_previousruntime)
})

/** Materializes a new runtime attempt pinned to one source publication version. */
export const createRuntime = async (
  trx: Transaction<Database>,
  input: {
    kind: RuntimeKind
    entityType: RuntimeRow['egcs_cn_entitytype']
    entityId: string
    purpose?: RuntimeRow['egcs_cn_purpose']
    sourcePublicationId: string
    sourcePublicationKind: RuntimeRow['egcs_cn_sourcepublicationkind']
    sourcePublicationVersionId: string
    sourceVersion: number
    initiatedBy: string
  }
): Promise<RuntimeMetadata> => {
  const runtime = await trx.insertInto('Common_Runtime').values({
    egcs_cn_kind: input.kind,
    egcs_cn_entitytype: input.entityType,
    egcs_cn_entityid: input.entityId,
    egcs_cn_purpose: input.purpose ?? 'standard',
    egcs_cn_sourcepublication: input.sourcePublicationId,
    egcs_cn_sourcepublicationkind: input.sourcePublicationKind,
    egcs_cn_sourcepublicationversion: input.sourcePublicationVersionId,
    egcs_cn_sourceversion: input.sourceVersion,
    egcs_cn_previousruntime: null,
    egcs_cn_attempt: 1,
    egcs_cn_initiatedby: input.initiatedBy
  }).returningAll().executeTakeFirstOrThrow()
  return toRuntimeMetadata(runtime)
}

/** Materializes a pinned item within a canonical runtime. */
export const createRuntimeItem = async (
  trx: Transaction<Database>,
  values: Omit<RuntimeItemInsert, 'id' | 'egcs_cn_state' | 'egcs_cn_createdat' | 'egcs_cn_startedat' | 'egcs_cn_updatedat' | 'egcs_cn_completedat' | '_deleted'>
): Promise<string> => {
  const item = await trx.insertInto('Common_Runtime_Item').values(values).returning('id').executeTakeFirstOrThrow()
  return String(item.id)
}

/** Applies a validated root transition by appending immutable transition evidence. */
export const transitionRuntime = async (
  trx: Transaction<Database>,
  input: { runtimeId: string, from: RuntimeState, to: RuntimeState, actorId?: string | null, reason?: string | null }
): Promise<RuntimeMetadata> => {
  await trx.insertInto('Common_Runtime_Transition').values({
    egcs_cn_runtime: input.runtimeId,
    egcs_cn_runtimeitem: null,
    egcs_cn_fromstate: input.from,
    egcs_cn_tostate: input.to,
    egcs_cn_actor: input.actorId ?? null,
    egcs_cn_reason: input.reason ?? null
  }).execute()
  const runtime = await trx.selectFrom('Common_Runtime').selectAll().where('id', '=', input.runtimeId).executeTakeFirstOrThrow()
  return toRuntimeMetadata(runtime)
}

/** Applies a validated item transition by appending immutable transition evidence. */
export const transitionRuntimeItem = async (
  trx: Transaction<Database>,
  input: { runtimeId: string, runtimeItemId: string, from: RuntimeState, to: RuntimeState, actorId?: string | null, reason?: string | null }
): Promise<RuntimeItemMetadata> => {
  await trx.insertInto('Common_Runtime_Transition').values({
    egcs_cn_runtime: input.runtimeId,
    egcs_cn_runtimeitem: input.runtimeItemId,
    egcs_cn_fromstate: input.from,
    egcs_cn_tostate: input.to,
    egcs_cn_actor: input.actorId ?? null,
    egcs_cn_reason: input.reason ?? null
  }).execute()
  const row = await trx.selectFrom('Common_Runtime_Item')
    .innerJoin('Common_Runtime', 'Common_Runtime.id', 'Common_Runtime_Item.egcs_cn_runtime')
    .select([
      'Common_Runtime.id as runtimeId',
      'Common_Runtime.egcs_cn_state as runtimeState',
      'Common_Runtime.egcs_cn_attempt as attempt',
      'Common_Runtime.egcs_cn_previousruntime as previousRuntimeId',
      'Common_Runtime_Item.id as runtimeItemId',
      'Common_Runtime_Item.egcs_cn_state as runtimeItemState'
    ])
    .where('Common_Runtime_Item.id', '=', input.runtimeItemId)
    .where('Common_Runtime_Item.egcs_cn_runtime', '=', input.runtimeId)
    .executeTakeFirstOrThrow()
  return {
    runtimeId: String(row.runtimeId),
    runtimeItemId: String(row.runtimeItemId),
    runtimeState: row.runtimeItemState,
    attempt: Number(row.attempt),
    previousRuntimeId: row.previousRuntimeId === null ? null : String(row.previousRuntimeId)
  }
}

/** Reduces terminal child outcomes using the canonical precedence rules. */
export const reduceRuntimeState = (
  states: readonly RuntimeState[],
  options: { approvalBacked: boolean, configuredNegative: boolean }
): RuntimeState => {
  if (states.includes('failed')) return 'failed'
  if (states.includes('denied')) return 'denied'
  if (options.configuredNegative || states.includes('unsuccessful')) return 'unsuccessful'
  if (states.includes('cancelled')) return 'cancelled'
  if (states.some(state => !RUNTIME_TERMINAL_STATES.has(state))) return 'active'
  return options.approvalBacked ? 'approved' : 'succeeded'
}

/** Cancels every remaining nonterminal descendant and then its runtime root. */
export const cancelRuntimeTree = async (
  trx: Transaction<Database>,
  input: { runtimeId: string, actorId: string, reason?: string }
): Promise<RuntimeMetadata> => {
  const runtime = await trx.selectFrom('Common_Runtime').selectAll()
    .where('id', '=', input.runtimeId).forUpdate().executeTakeFirstOrThrow()
  const items = await trx.selectFrom('Common_Runtime_Item').select(['id', 'egcs_cn_state'])
    .where('egcs_cn_runtime', '=', input.runtimeId)
    .orderBy('egcs_cn_parentruntimeitem', 'desc')
    .orderBy('egcs_cn_order', 'asc')
    .orderBy('id', 'asc')
    .forUpdate()
    .execute()
  for (const item of items) {
    if (!RUNTIME_TERMINAL_STATES.has(item.egcs_cn_state)) {
      await transitionRuntimeItem(trx, {
        runtimeId: input.runtimeId,
        runtimeItemId: String(item.id),
        from: item.egcs_cn_state,
        to: 'cancelled',
        actorId: input.actorId,
        reason: input.reason ?? 'explicit_cancellation'
      })
    }
  }
  if (RUNTIME_TERMINAL_STATES.has(runtime.egcs_cn_state)) return toRuntimeMetadata(runtime)
  return transitionRuntime(trx, {
    runtimeId: input.runtimeId,
    from: runtime.egcs_cn_state,
    to: 'cancelled',
    actorId: input.actorId,
    reason: input.reason ?? 'explicit_cancellation'
  })
}

/** Creates a successor attempt that preserves every publication-version pin. */
export const retryRuntime = async (
  trx: Transaction<Database>,
  input: { previousRuntimeId: string, initiatedBy: string, cloneItems?: boolean }
): Promise<RuntimeMetadata> => {
  const previous = await trx.selectFrom('Common_Runtime').selectAll()
    .where('id', '=', input.previousRuntimeId).forUpdate().executeTakeFirstOrThrow()
  if (!RUNTIME_TERMINAL_STATES.has(previous.egcs_cn_state)) throw new Error('Only terminal runtimes may be retried')
  const successor = await trx.insertInto('Common_Runtime').values({
    egcs_cn_kind: previous.egcs_cn_kind,
    egcs_cn_entitytype: previous.egcs_cn_entitytype,
    egcs_cn_entityid: String(previous.egcs_cn_entityid),
    egcs_cn_purpose: previous.egcs_cn_purpose,
    egcs_cn_sourcepublication: String(previous.egcs_cn_sourcepublication),
    egcs_cn_sourcepublicationkind: previous.egcs_cn_sourcepublicationkind,
    egcs_cn_sourcepublicationversion: String(previous.egcs_cn_sourcepublicationversion),
    egcs_cn_sourceversion: Number(previous.egcs_cn_sourceversion),
    egcs_cn_previousruntime: String(previous.id),
    egcs_cn_attempt: Number(previous.egcs_cn_attempt) + 1,
    egcs_cn_initiatedby: input.initiatedBy
  }).returningAll().executeTakeFirstOrThrow()
  if (input.cloneItems === false) return toRuntimeMetadata(successor)
  const previousItems = await trx.selectFrom('Common_Runtime_Item').selectAll()
    .where('egcs_cn_runtime', '=', input.previousRuntimeId)
    .orderBy('egcs_cn_order', 'asc')
    .orderBy('id', 'asc')
    .execute()
  const itemIds = new Map<string, string>()
  const pendingItems = [...previousItems]
  while (pendingItems.length > 0) {
    const nextIndex = pendingItems.findIndex(item => item.egcs_cn_parentruntimeitem === null
      || itemIds.has(String(item.egcs_cn_parentruntimeitem)))
    if (nextIndex < 0) throw new Error('Runtime item hierarchy is cyclic or incomplete')
    const [item] = pendingItems.splice(nextIndex, 1)
    if (!item) throw new Error('Runtime item hierarchy is incomplete')
    const newId = await createRuntimeItem(trx, {
      egcs_cn_runtime: String(successor.id),
      egcs_cn_parentruntimeitem: item.egcs_cn_parentruntimeitem === null
        ? null
        : itemIds.get(String(item.egcs_cn_parentruntimeitem)) as string,
      egcs_cn_kind: item.egcs_cn_kind,
      egcs_cn_order: Number(item.egcs_cn_order),
      egcs_cn_publication: String(item.egcs_cn_publication),
      egcs_cn_publicationkind: item.egcs_cn_publicationkind,
      egcs_cn_publicationversion: String(item.egcs_cn_publicationversion),
      egcs_cn_version: Number(item.egcs_cn_version)
    })
    itemIds.set(String(item.id), newId)
  }
  return toRuntimeMetadata(successor)
}
