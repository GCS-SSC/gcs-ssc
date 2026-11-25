import type { Generated, GeneratedAlways } from 'kysely'

import type { CorrespondenceOverview, CorrespondenceStatus } from './correspondence'

export { CORRESPONDENCE_STATUSES as AGREEMENT_REQUEST_STATUSES } from './correspondence'
export type { CorrespondenceEntry as AgreementRequestEntry, CorrespondenceThread as AgreementRequestThread } from './correspondence'
export type AgreementRequestStatus = CorrespondenceStatus
export const AGREEMENT_REQUEST_ENTITY_TYPES = ['fundingcaseagreementclaim', 'fundingcaseforecast'] as const
export type AgreementRequestEntityType = typeof AGREEMENT_REQUEST_ENTITY_TYPES[number]

export interface AgreementRequestThreadTable {
  id: Generated<string>
  egcs_fc_entityid: string
  egcs_fc_entitytype: AgreementRequestEntityType
  egcs_fc_subject: string
  egcs_fc_internal: Generated<boolean>
  egcs_fc_status: Generated<AgreementRequestStatus>
  _deleted: Generated<boolean>
}

export interface AgreementRequestEntryTable {
  id: Generated<string>
  egcs_fc_thread: string
  egcs_fc_kind: 'question' | 'reply' | 'note'
  egcs_fc_opening: Generated<boolean>
  egcs_fc_question: string | null
  egcs_fc_questionkind: GeneratedAlways<'question' | null>
  egcs_fc_body: string
  egcs_fc_correspondenceat: Date
  egcs_fc_loggedat: Generated<Date>
  egcs_fc_loggedby: string
  egcs_fc_contactname: string | null
  egcs_fc_contactemail: string | null
  egcs_fc_requestkey: string
  egcs_fc_requesthash: string
  _deleted: Generated<boolean>
}

export interface AgreementRequestAttachmentTable {
  id: Generated<string>
  egcs_fc_entry: string
  egcs_fc_attachment: string
  _deleted: Generated<boolean>
}

export interface AgreementRequestsOverview extends CorrespondenceOverview {
  proponentId: string
}
