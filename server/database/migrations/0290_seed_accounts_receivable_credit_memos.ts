import { sql, type Kysely, type Transaction } from 'kysely'
import type { H3Event } from 'h3'
import type { Database, Entity_Type, JsonValue } from '../../../shared/types/database'
import { parseMoney } from '../../../shared/utils/money'
import { databaseMoneyText, databaseMoneyValue } from '../../utils/database-money'
import { createPrimaryEntityAssignment } from '../../utils/entity-assignment'
import { setAppUserDbSession } from '../../utils/db-session'
import { lockAccountReceivablePaymentPoolAgreements } from '../../utils/account-receivable-context'
import { allocateRetainedAccountReceivableCoding, readAccountReceivableLines, validateAccountReceivableBasis } from '../../utils/account-receivable'
import { readAccountReceivableSources } from '../../utils/account-receivable-source'
import { validateAccountReceivableRecovery } from '../../utils/account-receivable-recovery'
import { defineUserAbilities } from '../../utils/rbac'
import { publishApprovalTemplate } from '../../utils/approval-template-versioning'
import { buildWorkflowSetupPublication } from '../../utils/workflow-setup-versioning'
import { publishDefinition } from '../../utils/system-publication'
import { createCompletionTransition } from '../../utils/workflow-runtime'
import { decideCanonicalApproval } from '../../utils/canonical-approval-runtime'

const RECEIPT_PREFIX = 'DEMO-AR-REPAYMENT-'

