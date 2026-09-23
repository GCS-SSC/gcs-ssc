import type { Database, HostManagedExtensionsDatabase } from '../../shared/types/database'

/**
 * Single ownership inventory for SQL access and committed row evidence.
 * Relationships describe ownership, not every FK (a reference to a user/status is not ownership).
 * Never cache resolved ownership across statements or infer historical evidence from this registry.
 */
export type AuditOwnershipRule =
  | { readonly kind: 'stored-audience' }
  | { readonly kind: 'global'; readonly reason: string }
  | { readonly kind: 'agency'; readonly column: string }
  | { readonly kind: 'actor-agencies'; readonly whenActorMissing?: 'global' | 'maintenance-global' }
  | { readonly kind: 'parent'; readonly column: string; readonly table: string; readonly targetColumn: string }
  | { readonly kind: 'encoded-entity'; readonly column: string; readonly dimensionColumn: string; readonly segments: Readonly<Record<string, number>> }
  | { readonly kind: 'entity'; readonly idColumn: string; readonly typeColumn: string }
  | { readonly kind: 'switch'; readonly column: string; readonly cases: Readonly<Record<string, AuditOwnershipRule>> }
  | { readonly kind: 'references'; readonly links: readonly { table: string; column: string }[] }
  | { readonly kind: 'first'; readonly rules: readonly AuditOwnershipRule[] }

const global = (reason: string): AuditOwnershipRule => ({ kind: 'global', reason })
const agency = (column: string): AuditOwnershipRule => ({ kind: 'agency', column })
const parent = (column: string, table: string, targetColumn = 'id'): AuditOwnershipRule => ({ kind: 'parent', column, table, targetColumn })
const entity = (idColumn: string, typeColumn: string): AuditOwnershipRule => ({ kind: 'entity', idColumn, typeColumn })
const actorAgencies: AuditOwnershipRule = { kind: 'actor-agencies' }

const publicationOwner: AuditOwnershipRule = {
  kind: 'switch', column: 'egcs_cn_kind', cases: {
    review_schema: parent('id', 'public.Common_Review_Schema'),
    review_set_setup: parent('id', 'public.Common_Review_Set_Setup'),
    recommendation_schema: parent('id', 'public.Common_Recommendation_Schema'),
    recommendation_set_setup: parent('id', 'public.Common_Recommendation_Set_Setup'),
    approval_template: parent('id', 'public.Common_Approval_Template'),
    workflow_setup: parent('id', 'public.Common_Workflow_Setup')
  }
}

type CoreTable = Exclude<keyof Database, `extensions.${string}`> | keyof HostManagedExtensionsDatabase
type QualifiedCoreTable = { [Table in CoreTable]: Table extends `${string}.${string}` ? Table : `public.${Table}` }[CoreTable]

