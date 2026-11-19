import { z } from 'zod'
import type { AgencyClauseText } from './agency-clause'
import { PositivePostgresBigintIdSchema } from './common'

export const StreamClauseLinkSchema = z.object({
  egcs_tp_clause: PositivePostgresBigintIdSchema
}).strict()

export type StreamClauseLink = {
  id: string
  egcs_tp_clause: string
  egcs_ay_languageindependentcode: string
  rows: AgencyClauseText[]
  egcs_ay_name_en: string
  egcs_ay_name_fr: string
  egcs_ay_active: boolean
  publicationState: 'draft' | 'published' | 'retired'
}
