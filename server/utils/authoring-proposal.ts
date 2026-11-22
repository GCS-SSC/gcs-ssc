import { randomUUID } from 'node:crypto'
import type { Kysely } from 'kysely'
import { sql } from 'kysely'
import { z } from 'zod'
import type { Database } from '~~/shared/types/database'
import type { PortableAuthoringKind, PortableAuthoringNotice } from '~~/shared/utils/portable-authoring-schema'
import { isAssignableGroup } from './group-eligibility'

const labels = {
  egcs_cn_name: { en: 'Name', fr: 'Nom' },
  egcs_cn_outcomename: { en: 'Outcome name', fr: 'Nom du résultat' },
  egcs_cn_description: { en: 'Description', fr: 'Description' }
} as const

const fields = {
  checklist: ['egcs_cn_outcomename'],
  assessment: ['egcs_cn_outcomename'],
  recommendation: [],
  approval: ['egcs_cn_description']
} as const

const rowSchema = z.record(z.string(), z.unknown())

/**
 * Leaves clearly marked draft placeholders for missing required catalog text.
 * @param kind - The selected catalog kind.
 * @param payload - Parsed provider proposal payload.
 * @param notices - Source findings accompanying the proposal.
 * @param locale - Language used for the report.
 * @returns The draft payload and bounded report notices.
 */
export const flagMissingDraftText = (
  kind: PortableAuthoringKind,
  payload: Record<string, unknown>,
  notices: PortableAuthoringNotice[],
  locale: 'en' | 'fr' = 'en'
) => {
  const draft = { ...payload }
  if (kind === 'approval' && draft.egcs_cn_allowadditionalapprovals !== true) {
    const { egcs_cn_defaultaddedapprovalname_en: en, egcs_cn_defaultaddedapprovalname_fr: fr } = draft
    if (typeof en === 'string' && !en.trim()) delete draft.egcs_cn_defaultaddedapprovalname_en
    if (typeof fr === 'string' && !fr.trim()) delete draft.egcs_cn_defaultaddedapprovalname_fr
  }
  const missing: PortableAuthoringNotice[] = []
  const suffix = randomUUID().slice(0, 8)
  for (const field of ['egcs_cn_name', ...fields[kind]] as const) {
    for (const language of ['en', 'fr'] as const) {
      const key = `${field}_${language}`
      const value = draft[key]
      if (typeof value === 'string' && value.trim()) continue
      const title = field === 'egcs_cn_name'
      const placeholder = language === 'en' ? 'To complete' : 'À compléter'
      const marked = title ? `${placeholder} (${suffix})` : placeholder
      draft[key] = marked
      const label = `${labels[field][locale]} (${language.toUpperCase()})`
      missing.push({
        message: locale === 'fr'
          ? `${label} manquant. Remplacez « ${marked} » avant de publier.`
          : `${label} was missing. Replace “${marked}” before publishing.`
      })
    }
  }
  return { payload: draft, notices: [...missing, ...notices].slice(0, 100) }
}

type Assignee = { stepIndex: number; groupName: string }

/**
 * Matches exact bilingual group names locally under current Agency scope.
 * @param db - Host database.
 * @param agencyId - Owning Agency.
 * @param payload - Proposal containing ordered approval steps.
 * @param assignees - Names transcribed from the source by OpenAI.
 * @returns The proposal with eligible, unambiguous group references.
 */
export const resolveProposedApprovalGroups = async (
  db: Kysely<Database>,
  agencyId: string,
  payload: Record<string, unknown>,
  assignees: Assignee[]
) => {
  if (!Array.isArray(payload.steps) || !assignees.length) return payload
  const steps: unknown[] = [...payload.steps]
  const normalizedNames = new Map<number, Set<string>>()
  for (const { stepIndex, groupName } of assignees) {
    const names = normalizedNames.get(stepIndex) ?? new Set<string>()
    names.add(groupName.trim().toLowerCase())
    normalizedNames.set(stepIndex, names)
  }
  for (const [index, names] of normalizedNames) {
    const source = rowSchema.safeParse(steps[index])
    if (!source.success) continue
    const name = [...names][0]
    const groups = name && names.size === 1
      ? await db.selectFrom('Common_Group').select('id')
          .where('egcs_cn_agency', '=', agencyId).where('_deleted', '=', false)
          .where(eb => eb.or([
            eb(sql<string>`lower(egcs_cn_name_en)`, '=', name),
            eb(sql<string>`lower(egcs_cn_name_fr)`, '=', name)
          ])).limit(2).execute()
      : []
    const match = groups.length === 1 ? groups[0]?.id : null
    const group = match && await isAssignableGroup(db, String(match), agencyId) ? String(match) : null
    steps[index] = { ...source.data, egcs_cn_defaultuser: null, egcs_cn_defaultgroup: group }
  }
  return { ...payload, steps }
}
