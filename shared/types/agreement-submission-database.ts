import type { Generated, GeneratedAlways } from 'kysely'
import type { JsonValue } from './database'
import type { ClaimCustomFieldSnapshot } from './schemas/agreement-custom-fields'

import type {
  AgreementSubmissionEventKind,
  AgreementSubmissionMode,
  AgreementSubmissionState,
  AgreementSubmissionTarget
} from './agreement-submission'

export type AgreementSubmissionPayload = Record<string, JsonValue>

export type ClaimSubmissionReferenceSnapshot = {
  applicantRecipientId: { en: string | null; fr: string | null }
  fiscalYearId: string
}

export interface AgreementSubmissionTable {
  id: Generated<string>
  egcs_fc_fundingagreement: string
  egcs_fc_target: AgreementSubmissionTarget
  egcs_fc_sourcesystem: string
  egcs_fc_sourceid: string
  egcs_fc_sourcerevision: string
  egcs_fc_formatversion: number
  egcs_fc_state: AgreementSubmissionState
  egcs_fc_mode: AgreementSubmissionMode
  egcs_fc_revision: number
  egcs_fc_payload: AgreementSubmissionPayload
  egcs_fc_amendment: string | null
  egcs_fc_budgetrevision: string | null
  egcs_fc_blocker: string | null
  egcs_fc_result: string | null
  egcs_fc_resultamendment: GeneratedAlways<string | null>
  egcs_fc_resultforecast: GeneratedAlways<string | null>
  egcs_fc_resultclaim: GeneratedAlways<string | null>
  egcs_fc_resulttype: GeneratedAlways<'fundingcaseagreementclaim' | 'fundingcaseforecast' | 'fundingcaseamendment'>
  egcs_fc_updatedat: Generated<Date>
  egcs_fc_updatedby: string | null
  _deleted: Generated<boolean>
}

export type AgreementSubmissionEditSection = {
  id: string
  en: string
  fr: string
} | { id: null }

export interface AgreementSubmissionEventTable {
  id: Generated<string>
  egcs_fc_submission: string
  egcs_fc_kind: AgreementSubmissionEventKind
  egcs_fc_sourcerevision: string
  egcs_fc_formatversion: number
  egcs_fc_payload: AgreementSubmissionPayload | null
  egcs_fc_forecastcustomfields: Generated<ClaimCustomFieldSnapshot | null>
  egcs_fc_claimcustomfields: Generated<ClaimCustomFieldSnapshot | null>
  egcs_fc_claimreferences: Generated<ClaimSubmissionReferenceSnapshot | null>
  egcs_fc_description: string | null
  egcs_fc_editsection: Generated<AgreementSubmissionEditSection | null>
  egcs_fc_amendment: Generated<string | null>
  egcs_fc_budgetrevision: Generated<string | null>
  egcs_fc_actor: string | null
  egcs_fc_createdat: Generated<Date>
  _deleted: Generated<boolean>
}
