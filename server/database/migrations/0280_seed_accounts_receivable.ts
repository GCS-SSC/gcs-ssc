import { sql, type Kysely, type Transaction } from 'kysely'
import type { H3Event } from 'h3'
import { ROLE_PERMISSION_SUBJECTS, canSubjectManageAssignments } from '@gcs-ssc/authorization'
import type { Database, JsonValue } from '../../../shared/types/database'
import { AccountReceivableCreateSchema } from '../../../shared/types/schemas/account-receivable'
import { parseMoney } from '../../../shared/utils/money'
import { databaseMoneyValue } from '../../utils/database-money'
import { createPrimaryEntityAssignment } from '../../utils/entity-assignment'
import { lockAccountReceivableRecoveryPool } from '../../utils/account-receivable-context'
import { allocateRetainedAccountReceivableCoding, validateAccountReceivableBasis } from '../../utils/account-receivable'
import { readAccountReceivableSources } from '../../utils/account-receivable-source'
import { defineUserAbilities } from '../../utils/rbac'
import { publishApprovalTemplate } from '../../utils/approval-template-versioning'
import { buildWorkflowSetupPublication } from '../../utils/workflow-setup-versioning'
import { publishDefinition } from '../../utils/system-publication'
import { createCompletionTransition } from '../../utils/workflow-runtime'
import { down as resetHistoricalDemo } from '../historical-demo-seed'

