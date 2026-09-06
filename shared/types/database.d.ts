import type { Generated } from 'kysely'
import type { CoreEntityType, CoreLifecycleEntityType } from '../constants/entity-registry'
import type {
  CompletionDisposition,
  PublicationKind,
  PublicationState,
  RuntimeItemKind,
  RuntimeKind,
  RuntimeState
} from '../constants/system-lifecycle'
import type { StatusId } from './status'

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

export type Agreement_Applicant_Recipient_Type = 'guarantor' | 'obligant' | 'consultant' | 'partner'
export type Decision_Type = 'fundingcaseintakeassessment'
export type Amended_Type = 'articles' | 'activities' | 'budget' | 'duration' | 'other'
export type Registry_Type = 'provincialbusinessnumber' | 'federalbusinessnumber' | 'craprogramaccountnumber' | 'noc' | 'naics' | 'other'
export type Agreement_Type = 'grant' | 'nonrepayable' | 'repayable' | 'partiallyrepayable' | 'other'
export type Applicant_Recipient_Type =
  | 'aboriginalrecipients'
  | 'forprofitorganizations'
  | 'government'
  | 'internationalnongov'
  | 'notforprofitorganizationsandcharities'
  | 'other'
  | 'individualorsoleproprietorships'
  | 'academia'
export type Workflow_Purpose = 'standard' | 'approval_submission' | 'risk_rating'
export type Workflow_Setup_Member_Kind = 'review_set' | 'recommendation_set' | 'approval_template'
export type Workflow_Transition_Event = 'materialized' | 'succeeded' | 'failed' | 'cancelled' | 'execution_failed'
export type Recommendation_Outcome = 'recommended' | 'not_recommended'
export type { AssignableEntityType } from '../constants/enums'
export type Workflow_Target_Entity_Type = CoreLifecycleEntityType | `${string}:${string}`
export type Payment_Type = 'reimbursement' | 'advance'
export type Language_Preference = 'eng' | 'fra'
export type Review_Type = 'checklist' | 'assessment'
export type Checklist_Result = 'pass' | 'pass_with_considerations' | 'fail'
export type Checklist_Answer = 'pass' | 'fail'
export type Entity_Type = CoreEntityType | `${string}:${string}`
export type Monitor_Action_Type = 'amendment' | 'mandatoryaction' | 'suggestedaction' | 'none'
export type Monitor_Responsible_Party = 'applicantrecipient' | 'organization' | 'joint'
export type Follow_Up_Status = 'open' | 'onhold' | 'completed' | 'cancelled' | 'unabletocomplete'
export type Jurisdiction = 'ab' | 'bc' | 'mb' | 'nb' | 'nl' | 'ns' | 'nt' | 'nu' | 'on' | 'pe' | 'qc' | 'sk' | 'yt'

export type Currency_Codes =
  | 'all'
  | 'amd'
  | 'ang'
  | 'aoa'
  | 'ars'
  | 'aud'
  | 'awg'
  | 'azn'
  | 'bam'
  | 'bbd'
  | 'bdt'
  | 'bgn'
  | 'bhd'
  | 'bif'
  | 'bnd'
  | 'bob'
  | 'bov'
  | 'brl'
  | 'bsd'
  | 'btn'
  | 'bwp'
  | 'byr'
  | 'bzd'
  | 'cad'
  | 'cdf'
  | 'chf'
  | 'clf'
  | 'clp'
  | 'cny'
  | 'cop'
  | 'crc'
  | 'cuc'
  | 'cve'
  | 'czk'
  | 'djf'
  | 'dkk'
  | 'dop'
  | 'dzd'
  | 'egp'
  | 'ern'
  | 'etb'
  | 'eur'
  | 'fjd'
  | 'gbp'
  | 'gel'
  | 'gip'
  | 'gmd'
  | 'gnf'
  | 'gtq'
  | 'gyd'
  | 'hkd'
  | 'hnl'
  | 'hrk'
  | 'htg'
  | 'huf'
  | 'idr'
  | 'ils'
  | 'inr'
  | 'iqd'
  | 'irr'
  | 'isk'
  | 'jmd'
  | 'jod'
  | 'jpy'
  | 'kes'
  | 'kgs'
  | 'khr'
  | 'kmf'
  | 'krw'
  | 'kwd'
  | 'kyd'
  | 'kzt'
  | 'lak'
  | 'lbp'
  | 'lrd'
  | 'lsl'
  | 'lyd'
  | 'mga'
  | 'mkd'
  | 'mop'
  | 'mur'
  | 'mvr'
  | 'mwk'
  | 'myr'
  | 'nok'
  | 'nzd'
  | 'svc'
  | 'usd'
  | 'xaf'
  | 'xcd'
  | 'xdr'
  | 'xof'
  | 'xpf'
  | 'zar'

export type Countries =
  | 'ad'
  | 'ae'
  | 'af'
  | 'ag'
  | 'ai'
  | 'al'
  | 'am'
  | 'ao'
  | 'aq'
  | 'ar'
  | 'as'
  | 'at'
  | 'au'
  | 'aw'
  | 'ax'
  | 'az'
  | 'ba'
  | 'bb'
  | 'bd'
  | 'be'
  | 'bf'
  | 'bg'
  | 'bh'
  | 'bi'
  | 'bj'
  | 'bl'
  | 'bm'
  | 'bn'
  | 'bo'
  | 'bq'
  | 'br'
  | 'bs'
  | 'bt'
  | 'bv'
  | 'bw'
  | 'by'
  | 'bz'
  | 'ca'
  | 'cc'
  | 'cd'
  | 'cf'
  | 'cg'
  | 'ch'
  | 'ci'
  | 'ck'
  | 'cl'
  | 'cm'
  | 'cn'
  | 'co'
  | 'cr'
  | 'cu'
  | 'cv'
  | 'cw'
  | 'cx'
  | 'cy'
  | 'cz'
  | 'de'
  | 'dj'
  | 'dk'
  | 'dm'
  | 'do'
  | 'dz'
  | 'ec'
  | 'ee'
  | 'eg'
  | 'eh'
  | 'er'
  | 'es'
  | 'et'
  | 'fi'
  | 'fj'
  | 'fk'
  | 'fm'
  | 'fo'
  | 'fr'
  | 'ga'
  | 'gb'
  | 'gd'
  | 'ge'
  | 'gf'
  | 'gg'
  | 'gh'
  | 'gi'
  | 'gl'
  | 'gm'
  | 'gn'
  | 'gp'
  | 'gq'
  | 'gr'
  | 'gs'
  | 'gt'
  | 'gu'
  | 'gw'
  | 'gy'
  | 'hk'
  | 'hm'
  | 'hn'
  | 'hr'
  | 'ht'
  | 'hu'
  | 'id'
  | 'ie'
  | 'il'
  | 'im'
  | 'in'
  | 'io'
  | 'iq'
  | 'ir'
  | 'is'
  | 'it'
  | 'je'
  | 'jm'
  | 'jo'
  | 'jp'
  | 'ke'
  | 'kg'
  | 'kh'
  | 'ki'
  | 'km'
  | 'kn'
  | 'kp'
  | 'kr'
  | 'kw'
  | 'ky'
  | 'kz'
  | 'la'
  | 'lb'
  | 'lc'
  | 'li'
  | 'lk'
  | 'lr'
  | 'ls'
  | 'lt'
  | 'lu'
  | 'lv'
  | 'ly'
  | 'ma'
  | 'mc'
  | 'md'
  | 'me'
  | 'mf'
  | 'mg'
  | 'mh'
  | 'mk'
  | 'ml'
  | 'mm'
  | 'mn'
  | 'mo'
  | 'mp'
  | 'mq'
  | 'mr'
  | 'ms'
  | 'mt'
  | 'mu'
  | 'mv'
  | 'mw'
  | 'mx'
  | 'my'
  | 'mz'
  | 'na'
  | 'nc'
  | 'ne'
  | 'nf'
  | 'ng'
  | 'ni'
  | 'nl'
  | 'no'
  | 'np'
  | 'nr'
  | 'nu'
  | 'nz'
  | 'om'
  | 'pa'
  | 'pe'
  | 'pf'
  | 'pg'
  | 'ph'
  | 'pk'
  | 'pl'
  | 'pm'
  | 'pn'
  | 'pr'
  | 'ps'
  | 'pt'
  | 'pw'
  | 'py'
  | 'qa'
  | 're'
  | 'ro'
  | 'rs'
  | 'ru'
  | 'rw'
  | 'sa'
  | 'sb'
  | 'sc'
  | 'sd'
  | 'se'
  | 'sg'
  | 'sh'
  | 'si'
  | 'sj'
  | 'sk'
  | 'sl'
  | 'sm'
  | 'sn'
  | 'so'
  | 'sr'
  | 'ss'
  | 'st'
  | 'sv'
  | 'sx'
  | 'sy'
  | 'sz'
  | 'tc'
  | 'td'
  | 'tf'
  | 'tg'
  | 'th'
  | 'tj'
  | 'tk'
  | 'tl'
  | 'tm'
  | 'tn'
  | 'to'
  | 'tr'
  | 'tt'
  | 'tv'
  | 'tw'
  | 'tz'
  | 'ua'
  | 'ug'
  | 'um'
  | 'us'
  | 'uy'
  | 'uz'
  | 'va'
  | 'vc'
  | 've'
  | 'vg'
  | 'vi'
  | 'vn'
  | 'vu'
  | 'wf'
  | 'ws'
  | 'ye'
  | 'yt'
  | 'za'
  | 'zm'
  | 'zw'

