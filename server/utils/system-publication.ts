/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- typed signatures document canonical lifecycle helpers */
import { createHash } from 'node:crypto'
import type { Kysely, Transaction } from 'kysely'
import type { PublicationKind, PublicationState } from '~~/shared/constants/system-lifecycle'
import type { Database, JsonValue } from '~~/shared/types/database'

type DbClient = Kysely<Database> | Transaction<Database>

export class PublishedDefinitionUnavailableError extends Error {
  constructor(publicationId: string, kind: PublicationKind) {
    super(`Published ${kind} ${publicationId} is unavailable`)
    this.name = 'PublishedDefinitionUnavailableError'
  }
}

export type PublicationMetadata = {
  publicationId: string
  publicationState: PublicationState
  publicationVersionId: string | null
  publicationVersion: number | null
  hasUnpublishedChanges: boolean
}

export type PublishedDefinition = PublicationMetadata & {
  definition: JsonValue
  hash: string
}

export class PublicationLifecycleConflictError extends Error {
  constructor(public readonly code: string) {
    super('Publication lifecycle conflict')
    this.name = 'PublicationLifecycleConflictError'
  }
}

const invalidPublicationState = (code: string) => new PublicationLifecycleConflictError(code)

export type PublicationVersionReference = {
  path: string
  order?: number | null
  publicationId: string
  kind: PublicationKind
  publicationVersionId: string
  publicationVersion: number
}

/** Serializes publication selection and point-in-time runtime selection for exact keys. */
export const lockPublicationSelectionKeys = async (
  db: Transaction<Database>,
  kind: PublicationKind,
  selections: ReadonlyArray<{ dimension: string, key: string }>
): Promise<void> => {
  const unique = [...new Map(selections.map(selection => [
    `${selection.dimension}\u0000${selection.key}`,
    selection
  ])).values()].sort((left, right) => left.dimension.localeCompare(right.dimension) || left.key.localeCompare(right.key))
  if (unique.length === 0) return
  await db.insertInto('Common_Publication_Selection_Lock').values(unique.map(selection => ({
    egcs_cn_kind: kind,
    egcs_cn_dimension: selection.dimension,
    egcs_cn_key: selection.key
  }))).onConflict(conflict => conflict.doNothing()).execute()
  await db.selectFrom('Common_Publication_Selection_Lock')
    .select('egcs_cn_key')
    .where('egcs_cn_kind', '=', kind)
    .where(eb => eb.or(unique.map(selection => eb.and([
      eb('egcs_cn_dimension', '=', selection.dimension),
      eb('egcs_cn_key', '=', selection.key)
    ]))))
    .orderBy('egcs_cn_dimension', 'asc')
    .orderBy('egcs_cn_key', 'asc')
    .forUpdate()
    .execute()
}

type PublicationWorkflowStatusReference = {
  statusId: string
  role: Database['Common_Workflow_Publication_Status']['egcs_cn_role']
  order: number
}

/** Recursively orders object keys while preserving array order. */
const canonicalize = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) return value.map(item => canonicalize(item))
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)])
    )
  }
  return value
}

/** Produces the stable JSON representation stored in immutable versions. */
export const canonicalizePublicationDefinition = (definition: JsonValue): JsonValue => canonicalize(definition)

/** Computes the stable SHA-256 digest for a canonical publication definition. */
export const hashPublicationDefinition = (definition: JsonValue): string => createHash('sha256')
  .update(JSON.stringify(canonicalizePublicationDefinition(definition)))
  .digest('hex')

/** Creates the draft publication identity used as a subtype shared primary key. */
export const createPublication = async (db: Transaction<Database>, kind: PublicationKind): Promise<string> => {
  const publication = await db.insertInto('Common_Publication')
    .values({ egcs_cn_kind: kind })
    .returning('id')
    .executeTakeFirstOrThrow()
  return String(publication.id)
}