const seedReceivableWorkspace = async (trx: Transaction<Database>): Promise<void> => {
  const root = await trx.selectFrom('Common_User').select(['id', 'egcs_cn_auth_user_id'])
    .where('egcs_cn_email', '=', 'root@example.com').where('_deleted', '=', false).executeTakeFirst()
  // The demo-only migration is also safe when applied to an intentionally unseeded database.
  if (!root?.egcs_cn_auth_user_id) return
  const role = await trx.selectFrom('role').select('id').where('name_en', '=', 'Root Administrator')
    .where('agency_id', 'is', null).where('_deleted', '=', false).executeTakeFirstOrThrow()
  for (const subject of ROLE_PERMISSION_SUBJECTS) {
    const permission = { access_level: 'manager' as const, can_manage_assignments: canSubjectManageAssignments(subject) }
    const existing = await trx.selectFrom('role_permission').select('id').where('role_id', '=', String(role.id))
      .where('subject', '=', subject).where('_deleted', '=', false).executeTakeFirst()
    if (existing) await trx.updateTable('role_permission').set(permission).where('id', '=', String(existing.id)).execute()
    else await trx.insertInto('role_permission').values({ role_id: String(role.id), subject, ...permission, _deleted: false }).execute()
  }
  const agreement = await trx.selectFrom('Funding_Case_Agreement_Profile as agreement')
    .innerJoin('Transfer_Payment_Stream as stream', 'stream.id', 'agreement.egcs_fc_transferpaymentstream')
    .innerJoin('Transfer_Payment_Profile as program', 'program.id', 'stream.egcs_tp_transferpaymentprofile')
    .select(['agreement.id', 'agreement.egcs_fc_agreementnumber', 'agreement.egcs_fc_currency', 'stream.id as streamId', 'program.egcs_tp_agency as agencyId'])
    .where('agreement.egcs_fc_agreementnumber', '=', 'AGR-FIN-DEMO-1').where('agreement._deleted', '=', false).executeTakeFirstOrThrow()
  const agencyId = String(agreement.agencyId)
  await trx.insertInto('Common_Status').values([
    { egcs_cn_agency: agencyId, egcs_cn_name_en: 'Receivable established', egcs_cn_name_fr: 'Créance établie', egcs_cn_terminal: true, egcs_cn_readonly: false, egcs_cn_color: '#16a34a', egcs_cn_icon: 'i-lucide-circle-check' },
    { egcs_cn_agency: agencyId, egcs_cn_name_en: 'Receivable denied', egcs_cn_name_fr: 'Créance refusée', egcs_cn_terminal: true, egcs_cn_readonly: false, egcs_cn_color: '#dc2626', egcs_cn_icon: 'i-lucide-circle-x' },
    { egcs_cn_agency: agencyId, egcs_cn_name_en: 'Receivable cancelled', egcs_cn_name_fr: 'Créance annulée', egcs_cn_terminal: true, egcs_cn_readonly: false, egcs_cn_color: '#71717a', egcs_cn_icon: 'i-lucide-ban' }
  ]).execute()
  const statuses = await trx.selectFrom('Common_Status').select(['id', 'egcs_cn_name_en'])
    .where('egcs_cn_agency', '=', agencyId).where('_deleted', '=', false).execute()
  const status = (name: string): string => {
    const found = statuses.find(item => item.egcs_cn_name_en === name)
    if (!found) throw new Error(`AR demo requires Agency status ${name}`)
    return String(found.id)
  }
  const approver = await trx.selectFrom('Common_User as person')
    .innerJoin('user_role_assignment as assignment', 'assignment.user_id', 'person.egcs_cn_auth_user_id')
    .innerJoin('role as role', 'role.id', 'assignment.role_id')
    .select('person.id').where('role.agency_id', '=', agencyId).where('assignment._deleted', '=', false)
    .where('role._deleted', '=', false).where('person._deleted', '=', false).where('person.id', '!=', String(root.id))
    .orderBy('person.id').executeTakeFirstOrThrow()
  const template = await trx.insertInto('Common_Approval_Template').values({
    egcs_cn_agency: agencyId, egcs_cn_name_en: 'Receivable establishment approval', egcs_cn_name_fr: 'Approbation de l’établissement d’une créance',
    egcs_cn_description_en: 'Confirm the debtor, retained sources, accounting and recovery policy.',
    egcs_cn_description_fr: 'Confirmer le débiteur, les sources conservées, la comptabilisation et le mode de recouvrement.'
  }).returningAll().executeTakeFirstOrThrow()
  await trx.insertInto('Common_Approval_Step').values({
    egcs_cn_approvaltemplate: String(template.id), egcs_cn_sequence: 1, egcs_cn_defaultuser: String(approver.id),
    egcs_cn_name_en: 'Confirm receivable establishment', egcs_cn_name_fr: 'Confirmer l’établissement de la créance',
    egcs_cn_description_en: 'Review the completed receivable package before posting the debt.',
    egcs_cn_description_fr: 'Examiner le dossier complété avant de comptabiliser la dette.', egcs_cn_approvertitle: 'Agency finance manager'
  }).execute()
  await publishApprovalTemplate(trx, template, String(root.id))
  const workflow = await trx.insertInto('Common_Workflow_Setup').values({
    egcs_cn_agency: agencyId, egcs_cn_entitytype: 'fundingcaseaccountreceivable', egcs_cn_purpose: 'approval_submission',
    egcs_cn_name_en: 'Receivable completion and approval', egcs_cn_name_fr: 'Achèvement et approbation de la créance',
    egcs_cn_description_en: 'Establish the approved recovery policy through the shared workflow.',
    egcs_cn_description_fr: 'Établir le mode de recouvrement approuvé par le flux partagé.',
    egcs_cn_cancellationstatus: status('Receivable cancelled'), egcs_cn_executionfailurestatus: status('Receivable denied'), egcs_cn_allowretry: true
  }).returningAll().executeTakeFirstOrThrow()
  await trx.insertInto('Common_Workflow_Setup_Allowed_Start_Status').values({
    egcs_cn_workflowsetup: String(workflow.id), egcs_cn_status: status('Draft'), egcs_cn_order: 1
  }).execute()
  await trx.insertInto('Common_Workflow_Setup_Member').values({
    egcs_cn_workflowsetup: String(workflow.id), egcs_cn_sequence: 1, egcs_cn_kind: 'approval_template', egcs_cn_approvaltemplate: String(template.id),
    egcs_cn_materializationstatus: status('Pending Approval'), egcs_cn_successstatus: status('Receivable established'), egcs_cn_failurestatus: status('Receivable denied')
  }).execute()
  const publication = await buildWorkflowSetupPublication(trx, workflow)
  await publishDefinition(trx, { publicationId: String(workflow.id), kind: 'workflow_setup', definition: publication.definition as unknown as JsonValue,
    references: publication.references, actorId: String(root.id) })
  await trx.insertInto('Transfer_Payment_Stream_Workflow').values({ egcs_tp_transferpaymentstream: String(agreement.streamId), egcs_tp_workflow: String(workflow.id) }).execute()
  const proponent = await trx.selectFrom('Funding_Case_Agreement_Applicant_Recipient').select('egcs_fc_applicantrecipient')
    .where('egcs_fc_fundingagreement', '=', String(agreement.id)).where('_deleted', '=', false).executeTakeFirstOrThrow()
  const debtor = await trx.selectFrom('Applicant_Recipient_Profile').select(['egcs_ar_legalname_en', 'egcs_ar_legalname_fr', 'egcs_ar_operatingname_en', 'egcs_ar_operatingname_fr'])
    .where('id', '=', String(proponent.egcs_fc_applicantrecipient)).executeTakeFirstOrThrow()
  const year = await trx.selectFrom('Funding_Case_Agreement_Budget_Fiscal_Year as budget')
    .innerJoin('Agency_Fiscal_Year as year', 'year.id', 'budget.egcs_fc_fiscalyear')
    .select(['year.id', 'year.egcs_ay_fiscalyeardisplay']).where('budget.egcs_fc_fundingagreement', '=', String(agreement.id)).where('budget._deleted', '=', false)
    .orderBy('year.egcs_ay_fiscalyear').executeTakeFirstOrThrow()
  const type = await trx.selectFrom('Agency_Account_Receivable_Type').selectAll().where('egcs_ay_organizationagency', '=', agencyId)
    .where('egcs_ay_claimrelated', '=', true).where('_deleted', '=', false).executeTakeFirstOrThrow()
  const account = await trx.selectFrom('Agency_Chart_of_Account').selectAll().where('egcs_ay_organizationagency', '=', agencyId)
    .where('egcs_ay_fiscalyear', '=', String(year.id)).where('egcs_ay_kind', '=', 'account_receivable')
    .where('egcs_ay_currency', '=', agreement.egcs_fc_currency).where('_deleted', '=', false).executeTakeFirstOrThrow()
  // Import one genuinely paid historical advance, with retained commitment coding.
  // This uses the same explicit historical import contract as the financial showcase.
  const paid = await trx.selectFrom('Funding_Case_Agreement_Payment').select(['egcs_fc_fundingagreementcommitment', 'egcs_fc_fiscalyear'])
    .where('egcs_fc_fundingagreement', '=', String(agreement.id)).where('_deleted', '=', false).orderBy('id').executeTakeFirstOrThrow()
  const commitmentLine = await trx.selectFrom('Funding_Case_Agreement_Commitment_Line').select('id')
    .where('egcs_fc_commitment', '=', String(paid.egcs_fc_fundingagreementcommitment)).where('_deleted', '=', false).orderBy('id').executeTakeFirstOrThrow()
  const advance = await trx.insertInto('Funding_Case_Agreement_Payment').values({
    egcs_fc_fundingagreementcommitment: paid.egcs_fc_fundingagreementcommitment, egcs_fc_fiscalyear: paid.egcs_fc_fiscalyear,
    egcs_fc_applicantrecipient: proponent.egcs_fc_applicantrecipient, egcs_fc_paymenttype: 'advance',
    egcs_fc_periodstart: 0, egcs_fc_periodend: 2, egcs_fc_paymentamount: databaseMoneyValue(parseMoney('25000.00')),
    egcs_fc_currency: agreement.egcs_fc_currency, egcs_fc_status: status('Draft'),
    egcs_fc_comment: 'Imported paid advance for participant delivery; retained financial coding supports the receivable demonstration.'
  }).returning('id').executeTakeFirstOrThrow()
  await createPrimaryEntityAssignment(trx, 'fundingcasepayment', String(advance.id), String(root.id))
  await trx.insertInto('Funding_Case_Agreement_Payment_Line').values({
    egcs_fc_fundingagreementpayment: String(advance.id), egcs_fc_fundingagreementcommitmentline: String(commitmentLine.id),
    egcs_fc_amount: databaseMoneyValue(parseMoney('25000.00'))
  }).execute()
  await trx.updateTable('Funding_Case_Agreement_Payment').set({ egcs_fc_status: status('Paid') }).where('id', '=', String(advance.id)).execute()
  const advanceType = await trx.selectFrom('Agency_Account_Receivable_Type').selectAll().where('egcs_ay_organizationagency', '=', agencyId)
    .where('egcs_ay_advancepaymentrelated', '=', true).where('_deleted', '=', false).executeTakeFirstOrThrow()
  const advances = await readAccountReceivableSources(trx, { agreementId: String(agreement.id), applicantRecipientId: String(proponent.egcs_fc_applicantrecipient),
    agencyFiscalYearId: String(year.id), currency: agreement.egcs_fc_currency, claimRelated: false, advancePaymentRelated: true })
  const advanceSource = advances.find(item => item.egcs_fc_payment === String(advance.id))
  if (!advanceSource) throw new Error('AR demo historical advance must be an eligible paid source')
  const monitorType = await trx.selectFrom('Transfer_Payment_Monitor_Type as stream_type')
    .innerJoin('Agency_Monitor_Type as agency_type', 'agency_type.id', 'stream_type.egcs_tp_agencymonitortype')
    .select('stream_type.id').where('stream_type.egcs_tp_transferpaymentstream', '=', String(agreement.streamId))
    .where('agency_type.egcs_ay_receivableeligible', '=', true).where('agency_type._deleted', '=', false)
    .where('stream_type._deleted', '=', false).executeTakeFirstOrThrow()
  const monitor = await trx.insertInto('Funding_Case_Agreement_Monitor').values({
    egcs_fc_fundingagreement: String(agreement.id), egcs_fc_type: String(monitorType.id), egcs_fc_onsite: false,
    egcs_fc_tentativefiscalyear: String(year.id), egcs_fc_tentativequarter: 2, egcs_fc_status: status('Draft')
  }).returning('id').executeTakeFirstOrThrow()
  await createPrimaryEntityAssignment(trx, 'fundingcasemonitor', String(monitor.id), String(root.id))
  const finding = await trx.insertInto('Funding_Case_Agreement_Monitor_Finding').values({
    egcs_fc_fundingagreementmonitor: String(monitor.id), egcs_fc_findingname: 'Ineligible project operations expense',
    egcs_fc_recommendationtype: 'mandatoryaction', egcs_fc_responsibleparty: 'applicantrecipient',
    egcs_fc_detail: 'The financial review identified an expense outside the Agreement eligible cost categories.'
  }).returning('id').executeTakeFirstOrThrow()
  const followup = await trx.insertInto('Funding_Case_Agreement_Monitor_Followup').values({
    egcs_fc_fundingagreementmonitor: String(monitor.id), egcs_fc_monitorfinding: String(finding.id), egcs_fc_requiresreceivable: true,
    egcs_fc_followupname: 'Establish receivable for the monitored ineligible expense', egcs_fc_responsibleparty: 'organization',
    egcs_fc_status: 'open', egcs_fc_duedate: new Date('2026-10-31')
  }).returning('id').executeTakeFirstOrThrow()
  const monitoredType = await trx.insertInto('Agency_Account_Receivable_Type').values({
    egcs_ay_organizationagency: agencyId, egcs_ay_name_en: 'Monitoring finding', egcs_ay_name_fr: 'Constat de surveillance',
    egcs_ay_description_en: 'Recover a finalized Claim expense identified by a linked financial monitoring follow-up.',
    egcs_ay_description_fr: 'Recouvrer une dépense de réclamation finalisée relevée dans un suivi de surveillance financière lié.',
    egcs_ay_monitorrequired: true, egcs_ay_advancepaymentrelated: false, egcs_ay_claimrelated: true
  }).returningAll().executeTakeFirstOrThrow()
  const sources = await readAccountReceivableSources(trx, { agreementId: String(agreement.id), applicantRecipientId: String(proponent.egcs_fc_applicantrecipient),
    agencyFiscalYearId: String(year.id), currency: agreement.egcs_fc_currency, claimRelated: true, advancePaymentRelated: false })
  if (sources.length < 3) throw new Error('AR demo requires three finalized, paid Claim sources')
  const event = { context: { $db: trx, $authContext: { userId: String(root.egcs_cn_auth_user_id), userAbilities: await defineUserAbilities(String(root.egcs_cn_auth_user_id), trx) } } } as unknown as H3Event
  const pool = await lockAccountReceivableRecoveryPool(trx, { agencyId, applicantRecipientId: String(proponent.egcs_fc_applicantrecipient), currency: agreement.egcs_fc_currency })
  for (const [index, scenario] of [
    { type, source: sources[0]!, followup: null, amount: '750.00', method: null, narrativeEn: 'Draft review of participant costs: confirm supporting invoices and the recovery method before Completion.', narrativeFr: 'Examen préliminaire des coûts des participants : confirmer les factures justificatives et le mode de recouvrement avant l’achèvement.', submit: false },
    { type, source: sources[1]!, followup: null, amount: '1250.00', method: 'offset' as const, narrativeEn: 'A finalized Claim included an ineligible project operations expense. Finance has prepared the debtor-specific offset policy for approval.', narrativeFr: 'Une réclamation finalisée comprend une dépense de fonctionnement inadmissible. Les finances ont préparé le recouvrement par compensation propre au débiteur pour approbation.', submit: true },
    { type: advanceType, source: advanceSource, followup: null, amount: '2500.00', method: null, narrativeEn: 'Unused paid advance: confirm the outstanding fiscal balance and recovery method before Completion.', narrativeFr: 'Avance payée inutilisée : confirmer le solde de l’exercice et le mode de recouvrement avant l’achèvement.', submit: false },
    { type: monitoredType, source: sources[2]!, followup: String(followup.id), amount: '900.00', method: 'direct_repayment' as const, narrativeEn: 'Prepare the receivable requested by the financial monitoring finding; retain the linked follow-up as establishment evidence.', narrativeFr: 'Préparer la créance demandée par le constat de surveillance financière; conserver le suivi lié comme preuve d’établissement.', submit: false }
  ].entries()) {
    const input = AccountReceivableCreateSchema.parse({ egcs_fc_applicantrecipient: String(proponent.egcs_fc_applicantrecipient), egcs_fc_agencyfiscalyear: String(year.id),
      egcs_fc_type: String(scenario.type.id), egcs_fc_monitorfollowup: scenario.followup, egcs_fc_recoverymethod: scenario.method, egcs_fc_requesteddate: '2026-10-03',
      egcs_fc_narrative_en: scenario.narrativeEn, egcs_fc_narrative_fr: scenario.narrativeFr, egcs_fc_sources: [scenario.source.id] })
    // Trusted historical seed authoring retains the ordinary source reader, exact
    // allocation and basis validation; it never fabricates a successful workflow.
    const source = scenario.source
    const definition = scenario.type
    const created = await trx.insertInto('Funding_Case_Agreement_Account_Receivable').values({
      egcs_fc_fundingagreement: String(agreement.id), egcs_fc_pool: String(pool.id), egcs_fc_applicantrecipient: input.egcs_fc_applicantrecipient,
      egcs_fc_agencyfiscalyear: input.egcs_fc_agencyfiscalyear, egcs_fc_type: input.egcs_fc_type,
      egcs_fc_typename_en: definition.egcs_ay_name_en, egcs_fc_typename_fr: definition.egcs_ay_name_fr,
      egcs_fc_typedescription_en: definition.egcs_ay_description_en, egcs_fc_typedescription_fr: definition.egcs_ay_description_fr,
      egcs_fc_monitorrequired: definition.egcs_ay_monitorrequired, egcs_fc_advancepaymentrelated: definition.egcs_ay_advancepaymentrelated,
      egcs_fc_claimrelated: definition.egcs_ay_claimrelated, egcs_fc_monitorfollowup: scenario.followup,
      egcs_fc_fiscaloutstanding: definition.egcs_ay_advancepaymentrelated ? databaseMoneyValue(parseMoney(String((source.egcs_fc_evidence as Record<string, JsonValue>).egcs_fc_fiscaloutstanding))) : null, egcs_fc_recoverymethod: input.egcs_fc_recoverymethod,
      egcs_fc_currency: agreement.egcs_fc_currency, egcs_fc_number: index + 1, egcs_fc_agreementnumber: agreement.egcs_fc_agreementnumber,
      egcs_fc_requesteddate: input.egcs_fc_requesteddate, egcs_fc_narrative_en: input.egcs_fc_narrative_en, egcs_fc_narrative_fr: input.egcs_fc_narrative_fr,
      egcs_fc_createdby: String(root.id), egcs_fc_status: status('Draft')
    }).returning('id').executeTakeFirstOrThrow()
    await createPrimaryEntityAssignment(trx, 'fundingcaseaccountreceivable', String(created.id), String(root.id))
    const { id: sourceKey, label_en: _en, label_fr: _fr, coding, ...retained } = source
    const line = await trx.insertInto('Funding_Case_Agreement_Account_Receivable_Line').values({ ...retained,
      egcs_fc_receivable: String(created.id), egcs_fc_fundingagreement: String(agreement.id), egcs_fc_sourcekey: sourceKey,
      egcs_fc_sourceamount: databaseMoneyValue(source.egcs_fc_sourceamount), egcs_fc_amount: databaseMoneyValue(parseMoney(scenario.amount)),
      egcs_fc_evidence: sql`${JSON.stringify({ source: source.egcs_fc_evidence, egcs_fc_debtorname_en: debtor.egcs_ar_legalname_en ?? debtor.egcs_ar_operatingname_en ?? '', egcs_fc_debtorname_fr: debtor.egcs_ar_legalname_fr ?? debtor.egcs_ar_operatingname_fr ?? '', egcs_fc_fiscalyeardisplay: year.egcs_ay_fiscalyeardisplay })}::jsonb`, egcs_fc_accountreceivablechartofaccount: String(account.id),
      egcs_fc_accountreceivableaccountingdimensions: sql`${JSON.stringify(account.egcs_ay_accountingdimensions)}::jsonb`
    }).returning('id').executeTakeFirstOrThrow()
    const allocated = allocateRetainedAccountReceivableCoding(parseMoney(scenario.amount), coding.map((item, part) => ({
      id: String(part), basis: item.egcs_fc_paidbasis, capacity: item.egcs_fc_paidbasis
    })))
    for (const [part, item] of coding.entries()) {
      await trx.insertInto('Funding_Case_Agreement_Account_Receivable_Coding').values({ ...item,
        egcs_fc_receivable: String(created.id), egcs_fc_receivableline: String(line.id), egcs_fc_fundingagreement: String(agreement.id),
        egcs_fc_paidbasis: databaseMoneyValue(item.egcs_fc_paidbasis), egcs_fc_sharedpaidbasis: databaseMoneyValue(item.egcs_fc_sharedpaidbasis),
        egcs_fc_amount: databaseMoneyValue(allocated.find(split => split.id === String(part))!.amount),
        egcs_fc_accountingdimensions: sql`${JSON.stringify(item.egcs_fc_accountingdimensions)}::jsonb`
      }).execute()
    }
    await validateAccountReceivableBasis(trx, String(created.id))
    if (scenario.submit) {
      await validateAccountReceivableBasis(trx, String(created.id), { submission: true })
      await createCompletionTransition(event, trx, 'fundingcaseaccountreceivable', String(created.id), {
        initiatedBy: String(root.id), comments: 'Prepared for the Agency finance manager to review the retained Claim and offset policy.'
      })
    }
  }
  await sql`SET CONSTRAINTS ALL IMMEDIATE`.execute(trx)
  await sql`SET CONSTRAINTS ALL DEFERRED`.execute(trx)
}

export const up = async (db: Kysely<Database>): Promise<void> => {
  if (db.isTransaction) await seedReceivableWorkspace(db as Transaction<Database>)
  else await db.transaction().execute(seedReceivableWorkspace)
}

/** Demo-only rollback clears the complete demo, preserving production migration isolation. */
export const down = async (db: Kysely<Database>): Promise<void> => await resetHistoricalDemo(db)