export interface ExtensionsDatabase {
  'extensions.agency_enablement': ExtensionsAgencyEnablementTable
  'extensions.agency_storage_selection': ExtensionsAgencyStorageSelectionTable
  'extensions.stream_configuration': ExtensionsStreamConfigurationTable
  'extensions.kv_entry': ExtensionsKvEntryTable
  'extensions.secret_entry': ExtensionsSecretEntryTable
  'extensions.gcs_gcforms_credentials': ExtensionsGcsGcFormsCredentialTable
}

export interface Database extends ExtensionsDatabase {
  Agency_Profile: AgencyProfileTable
  Agency_Cost_Category: AgencyCostCategoryTable
  Agency_Cost_Category_Line_Item: AgencyCostCategoryLineItemTable
  Agency_Fiscal_Year: AgencyFiscalYearTable
  Agency_Address_Type: AgencyAddressTypeTable
  Agency_Applicant_Recipient_Subtype: AgencyApplicantRecipientSubtypeTable
  Agency_Approval_Behalf_Type: AgencyApprovalBehalfTypeTable
  Agency_Agreement_Type: AgencyAgreementTypeTable
  Agency_Holdback_Basis: AgencyHoldbackBasisTable
  Applicant_Recipient_Profile: ApplicantRecipientProfileTable
  Applicant_Recipient_Registry: ApplicantRecipientRegistryTable
  Applicant_Recipient_Agency_Financial_Id: ApplicantRecipientAgencyFinancialIdTable
  Applicant_Recipient_Other_Name: ApplicantRecipientOtherNameTable
  Applicant_Recipient_Address: ApplicantRecipientAddressTable
  Applicant_Recipient_Contact: ApplicantRecipientContactTable
  Applicant_Recipient_Funding_History: ApplicantRecipientFundingHistoryTable
  Applicant_Recipient_Funding_History_Recipient: ApplicantRecipientFundingHistoryRecipientTable
  Transfer_Payment_Profile: TransferPaymentProfileTable
  Common_Workflow_Member_Condition: WorkflowMemberConditionTable
  Common_Workflow_Publication_Condition: WorkflowPublicationConditionTable
  Transfer_Payment_Stream_Field_Section: TransferPaymentStreamFieldSectionTable
  Transfer_Payment_Stream_Field: TransferPaymentStreamFieldTable
  Transfer_Payment_Stream_Field_Option: TransferPaymentStreamFieldOptionTable
  Funding_Case_Agreement_Profile: FundingCaseAgreementProfileTable
  Funding_Case_Agreement_Closeout: FundingCaseAgreementCloseoutTable
  Funding_Case_Agreement_Closeout_Snapshot: FundingCaseAgreementCloseoutSnapshotTable
  Funding_Case_Agreement_Amendment: FundingCaseAgreementAmendmentTable
  Funding_Case_Agreement_Amendment_Type: FundingCaseAgreementAmendmentTypeTable
  Funding_Case_Agreement_Amendment_Subtype: FundingCaseAgreementAmendmentSubtypeTable
  Funding_Case_Agreement_Budget_Version: FundingCaseAgreementBudgetVersionTable
  Funding_Case_Agreement_Activity_Version: FundingCaseAgreementActivityVersionTable
  Funding_Case_Agreement_Revision: FundingCaseAgreementRevisionTable
  Funding_Case_Agreement_Approval_Submission: FundingCaseAgreementApprovalSubmissionTable
  Funding_Case_Agreement_Applicant_Recipient: FundingCaseAgreementApplicantRecipientTable
  Funding_Case_Agreement_Address: FundingCaseAgreementAddressTable
  Funding_Case_Agreement_Budget_Fiscal_Year: FundingCaseAgreementBudgetFiscalYearTable
  Funding_Case_Agreement_Budget_Line_Item: FundingCaseAgreementBudgetLineItemTable
  Funding_Case_Agreement_Forecast: FundingCaseAgreementForecastTable
  Funding_Case_Agreement_Forecast_Line_Item: FundingCaseAgreementForecastLineItemTable
  Funding_Case_Agreement_Claim: FundingCaseAgreementClaimTable
  Funding_Case_Agreement_Claim_Line_Item: FundingCaseAgreementClaimLineItemTable
  Funding_Case_Agreement_Claim_Reconcile: FundingCaseAgreementClaimReconcileTable
  Funding_Case_Agreement_Claim_Reconcile_Line_Item: FundingCaseAgreementClaimReconcileLineItemTable
  Funding_Case_Agreement_Commitment: FundingCaseAgreementCommitmentTable
  Funding_Case_Agreement_Commitment_Line: FundingCaseAgreementCommitmentLineTable
  Funding_Case_Agreement_Payment: FundingCaseAgreementPaymentTable
  Funding_Case_Agreement_Payment_Line: FundingCaseAgreementPaymentLineTable
  Funding_Case_Agreement_Monitor: FundingCaseAgreementMonitorTable
  Funding_Case_Agreement_Monitor_Planning: FundingCaseAgreementMonitorPlanningTable
  Funding_Case_Agreement_Monitor_Items: FundingCaseAgreementMonitorItemsTable
  Funding_Case_Agreement_Monitor_Finding: FundingCaseAgreementMonitorFindingTable
  Funding_Case_Agreement_Monitor_Followup: FundingCaseAgreementMonitorFollowupTable
  Funding_Case_Agreement_Monitor_Followup_Update: FundingCaseAgreementMonitorFollowupUpdateTable
  Funding_Case_Agreement_Monitor_Promising_Practice: FundingCaseAgreementMonitorPromisingPracticeTable
  Funding_Case_Agreement_Generated_Document: FundingCaseAgreementGeneratedDocumentTable
  Funding_Case_Agreement_Activity: FundingCaseAgreementActivityTable
  Funding_Case_Agreement_Outcome_Activity: FundingCaseAgreementOutcomeActivityTable
  Funding_Case_Agreement_Responsible_Party_Activity: FundingCaseAgreementResponsiblePartyActivityTable
  Transfer_Payment_Fiscal_Year_Budget: TransferPaymentFiscalYearBudgetTable
  Transfer_Payment_Stream: TransferPaymentStreamTable
  Transfer_Payment_Stream_Holdback_Basis: TransferPaymentStreamHoldbackBasisTable
  Transfer_Payment_Stream_Document_Template: TransferPaymentStreamDocumentTemplateTable
  Transfer_Payment_Objective: TransferPaymentObjectiveTable
  Transfer_Payment_Stream_Budget: TransferPaymentStreamBudgetTable
  Transfer_Payment_Stream_Eligible_Recipient: TransferPaymentStreamEligibleRecipientTable
  Transfer_Payment_Stream_Cost_Category_Line_Item: TransferPaymentStreamCostCategoryLineItemTable
  Transfer_Payment_Outcome: TransferPaymentOutcomeTable
  Transfer_Payment_Outcome_Performance_Indicator: TransferPaymentOutcomePerformanceIndicatorTable
  Transfer_Payment_Stream_Outcome: TransferPaymentStreamOutcomeTable
  Transfer_Payment_Amendment_Type: TransferPaymentAmendmentTypeTable
  Transfer_Payment_Amendment_Subtype: TransferPaymentAmendmentSubtypeTable
  Transfer_Payment_Amendment_Subtype_Type: TransferPaymentAmendmentSubtypeTypeTable
  Transfer_Payment_Agreement_Subtype: TransferPaymentAgreementSubtypeTable
  Transfer_Payment_Stream_Chart_of_Account: TransferPaymentStreamChartOfAccountTable
  Transfer_Payment_Stream_Commitment_Type: TransferPaymentStreamCommitmentTypeTable
  Transfer_Payment_Monitor_Type: TransferPaymentMonitorTypeTable
  Transfer_Payment_Stream_Area_of_Expertise: TransferPaymentStreamAreaOfExpertiseTable
  Transfer_Payment_Stream_Risk_Rating: TransferPaymentStreamRiskRatingTable
  Transfer_Payment_Financial_Limits: TransferPaymentFinancialLimitsTable
  Common_Contact: CommonContactTable
  Common_Address: CommonAddressTable
  Common_Completion: CommonCompletionTable
  Common_Publication: CommonPublicationTable
  Common_Publication_Version: CommonPublicationVersionTable
  Common_Publication_Version_Reference: CommonPublicationVersionReferenceTable
  Common_Workflow_Publication_Status: CommonWorkflowPublicationStatusTable
  Common_Publication_Selection: CommonPublicationSelectionTable
  Common_Publication_Selection_Lock: CommonPublicationSelectionLockTable
  Common_Publication_Transition: CommonPublicationTransitionTable
  Common_Runtime: CommonRuntimeTable
  Common_Runtime_Item: CommonRuntimeItemTable
  Common_Runtime_Transition: CommonRuntimeTransitionTable
  Common_Status: CommonStatusTable
  Common_Additional_Reviewers: CommonAdditionalReviewersTable
  Common_Certification: CommonCertificationTable
  Common_Approval_Template: CommonApprovalTemplateTable
  Common_Approval_Step: CommonApprovalStepTable
  Common_Routing_Slip: CommonRoutingSlipTable
  Common_Approval: CommonApprovalTable
  Common_Approval_Certification: CommonApprovalCertificationTable
  Common_Assessment_Outcome: CommonAssessmentOutcomeTable
  Common_Assessment_Custom_Outcome: CommonAssessmentCustomOutcomeTable
  Common_User: CommonUserTable
  Common_GWCOA: CommonGwcoaTable
  Common_Entity_Type: CommonEntityTypeTable
  Common_Entity: CommonEntityTable
  Common_Extension_Entity_Owner: CommonExtensionEntityOwnerTable
  Common_Entity_Assignment: CommonEntityAssignmentTable
  Common_Review_Schema: CommonReviewSchemaTable
  Common_Assessment_Schema: CommonAssessmentSchemaTable
  Common_Checklist_Schema: CommonChecklistSchemaTable
  Common_Review_Set_Setup: CommonReviewSetSetupTable
  Common_Review_Setup: CommonReviewSetupTable
  Common_Review_Set: CommonReviewSetTable
  Common_Review: CommonReviewTable
  Common_Review_Response: CommonReviewResponseTable
  Common_Assessment: CommonAssessmentTable
  Common_Checklist: CommonChecklistTable
  Common_Assessment_Response: CommonAssessmentResponseTable
  Common_Checklist_Response: CommonChecklistResponseTable
  Common_Recommendation_Schema: CommonRecommendationSchemaTable
  Common_Recommendation_Set_Setup: CommonRecommendationSetSetupTable
  Common_Recommendation_Setup: CommonRecommendationSetupTable
  Common_Recommendation_Set: CommonRecommendationSetTable
  Common_Workflow_Setup: CommonWorkflowSetupTable
  Common_Workflow_Setup_Allowed_Start_Status: CommonWorkflowSetupAllowedStartStatusTable
  Common_Workflow_Setup_Member: CommonWorkflowSetupMemberTable
  Common_Workflow_Setup_Member_Owner: CommonWorkflowSetupMemberOwnerTable
  Common_Workflow_Run: CommonWorkflowRunTable
  Common_Workflow_Status_Transition: CommonWorkflowStatusTransitionTable
  Common_Workflow_Owner_Blocker: CommonWorkflowOwnerBlockerTable
  Common_Recommendation: CommonRecommendationTable
  Common_Attachment_Types: CommonAttachmentTypesTable
  Common_Attachment: CommonAttachmentTable
  Common_Entity_Attachment: CommonEntityAttachmentTable
  storage_cleanup_outbox: StorageCleanupOutboxTable
  // Better Auth & RBAC
  user: UserTable
  session: SessionTable
  account: AccountTable
  verification: VerificationTable
  user_role_assignment: UserRoleAssignmentTable
  security_audit_event: SecurityAuditEventTable
  role: RoleTable
  role_permission: RolePermissionTable
  role_transfer_payment_scope: RoleTransferPaymentScopeTable
}