export const AUDIT_TABLE_OWNERSHIP: Readonly<Record<string, AuditOwnershipRule>> = {
  'public.Agency_Address_Type': parent('egcs_ay_organizationagency', 'public.Agency_Profile'),
  'public.Agency_Agreement_Type': parent('egcs_ay_organizationagency', 'public.Agency_Profile'),
  'public.Agency_Custom_Field': parent('egcs_ay_agency', 'public.Agency_Profile'),
  'public.Agency_Custom_Field_Option': parent('egcs_ay_field', 'public.Agency_Custom_Field'),
  'public.Agency_Applicant_Recipient_Subtype': parent('egcs_ay_organizationagency', 'public.Agency_Profile'),
  'public.Agency_Approval_Behalf_Type': parent('egcs_ay_organizationagency', 'public.Agency_Profile'),
  'public.Agency_Cost_Category': parent('egcs_ay_organizationagency', 'public.Agency_Profile'),
  'public.Agency_Cost_Category_Line_Item': parent('egcs_ay_organizationcostcategory', 'public.Agency_Cost_Category'),
  'public.Agency_Fiscal_Year': parent('egcs_ay_organizationagency', 'public.Agency_Profile'),
  'public.Agency_Holdback_Basis': parent('egcs_ay_organizationagency', 'public.Agency_Profile'),
  'public.Agency_Profile': agency('id'),
  'public.Applicant_Recipient_Address': parent('egcs_ar_applicantrecipient', 'public.Applicant_Recipient_Profile'),
  'public.Applicant_Recipient_Agency_Financial_Id': parent('egcs_ar_agency', 'public.Agency_Profile'),
  'public.Applicant_Recipient_Contact': parent('egcs_ar_applicantrecipient', 'public.Applicant_Recipient_Profile'),
  'public.Applicant_Recipient_Funding_History': actorAgencies,
  'public.Applicant_Recipient_Funding_History_Recipient': parent('egcs_ar_applicantrecipient', 'public.Applicant_Recipient_Profile'),
  'public.Applicant_Recipient_Other_Name': parent('egcs_ar_applicantrecipient', 'public.Applicant_Recipient_Profile'),
  'public.Applicant_Recipient_Note': agency('egcs_ar_agency'),
  'public.Applicant_Recipient_Profile': actorAgencies,
  'public.Applicant_Recipient_Registry': parent('egcs_ar_applicantrecipient', 'public.Applicant_Recipient_Profile'),
  'public.Common_Additional_Reviewers': entity('egcs_cn_entityid', 'egcs_cn_entitytype'),
  'public.Common_Group': agency('egcs_cn_agency'),
  'public.Common_Group_Member': parent('egcs_cn_group', 'public.Common_Group'),
  'public.Common_Address': { kind: 'references', links: [
    { table: 'public.Applicant_Recipient_Address', column: 'egcs_ar_address' },
    { table: 'public.Funding_Case_Agreement_Address', column: 'egcs_fc_address' }
  ] },
  'public.Common_Approval': parent('egcs_cn_routingslip', 'public.Common_Routing_Slip'),
  'public.Common_Approval_Certification': parent('egcs_cn_approval', 'public.Common_Approval'),
  'public.Common_Approval_Step': parent('egcs_cn_approvaltemplate', 'public.Common_Approval_Template'),
  'public.Common_Approval_Template': parent('egcs_cn_agency', 'public.Agency_Profile'),
  'public.Common_Assessment': parent('egcs_cn_review', 'public.Common_Review'),
  'public.Common_Assessment_Custom_Outcome': parent('egcs_cn_review', 'public.Common_Review'),
  'public.Common_Assessment_Outcome': parent('egcs_cn_review', 'public.Common_Review'),
  'public.Common_Assessment_Response': parent('egcs_cn_assessment', 'public.Common_Assessment'),
  'public.Common_Assessment_Schema': parent('egcs_cn_reviewschema', 'public.Common_Review_Schema'),
  'public.Common_Attachment': { kind: 'references', links: [
    { table: 'public.Common_Entity_Attachment', column: 'egcs_cn_attachment' },
    { table: 'public.Common_Approval', column: 'egcs_cn_attachment' },
    { table: 'public.Funding_Case_Agreement_Generated_Document', column: 'egcs_fc_generatedattachment' },
    { table: 'public.Transfer_Payment_Stream_Document_Template', column: 'egcs_tp_templateattachment_en' },
    { table: 'public.Transfer_Payment_Stream_Document_Template', column: 'egcs_tp_templateattachment_fr' }
  ] },
  'public.Common_Attachment_Types': parent('egcs_cn_agency', 'public.Agency_Profile'),
  'public.Common_Certification': { kind: 'first', rules: [parent('egcs_cn_routingslip', 'public.Common_Routing_Slip'), parent('egcs_cn_approvaltemplate', 'public.Common_Approval_Template')] },
  'public.Common_Checklist': parent('egcs_cn_review', 'public.Common_Review'),
  'public.Common_Checklist_Response': parent('egcs_cn_checklist', 'public.Common_Checklist'),
  'public.Common_Checklist_Schema': parent('egcs_cn_reviewschema', 'public.Common_Review_Schema'),
  'public.Common_Completion': entity('egcs_cn_entityid', 'egcs_cn_entitytype'),
  'public.Common_Contact': actorAgencies,
  'public.Common_Entity': entity('id', 'egcs_cn_entitytype'),
  'public.Common_Entity_Assignment': entity('egcs_cn_entityid', 'egcs_cn_entitytype'),
  'public.Common_Entity_Attachment': entity('egcs_cn_entityid', 'egcs_cn_entitytype'),
  'public.Common_Entity_Type': global('Polymorphic type catalog'),
  'public.Common_Extension_Entity_Owner': { kind: 'switch', column: 'egcs_cn_ownertype', cases: {
    applicantrecipient: agency('egcs_cn_agency'),
    fundingcaseagreement: parent('egcs_cn_ownerid', 'public.Funding_Case_Agreement_Profile')
  } },
  'public.Common_GWCOA': actorAgencies,
  'public.Common_Publication': publicationOwner,
  'public.Common_Publication_Transition': parent('egcs_cn_publication', 'public.Common_Publication'),
  'public.Common_Publication_Version': parent('egcs_cn_publication', 'public.Common_Publication'),
  'public.Common_Publication_Version_Reference': parent('egcs_cn_parentversion', 'public.Common_Publication_Version'),
  'public.Common_Recommendation': entity('egcs_cn_entityid', 'egcs_cn_entitytype'),
  'public.Common_Recommendation_Schema': parent('egcs_cn_agency', 'public.Agency_Profile'),
  'public.Common_Recommendation_Set': entity('egcs_cn_entityid', 'egcs_cn_entitytype'),
  'public.Common_Recommendation_Set_Setup': parent('egcs_cn_agency', 'public.Agency_Profile'),
  'public.Common_Recommendation_Setup': parent('egcs_cn_recommendationset', 'public.Common_Recommendation_Set_Setup'),
  'public.Common_Review': parent('egcs_cn_reviewset', 'public.Common_Review_Set'),
  'public.Common_Review_Response': parent('egcs_cn_assessment', 'public.Common_Review'),
  'public.Common_Review_Schema': parent('egcs_cn_agency', 'public.Agency_Profile'),
  'public.Common_Review_Set': entity('egcs_cn_entityid', 'egcs_cn_entitytype'),
  'public.Common_Review_Set_Setup': parent('egcs_cn_agency', 'public.Agency_Profile'),
  'public.Common_Review_Setup': parent('egcs_cn_reviewset', 'public.Common_Review_Set_Setup'),
  'public.Common_Routing_Slip': entity('egcs_cn_entityid', 'egcs_cn_entitytype'),
  'public.Common_Runtime': entity('egcs_cn_entityid', 'egcs_cn_entitytype'),
  'public.Common_Runtime_Item': parent('egcs_cn_runtime', 'public.Common_Runtime'),
  'public.Common_Runtime_Transition': parent('egcs_cn_runtime', 'public.Common_Runtime'),
  'public.Common_Status': parent('egcs_cn_agency', 'public.Agency_Profile'),
  'public.Common_User': actorAgencies,
  'public.Common_Workflow_Member_Condition': parent('egcs_cn_workflowsetupmember', 'public.Common_Workflow_Setup_Member'),
  'public.Common_Workflow_Owner_Blocker': parent('egcs_cn_workflowrun', 'public.Common_Workflow_Run'),
  'public.Common_Workflow_Publication_Condition': parent('egcs_cn_publicationversion', 'public.Common_Publication_Version'),
  'public.Common_Workflow_Publication_Status': parent('egcs_cn_publicationversion', 'public.Common_Publication_Version'),
  'public.Common_Workflow_Run': parent('id', 'public.Common_Runtime'),
  'public.Common_Workflow_Setup': parent('egcs_cn_agency', 'public.Agency_Profile'),
  'public.Common_Workflow_Setup_Allowed_Start_Status': parent('egcs_cn_workflowsetup', 'public.Common_Workflow_Setup'),
  'public.Common_Workflow_Setup_Member': parent('egcs_cn_workflowsetup', 'public.Common_Workflow_Setup'),
  'public.Common_Workflow_Setup_Member_Owner': parent('egcs_cn_workflowsetupmember', 'public.Common_Workflow_Setup_Member'),
  'public.Common_Workflow_Status_Transition': parent('egcs_cn_workflowrun', 'public.Common_Workflow_Run'),
  'public.Funding_Case_Agreement_Activity': parent('egcs_fc_fundingagreement', 'public.Funding_Case_Agreement_Profile'),
  'public.Funding_Case_Agreement_Activity_Version': parent('egcs_fc_fundingagreement', 'public.Funding_Case_Agreement_Profile'),
  'public.Funding_Case_Agreement_Address': parent('egcs_fc_fundingagreement', 'public.Funding_Case_Agreement_Profile'),
  'public.Funding_Case_Agreement_Note': parent('egcs_fc_fundingagreement', 'public.Funding_Case_Agreement_Profile'),
  'public.Funding_Case_Agreement_Amendment': parent('egcs_fc_fundingagreement', 'public.Funding_Case_Agreement_Profile'),
  'public.Funding_Case_Agreement_Amendment_Subtype': parent('egcs_fc_amendment', 'public.Funding_Case_Agreement_Amendment'),
  'public.Funding_Case_Agreement_Amendment_Type': parent('egcs_fc_amendment', 'public.Funding_Case_Agreement_Amendment'),
  'public.Funding_Case_Agreement_Applicant_Recipient': parent('egcs_fc_fundingagreement', 'public.Funding_Case_Agreement_Profile'),
  'public.Funding_Case_Agreement_Approval_Submission': parent('egcs_fc_fundingagreement', 'public.Funding_Case_Agreement_Profile'),
  'public.Funding_Case_Agreement_Budget_Fiscal_Year': parent('egcs_fc_fundingagreement', 'public.Funding_Case_Agreement_Profile'),
  'public.Funding_Case_Agreement_Budget_Line_Item': parent('egcs_fc_fundingagreementbudgetfiscalyear', 'public.Funding_Case_Agreement_Budget_Fiscal_Year'),
  'public.Funding_Case_Agreement_Budget_Version': parent('egcs_fc_fundingagreement', 'public.Funding_Case_Agreement_Profile'),
  'public.Funding_Case_Agreement_Claim': parent('egcs_fc_fundingagreement', 'public.Funding_Case_Agreement_Profile'),
  'public.Funding_Case_Agreement_Claim_Line_Item': parent('egcs_fc_fundingagreementclaim', 'public.Funding_Case_Agreement_Claim'),
  'public.Funding_Case_Agreement_Claim_Reconcile': parent('egcs_fc_fundingagreementclaim', 'public.Funding_Case_Agreement_Claim'),
  'public.Funding_Case_Agreement_Claim_Reconcile_Line_Item': parent('egcs_fc_fundingagreementclaimreconcile', 'public.Funding_Case_Agreement_Claim_Reconcile'),
  'public.Funding_Case_Agreement_Closeout': parent('egcs_fc_fundingagreement', 'public.Funding_Case_Agreement_Profile'),
  'public.Funding_Case_Agreement_Closeout_Snapshot': parent('egcs_fc_fundingagreement', 'public.Funding_Case_Agreement_Profile'),
  'public.Funding_Case_Agreement_Commitment': parent('egcs_fc_fundingagreement', 'public.Funding_Case_Agreement_Profile'),
  'public.Funding_Case_Agreement_Commitment_Line': parent('egcs_fc_commitment', 'public.Funding_Case_Agreement_Commitment'),
  'public.Funding_Case_Agreement_Forecast': parent('egcs_fc_fundingagreement', 'public.Funding_Case_Agreement_Profile'),
  'public.Funding_Case_Agreement_Forecast_Line_Item': parent('egcs_fc_agreementforecast', 'public.Funding_Case_Agreement_Forecast'),
  'public.Funding_Case_Agreement_Generated_Document': parent('egcs_fc_fundingagreement', 'public.Funding_Case_Agreement_Profile'),
  'public.Funding_Case_Agreement_Monitor': parent('egcs_fc_fundingagreement', 'public.Funding_Case_Agreement_Profile'),
  'public.Funding_Case_Agreement_Monitor_Finding': parent('egcs_fc_fundingagreementmonitor', 'public.Funding_Case_Agreement_Monitor'),
  'public.Funding_Case_Agreement_Monitor_Followup': parent('egcs_fc_fundingagreementmonitor', 'public.Funding_Case_Agreement_Monitor'),
  'public.Funding_Case_Agreement_Monitor_Followup_Update': parent('egcs_fc_fundingagreementmonitorfollowup', 'public.Funding_Case_Agreement_Monitor_Followup'),
  'public.Funding_Case_Agreement_Monitor_Items': parent('egcs_fc_fundingagreementmonitor', 'public.Funding_Case_Agreement_Monitor'),
  'public.Funding_Case_Agreement_Monitor_Planning': parent('egcs_fc_fundingagreementmonitor', 'public.Funding_Case_Agreement_Monitor'),
  'public.Funding_Case_Agreement_Monitor_Promising_Practice': parent('egcs_fc_fundingagreementmonitor', 'public.Funding_Case_Agreement_Monitor'),
  'public.Funding_Case_Agreement_Outcome_Activity': parent('egcs_fc_activity', 'public.Funding_Case_Agreement_Activity'),
  'public.Funding_Case_Agreement_Payment': parent('egcs_fc_fundingagreementcommitment', 'public.Funding_Case_Agreement_Commitment'),
  'public.Funding_Case_Agreement_Payment_Line': parent('egcs_fc_fundingagreementpayment', 'public.Funding_Case_Agreement_Payment'),
  'public.Funding_Case_Agreement_Profile': parent('egcs_fc_transferpaymentstream', 'public.Transfer_Payment_Stream'),
  'public.Funding_Case_Agreement_Responsible_Party_Activity': parent('egcs_fc_activity', 'public.Funding_Case_Agreement_Activity'),
  'public.Funding_Case_Agreement_Revision': parent('egcs_fc_fundingagreement', 'public.Funding_Case_Agreement_Profile'),
  'public.Transfer_Payment_Agreement_Subtype': parent('egcs_tp_transferpaymentstream', 'public.Transfer_Payment_Stream'),
  'public.Transfer_Payment_Amendment_Subtype': parent('egcs_tp_transferpaymentstream', 'public.Transfer_Payment_Stream'),
  'public.Transfer_Payment_Amendment_Subtype_Type': parent('egcs_tp_amendmentsubtype', 'public.Transfer_Payment_Amendment_Subtype'),
  'public.Transfer_Payment_Amendment_Type': parent('egcs_tp_transferpaymentstream', 'public.Transfer_Payment_Stream'),
  'public.Transfer_Payment_Financial_Limits': parent('egcs_tp_transferpaymentstream', 'public.Transfer_Payment_Stream'),
  'public.Transfer_Payment_Fiscal_Year_Budget': parent('egcs_tp_transferpaymentprofile', 'public.Transfer_Payment_Profile'),
  'public.Transfer_Payment_Monitor_Type': parent('egcs_tp_transferpaymentstream', 'public.Transfer_Payment_Stream'),
  'public.Transfer_Payment_Objective': parent('egcs_tp_transferpaymentprofile', 'public.Transfer_Payment_Profile'),
  'public.Transfer_Payment_Outcome': parent('egcs_tp_transferpaymentprofile', 'public.Transfer_Payment_Profile'),
  'public.Transfer_Payment_Outcome_Performance_Indicator': parent('egcs_tp_transferpaymentoutcome', 'public.Transfer_Payment_Outcome'),
  'public.Transfer_Payment_Profile': parent('egcs_tp_agency', 'public.Agency_Profile'),
  'public.Transfer_Payment_Stream': parent('egcs_tp_transferpaymentprofile', 'public.Transfer_Payment_Profile'),
  'public.Transfer_Payment_Stream_Area_of_Expertise': parent('egcs_tp_transferpaymentstream', 'public.Transfer_Payment_Stream'),
  'public.Transfer_Payment_Stream_Budget': parent('egcs_tp_transferpaymentstream', 'public.Transfer_Payment_Stream'),
  'public.Transfer_Payment_Stream_Chart_of_Account': parent('egcs_tp_transferpaymentstream', 'public.Transfer_Payment_Stream'),
  'public.Transfer_Payment_Stream_Commitment_Type': parent('egcs_tp_transferpaymentstream', 'public.Transfer_Payment_Stream'),
  'public.Transfer_Payment_Stream_Cost_Category_Line_Item': parent('egcs_tp_transferpaymentstream', 'public.Transfer_Payment_Stream'),
  'public.Transfer_Payment_Stream_Document_Template': parent('egcs_tp_transferpaymentstream', 'public.Transfer_Payment_Stream'),
  'public.Transfer_Payment_Stream_Eligible_Recipient': parent('egcs_tp_transferpaymentstream', 'public.Transfer_Payment_Stream'),
  'public.Transfer_Payment_Stream_Field_Assignment': parent('egcs_tp_transferpaymentstream', 'public.Transfer_Payment_Stream'),
  'public.Transfer_Payment_Stream_Field_Section': parent('egcs_tp_transferpaymentstream', 'public.Transfer_Payment_Stream'),
  'public.Transfer_Payment_Stream_Holdback_Basis': parent('egcs_tp_transferpaymentstream', 'public.Transfer_Payment_Stream'),
  'public.Transfer_Payment_Stream_Outcome': parent('egcs_tp_transferpaymentstream', 'public.Transfer_Payment_Stream'),
  'public.Transfer_Payment_Stream_Review_Set': parent('egcs_tp_transferpaymentstream', 'public.Transfer_Payment_Stream'),
  'public.Transfer_Payment_Stream_Risk_Rating': parent('egcs_tp_transferpaymentstream', 'public.Transfer_Payment_Stream'),
  'public.Transfer_Payment_Stream_Workflow': parent('egcs_tp_transferpaymentstream', 'public.Transfer_Payment_Stream'),
  'public.account': actorAgencies,
  'public.role': { kind: 'first', rules: [parent('agency_id', 'public.Agency_Profile'), global('Global role')] },
  'public.role_permission': parent('role_id', 'public.role'),
  'public.role_transfer_payment_scope': parent('role_id', 'public.role'),
  'public.session': actorAgencies,
  'public.storage_cleanup_outbox': agency('agency_id'),
  'public.user': actorAgencies,
  'public.user_role_assignment': parent('role_id', 'public.role'),
  'public.verification': { kind: 'actor-agencies', whenActorMissing: 'global' },
  'audit.access_event': { kind: 'stored-audience' },
  'audit.capture_policy': { kind: 'actor-agencies', whenActorMissing: 'maintenance-global' },
  'audit.change_event': { kind: 'stored-audience' },
  'audit.security_audit_event': { kind: 'stored-audience' },
  'extensions.agency_enablement': agency('agency_id'),
  'extensions.agency_storage_selection': agency('agency_id'),
  'extensions.stream_configuration': parent('stream_id', 'public.Transfer_Payment_Stream'),
  'extensions.kv_entry': entity('owner_id', 'owner_type'),
  'extensions.secret_entry': entity('owner_id', 'owner_type'),
  'public.kysely_migration': global('Migration journal and lock'),
  'public.kysely_migration_lock': global('Migration journal and lock')
} satisfies Record<QualifiedCoreTable, AuditOwnershipRule> & Record<string, AuditOwnershipRule>

