import type { Kysely, Selectable } from 'kysely'
/* eslint-disable jsdoc/require-jsdoc -- Public status service methods have descriptive names and focused contract tests. */
import type { Database, CommonStatusTable } from '~~/shared/types/database'
import type { StatusDefinition } from '~~/shared/types/status'

const STATUS_CACHE_MAX_AGE_MS = 60 * 60 * 1000

const toDefinition = (row: Selectable<CommonStatusTable>): StatusDefinition => ({
  id: String(row.id),
  agencyId: String(row.egcs_cn_agency),
  nameEn: row.egcs_cn_name_en,
  nameFr: row.egcs_cn_name_fr,
  color: row.egcs_cn_color,
  icon: row.egcs_cn_icon,
  readOnly: row.egcs_cn_readonly,
  terminal: row.egcs_cn_terminal,
  isDraft: row.egcs_cn_isdraft,
  deleted: row._deleted
})

type AgencyCacheEntry = { loadedAt: number, definitions: StatusDefinition[] }

export class StatusCatalogService {
  readonly #agencyCache = new Map<string, AgencyCacheEntry>()
  readonly #inflight = new Map<string, Promise<StatusDefinition[]>>()
  readonly #generations = new Map<string, number>()
  readonly #byId = new Map<string, StatusDefinition>()

  async getAgency(db: Kysely<Database>, agencyId: string, force = false): Promise<StatusDefinition[]> {
    const cached = this.#agencyCache.get(agencyId)
    if (!force && cached && Date.now() - cached.loadedAt < STATUS_CACHE_MAX_AGE_MS) return cached.definitions
    const pending = this.#inflight.get(agencyId)
    if (!force && pending) return await pending
    const generation = (this.#generations.get(agencyId) ?? 0) + (force ? 1 : 0)
    this.#generations.set(agencyId, generation)

    const load = db.selectFrom('Common_Status')
      .selectAll()
      .where('egcs_cn_agency', '=', agencyId)
      .orderBy('egcs_cn_isdraft', 'desc')
      .orderBy('id', 'asc')
      .execute()
      .then(rows => {
        const definitions = rows.map(toDefinition)
        if (this.#generations.get(agencyId) !== generation) return definitions
        const previous = this.#agencyCache.get(agencyId)?.definitions ?? []
        for (const definition of previous) this.#byId.delete(definition.id)
        for (const definition of definitions) this.#byId.set(definition.id, definition)
        this.#agencyCache.set(agencyId, { loadedAt: Date.now(), definitions })
        return definitions
      })
      .finally(() => {
        if (this.#inflight.get(agencyId) === load) this.#inflight.delete(agencyId)
      })
    this.#inflight.set(agencyId, load)
    return await load
  }

  async getAll(db: Kysely<Database>): Promise<StatusDefinition[]> {
    const agencyIds = await db.selectFrom('Common_Status')
      .select('egcs_cn_agency')
      .distinct()
      .execute()
    const catalogs = await Promise.all(agencyIds.map(({ egcs_cn_agency: agencyId }) => this.getAgency(db, String(agencyId))))
    return catalogs.flat()
  }

  async refreshAgency(db: Kysely<Database>, agencyId: string): Promise<StatusDefinition[]> {
    return await this.getAgency(db, agencyId, true)
  }

  invalidateAgency(agencyId: string): void {
    const previous = this.#agencyCache.get(agencyId)?.definitions ?? []
    for (const definition of previous) this.#byId.delete(definition.id)
    this.#agencyCache.delete(agencyId)
    this.#inflight.delete(agencyId)
    this.#generations.set(agencyId, (this.#generations.get(agencyId) ?? 0) + 1)
  }

  getById(statusId: string): StatusDefinition | undefined {
    return this.#byId.get(statusId)
  }
}

export const statusCatalogService = new StatusCatalogService()