export interface ExtensionsAgencyEnablementTable {
  id: Generated<string>
  extension_key: string
  agency_id: string
  enabled: boolean
  config: Generated<JsonValue>
  _deleted: Generated<boolean>
}

export interface ExtensionsAgencyStorageSelectionTable {
  id: Generated<string>
  agency_id: string
  provider_key: string
  created_at: Generated<Date | string>
  updated_at: Date | string | null
  _deleted: Generated<boolean>
}

export interface ExtensionsStreamConfigurationTable {
  id: Generated<string>
  extension_key: string
  stream_id: string
  enabled: boolean
  config: Generated<JsonValue>
  _deleted: Generated<boolean>
}

export interface ExtensionsKvEntryTable {
  id: Generated<string>
  extension_key: string
  owner_type: string
  owner_id: string
  config_key: string
  value: Generated<JsonValue>
  _deleted: Generated<boolean>
}

export interface ExtensionsSecretEntryTable {
  id: Generated<string>
  extension_key: string
  owner_type: string
  owner_id: string
  secret_key: string
  ciphertext: string
  iv: string
  auth_tag: string
  algorithm: string
  key_version: number
  metadata: Generated<JsonValue>
  created_at: Generated<Date | string>
  updated_at: Date | string | null
  _deleted: Generated<boolean>
}

export interface ExtensionsGcsGcFormsCredentialTable {
  id: Generated<string | number>
  agency_id: string | number
  name_en: string
  name_fr: string
  key_id: string
  user_id: string
  form_id: string
  created_at: Generated<Date | string>
  updated_at: Date | string | null
  _deleted: Generated<boolean>
}

export interface UserTable {
  id: Generated<string>
  name: string
  email: string
  emailVerified: boolean
  image?: string
  createdAt: Date
  updatedAt: Date
  _deleted: Generated<boolean>
}

export interface SessionTable {
  id: string
  expiresAt: Date
  token: string
  createdAt: Date
  updatedAt: Date
  userId: string
  ipAddress?: string
  userAgent?: string
}

export interface AccountTable {
  id: string
  accountId: string
  providerId: string
  userId: string
  accessToken?: string
  refreshToken?: string
  idToken?: string
  accessTokenExpiresAt?: Date
  refreshTokenExpiresAt?: Date
  scope?: string
  password?: string
  createdAt: Date
  updatedAt: Date
}

export interface VerificationTable {
  id: string
  identifier: string
  value: string
  expiresAt: Date
  createdAt?: Date
  updatedAt?: Date
}

export interface RoleTable {
  id: Generated<string>
  agency_id?: string
  name_en: string
  name_fr: string
  description_en?: string
  description_fr?: string
  _deleted: Generated<boolean>
}

export interface RolePermissionTable {
  id: Generated<string>
  role_id: string
  subject: 'system' | 'agency' | 'transfer_payment' | 'role' | 'user' | 'agreement' | 'applicant_recipient'
  access_level: 'viewer' | 'contributor' | 'manager' | null
  can_manage_assignments: Generated<boolean>
  _deleted: Generated<boolean>
}

export interface RoleTransferPaymentScopeTable {
  id: Generated<string>
  role_id: string
  transfer_payment_profile_id: string
  _deleted: Generated<boolean>
}

export interface UserRoleAssignmentTable {
  id: Generated<string>
  user_id: string
  role_id: string
  createdAt: Date
  _deleted: Generated<boolean>
}

export interface SecurityAuditEventTable {
  id: Generated<string>
  actor_user_id: string
  event_type:
    | 'role.created'
    | 'role.profile_updated'
    | 'role.deleted'
    | 'role.permission_updated'
    | 'user.created'
    | 'user.profile_updated'
    | 'user.deleted'
    | 'user.activated'
    | 'user.role_assignment_created'
    | 'user.role_assignment_deleted'
  target_type: 'role' | 'user' | 'user_role_assignment'
  target_id: string
  metadata: Generated<JsonValue>
  created_at: Generated<Date>
}

export interface AgencyProfileTable {
  id: Generated<string>
  egcs_ay_gwcoa_number: number
  egcs_ay_agencyfinancialsystemid: string
  egcs_ay_name_en: string
  egcs_ay_name_fr: string
  egcs_ay_abbreviation_en: string
  egcs_ay_abbreviation_fr: string
  egcs_ay_active: Generated<boolean>
  egcs_ay_claimreconciliationstartstatus?: StatusId | null
  egcs_ay_claimreconciliationfinalstatus?: StatusId | null
  _deleted: Generated<boolean>
}

export interface CommonStatusTable {
  id: Generated<StatusId>
  egcs_cn_agency: string
  egcs_cn_name_en: string
  egcs_cn_name_fr: string
  egcs_cn_color: string
  egcs_cn_icon: string
  egcs_cn_readonly: Generated<boolean>
  egcs_cn_terminal: Generated<boolean>
  egcs_cn_isdraft: Generated<boolean>
  _deleted: Generated<boolean>
}

export interface AgencyHoldbackBasisTable {
  id: Generated<string>
  egcs_ay_organizationagency: string
  egcs_ay_languageindependentcode: string
  egcs_ay_name_en: string
  egcs_ay_name_fr: string
  _deleted: Generated<boolean>
}

export interface AgencyCostCategoryTable {
  id: Generated<string>
  egcs_ay_organizationagency: string
  egcs_ay_name_en: string
  egcs_ay_name_fr: string
  _deleted: Generated<boolean>
}

export interface AgencyCostCategoryLineItemTable {
  id: Generated<string>
  egcs_ay_name_en: string
  egcs_ay_name_fr: string
  egcs_ay_organizationcostcategory: string
  _deleted: Generated<boolean>
}

export interface AgencyFiscalYearTable {
  id: Generated<string>
  egcs_ay_organizationagency: string
  egcs_ay_fiscalyeardisplay: string
  egcs_ay_fiscalyear: number
  egcs_ay_startdate: Date
  egcs_ay_enddate: Date
  _deleted: Generated<boolean>
}

export interface AgencyAddressTypeTable {
  id: Generated<string>
  egcs_ay_organizationagency: string
  egcs_ay_typename_en: string
  egcs_ay_typename_fr: string
  _deleted: Generated<boolean>
}

export interface AgencyApplicantRecipientSubtypeTable {
  id: Generated<string>
  egcs_ay_applicantrecipienttype: Applicant_Recipient_Type
  egcs_ay_organizationagency: string
  egcs_ay_description_en: string
  egcs_ay_description_fr: string
  egcs_ay_name_en: string
  egcs_ay_name_fr: string
  _deleted: Generated<boolean>
}

export interface AgencyApprovalBehalfTypeTable {
  id: Generated<string>
  egcs_ay_organizationagency: string
  egcs_ay_name_en: string
  egcs_ay_name_fr: string
  egcs_ay_require_actual: boolean
  _deleted: Generated<boolean>
}

export interface AgencyAgreementTypeTable {
  id: Generated<string>
  egcs_ay_organizationagency: string
  egcs_ay_agreementtype: Agreement_Type
  egcs_ay_name_en: string
  egcs_ay_name_fr: string
  _deleted: Generated<boolean>
}

export interface ApplicantRecipientProfileTable {
  id: Generated<string>
  egcs_ar_description_en?: string | null
  egcs_ar_description_fr?: string | null
  egcs_ar_operatingname_en?: string | null
  egcs_ar_operatingname_fr?: string | null
  egcs_ar_applicantrecipientsubtypes: string
  egcs_ar_leadagency?: string | null
  egcs_ar_legalname_en?: string | null
  egcs_ar_legalname_fr?: string | null
  egcs_ar_researchorganization_en?: string | null
  egcs_ar_researchorganization_fr?: string | null
  egcs_ar_active: Generated<boolean>
  _deleted: Generated<boolean>
}