const seedCreditMemoExamples = async (trx: Transaction<Database>): Promise<void> => {
  const root = await trx.selectFrom('Common_User').select(['id', 'egcs_cn_auth_user_id'])
    .where('egcs_cn_email', '=', 'root@example.com').where('_deleted', '=', false).executeTakeFirst()
  if (!root?.egcs_cn_auth_user_id) return
  const existing = await trx.selectFrom('Funding_Case_Account_Receivable_Credit_Memo').select('id')
    .where('egcs_fc_receiptreference', 'like', `${RECEIPT_PREFIX}%`).executeTakeFirst()
  if (existing) return
  const source = await trx.selectFrom('Funding_Case_Agreement_Account_Receivable as debt')
    .innerJoin('Funding_Case_Account_Receivable_Pool as pool', 'pool.id', 'debt.egcs_fc_pool')
    .selectAll('debt').select(['pool.egcs_fc_agency as agencyId', databaseMoneyText(sql.ref('debt.egcs_fc_fiscaloutstanding')).as('egcs_fc_fiscaloutstanding')])
    .where('debt.egcs_fc_agreementnumber', '=', 'AGR-FIN-DEMO-1').where('debt.egcs_fc_number', '=', 3)
    .where('debt.egcs_fc_advancepaymentrelated', '=', true).where('debt._deleted', '=', false).executeTakeFirst()
  if (!source) return
  const agreementId = String(source.egcs_fc_fundingagreement)
  const agencyId = String(source.agencyId)
  await lockAccountReceivablePaymentPoolAgreements(trx, { agencyId, agreementId,
    applicantRecipientId: String(source.egcs_fc_applicantrecipient), currency: source.egcs_fc_currency })
  const unresolved = await trx.selectFrom('Funding_Case_Account_Receivable_Recovery').select('id')
    .where('egcs_fc_pool', '=', String(source.egcs_fc_pool)).where('egcs_fc_outcome', '=', 'open').where('_deleted', '=', false).executeTakeFirst()
  if (unresolved) throw new Error('Finish the pending demo repayment before adding approved Credit Memo examples.')
  const sourceLines = await readAccountReceivableLines(trx, String(source.id))
  if (sourceLines.length !== 1) throw new Error('The demo advance must retain one source line.')
  const statuses = await trx.selectFrom('Common_Status').select(['id', 'egcs_cn_name_en'])
    .where('egcs_cn_agency', '=', agencyId).where('_deleted', '=', false).execute()
  const status = (name: string): string => {
    const value = statuses.find(row => row.egcs_cn_name_en === name)
    if (!value) throw new Error(`Credit Memo demo requires Agency status ${name}`)
    return String(value.id)
  }
  const approver = await trx.selectFrom('Common_Approval_Step as step')
    .innerJoin('Common_Approval_Template as template', 'template.id', 'step.egcs_cn_approvaltemplate')
    .innerJoin('Common_User as person', 'person.id', 'step.egcs_cn_defaultuser')
    .select(['person.id', 'person.egcs_cn_auth_user_id'])
    .where('template.egcs_cn_agency', '=', agencyId).where('template.egcs_cn_name_en', '=', 'Receivable establishment approval')
    .where('template._deleted', '=', false).where('step._deleted', '=', false).where('person._deleted', '=', false)
    .where('person.id', '!=', String(root.id)).orderBy('step.egcs_cn_sequence').executeTakeFirstOrThrow()
  if (!approver.egcs_cn_auth_user_id) throw new Error('The demo finance approver requires an authenticated identity.')
  const eventFor = async (authId: string): Promise<H3Event> => ({ context: {
    $db: trx, $authContext: { userId: authId, userAbilities: await defineUserAbilities(authId, trx) }
  } } as unknown as H3Event)
  const creatorEvent = await eventFor(String(root.egcs_cn_auth_user_id))
  const approverEvent = await eventFor(String(approver.egcs_cn_auth_user_id))
  await setAppUserDbSession(trx, String(root.id))

  const memoStatuses = await trx.insertInto('Common_Status').values([
    { egcs_cn_agency: agencyId, egcs_cn_name_en: 'Credit Memo recorded', egcs_cn_name_fr: 'Note de crédit comptabilisée', egcs_cn_terminal: true, egcs_cn_readonly: false, egcs_cn_color: '#16a34a', egcs_cn_icon: 'i-lucide-circle-check' },
    { egcs_cn_agency: agencyId, egcs_cn_name_en: 'Credit Memo denied', egcs_cn_name_fr: 'Note de crédit refusée', egcs_cn_terminal: true, egcs_cn_readonly: false, egcs_cn_color: '#dc2626', egcs_cn_icon: 'i-lucide-circle-x' },
    { egcs_cn_agency: agencyId, egcs_cn_name_en: 'Credit Memo cancelled', egcs_cn_name_fr: 'Note de crédit annulée', egcs_cn_terminal: true, egcs_cn_readonly: false, egcs_cn_color: '#71717a', egcs_cn_icon: 'i-lucide-ban' }
  ]).returning('id').execute()
  const template = await trx.insertInto('Common_Approval_Template').values({
    egcs_cn_agency: agencyId, egcs_cn_name_en: 'Received repayment approval', egcs_cn_name_fr: 'Approbation du remboursement reçu',
    egcs_cn_description_en: 'Confirm received funds and the credit amount for the Proponent, Agency and currency.',
    egcs_cn_description_fr: 'Confirmer les fonds reçus et le montant du crédit pour le promoteur, l’organisme et la devise.'
  }).returningAll().executeTakeFirstOrThrow()
  await trx.insertInto('Common_Approval_Step').values({
    egcs_cn_approvaltemplate: String(template.id), egcs_cn_sequence: 1, egcs_cn_defaultuser: String(approver.id),
    egcs_cn_name_en: 'Confirm received repayment', egcs_cn_name_fr: 'Confirmer le remboursement reçu',
    egcs_cn_description_en: 'Review the receipt and Proponent, Agency, currency and credit amount before posting the credit.',
    egcs_cn_description_fr: 'Examiner le reçu, le promoteur, l’organisme, la devise et le montant du crédit avant de comptabiliser le crédit.', egcs_cn_approvertitle: 'Agency finance manager'
  }).execute()
  await publishApprovalTemplate(trx, template, String(root.id))
  const workflow = await trx.insertInto('Common_Workflow_Setup').values({
    egcs_cn_agency: agencyId, egcs_cn_entitytype: 'fundingcaseaccountreceivablecreditmemo', egcs_cn_purpose: 'approval_submission',
    egcs_cn_name_en: 'Credit Memo completion and approval', egcs_cn_name_fr: 'Achèvement et approbation de la note de crédit',
    egcs_cn_description_en: 'Record received repayments through the shared approval workflow.',
    egcs_cn_description_fr: 'Comptabiliser les remboursements reçus par le flux d’approbation partagé.',
    egcs_cn_cancellationstatus: String(memoStatuses[2]!.id), egcs_cn_executionfailurestatus: String(memoStatuses[1]!.id), egcs_cn_allowretry: true
  }).returningAll().executeTakeFirstOrThrow()
  await trx.insertInto('Common_Workflow_Setup_Allowed_Start_Status').values({ egcs_cn_workflowsetup: String(workflow.id), egcs_cn_status: status('Draft'), egcs_cn_order: 1 }).execute()
  await trx.insertInto('Common_Workflow_Setup_Member').values({ egcs_cn_workflowsetup: String(workflow.id), egcs_cn_sequence: 1,
    egcs_cn_kind: 'approval_template', egcs_cn_approvaltemplate: String(template.id), egcs_cn_materializationstatus: status('Pending Approval'),
    egcs_cn_successstatus: String(memoStatuses[0]!.id), egcs_cn_failurestatus: String(memoStatuses[1]!.id) }).execute()
  const publication = await buildWorkflowSetupPublication(trx, workflow)
  await publishDefinition(trx, { publicationId: String(workflow.id), kind: 'workflow_setup', definition: publication.definition as unknown as JsonValue,
    references: publication.references, actorId: String(root.id) })
  const agreement = await trx.selectFrom('Funding_Case_Agreement_Profile').select('egcs_fc_transferpaymentstream').where('id', '=', agreementId).executeTakeFirstOrThrow()
  await trx.insertInto('Transfer_Payment_Stream_Workflow').values({ egcs_tp_transferpaymentstream: String(agreement.egcs_fc_transferpaymentstream), egcs_tp_workflow: String(workflow.id) }).execute()

  const completeAndApprove = async (entityType: Entity_Type, entityId: string): Promise<void> => {
    await createCompletionTransition(creatorEvent, trx, entityType, entityId, { initiatedBy: String(root.id), comments: 'Completed retained evidence for the approved repayment demonstration.' })
    const approval = await trx.selectFrom('Common_Approval as approval').innerJoin('Common_Routing_Slip as slip', 'slip.id', 'approval.egcs_cn_routingslip')
      .innerJoin('Common_Runtime_Item as item', 'item.id', 'approval.egcs_cn_runtimeitem').select('approval.id')
      .where('slip.egcs_cn_entitytype', '=', entityType).where('slip.egcs_cn_entityid', '=', entityId)
      .where('item.egcs_cn_state', '=', 'awaiting_action').orderBy('approval.egcs_cn_sequence').executeTakeFirstOrThrow()
    await decideCanonicalApproval(approverEvent, trx, String(approval.id), { approvalId: String(approval.id), certifications: [],
      egcs_cn_comment: 'Verified the retained evidence and exact amounts for the financial demonstration.' }, true, { agencyId })
    await setAppUserDbSession(trx, String(root.id))
  }
  const lastReceivable = await trx.selectFrom('Funding_Case_Agreement_Account_Receivable').select(eb => eb.fn.max<number>('egcs_fc_number').as('number'))
    .where('egcs_fc_fundingagreement', '=', agreementId).executeTakeFirstOrThrow()
  const lastMemo = await trx.selectFrom('Funding_Case_Account_Receivable_Credit_Memo').select(eb => eb.fn.max<number>('egcs_fc_number').as('number'))
    .where('egcs_fc_agency', '=', agencyId).executeTakeFirstOrThrow()
  let memoNumber = lastMemo.number ?? 0
  let receiptNumber = 0
  for (const [index, scenario] of [
    { amount: '1200.00', method: 'direct_repayment' as const, memos: ['200.00', '150.00'] },
    { amount: '800.00', method: 'offset' as const, memos: ['300.00', '100.00'] }
  ].entries()) {
    // Earlier posted repayments change the paid basis. Capture current evidence
    // for each new receivable rather than reusing the original draft snapshot.
    const liveSources = await readAccountReceivableSources(trx, { agreementId, applicantRecipientId: String(source.egcs_fc_applicantrecipient),
      agencyFiscalYearId: String(source.egcs_fc_agencyfiscalyear), claimRelated: false, advancePaymentRelated: true, currency: source.egcs_fc_currency })
    const liveSource = liveSources.find(row => row.id === sourceLines[0]!.egcs_fc_sourcekey)
    if (!liveSource?.coding.length) throw new Error('The demo advance requires an eligible paid source and coding.')
    const { id: _sourceId, agencyId: _agencyId, egcs_fc_statusagency: _statusAgency,
      egcs_fc_statusterminal: _statusTerminal, egcs_fc_statusdeleted: _statusDeleted,
      egcs_fc_fiscaloutstanding: _fiscalOutstanding, ...retainedHeader } = source
    const debt = await trx.insertInto('Funding_Case_Agreement_Account_Receivable').values({ ...retainedHeader,
      egcs_fc_number: (lastReceivable.number ?? 0) + index + 1, egcs_fc_createdby: String(root.id), egcs_fc_createdat: new Date(),
      egcs_fc_status: status('Draft'), egcs_fc_outcome: 'open', egcs_fc_postedat: null, egcs_fc_postingruntime: null,
      egcs_fc_terminalby: null, egcs_fc_terminalat: null, egcs_fc_terminalreason: null,
      egcs_fc_fiscaloutstanding: databaseMoneyValue(parseMoney(String((liveSource.egcs_fc_evidence as Record<string, JsonValue>).egcs_fc_fiscaloutstanding))),
      egcs_fc_recoverymethod: scenario.method, egcs_fc_recipientpreference: null,
      egcs_fc_narrative_en: 'Completed receivable demonstration: partial return of an unused paid advance.',
      egcs_fc_narrative_fr: 'Démonstration de créance établie : remboursement partiel d’une avance payée inutilisée.'
    }).returning('id').executeTakeFirstOrThrow()
    await createPrimaryEntityAssignment(trx, 'fundingcaseaccountreceivable', String(debt.id), String(root.id))
    const { id: sourceKey, label_en: _en, label_fr: _fr, coding, ...retainedLine } = liveSource
    const originalLine = sourceLines[0]!
    const line = await trx.insertInto('Funding_Case_Agreement_Account_Receivable_Line').values({ ...retainedLine,
      egcs_fc_receivable: String(debt.id), egcs_fc_fundingagreement: agreementId, egcs_fc_sourcekey: sourceKey,
      egcs_fc_amount: databaseMoneyValue(parseMoney(scenario.amount)), egcs_fc_sourceamount: databaseMoneyValue(retainedLine.egcs_fc_sourceamount),
      egcs_fc_evidence: sql`${JSON.stringify({ ...(originalLine.egcs_fc_evidence as Record<string, JsonValue>), source: liveSource.egcs_fc_evidence })}::jsonb`,
      egcs_fc_accountreceivablechartofaccount: originalLine.egcs_fc_accountreceivablechartofaccount,
      egcs_fc_accountreceivableaccountingdimensions: sql`${JSON.stringify(originalLine.egcs_fc_accountreceivableaccountingdimensions)}::jsonb`
    }).returning('id').executeTakeFirstOrThrow()
    const splits = allocateRetainedAccountReceivableCoding(parseMoney(scenario.amount), coding.map((part, index) => ({ id: String(index), basis: part.egcs_fc_paidbasis, capacity: part.egcs_fc_paidbasis })))
    for (const [partIndex, part] of coding.entries()) {
      await trx.insertInto('Funding_Case_Agreement_Account_Receivable_Coding').values({ ...part,
        egcs_fc_receivable: String(debt.id), egcs_fc_receivableline: String(line.id), egcs_fc_fundingagreement: agreementId, egcs_fc_paidbasis: databaseMoneyValue(part.egcs_fc_paidbasis),
        egcs_fc_sharedpaidbasis: databaseMoneyValue(part.egcs_fc_sharedpaidbasis), egcs_fc_amount: databaseMoneyValue(splits.find(split => split.id === String(partIndex))!.amount),
        egcs_fc_accountingdimensions: sql`${JSON.stringify(part.egcs_fc_accountingdimensions)}::jsonb`
      }).execute()
    }
    await validateAccountReceivableBasis(trx, String(debt.id), { submission: true })
    await completeAndApprove('fundingcaseaccountreceivable', String(debt.id))
    for (const value of scenario.memos) {
      memoNumber += 1
      receiptNumber += 1
      const memo = await trx.insertInto('Funding_Case_Account_Receivable_Credit_Memo').values({
        egcs_fc_fundingagreement: agreementId, egcs_fc_agency: agencyId, egcs_fc_pool: String(source.egcs_fc_pool),
        egcs_fc_applicantrecipient: String(source.egcs_fc_applicantrecipient), egcs_fc_currency: source.egcs_fc_currency,
        egcs_fc_number: memoNumber, egcs_fc_agreementnumber: source.egcs_fc_agreementnumber,
        egcs_fc_receiveddate: new Date('2026-10-03'), egcs_fc_amount: databaseMoneyValue(parseMoney(value)),
        egcs_fc_receiptreference: `${RECEIPT_PREFIX}${String(receiptNumber).padStart(3, '0')}`,
        egcs_fc_narrative_en: 'Recipient repayment received against the unused advance; allocated to the approved receivable.',
        egcs_fc_narrative_fr: 'Remboursement du bénéficiaire reçu pour l’avance inutilisée et affecté à la créance approuvée.',
        egcs_fc_createdby: String(root.id), egcs_fc_status: status('Draft')
      }).returning('id').executeTakeFirstOrThrow()
      await createPrimaryEntityAssignment(trx, 'fundingcaseaccountreceivablecreditmemo', String(memo.id), String(root.id))
      const recovery = await trx.insertInto('Funding_Case_Account_Receivable_Recovery').values({ egcs_fc_pool: String(source.egcs_fc_pool),
        egcs_fc_creditmemo: String(memo.id), egcs_fc_amount: databaseMoneyValue(parseMoney(value)) }).returning('id').executeTakeFirstOrThrow()
      await trx.insertInto('Funding_Case_Account_Receivable_Allocation').values({ egcs_fc_recovery: String(recovery.id), egcs_fc_receivable: String(debt.id),
        egcs_fc_receivableline: String(line.id), egcs_fc_fundingagreement: agreementId, egcs_fc_amount: databaseMoneyValue(parseMoney(value)) }).execute()
      await validateAccountReceivableRecovery(trx, String(recovery.id))
      await completeAndApprove('fundingcaseaccountreceivablecreditmemo', String(memo.id))
    }
  }
  await sql`SET CONSTRAINTS ALL IMMEDIATE`.execute(trx)
  await sql`SET CONSTRAINTS ALL DEFERRED`.execute(trx)
}

export const up = async (db: Kysely<Database>): Promise<void> => {
  if (db.isTransaction) await seedCreditMemoExamples(db as Transaction<Database>)
  else await db.transaction().execute(seedCreditMemoExamples)
}

export const down = async (db: Kysely<Database>): Promise<void> => {
  const evidence = await db.selectFrom('Funding_Case_Account_Receivable_Credit_Memo').select('id')
    .where('egcs_fc_receiptreference', 'like', `${RECEIPT_PREFIX}%`).executeTakeFirst()
  if (evidence) throw new Error('Approved demo repayments contain retained workflow and posting evidence; rollback requires an explicit demo reset.')
}