/** Reads canonical lifecycle metadata and compares an optional working definition. */
export const readPublicationMetadata = async (
  db: DbClient,
  publicationId: string,
  workingDefinition?: JsonValue
): Promise<PublicationMetadata> => {
  const publication = await db.selectFrom('Common_Publication')
    .leftJoin('Common_Publication_Version', 'Common_Publication_Version.id', 'Common_Publication.egcs_cn_currentversion')
    .select([
      'Common_Publication.id',
      'Common_Publication.egcs_cn_state',
      'Common_Publication.egcs_cn_currentversion',
      'Common_Publication_Version.egcs_cn_version',
      'Common_Publication_Version.egcs_cn_hash'
    ])
    .where('Common_Publication.id', '=', publicationId)
    .where('Common_Publication._deleted', '=', false)
    .executeTakeFirstOrThrow()
  const workingHash = workingDefinition === undefined ? null : hashPublicationDefinition(workingDefinition)
  return {
    publicationId: String(publication.id),
    publicationState: publication.egcs_cn_state,
    publicationVersionId: publication.egcs_cn_currentversion === null ? null : String(publication.egcs_cn_currentversion),
    publicationVersion: publication.egcs_cn_version === null ? null : Number(publication.egcs_cn_version),
    hasUnpublishedChanges: workingHash !== null && workingHash !== publication.egcs_cn_hash
  }
}

/** Reads lifecycle metadata for a collection without issuing one publication query per item. */
export const readPublicationMetadataBatch = async (
  db: DbClient,
  publications: ReadonlyArray<{ publicationId: string, workingDefinition?: JsonValue }>
): Promise<Map<string, PublicationMetadata>> => {
  if (publications.length === 0) return new Map()
  const definitions = new Map(publications.map(item => [item.publicationId, item.workingDefinition]))
  const rows = await db.selectFrom('Common_Publication')
    .leftJoin('Common_Publication_Version', 'Common_Publication_Version.id', 'Common_Publication.egcs_cn_currentversion')
    .select([
      'Common_Publication.id',
      'Common_Publication.egcs_cn_state',
      'Common_Publication.egcs_cn_currentversion',
      'Common_Publication_Version.egcs_cn_version',
      'Common_Publication_Version.egcs_cn_hash'
    ])
    .where('Common_Publication.id', 'in', [...definitions.keys()])
    .where('Common_Publication._deleted', '=', false)
    .execute()
  return new Map(rows.map(row => {
    const publicationId = String(row.id)
    const definition = definitions.get(publicationId)
    const workingHash = definition === undefined ? null : hashPublicationDefinition(definition)
    return [publicationId, {
      publicationId,
      publicationState: row.egcs_cn_state,
      publicationVersionId: row.egcs_cn_currentversion === null ? null : String(row.egcs_cn_currentversion),
      publicationVersion: row.egcs_cn_version === null ? null : Number(row.egcs_cn_version),
      hasUnpublishedChanges: workingHash !== null && workingHash !== row.egcs_cn_hash
    }]
  }))
}

/** Resolves the current immutable version for a selectable published resource. */
export const readCurrentPublishedDefinition = async <T extends JsonValue = JsonValue>(
  db: DbClient,
  publicationId: string,
  kind: PublicationKind
): Promise<{ publicationId: string, publicationVersionId: string, publicationVersion: number, definition: T }> => {
  const row = await db.selectFrom('Common_Publication')
    .innerJoin('Common_Publication_Version', 'Common_Publication_Version.id', 'Common_Publication.egcs_cn_currentversion')
    .select([
      'Common_Publication.id',
      'Common_Publication.egcs_cn_kind',
      'Common_Publication.egcs_cn_state',
      'Common_Publication_Version.id as versionId',
      'Common_Publication_Version.egcs_cn_version',
      'Common_Publication_Version.egcs_cn_definition'
    ])
    .where('Common_Publication.id', '=', publicationId)
    .where('Common_Publication.egcs_cn_kind', '=', kind)
    .where('Common_Publication.egcs_cn_state', '=', 'published')
    .where('Common_Publication._deleted', '=', false)
    .executeTakeFirst()
  if (!row) throw new PublishedDefinitionUnavailableError(publicationId, kind)
  return {
    publicationId: String(row.id),
    publicationVersionId: String(row.versionId),
    publicationVersion: Number(row.egcs_cn_version),
    definition: row.egcs_cn_definition as T
  }
}