/** Typed entity references resolve through this same inventory, never through URL inference. */
export const AUDIT_ENTITY_TABLES: Readonly<Record<string, string>> = {
  agency: 'public.Agency_Profile',
  transferpaymentstream: 'public.Transfer_Payment_Stream',
  applicantrecipient: 'public.Applicant_Recipient_Profile',
  fundingcaseagreement: 'public.Funding_Case_Agreement_Profile',
  fundingcaseamendment: 'public.Funding_Case_Agreement_Amendment',
  fundingcaseagreementcloseout: 'public.Funding_Case_Agreement_Closeout',
  fundingcaseforecast: 'public.Funding_Case_Agreement_Forecast',
  fundingcaseagreementclaim: 'public.Funding_Case_Agreement_Claim',
  fundingclaimreconcile: 'public.Funding_Case_Agreement_Claim_Reconcile',
  fundingcaseagreementcommitment: 'public.Funding_Case_Agreement_Commitment',
  fundingcasepayment: 'public.Funding_Case_Agreement_Payment',
  fundingcasemonitor: 'public.Funding_Case_Agreement_Monitor',
  // The public SDK persists this owner type in host-managed extension KV/secret records.
  fundingcaseagreementmonitor: 'public.Funding_Case_Agreement_Monitor',
  commonreview: 'public.Common_Review',
  commonrecommendation: 'public.Common_Recommendation'
}

/** Security events use explicit targets; never infer a target from metadata or request routes. */
export const AUDIT_SECURITY_TARGET_TABLES: Readonly<Record<string, string>> = {
  role: 'public.role',
  user: 'public.user',
  user_role_assignment: 'public.user_role_assignment'
}