export interface ApplicantRecipientRegistryTable {
  id: Generated<string>
  egcs_ar_applicantrecipient: string
  egcs_ar_number: string
  egcs_ar_registry: Registry_Type
  egcs_ar_othercomment?: string | null
  _deleted: Generated<boolean>
}

export interface ApplicantRecipientAgencyFinancialIdTable {
  id: Generated<string>
  egcs_ar_applicantrecipient: string
  egcs_ar_agency?: string | null
  egcs_ar_financialsystemid: string
  _deleted: Generated<boolean>
}

export interface ApplicantRecipientOtherNameTable {
  id: Generated<string>
  egcs_ar_othername: string
  egcs_ar_applicantrecipient: string
  _deleted: Generated<boolean>
}

export interface ApplicantRecipientAddressTable {
  id: Generated<string>
  egcs_ar_applicantrecipient: string
  egcs_ar_address: string
  _deleted: Generated<boolean>
}

export interface ApplicantRecipientContactTable {
  id: Generated<string>
  egcs_ar_applicantrecipient: string
  egcs_ar_contact: string
  _deleted: Generated<boolean>
}

export interface ApplicantRecipientFundingHistoryTable {
  id: Generated<string>
  egcs_ar_agencyname_en?: string | null
  egcs_ar_agencyname_fr?: string | null
  egcs_ar_programname_en?: string | null
  egcs_ar_programname_fr?: string | null
  egcs_ar_agreementnumber: string
  egcs_ar_title_en?: string | null
  egcs_ar_title_fr?: string | null
  egcs_ar_description_en?: string | null
  egcs_ar_description_fr?: string | null
  egcs_ar_startdate: Date
  egcs_ar_enddate: Date
  egcs_ar_fundingamount: number
  egcs_ar_currency: Currency_Codes
  _deleted: Generated<boolean>
}

export interface ApplicantRecipientFundingHistoryRecipientTable {
  id: Generated<string>
  egcs_ar_fundinghistory: string
  egcs_ar_applicantrecipient: string
  _deleted: Generated<boolean>
}

export interface CommonPublicationTable {
  id: Generated<string>
  egcs_cn_kind: PublicationKind
  egcs_cn_state: Generated<PublicationState>
  egcs_cn_currentversion: string | null
  _deleted: Generated<boolean>
}

export interface CommonPublicationVersionTable {
  id: Generated<string>
  egcs_cn_publication: string
  egcs_cn_kind: PublicationKind
  egcs_cn_version: number
  egcs_cn_definition: JsonValue
  egcs_cn_hash: string
  egcs_cn_actor: string
  egcs_cn_createdat: Generated<Date>
}

export interface CommonPublicationTransitionTable {
  id: Generated<string>
  egcs_cn_publication: string
  egcs_cn_fromstate: PublicationState
  egcs_cn_tostate: PublicationState
  egcs_cn_publicationversion: string | null
  egcs_cn_actor: string
  egcs_cn_createdat: Generated<Date>
}

export interface CommonPublicationVersionReferenceTable {
  id: Generated<string>
  egcs_cn_parentversion: string
  egcs_cn_path: string
  egcs_cn_order: number | null
  egcs_cn_publication: string
  egcs_cn_kind: PublicationKind
  egcs_cn_publicationversion: string
  egcs_cn_version: number
}

export interface CommonWorkflowPublicationStatusTable {
  id: Generated<string>
  egcs_cn_publicationversion: string
  egcs_cn_status: StatusId
  egcs_cn_role: 'allowed_start' | 'materialization' | 'success' | 'failure' | 'cancellation' | 'execution_failure'
  egcs_cn_order: number
}

export interface CommonPublicationSelectionTable {
  id: Generated<string>
  egcs_cn_publication: string
  egcs_cn_kind: PublicationKind
  egcs_cn_dimension: string
  egcs_cn_key: string
}

export interface CommonPublicationSelectionLockTable {
  egcs_cn_kind: PublicationKind
  egcs_cn_dimension: string
  egcs_cn_key: string
}

export interface CommonRuntimeTable {
  id: Generated<string>
  egcs_cn_kind: RuntimeKind
  egcs_cn_entitytype: Entity_Type
  egcs_cn_entityid: string
  egcs_cn_purpose: Generated<Workflow_Purpose>
  egcs_cn_sourcepublication: string
  egcs_cn_sourcepublicationkind: PublicationKind
  egcs_cn_sourcepublicationversion: string
  egcs_cn_sourceversion: number
  egcs_cn_previousruntime: string | null
  egcs_cn_attempt: Generated<number>
  egcs_cn_initiatedby: string
  egcs_cn_state: Generated<RuntimeState>
  egcs_cn_createdat: Generated<Date>
  egcs_cn_startedat: Date | null
  egcs_cn_updatedat: Generated<Date>
  egcs_cn_completedat: Date | null
  _deleted: Generated<boolean>
}

export interface CommonRuntimeItemTable {
  id: Generated<string>
  egcs_cn_runtime: string
  egcs_cn_parentruntimeitem: string | null
  egcs_cn_kind: RuntimeItemKind
  egcs_cn_order: number
  egcs_cn_publication: string
  egcs_cn_publicationkind: PublicationKind
  egcs_cn_publicationversion: string
  egcs_cn_version: number
  egcs_cn_state: Generated<RuntimeState>
  egcs_cn_createdat: Generated<Date>
  egcs_cn_startedat: Date | null
  egcs_cn_updatedat: Generated<Date>
  egcs_cn_completedat: Date | null
  _deleted: Generated<boolean>
}

export interface CommonRuntimeTransitionTable {
  id: Generated<string>
  egcs_cn_runtime: string
  egcs_cn_runtimeitem: string | null
  egcs_cn_fromstate: RuntimeState
  egcs_cn_tostate: RuntimeState
  egcs_cn_actor: string | null
  egcs_cn_reason: string | null
  egcs_cn_createdat: Generated<Date>
}

export interface CommonContactTable {
  id: Generated<string>
  egcs_cn_title?: string
  egcs_cn_name: string
  egcs_cn_businessphone?: number
  egcs_cn_businessphoneextension?: number
  egcs_cn_generallanguagepreference: Language_Preference
  egcs_cn_jobtitle_en: string
  egcs_cn_jobtitle_fr: string
  egcs_cn_primaryaccount: boolean
  egcs_cn_email: string
  _deleted: Generated<boolean>
}

export interface CommonAddressTable {
  id: Generated<string>
  egcs_cn_federalridingid: number
  egcs_cn_addresscity: string
  egcs_cn_addresscountry: Countries
  egcs_cn_addresssubdivision: string
  egcs_cn_gc_addressid?: number
  egcs_cn_latitude?: number
  egcs_cn_longitude?: number
  egcs_cn_mainphone: number
  egcs_cn_mainphoneextension?: number
  egcs_cn_postalcodezipcode: string
  egcs_cn_street1: string
  egcs_cn_street2?: string
  egcs_cn_street3?: string
  _deleted: Generated<boolean>
}

export interface CommonCompletionTable {
  id: Generated<string>
  egcs_cn_entitytype: Entity_Type
  egcs_cn_entityid: string
  egcs_cn_comments?: string
  egcs_cn_user: string
  egcs_cn_disposition: CompletionDisposition
  egcs_cn_completedat: Generated<Date>
  _deleted: Generated<boolean>
}

export interface CommonEntityTypeTable {
  egcs_cn_type: Entity_Type
  egcs_cn_extensionkey: string | null
  egcs_cn_localtype: string
  egcs_cn_label_en: string
  egcs_cn_label_fr: string
  egcs_cn_completion: Generated<'supported' | 'none'>
  egcs_cn_approvalsubmission: Generated<'explicit' | 'on_completion' | 'none'>
  egcs_cn_standardworkflow: Generated<'explicit' | 'none'>
  egcs_cn_riskrating: Generated<'explicit' | 'none'>
  egcs_cn_supportsdirectreviews: Generated<boolean>
  egcs_cn_ownerkind: 'agreement' | 'proponent' | 'runtime_source' | null
  egcs_cn_assignmentmode: 'independent' | 'inherited' | null
  _deleted: Generated<boolean>
}

export interface CommonCertificationTable {
  id: Generated<string>
  egcs_cn_order: number
  egcs_cn_description_en: string
  egcs_cn_description_fr: string
  egcs_cn_name_en: string
  egcs_cn_name_fr: string
  egcs_cn_optional?: boolean
  egcs_cn_certification_en: string
  egcs_cn_certification_fr: string
  egcs_cn_approvalstep?: string
  egcs_cn_approvaltemplate?: string
  egcs_cn_routingslip?: string
  _deleted: Generated<boolean>
}

export interface CommonApprovalTemplateTable {
  id: Generated<string>
  egcs_cn_publicationkind: Generated<'approval_template'>
  egcs_cn_scopetype: 'fundingopportunity' | 'transferpaymentstream'
  egcs_cn_scopeid: string
  egcs_cn_description_en: string
  egcs_cn_description_fr: string
  egcs_cn_name_en: string
  egcs_cn_name_fr: string
  egcs_cn_allowadditionalapprovals: Generated<boolean>
  egcs_cn_defaultaddedapprovalname_en?: string
  egcs_cn_defaultaddedapprovalname_fr?: string
  egcs_cn_allowaddedapprovalnamechanges: Generated<boolean>
  egcs_cn_allowaddedapprovalcertificationchanges: Generated<boolean>
  _deleted: Generated<boolean>
}

export interface CommonApprovalStepTable {
  id: Generated<string>
  egcs_cn_sequence: number
  egcs_cn_description_en: string
  egcs_cn_description_fr: string
  egcs_cn_name_en: string
  egcs_cn_name_fr: string
  egcs_cn_approvaltemplate: string
  egcs_cn_defaultuser: string
  egcs_cn_approvertitle: string
  _deleted: Generated<boolean>
}