/** Publishes a changed working definition and pins all referenced versions atomically. */
export const publishDefinition = async (
  db: Transaction<Database>,
  input: {
    publicationId: string
    kind: PublicationKind
    definition: JsonValue
    actorId: string
    references?: PublicationVersionReference[]
    workflowStatuses?: PublicationWorkflowStatusReference[]
    selections?: Array<{ dimension: string, key: string }>
  }
): Promise<PublishedDefinition> => {
  if (input.references && input.references.length > 0) {
    const referencedPublicationIds = [...new Set(input.references.map(reference => reference.publicationId))].sort()
    const referencedPublications = await db.selectFrom('Common_Publication')
      .select(['id', 'egcs_cn_kind', 'egcs_cn_state', 'egcs_cn_currentversion'])
      .where('id', 'in', referencedPublicationIds)
      .where('_deleted', '=', false)
      .orderBy('id', 'asc')
      .forUpdate()
      .execute()
    const referencedById = new Map(referencedPublications.map(item => [String(item.id), item]))
    for (const reference of input.references) {
      const current = referencedById.get(reference.publicationId)
      if (!current || current.egcs_cn_kind !== reference.kind || current.egcs_cn_state !== 'published'
        || String(current.egcs_cn_currentversion) !== reference.publicationVersionId) {
        throw invalidPublicationState('PUBLICATION_REFERENCE_UNAVAILABLE')
      }
    }
  }
  const existingSelections = await db.selectFrom('Common_Publication_Selection')
    .select(['egcs_cn_dimension as dimension', 'egcs_cn_key as key'])
    .where('egcs_cn_publication', '=', input.publicationId)
    .execute()
  await lockPublicationSelectionKeys(db, input.kind, [
    ...existingSelections,
    ...(input.selections ?? [])
  ])

  const publication = await db.selectFrom('Common_Publication')
    .leftJoin('Common_Publication_Version', 'Common_Publication_Version.id', 'Common_Publication.egcs_cn_currentversion')
    .select([
      'Common_Publication.id',
      'Common_Publication.egcs_cn_kind',
      'Common_Publication.egcs_cn_state',
      'Common_Publication.egcs_cn_currentversion',
      'Common_Publication_Version.egcs_cn_version',
      'Common_Publication_Version.egcs_cn_hash',
      'Common_Publication_Version.egcs_cn_definition'
    ])
    .where('Common_Publication.id', '=', input.publicationId)
    .where('Common_Publication._deleted', '=', false)
    .forUpdate('Common_Publication')
    .executeTakeFirstOrThrow()
  if (publication.egcs_cn_kind !== input.kind) throw new Error('Publication kind does not match its adapter')
  if (publication.egcs_cn_state === 'retired') throw invalidPublicationState('PUBLICATION_RETIRED')

  const definition = canonicalizePublicationDefinition(input.definition)
  const hash = hashPublicationDefinition(definition)
  if (publication.egcs_cn_state === 'published' && publication.egcs_cn_hash === hash) {
    return {
      publicationId: String(publication.id),
      publicationState: 'published',
      publicationVersionId: String(publication.egcs_cn_currentversion),
      publicationVersion: Number(publication.egcs_cn_version),
      hasUnpublishedChanges: false,
      definition: publication.egcs_cn_definition as JsonValue,
      hash
    }
  }

  const nextVersion = publication.egcs_cn_version === null ? 1 : Number(publication.egcs_cn_version) + 1
  const version = await db.insertInto('Common_Publication_Version').values({
    egcs_cn_publication: input.publicationId,
    egcs_cn_kind: input.kind,
    egcs_cn_version: nextVersion,
    egcs_cn_definition: definition,
    egcs_cn_hash: hash,
    egcs_cn_actor: input.actorId
  }).returning('id').executeTakeFirstOrThrow()
  if (input.references && input.references.length > 0) {
    await db.insertInto('Common_Publication_Version_Reference').values(input.references.map(reference => ({
      egcs_cn_parentversion: String(version.id),
      egcs_cn_path: reference.path,
      egcs_cn_order: reference.order ?? null,
      egcs_cn_publication: reference.publicationId,
      egcs_cn_kind: reference.kind,
      egcs_cn_publicationversion: reference.publicationVersionId,
      egcs_cn_version: reference.publicationVersion
    }))).execute()
  }
  if (input.workflowStatuses && input.workflowStatuses.length > 0) {
    if (input.kind !== 'workflow_setup') throw new Error('Workflow publication statuses require a workflow setup')
    await db.insertInto('Common_Workflow_Publication_Status').values(input.workflowStatuses.map(status => ({
      egcs_cn_publicationversion: String(version.id),
      egcs_cn_status: status.statusId,
      egcs_cn_role: status.role,
      egcs_cn_order: status.order
    }))).execute()
  }
  await db.deleteFrom('Common_Publication_Selection')
    .where('egcs_cn_publication', '=', input.publicationId)
    .execute()
  if (input.selections && input.selections.length > 0) {
    await db.insertInto('Common_Publication_Selection').values(input.selections.map(selection => ({
      egcs_cn_publication: input.publicationId,
      egcs_cn_kind: input.kind,
      egcs_cn_dimension: selection.dimension,
      egcs_cn_key: selection.key
    }))).execute()
  }
  await db.insertInto('Common_Publication_Transition').values({
    egcs_cn_publication: input.publicationId,
    egcs_cn_fromstate: publication.egcs_cn_state,
    egcs_cn_tostate: 'published',
    egcs_cn_publicationversion: String(version.id),
    egcs_cn_actor: input.actorId
  }).execute()
  return {
    publicationId: input.publicationId,
    publicationState: 'published',
    publicationVersionId: String(version.id),
    publicationVersion: nextVersion,
    hasUnpublishedChanges: false,
    definition,
    hash
  }
}

/** Permanently retires a published resource while preserving historical versions. */
export const retirePublication = async (
  db: Transaction<Database>,
  input: { publicationId: string, kind: PublicationKind, actorId: string }
): Promise<PublicationMetadata> => {
  const publication = await db.selectFrom('Common_Publication').selectAll()
    .where('id', '=', input.publicationId).where('_deleted', '=', false).forUpdate().executeTakeFirstOrThrow()
  if (publication.egcs_cn_kind !== input.kind) throw new Error('Publication kind does not match its adapter')
  if (publication.egcs_cn_state !== 'published' || publication.egcs_cn_currentversion === null) {
    throw invalidPublicationState('PUBLICATION_RETIRE_REQUIRES_PUBLISHED')
  }
  const publishedParent = await db.selectFrom('Common_Publication_Version_Reference as Reference')
    .innerJoin('Common_Publication as Parent_Publication', join => join
      .onRef('Parent_Publication.egcs_cn_currentversion', '=', 'Reference.egcs_cn_parentversion')
      .on('Parent_Publication.egcs_cn_state', '=', 'published')
      .on('Parent_Publication._deleted', '=', false))
    .select('Parent_Publication.id')
    .where('Reference.egcs_cn_publication', '=', input.publicationId)
    .executeTakeFirst()
  if (publishedParent) throw invalidPublicationState('PUBLICATION_REFERENCED_BY_PUBLISHED_PARENT')
  await db.insertInto('Common_Publication_Transition').values({
    egcs_cn_publication: input.publicationId,
    egcs_cn_fromstate: 'published',
    egcs_cn_tostate: 'retired',
    egcs_cn_publicationversion: String(publication.egcs_cn_currentversion),
    egcs_cn_actor: input.actorId
  }).execute()
  await db.deleteFrom('Common_Publication_Selection')
    .where('egcs_cn_publication', '=', input.publicationId)
    .execute()
  return readPublicationMetadata(db, input.publicationId)
}