export interface CommonRoutingSlipTable {
  id: Generated<string>
  egcs_cn_entitytype: Entity_Type
  egcs_cn_entityid: string
  egcs_cn_name_en: string
  egcs_cn_name_fr: string
  egcs_cn_approvaltemplate: string
  egcs_cn_allowadditionalapprovals: Generated<boolean>
  egcs_cn_defaultaddedapprovalname_en?: string
  egcs_cn_defaultaddedapprovalname_fr?: string
  egcs_cn_allowaddedapprovalnamechanges: Generated<boolean>
  egcs_cn_allowaddedapprovalcertificationchanges: Generated<boolean>
  egcs_cn_runtimeitem: string
  _deleted: Generated<boolean>
}

export interface CommonApprovalTable {
  id: Generated<string>
  egcs_cn_runtimeitem: string
  egcs_cn_sequence: number
  egcs_cn_name_en: string
  egcs_cn_name_fr: string
  egcs_cn_routingslip: string
  egcs_cn_defaultuser: string
  egcs_cn_assigneduser?: string
  egcs_cn_onbehalf?: string
  egcs_cn_approvalpositiontitle?: string
  egcs_cn_isadded: boolean
  egcs_cn_approvalvalue?: boolean
  egcs_cn_approvaldate?: Date
  egcs_cn_attachment?: string
  egcs_cn_comment?: string
}

export interface CommonApprovalCertificationTable {
  id: Generated<string>
  egcs_cn_optional: boolean
  egcs_cn_certification_en: string
  egcs_cn_certification_fr: string
  egcs_cn_value?: boolean
  egcs_cn_approval: string
}

export interface CommonAssessmentOutcomeTable {
  id: Generated<string>
  egcs_cn_review: string
  egcs_cn_section: string
  egcs_cn_subsection: string
  egcs_cn_name_en: string
  egcs_cn_name_fr: string
  egcs_cn_recommendedstrategy: string
  egcs_cn_accepted: boolean
  egcs_cn_selectedstrategy: string
  egcs_cn_justification?: string
  egcs_cn_comment: string
  _deleted: Generated<boolean>
}

export interface CommonAssessmentCustomOutcomeTable {
  id: Generated<string>
  egcs_cn_name: string
  egcs_cn_outcome: string
  egcs_cn_review: string
  _deleted: Generated<boolean>
}

export interface CommonUserTable {
  id: Generated<string>
  egcs_cn_auth_user_id: string
  egcs_cn_name: string
  egcs_cn_position_title: string
  egcs_cn_email: string
  egcs_cn_email_verified: boolean
  egcs_cn_image?: string
  egcs_cn_created_at: Date
  egcs_cn_updated_at: Date
  _deleted: Generated<boolean>
}

export interface CommonGwcoaTable {
  id: Generated<string>
  egcs_cn_number: number
  egcs_cn_name_en: string
  egcs_cn_name_fr: string
  _deleted: Generated<boolean>
}

export interface CommonEntityTable {
  id: Generated<string>
  egcs_cn_entitytype: Entity_Type
  _deleted: Generated<boolean>
}

export interface CommonExtensionEntityOwnerTable {
  egcs_cn_entityid: string
  egcs_cn_entitytype: Entity_Type
  egcs_cn_ownerid: string
  egcs_cn_ownertype: 'fundingcaseagreement' | 'applicantrecipient'
}

export interface CommonEntityAssignmentTable {
  id: Generated<string>
  egcs_cn_entityid: string
  egcs_cn_entitytype: Entity_Type
  egcs_cn_user: string
  egcs_cn_isprimary: Generated<boolean>
  egcs_cn_createdby: string
  egcs_cn_createdat: Generated<Date>
  _deleted: Generated<boolean>
}

export interface FundingCaseAgreementProfileTable {
  egcs_fc_customfields: Generated<Record<string, string | number | string[]>>
  id: Generated<string>
  egcs_fc_agreementnumber: string
  egcs_fc_transferpaymentstream: string
  egcs_fc_financialsystemnumber: string
  egcs_fc_title_en: string
  egcs_fc_title_fr: string
  egcs_fc_description_en: string
  egcs_fc_description_fr: string
  egcs_fc_agreementtype: Agreement_Type
  egcs_fc_agreementsubtype: string
  egcs_fc_furtherdistribution: boolean
  egcs_fc_holdback: Generated<number>
  egcs_fc_holdbackbasis: string
  egcs_fc_riskscore?: number | null
  egcs_fc_status: StatusId
  egcs_fc_authorizedassistancestartdate: Date
  egcs_fc_authorizedassistanceenddate: Date
  _deleted: Generated<boolean>
}

export interface FundingCaseAgreementAmendmentTable {
  id: Generated<string>
  egcs_fc_fundingagreement: string
  egcs_fc_amendmentnumber: number
  egcs_fc_name_en?: string | null
  egcs_fc_name_fr?: string | null
  egcs_fc_status: StatusId
  egcs_fc_isopen: Generated<boolean>
  egcs_fc_proposedauthorizedassistancestartdate?: Date | null
  egcs_fc_proposedauthorizedassistanceenddate?: Date | null
  _deleted: Generated<boolean>
}

export interface FundingCaseAgreementAmendmentTypeTable {
  id: Generated<string>
  egcs_fc_amendment: string
  egcs_fc_amendmenttype: string
  _deleted: Generated<boolean>
}

export interface FundingCaseAgreementAmendmentSubtypeTable {
  id: Generated<string>
  egcs_fc_amendment: string
  egcs_fc_amendmentsubtype: string
  _deleted: Generated<boolean>
}

export interface FundingCaseAgreementBudgetVersionTable {
  id: Generated<string>
  egcs_fc_fundingagreement: string
  egcs_fc_amendment?: string | null
  egcs_fc_sourceversion?: string | null
  egcs_fc_iscurrent: Generated<boolean>
  _deleted: Generated<boolean>
}

export interface FundingCaseAgreementActivityVersionTable {
  id: Generated<string>
  egcs_fc_fundingagreement: string
  egcs_fc_amendment?: string | null
  egcs_fc_sourceversion?: string | null
  egcs_fc_iscurrent: Generated<boolean>
  _deleted: Generated<boolean>
}

export interface FundingCaseAgreementRevisionTable {
  id: Generated<string>
  egcs_fc_fundingagreement: string
  egcs_fc_amendment?: string | null
  egcs_fc_approvalsubmission: string
  egcs_fc_revisionnumber: number
  egcs_fc_approvedat: Generated<Date>
  _deleted: Generated<boolean>
}

export interface FundingCaseAgreementApprovalSubmissionTable {
  id: Generated<string>
  egcs_fc_fundingagreement: string
  egcs_fc_amendment?: string | null
  egcs_fc_workflowrun: string
  egcs_fc_snapshotschemaversion: number
  egcs_fc_packet: JsonValue
  egcs_fc_canonicalhash: string
  egcs_fc_submittedat: Generated<Date>
}

export interface FundingCaseAgreementApplicantRecipientTable {
  id: Generated<string>
  egcs_fc_fundingagreement: string
  egcs_fc_applicantrecipient: string
  _deleted: Generated<boolean>
}

export interface FundingCaseAgreementAddressTable {
  id: Generated<string>
  egcs_fc_fundingagreement: string
  egcs_fc_addresstype: string
  egcs_fc_address: string
  _deleted: Generated<boolean>
}

export interface FundingCaseAgreementBudgetFiscalYearTable {
  id: Generated<string>
  egcs_fc_fundingagreement: string
  egcs_fc_budgetversion: Generated<string>
  egcs_fc_originalbudgetfiscalyear?: string | null
  egcs_fc_fiscalyear: string
  _deleted: Generated<boolean>
}

export interface FundingCaseAgreementBudgetLineItemTable {
  id: Generated<string>
  egcs_fc_fundingagreement: Generated<string>
  egcs_fc_budgetversion: Generated<string>
  egcs_fc_originalbudgetlineitem?: string | null
  egcs_fc_fundingagreementbudgetfiscalyear: string
  egcs_fc_organizationcostcategory: string
  egcs_fc_costsubsection: string
  egcs_fc_description: string
  egcs_fc_totalamount: number
  egcs_fc_programfunding: number
  egcs_fc_otherfederalfunding?: number | null
  egcs_fc_othergovfunding?: number | null
  egcs_fc_otherfunding?: number | null
  egcs_fc_currency: Currency_Codes
  _deleted: Generated<boolean>
}

export interface FundingCaseAgreementForecastTable {
  id: Generated<string>
  egcs_fc_fundingagreement: string
  egcs_fc_fiscalyear: string
  egcs_fc_status: StatusId
  egcs_fc_active: Generated<boolean>
  _deleted: Generated<boolean>
}

export interface FundingCaseAgreementForecastLineItemTable {
  id: Generated<string>
  egcs_fc_agreementforecast: string
  egcs_fc_fundingagreement: Generated<string>
  egcs_fc_fundingagreementbudgetlineitem: string
  egcs_fc_month: number
  egcs_fc_amount: number
  egcs_fc_currency: Currency_Codes
  egcs_fc_version: string
  _deleted: Generated<boolean>
}

export interface FundingCaseAgreementClaimTable {
  id: Generated<string>
  egcs_fc_fundingagreement: string
  egcs_fc_fiscalyear: string
  egcs_fc_isfinalforyear: boolean
  egcs_fc_periodend: number
  egcs_fc_periodstart: number
  egcs_fc_receiveddate: Date
  egcs_fc_gcformssubmissionuuid?: string | null
  egcs_fc_status: StatusId
  _deleted: Generated<boolean>
}

export interface FundingCaseAgreementClaimLineItemTable {
  id: Generated<string>
  egcs_fc_fundingagreementclaim: string
  egcs_fc_fundingagreement: Generated<string>
  egcs_fc_fundingagreementbudgetlineitem?: string | null
  egcs_fc_submittedcostcategory?: string | null
  egcs_fc_submittedcostsubsection?: string | null
  egcs_fc_submittedlineitem?: string | null
  egcs_fc_description: string
  egcs_fc_amount: number
  egcs_fc_currency: Currency_Codes
  _deleted: Generated<boolean>
}

export interface FundingCaseAgreementClaimReconcileTable {
  id: Generated<string>
  egcs_fc_fundingagreementclaim: string
  egcs_fc_user: string
  egcs_fc_status: StatusId
  egcs_fc_isfinal: boolean
  egcs_fc_isopen: Generated<boolean>
  _deleted: Generated<boolean>
}

export interface FundingCaseAgreementClaimReconcileLineItemTable {
  id: Generated<string>
  egcs_fc_fundingagreementclaimreconcile: string
  egcs_fc_fundingagreementclaim: Generated<string>
  egcs_fc_lineitem: string
  egcs_fc_reconciled: number
  egcs_fc_sampled?: number | null
  egcs_fc_rationale?: string | null
  _deleted: Generated<boolean>
}

export interface FundingCaseAgreementCommitmentTable {
  id: Generated<string>
  egcs_fc_fundingagreement: string
  egcs_fc_transferpaymentstream: Generated<string>
  egcs_fc_type: string
  egcs_fc_status: StatusId
  egcs_fc_financialsystemnumber?: string | null
  egcs_fc_active: Generated<boolean>
  _deleted: Generated<boolean>
}

export interface FundingCaseAgreementCommitmentLineTable {
  id: Generated<string>
  egcs_fc_commitment: string
  egcs_fc_fundingagreement: Generated<string>
  egcs_fc_transferpaymentstream: Generated<string>
  egcs_fc_commitmentlinenumber: number
  egcs_fc_transferpaymentstreamchartofaccount: string
  egcs_fc_amount: number
  _deleted: Generated<boolean>
}

export interface FundingCaseAgreementPaymentTable {
  id: Generated<string>
  egcs_fc_fundingagreementcommitment: string
  egcs_fc_fundingagreement: Generated<string>
  egcs_fc_fiscalyear: string
  egcs_fc_paymenttype: Payment_Type
  egcs_fc_periodstart: number
  egcs_fc_periodend: number
  egcs_fc_paymentamount: number
  egcs_fc_currency: Currency_Codes
  egcs_fc_comment?: string | null
  egcs_fc_status: StatusId
  _deleted: Generated<boolean>
}

export interface FundingCaseAgreementPaymentLineTable {
  id: Generated<string>
  egcs_fc_fundingagreementpayment: string
  egcs_fc_fundingagreementcommitment: Generated<string>
  egcs_fc_fundingagreementcommitmentline: string
  egcs_fc_amount: number
  _deleted: Generated<boolean>
}

export interface FundingCaseAgreementMonitorTable {
  id: Generated<string>
  egcs_fc_fundingagreement: string
  egcs_fc_type: string
  egcs_fc_onsite: boolean
  egcs_fc_tentativefiscalyear: string
  egcs_fc_tentativequarter: number
  egcs_fc_status: StatusId
  _deleted: Generated<boolean>
}

export interface FundingCaseAgreementMonitorPlanningTable {
  id: Generated<string>
  egcs_fc_fundingagreementmonitor: string
  egcs_fc_objective: string
  _deleted: Generated<boolean>
}

export interface FundingCaseAgreementMonitorItemsTable {
  id: Generated<string>
  egcs_fc_fundingagreementmonitor: string
  egcs_fc_item: string
  egcs_fc_plannedstart: Date
  egcs_fc_plannedend: Date
  egcs_fc_detail: string
  egcs_fc_monitored: boolean
  egcs_fc_actualstart?: Date | null
  egcs_fc_actualend?: Date | null
  _deleted: Generated<boolean>
}

export interface FundingCaseAgreementMonitorFindingTable {
  id: Generated<string>
  egcs_fc_fundingagreementmonitor: string
  egcs_fc_findingname: string
  egcs_fc_recommendationtype: Monitor_Action_Type
  egcs_fc_responsibleparty: Monitor_Responsible_Party
  egcs_fc_detail: string
  _deleted: Generated<boolean>
}

export interface FundingCaseAgreementMonitorFollowupTable {
  id: Generated<string>
  egcs_fc_fundingagreementmonitor: string
  egcs_fc_followupname: string
  egcs_fc_responsibleparty: Monitor_Responsible_Party
  egcs_fc_status: Follow_Up_Status
  egcs_fc_duedate: Date
  _deleted: Generated<boolean>
}

export interface FundingCaseAgreementMonitorFollowupUpdateTable {
  id: Generated<string>
  egcs_fc_fundingagreementmonitorfollowup: string
  egcs_fc_update: string
  egcs_fc_status: Follow_Up_Status
  egcs_fc_updatedate: Date
  _deleted: Generated<boolean>
}

export interface FundingCaseAgreementMonitorPromisingPracticeTable {
  id: Generated<string>
  egcs_fc_fundingagreementmonitor: string
  egcs_fc_practice: string
  _deleted: Generated<boolean>
}

export interface FundingCaseAgreementActivityTable {
  id: Generated<string>
  egcs_fc_fundingagreement: string
  egcs_fc_activityversion: Generated<string>
  egcs_fc_description_en: string
  egcs_fc_description_fr: string
  egcs_fc_startdate: Date
  egcs_fc_enddate: Date
  egcs_fc_expectedresults_en: string
  egcs_fc_expectedresults_fr: string
  egcs_fc_name_en: string
  egcs_fc_name_fr: string
  _deleted: Generated<boolean>
}

export interface FundingCaseAgreementOutcomeActivityTable {
  id: Generated<string>
  egcs_fc_outcomes: string
  egcs_fc_activity: string
  _deleted: Generated<boolean>
}

export interface FundingCaseAgreementResponsiblePartyActivityTable {
  id: Generated<string>
  egcs_fc_responsibleparty: string
  egcs_fc_activity: string
  _deleted: Generated<boolean>
}

export interface CommonAdditionalReviewersTable {
  id: Generated<string>
  egcs_cn_entitytype: Entity_Type
  egcs_cn_entityid: string
  egcs_cn_comments?: string
  egcs_cn_user: string
  egcs_cn_completedat?: Date | null
  _deleted: Generated<boolean>
}

export interface CommonReviewSchemaTable {
  id: Generated<string>
  egcs_cn_publicationkind: Generated<'review_schema'>
  egcs_cn_reviewtype: Review_Type
  egcs_cn_agency: string
  egcs_cn_entitytype: Entity_Type
  egcs_cn_name_en: string
  egcs_cn_name_fr: string
  egcs_cn_outcomename_en: string
  egcs_cn_outcomename_fr: string
  egcs_cn_disablecustomoutcomes: boolean
  egcs_cn_disablealignment: boolean
  egcs_cn_disablereviewers: boolean
  egcs_cn_scoringmatrix: JsonValue | null
  egcs_cn_assessmentschema: JsonValue | null
  _deleted: Generated<boolean>
}

export interface CommonAssessmentSchemaTable {
  id: Generated<string>
  egcs_cn_reviewschema: string
  egcs_cn_scoringmatrix?: JsonValue | null
  egcs_cn_assessmentschema?: JsonValue | null
  egcs_cn_outcomename_en: string
  egcs_cn_outcomename_fr: string
  egcs_cn_disablecustomoutcomes: Generated<boolean>
  egcs_cn_disablealignment: Generated<boolean>
  _deleted: Generated<boolean>
}

export interface CommonChecklistSchemaTable {
  id: Generated<string>
  egcs_cn_reviewschema: string
  egcs_cn_checklistschema?: JsonValue | null
  _deleted: Generated<boolean>
}

export interface CommonReviewSetSetupTable {
  id: Generated<string>
  egcs_cn_publicationkind: Generated<'review_set_setup'>
  egcs_cn_scopetype: CommonScopeEntityType
  egcs_cn_scopeid: string
  egcs_cn_entitytype: Entity_Type
  egcs_cn_name_en: string
  egcs_cn_name_fr: string
  egcs_cn_description_en: Generated<string>
  egcs_cn_description_fr: Generated<string>
  egcs_cn_order: number
  egcs_cn_sequential: boolean
  egcs_cn_approvaltemplate?: string
  _deleted: Generated<boolean>
}

export interface CommonReviewSetupTable {
  id: Generated<string>
  egcs_cn_entitytype: Entity_Type
  egcs_cn_order: number
  egcs_cn_reviewset: string
  egcs_cn_approvaltemplate?: string
  egcs_cn_reviewschema: string
  egcs_cn_failonchecklistfailure: Generated<boolean>
  egcs_cn_failurethreshold: number | null
  _deleted: Generated<boolean>
}

export type CommonScopeEntityType =
  'fundingopportunity'
  | 'fundingcaseintake'
  | 'fundingcaseagreement'
  | 'applicantrecipient'
  | 'transferpaymentstream'

export interface CommonReviewSetTable {
  id: Generated<string>
  egcs_cn_reviewsetsetup: string
  egcs_cn_entitytype: Entity_Type
  egcs_cn_entityid: string
  egcs_cn_runtimeitem: string
  _deleted: Generated<boolean>
}

export interface CommonReviewTable {
  id: Generated<string>
  egcs_cn_helpers?: JsonValue
  egcs_cn_reviewresult: number | null
  egcs_cn_reviewset: string
  egcs_cn_reviewschema: string
  egcs_cn_runtimeitem: string
  egcs_cn_disablecustomoutcomes: boolean
  egcs_cn_disablealignment: boolean
  egcs_cn_disablereviewers: boolean
  egcs_cn_failonchecklistfailure: Generated<boolean>
  egcs_cn_failurethreshold: Generated<number | null>
  egcs_cn_reviewalignment?: boolean | null
  egcs_cn_reviewalignresult?: number | null
  egcs_cn_reviewalignmentnarrative?: string | null
  _deleted: Generated<boolean>
}

export interface CommonAssessmentTable {
  id: Generated<string>
  egcs_cn_review: string
  egcs_cn_reviewresult: number
  egcs_cn_disablecustomoutcomes: Generated<boolean>
  egcs_cn_disablealignment: Generated<boolean>
  egcs_cn_reviewalignment?: boolean | null
  egcs_cn_reviewalignresult?: number | null
  egcs_cn_reviewalignmentnarrative?: string | null
  _deleted: Generated<boolean>
}

export interface CommonChecklistTable {
  id: Generated<string>
  egcs_cn_review: string
  egcs_cn_result?: Checklist_Result | null
  egcs_cn_evaluationtrace?: JsonValue | null
  _deleted: Generated<boolean>
}

export interface CommonReviewResponseTable {
  id: Generated<string>
  egcs_cn_section: string
  egcs_cn_subsection: string
  egcs_cn_question: string
  egcs_cn_value?: number | null
  egcs_cn_comment: string
  egcs_cn_calculated: Generated<boolean>
  egcs_cn_assessment: string
  _deleted: Generated<boolean>
}

export interface CommonAssessmentResponseTable {
  id: Generated<string>
  egcs_cn_assessment: string
  egcs_cn_section: string
  egcs_cn_subsection: string
  egcs_cn_question: string
  egcs_cn_value?: number | null
  egcs_cn_comment: Generated<string>
  egcs_cn_calculated: Generated<boolean>
  _deleted: Generated<boolean>
}

export interface CommonChecklistResponseTable {
  id: Generated<string>
  egcs_cn_checklist: string
  egcs_cn_section: string
  egcs_cn_question: string
  egcs_cn_answer: Checklist_Answer
  egcs_cn_comment: Generated<string>
  _deleted: Generated<boolean>
}

export interface CommonRecommendationSchemaTable {
  id: Generated<string>
  egcs_cn_publicationkind: Generated<'recommendation_schema'>
  egcs_cn_agency: string
  egcs_cn_name_en: string
  egcs_cn_name_fr: string
  egcs_cn_result: JsonValue
  egcs_cn_recommendationschema: JsonValue
  _deleted: Generated<boolean>
}

export interface CommonRecommendationSetSetupTable {
  id: Generated<string>
  egcs_cn_publicationkind: Generated<'recommendation_set_setup'>
  egcs_cn_scopetype: CommonScopeEntityType
  egcs_cn_scopeid: string
  egcs_cn_name_en: string
  egcs_cn_name_fr: string
  egcs_cn_description_en: string
  egcs_cn_description_fr: string
  egcs_cn_approvaltemplate?: string
  _deleted: Generated<boolean>
}

export interface CommonRecommendationSetupTable {
  id: Generated<string>
  egcs_cn_order: number
  egcs_cn_recommendationset: string
  egcs_cn_approvaltemplate?: string
  egcs_cn_recommendationschema: string
  egcs_cn_failonnotrecommended: Generated<boolean>
  _deleted: Generated<boolean>
}

export interface CommonRecommendationSetTable {
  id: Generated<string>
  egcs_cn_recommendationsetsetup: string
  egcs_cn_entitytype: Entity_Type
  egcs_cn_entityid: string
  egcs_cn_runtimeitem: string
  _deleted: Generated<boolean>
}

export interface CommonRecommendationTable {
  id: Generated<string>
  egcs_cn_recommendationset: string
  egcs_cn_recommendationsetup: string
  egcs_cn_entitytype: Entity_Type
  egcs_cn_entityid: string
  egcs_cn_runtimeitem: string
  egcs_cn_recommendation?: number | null
  egcs_cn_response: JsonValue
  egcs_cn_resultoptionkey?: string | null
  egcs_cn_outcome?: Recommendation_Outcome | null
  egcs_cn_revision: Generated<number>
  _deleted: Generated<boolean>
}

export interface CommonWorkflowSetupTable {
  id: Generated<string>
  egcs_cn_publicationkind: Generated<'workflow_setup'>
  egcs_cn_scopetype: CommonScopeEntityType
  egcs_cn_scopeid: string
  egcs_cn_entitytype: Entity_Type
  egcs_cn_name_en: string
  egcs_cn_name_fr: string
  egcs_cn_description_en: string
  egcs_cn_description_fr: string
  egcs_cn_purpose: Generated<Workflow_Purpose>
  egcs_cn_cancellationstatus: StatusId
  egcs_cn_executionfailurestatus: StatusId
  egcs_cn_allowretry: Generated<boolean>
  _deleted: Generated<boolean>
}

export interface CommonWorkflowSetupAllowedStartStatusTable {
  id: Generated<string>
  egcs_cn_workflowsetup: string
  egcs_cn_status: StatusId
  egcs_cn_order: number
  _deleted: Generated<boolean>
}

export interface CommonWorkflowSetupMemberTable {
  id: Generated<string>
  egcs_cn_workflowsetup: string
  egcs_cn_sequence: number
  egcs_cn_kind: Workflow_Setup_Member_Kind
  egcs_cn_reviewset?: string | null
  egcs_cn_recommendationset?: string | null
  egcs_cn_approvaltemplate?: string | null
  egcs_cn_materializationstatus?: StatusId | null
  egcs_cn_successstatus?: StatusId | null
  egcs_cn_failurestatus?: StatusId | null
  egcs_cn_allowownerredirect: Generated<boolean>
  _deleted: Generated<boolean>
}

export interface CommonWorkflowSetupMemberOwnerTable {
  id: Generated<string>
  egcs_cn_workflowsetupmember: string
  egcs_cn_reviewsetup?: string | null
  egcs_cn_recommendationsetup?: string | null
  egcs_cn_defaultowner?: string | null
  _deleted: Generated<boolean>
}

export interface CommonWorkflowRunTable {
  egcs_cn_routing?: JsonValue | null
  id: string
  egcs_cn_completion?: string | null
}

export interface CommonWorkflowStatusTransitionTable {
  id: Generated<string>
  egcs_cn_workflowrun: string
  egcs_cn_workflowitem?: string | null
  egcs_cn_event: Workflow_Transition_Event
  egcs_cn_previousstatus: StatusId
  egcs_cn_newstatus: StatusId
  egcs_cn_actor?: string | null
  egcs_cn_createdat: Generated<Date>
}

export interface CommonWorkflowOwnerBlockerTable {
  id: Generated<string>
  egcs_cn_workflowrun: string
  egcs_cn_workflowsetupmember: string
  egcs_cn_reviewsetup?: string | null
  egcs_cn_recommendationsetup?: string | null
  egcs_cn_configuredowner?: string | null
  egcs_cn_reason: string
  egcs_cn_triggeredby?: string | null
  egcs_cn_replacementowner?: string | null
  egcs_cn_resolvedby?: string | null
  egcs_cn_createdat: Generated<Date>
  egcs_cn_resolvedat?: Date | null
  _deleted: Generated<boolean>
}

export interface CommonAttachmentTypesTable {
  id: Generated<string>
  egcs_cn_agency: string
  egcs_cn_name_en: string
  egcs_cn_name_fr: string
  egcs_cn_description_en: string
  egcs_cn_description_fr: string
  _deleted: Generated<boolean>
}

export interface CommonAttachmentTable {
  id: Generated<string>
  egcs_cn_attachmenttype: string
  egcs_cn_name_en: string
  egcs_cn_name_fr: string
  egcs_cn_description_en: string
  egcs_cn_description_fr: string
  egcs_cn_filename: string
  egcs_cn_provider: string
  egcs_cn_providerobjectid: string
  egcs_cn_providerlocator: JsonValue
  egcs_cn_providermetadata?: JsonValue | null
  egcs_cn_metadatapersistence?: 'host' | 'provider' | null
  egcs_cn_metadatacontractversion?: number | null
  egcs_cn_mimetype: string
  egcs_cn_createdat: Date
  egcs_cn_filesize: number
  _deleted: Generated<boolean>
}

export interface CommonEntityAttachmentTable {
  id: Generated<string>
  egcs_cn_attachment: string
  egcs_cn_entityid: string
  egcs_cn_entitytype: string
  egcs_cn_uploadedby: string
  egcs_cn_createdat: Generated<Date>
  egcs_cn_updatedat?: Date | null
  _deleted: Generated<boolean>
}

export interface StorageCleanupOutboxTable {
  id: Generated<string>
  provider_key: string
  agency_id: string
  purpose: string
  object_id: string
  locator: JsonValue
  operation: Generated<'delete_object' | 'restore_metadata'>
  payload?: JsonValue | null
  status: Generated<'pending' | 'processing' | 'completed' | 'dead_letter'>
  attempt_count: Generated<number>
  next_attempt_at: Generated<Date>
  lease_owner?: string | null
  lease_expires_at?: Date | null
  last_error?: string | null
  created_at: Generated<Date>
  updated_at: Generated<Date>
  completed_at?: Date | null
}

export interface TransferPaymentProfileTable {
  id: Generated<string>
  egcs_tp_agency: string
  egcs_tp_datestart: Date
  egcs_tp_dateend: Date
  egcs_tp_name_en: string
  egcs_tp_name_fr: string
  egcs_tp_abbreviation_en: string
  egcs_tp_abbreviation_fr: string
  egcs_tp_description_en: string
  egcs_tp_description_fr: string
  egcs_tp_purpose_en: string
  egcs_tp_purpose_fr: string
  egcs_tp_tclink: string
  egcs_tp_active: Generated<boolean>
  _deleted: Generated<boolean>
}

export interface TransferPaymentFiscalYearBudgetTable {
  id: Generated<string>
  egcs_tp_transferpaymentprofile: string
  egcs_tp_fiscalyear: string
  egcs_tp_totalbudget: number
  egcs_tp_overcommitthreshold: number
  _deleted: Generated<boolean>
}

export interface TransferPaymentStreamTable {
  id: Generated<string>
  egcs_tp_transferpaymentprofile: string
  egcs_tp_parentstream: string | null
  egcs_tp_name_en: string
  egcs_tp_name_fr: string
  egcs_tp_description_en: string
  egcs_tp_description_fr: string
  egcs_tp_abbreviation_en: string
  egcs_tp_abbreviation_fr: string
  egcs_tp_objective_en: string
  egcs_tp_objective_fr: string
  egcs_tp_allowsfurtherdistribution: Generated<boolean>
  egcs_tp_active: Generated<boolean>
  _deleted: Generated<boolean>
}

export interface TransferPaymentStreamHoldbackBasisTable {
  id: Generated<string>
  egcs_tp_transferpaymentstream: string
  egcs_tp_agencyholdback: string
  egcs_tp_name_en: string
  egcs_tp_name_fr: string
  _deleted: Generated<boolean>
}

export type TransferPaymentDocumentTemplateEntityType = 'fundingcaseagreement' | 'fundingcaseagreementcloseout'
export type TransferPaymentDocumentTemplateKind = 'docx' | 'html'
export type TransferPaymentDocumentTemplateOutputFormat = 'docx' | 'html' | 'pdf'

export interface TransferPaymentStreamDocumentTemplateTable {
  id: Generated<string>
  egcs_tp_transferpaymentstream: string
  egcs_tp_entitytype: TransferPaymentDocumentTemplateEntityType
  egcs_tp_name_en: string
  egcs_tp_name_fr: string
  egcs_tp_description_en: string
  egcs_tp_description_fr: string
  egcs_tp_templateattachment_en: string
  egcs_tp_templateattachment_fr: string
  egcs_tp_templatekind: TransferPaymentDocumentTemplateKind
  egcs_tp_outputformats: TransferPaymentDocumentTemplateOutputFormat[]
  egcs_tp_active: Generated<boolean>
  _deleted: Generated<boolean>
}

export interface FundingCaseAgreementGeneratedDocumentTable {
  id: Generated<string>
  egcs_fc_fundingagreement: string
  egcs_fc_closeout?: string | null
  egcs_fc_documenttemplate: string
  egcs_fc_generatedattachment: string
  egcs_fc_language: Language_Preference
  egcs_fc_name_en: string
  egcs_fc_name_fr: string
  egcs_fc_outputformat: TransferPaymentDocumentTemplateOutputFormat
  egcs_fc_generatedat: Date
  _deleted: Generated<boolean>
}

export interface FundingCaseAgreementCloseoutTable {
  id: Generated<string>
  egcs_fc_fundingagreement: string
  egcs_fc_closeoutnumber: number
  egcs_fc_status: StatusId
  egcs_fc_isopen: Generated<boolean>
  _deleted: Generated<boolean>
}

export interface FundingCaseAgreementCloseoutSnapshotTable {
  id: Generated<string>
  egcs_fc_fundingagreement: string
  egcs_fc_closeout: string
  egcs_fc_workflowrun: string
  egcs_fc_snapshotschemaversion: number
  egcs_fc_packet: JsonValue
  egcs_fc_canonicalhash: string
  egcs_fc_capturedat: Generated<Date>
}

export interface TransferPaymentFinancialLimitsTable {
  id: Generated<string>
  egcs_tp_transferpaymentstream: string
  egcs_tp_maxallowableperrecipient: number
  egcs_tp_maxpercentofsupportavailableperrecipient: number
  egcs_tp_maxpercentofretroactivecostsallowable: number
  egcs_tp_stackinglimit: number
  egcs_tp_active: Generated<boolean>
  _deleted: Generated<boolean>
}

export interface TransferPaymentObjectiveTable {
  id: Generated<string>
  egcs_tp_transferpaymentprofile: string
  egcs_tp_objective_en: string
  egcs_tp_objective_fr: string
  _deleted: Generated<boolean>
}

export interface TransferPaymentStreamBudgetTable {
  id: Generated<string>
  egcs_tp_transferpaymentstream: string
  egcs_tp_totalbudget: number
  egcs_tp_transferpaymentbudget: string
  egcs_tp_overcommitthreshold: number
  _deleted: Generated<boolean>
}

export interface TransferPaymentStreamEligibleRecipientTable {
  id: Generated<string>
  egcs_tp_transferpaymentstream: string
  egcs_tp_applicantrecipientsubtype: string
  _deleted: Generated<boolean>
}

export interface TransferPaymentStreamCostCategoryLineItemTable {
  id: Generated<string>
  egcs_tp_transferpaymentstream: string
  egcs_tp_organizationcostcategory: string
  egcs_tp_costsharingratio: number
  _deleted: Generated<boolean>
}

export interface TransferPaymentOutcomeTable {
  id: Generated<string>
  egcs_tp_transferpaymentprofile: string
  egcs_tp_name_en: string
  egcs_tp_name_fr: string
  egcs_tp_description_en: string
  egcs_tp_description_fr: string
  _deleted: Generated<boolean>
}

export interface TransferPaymentOutcomePerformanceIndicatorTable {
  id: Generated<string>
  egcs_tp_transferpaymentoutcome: string
  egcs_tp_name_en: string
  egcs_tp_name_fr: string
  egcs_tp_description_en: string
  egcs_tp_description_fr: string
  _deleted: Generated<boolean>
}

export interface TransferPaymentStreamOutcomeTable {
  id: Generated<string>
  egcs_tp_transferpaymentstream: string
  egcs_tp_transferpaymentoutcome: string
  _deleted: Generated<boolean>
}

export interface TransferPaymentAmendmentTypeTable {
  id: Generated<string>
  egcs_tp_amended: Amended_Type
  egcs_tp_name_en: string
  egcs_tp_name_fr: string
  egcs_tp_requiresamendmentsubtype: Generated<boolean>
  egcs_tp_transferpaymentstream: string
  _deleted: Generated<boolean>
}

export interface TransferPaymentAmendmentSubtypeTable {
  id: Generated<string>
  egcs_tp_name_en: string
  egcs_tp_name_fr: string
  egcs_tp_description_en: string
  egcs_tp_description_fr: string
  egcs_tp_transferpaymentstream: string
  _deleted: Generated<boolean>
}

export interface TransferPaymentAmendmentSubtypeTypeTable {
  id: Generated<string>
  egcs_tp_amendmentsubtype: string
  egcs_tp_amendmenttype: string
  _deleted: Generated<boolean>
}

export interface TransferPaymentAgreementSubtypeTable {
  id: Generated<string>
  egcs_tp_agreementtype: string
  egcs_tp_transferpaymentstream: string
  _deleted: Generated<boolean>
}

export interface TransferPaymentStreamChartOfAccountTable {
  id: Generated<string>
  egcs_tp_streambudget: string
  egcs_tp_accountingdimensions: JsonValue
  egcs_tp_transferpaymentstream: string
  _deleted: Generated<boolean>
}

export interface TransferPaymentStreamCommitmentTypeTable {
  id: Generated<string>
  egcs_tp_name_en: string
  egcs_tp_name_fr: string
  egcs_tp_transferpaymentstream: string
  _deleted: Generated<boolean>
}

export interface TransferPaymentMonitorTypeTable {
  id: Generated<string>
  egcs_tp_name_en: string
  egcs_tp_name_fr: string
  egcs_tp_transferpaymentstream: string
  _deleted: Generated<boolean>
}

export interface TransferPaymentStreamAreaOfExpertiseTable {
  id: Generated<string>
  egcs_tp_transferpaymentstream: string
  egcs_tp_name_en: string
  egcs_tp_name_fr: string
  egcs_tp_description_en: string
  egcs_tp_description_fr: string
  _deleted: Generated<boolean>
}

export interface TransferPaymentStreamRiskRatingTable {
  id: Generated<string>
  egcs_tp_transferpaymentstream: string
  egcs_tp_riskscore: number
  egcs_tp_name_en: string
  egcs_tp_name_fr: string
  _deleted: Generated<boolean>
}

export type DBTable<T> = T

export interface TransferPaymentStreamFieldSectionTable {
  id: Generated<string>
  egcs_tp_transferpaymentstream: string
  name_en: string
  name_fr: string
  display_order: Generated<number>
  _deleted: Generated<boolean>
}
export interface TransferPaymentStreamFieldTable {
  section_id: string
  id: Generated<string>
  egcs_tp_transferpaymentstream: string
  name_en: string
  name_fr: string
  kind: 'text' | 'number' | 'relational'
  multiple: Generated<boolean>
  presentation: Generated<'single_line' | 'multiline'>
  required: Generated<boolean>
  discriminator: Generated<boolean>
  active: Generated<boolean>
  display_order: Generated<number>
  _deleted: Generated<boolean>
}
export interface TransferPaymentStreamFieldOptionTable {
  id: Generated<string>
  field_id: string
  name_en: string
  name_fr: string
  category_en: string | null
  category_fr: string | null
  active: Generated<boolean>
  display_order: Generated<number>
  _deleted: Generated<boolean>
}

export interface WorkflowMemberConditionTable {
  id: Generated<string>
  member_id: string
  field_id: string
  option_id: string
  _deleted: Generated<boolean>
}
export interface WorkflowPublicationConditionTable extends WorkflowMemberConditionTable {
  version_id: string
}
