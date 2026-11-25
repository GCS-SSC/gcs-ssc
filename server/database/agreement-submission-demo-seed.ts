import { sql, type Insertable, type Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { AgreementSubmissionTable, ClaimSubmissionReferenceSnapshot } from '~~/shared/types/agreement-submission-database'
import type {
  AgreementCustomFieldValues,
  AssignedAgencyCustomFieldDefinition,
  ClaimCustomFieldSnapshot
} from '~~/shared/types/schemas/agreement-custom-fields'
import { claimCustomFieldSnapshot } from '~~/shared/utils/claim-custom-field-snapshot'
import { readClaimSubmissionEvidence } from '../utils/agreement-submission-claim-evidence'
import { readAssignedAgencyCustomFieldDefinitions } from './stream-custom-field-definitions'

/**
 * Seeds repeatable review examples for the Aurora Community Centre Equipment Upgrade.
 * @param db - Transaction already restoring the demo snapshot.
 */
export const seedAgreementSubmissionDemo = async (db: Transaction<Database>): Promise<void> => {
  const agreement = await db.selectFrom('Funding_Case_Agreement_Profile')
    .select(['id', 'egcs_fc_transferpaymentstream']).where('id', '=', '120').executeTakeFirstOrThrow()
  const reviewer = await db.selectFrom('Common_Entity_Assignment').select('egcs_cn_user')
    .where('egcs_cn_entityid', '=', agreement.id).where('egcs_cn_entitytype', '=', 'fundingcaseagreement')
    .where('egcs_cn_isprimary', '=', true).where('_deleted', '=', false).executeTakeFirstOrThrow()
  const actor = reviewer.egcs_cn_user

  const draftStatus = await db.selectFrom('Common_Status').select('id')
    .where('egcs_cn_agency', '=', '21').where('egcs_cn_isdraft', '=', true)
    .where('_deleted', '=', false).executeTakeFirstOrThrow()
  const type = await db.insertInto('Transfer_Payment_Amendment_Type').values({
    egcs_tp_transferpaymentstream: agreement.egcs_fc_transferpaymentstream,
    egcs_tp_amended: 'budget',
    egcs_tp_name_en: 'Submission budget revision',
    egcs_tp_name_fr: 'Révision budgétaire de la soumission',
    egcs_tp_requiresamendmentsubtype: false
  }).returning('id').executeTakeFirstOrThrow()
  await sql`SET CONSTRAINTS trg_enforce_fundingcaseamendment_assignment_roster DEFERRED`.execute(db)
  const amendment = await db.insertInto('Funding_Case_Agreement_Amendment').values({
    egcs_fc_fundingagreement: agreement.id,
    egcs_fc_amendmentnumber: 1,
    egcs_fc_name_en: 'Community centre budget revision',
    egcs_fc_name_fr: 'Révision budgétaire du centre communautaire',
    egcs_fc_status: draftStatus.id
  }).returning('id').executeTakeFirstOrThrow()
  await db.insertInto('Funding_Case_Agreement_Amendment_Type').values({
    egcs_fc_amendment: amendment.id,
    egcs_fc_amendmenttype: type.id
  }).execute()
  await db.insertInto('Common_Entity_Assignment').values({
    egcs_cn_entitytype: 'fundingcaseamendment',
    egcs_cn_entityid: amendment.id,
    egcs_cn_user: actor,
    egcs_cn_createdby: actor,
    egcs_cn_isprimary: true
  }).execute()
  await sql`SET CONSTRAINTS trg_enforce_fundingcaseamendment_assignment_roster IMMEDIATE`.execute(db)
  const live = await db.selectFrom('Funding_Case_Agreement_Budget_Version').select('id')
    .where('egcs_fc_fundingagreement', '=', agreement.id).where('egcs_fc_iscurrent', '=', true)
    .where('_deleted', '=', false).executeTakeFirstOrThrow()
  const proposal = await db.insertInto('Funding_Case_Agreement_Budget_Version').values({
    egcs_fc_fundingagreement: agreement.id,
    egcs_fc_amendment: amendment.id,
    egcs_fc_sourceversion: live.id,
    egcs_fc_iscurrent: false
  }).returning('id').executeTakeFirstOrThrow()
  const year = await db.insertInto('Funding_Case_Agreement_Budget_Fiscal_Year').values({
    egcs_fc_fundingagreement: agreement.id,
    egcs_fc_budgetversion: proposal.id,
    egcs_fc_originalbudgetfiscalyear: '7',
    egcs_fc_fiscalyear: '41'
  }).returning('id').executeTakeFirstOrThrow()
  const { id: lineId, ...line } = await db.selectFrom('Funding_Case_Agreement_Budget_Line_Item').selectAll()
    .where('id', '=', '14').where('egcs_fc_budgetversion', '=', live.id).executeTakeFirstOrThrow()
  await db.insertInto('Funding_Case_Agreement_Budget_Line_Item').values({
    ...line,
    egcs_fc_budgetversion: proposal.id,
    egcs_fc_originalbudgetlineitem: lineId,
    egcs_fc_fundingagreementbudgetfiscalyear: year.id
  }).execute()

  const [supportingDetails, volunteerHours, deliveryMethod] = await db.insertInto('Agency_Custom_Field').values([
    {
      egcs_ay_agency: '21',
      egcs_ay_name_en: 'Required supporting details',
      egcs_ay_name_fr: 'Renseignements justificatifs requis',
      egcs_ay_kind: 'text',
      egcs_ay_presentation: 'multiline'
    },
    {
      egcs_ay_agency: '21',
      egcs_ay_name_en: 'Volunteer hours',
      egcs_ay_name_fr: 'Heures de bénévolat',
      egcs_ay_kind: 'number',
      egcs_ay_minimum: 0,
      egcs_ay_maximum: 200,
      egcs_ay_decimalplaces: 0
    },
    {
      egcs_ay_agency: '21',
      egcs_ay_name_en: 'Delivery method',
      egcs_ay_name_fr: 'Mode de livraison',
      egcs_ay_kind: 'relational'
    }
  ]).returning('id').execute()
  if (!supportingDetails || !volunteerHours || !deliveryMethod) throw new Error('Claim demo fields were not created')
  const [supplierDelivery, localPickup] = await db.insertInto('Agency_Custom_Field_Option').values([
    {
      egcs_ay_field: deliveryMethod.id,
      egcs_ay_name_en: 'Supplier delivery',
      egcs_ay_name_fr: 'Livraison par le fournisseur',
      egcs_ay_category_en: null,
      egcs_ay_category_fr: null,
      egcs_ay_displayorder: 1
    },
    {
      egcs_ay_field: deliveryMethod.id,
      egcs_ay_name_en: 'Local pickup',
      egcs_ay_name_fr: 'Ramassage local',
      egcs_ay_category_en: null,
      egcs_ay_category_fr: null,
      egcs_ay_displayorder: 2
    }
  ]).returning('id').execute()
  if (!supplierDelivery || !localPickup) throw new Error('Claim demo options were not created')
  await db.insertInto('Transfer_Payment_Stream_Field_Assignment').values(
    [supportingDetails, volunteerHours, deliveryMethod].map((field, index) => ({
      egcs_tp_transferpaymentstream: agreement.egcs_fc_transferpaymentstream,
      egcs_tp_agencyfield: field.id,
      egcs_tp_target: 'claim',
      egcs_tp_required: index === 0,
      egcs_tp_displayorder: index + 1
    } satisfies Insertable<Database['Transfer_Payment_Stream_Field_Assignment']>))
  ).execute()
  await db.insertInto('Transfer_Payment_Stream_Field_Assignment').values(
    [volunteerHours, deliveryMethod].map((field, index) => ({
      egcs_tp_transferpaymentstream: agreement.egcs_fc_transferpaymentstream,
      egcs_tp_agencyfield: field.id,
      egcs_tp_target: 'forecast',
      egcs_tp_required: false,
      egcs_tp_displayorder: index + 1
    }))
  ).execute()
  const forecastDefinitions = await readAssignedAgencyCustomFieldDefinitions(db, agreement.egcs_fc_transferpaymentstream, 'forecast')
  const claimDefinitions = await readAssignedAgencyCustomFieldDefinitions(db, agreement.egcs_fc_transferpaymentstream, 'claim')
  const customFields = {
    [supportingDetails.id]: 'The supplier invoice includes furniture and installation.',
    [volunteerHours.id]: 18,
    [deliveryMethod.id]: [supplierDelivery.id]
  } satisfies AgreementCustomFieldValues
  const claim = {
    applicantRecipientId: '119',
    fiscalYearId: '7',
    isFinalForYear: false,
    periodStart: 0,
    periodEnd: 2,
    receivedDate: '2026-06-30',
    customFields,
    lineItems: [{
      budgetLineItemId: '14',
      description: 'Accessible furniture and installation',
      amount: { amount: '250000', currency: 'CAD' }
    }]
  }
  const forecast = {
    customFields: {
      [volunteerHours.id]: 18,
      [deliveryMethod.id]: [supplierDelivery.id]
    } satisfies AgreementCustomFieldValues,
    applicantRecipientId: '119',
    fiscalYearId: '7',
    lineItems: [{
      budgetLineItemId: '14', month: 3, description: 'Equipment and installation',
      submittedCostCategory: 'Community infrastructure', submittedCostSubsection: 'Community centre equipment',
      amount: { amount: '800000', currency: 'CAD' }
    }]
  }
  const proposedBudget = {
    fiscalYears: [{
      fiscalYearId: '41',
      lineItems: [{
        id: '14',
        egcs_fc_applicantrecipient: '119',
        egcs_fc_organizationcostcategory: '89',
        egcs_fc_costsubsection: 'Community centre equipment',
        egcs_fc_costsubsection_fr: 'Équipement du centre communautaire',
        egcs_fc_description: 'Equipment, furniture, and installation',
        egcs_fc_description_fr: 'Équipement, mobilier et installation',
        egcs_fc_totalamount: { amount: '14900000', currency: 'CAD' },
        egcs_fc_programfunding: { amount: '14900000', currency: 'CAD' },
        egcs_fc_currency: 'cad'
      }]
    }]
  }

  const sampleDefaults = {
    egcs_fc_fundingagreement: agreement.id,
    egcs_fc_sourcesystem: 'demo',
    egcs_fc_sourcerevision: '1',
    egcs_fc_formatversion: 1,
    egcs_fc_state: 'submitted',
    egcs_fc_mode: 'review',
    egcs_fc_revision: 1,
    egcs_fc_amendment: null,
    egcs_fc_budgetrevision: null,
    egcs_fc_blocker: null,
    egcs_fc_result: null,
    egcs_fc_updatedby: null
  } satisfies Partial<Insertable<AgreementSubmissionTable>>

  await sql`SET CONSTRAINTS trg_enforce_fundingcaseagreementclaim_assignment_roster, trg_enforce_fundingcaseforecast_assignment_roster DEFERRED`.execute(db)
  /**
   * Assigns a seeded financial Draft to the reviewer.
   * @param id - Draft identifier.
   * @param entityType - Financial assignment root.
   * @returns Insert result.
   */
  const assignDraft = (id: string, entityType: 'fundingcaseagreementclaim' | 'fundingcaseforecast') => db
    .insertInto('Common_Entity_Assignment').values({
      egcs_cn_entitytype: entityType, egcs_cn_entityid: id, egcs_cn_user: actor,
      egcs_cn_createdby: actor, egcs_cn_isprimary: true
    }).execute()
  /**
   * Creates a native Draft Claim using the demo's active budget line.
   * @param snapshot - Latest submitted Claim payload.
   * @returns Draft Claim identifier.
   */
  const createClaim = async (snapshot: Omit<typeof claim, 'lineItems'> & {
    lineItems: Array<(typeof claim.lineItems)[number] & { submittedCostCategory?: string; submittedCostSubsection?: string; sourceLineId?: string }>
  }) => {
    const draft = await db.insertInto('Funding_Case_Agreement_Claim').values({
      egcs_fc_fundingagreement: agreement.id,
      egcs_fc_applicantrecipient: claim.applicantRecipientId,
      egcs_fc_fiscalyear: claim.fiscalYearId,
      egcs_fc_isfinalforyear: claim.isFinalForYear,
      egcs_fc_periodstart: claim.periodStart, egcs_fc_periodend: claim.periodEnd,
      egcs_fc_receiveddate: new Date(`${snapshot.receivedDate}T00:00:00Z`), egcs_fc_status: draftStatus.id,
      egcs_fc_customfields: snapshot.customFields,
      egcs_fc_customfielddefinitions: sql<AssignedAgencyCustomFieldDefinition[]>`${JSON.stringify(claimDefinitions)}::jsonb`
    }).returning('id').executeTakeFirstOrThrow()
    await db.insertInto('Funding_Case_Agreement_Claim_Line_Item').values(snapshot.lineItems.map(line => ({
      egcs_fc_fundingagreementclaim: draft.id,
      egcs_fc_fundingagreementbudgetlineitem: line.budgetLineItemId,
      egcs_fc_description: line.description,
      egcs_fc_sourcesubmissionlineid: line.sourceLineId,
      egcs_fc_submittedcostcategory: line.submittedCostCategory,
      egcs_fc_submittedcostsubsection: line.submittedCostSubsection,
      egcs_fc_amount: line.amount.amount,
      egcs_fc_totalamount: line.amount.amount,
      egcs_fc_currency: 'cad'
    }))).execute()
    await assignDraft(draft.id, 'fundingcaseagreementclaim')
    return draft.id
  }
  /**
   * Creates the Draft Forecast with its current submitted amount.
   * @param amount - Current amount in minor units.
   * @param answers - Current pinned answers.
   * @returns Draft Forecast identifier for the demo fiscal year.
   */
  const createForecast = async (amount = '800000', answers: AgreementCustomFieldValues = forecast.customFields) => {
    const version = await db.selectFrom('Funding_Case_Agreement_Forecast')
      .select(eb => eb.fn.max('egcs_fc_version').as('version'))
      .where('egcs_fc_fundingagreement', '=', agreement.id).where('egcs_fc_fiscalyear', '=', forecast.fiscalYearId)
      .executeTakeFirstOrThrow()
    const draft = await db.insertInto('Funding_Case_Agreement_Forecast').values({
      egcs_fc_customfielddefinitions: sql<AssignedAgencyCustomFieldDefinition[]>`${JSON.stringify(forecastDefinitions)}::jsonb`,
      egcs_fc_customfields: answers,
      egcs_fc_fundingagreement: agreement.id, egcs_fc_fiscalyear: forecast.fiscalYearId,
      egcs_fc_version: String(BigInt(version.version ?? '-1') + BigInt(1)), egcs_fc_status: draftStatus.id
    }).returning('id').executeTakeFirstOrThrow()
    await db.insertInto('Funding_Case_Agreement_Forecast_Line_Item').values({
      egcs_fc_agreementforecast: draft.id, egcs_fc_fundingagreementbudgetlineitem: '14',
      egcs_fc_month: 3, egcs_fc_amount: amount, egcs_fc_totalamount: amount, egcs_fc_currency: 'cad'
    }).execute()
    await assignDraft(draft.id, 'fundingcaseforecast')
    return draft.id
  }
  const reviewDescription = 'Equipment costs pending supporting detail'
  const claimToReturn = { ...claim, lineItems: claim.lineItems.map(item => ({ ...item, description: reviewDescription })) }
  const furniture = {
    ...claim.lineItems[0]!,
    sourceLineId: 'furniture',
    submittedCostCategory: 'Community infrastructure',
    submittedCostSubsection: 'Community centre equipment'
  }
  const delivery = {
    sourceLineId: 'delivery',
    budgetLineItemId: '14',
    description: 'Equipment delivery to the community centre',
    submittedCostCategory: 'Delivery and installation',
    submittedCostSubsection: 'Freight',
    amount: { amount: '43000', currency: 'CAD' }
  }
  const fittings = {
    sourceLineId: 'fittings',
    budgetLineItemId: '14',
    description: 'Wall mounting hardware and safety fittings',
    submittedCostCategory: 'Equipment',
    submittedCostSubsection: 'Hardware',
    amount: { amount: '18000', currency: 'CAD' }
  }
  const receivedClaim = { ...claim, lineItems: [furniture, delivery, fittings] }
  const returnedFurniture = { ...furniture, amount: { amount: '240000', currency: 'CAD' } }
  const returnedDelivery = {
    ...delivery,
    description: 'Delivery and placement of accessible furniture',
    submittedCostSubsection: 'Local delivery'
  }
  const returnedClaim = {
    ...receivedClaim,
    customFields: {
      ...customFields,
      [supportingDetails.id]: 'Please separate freight from installation on the invoice.',
      [volunteerHours.id]: 16
    },
    lineItems: [returnedFurniture, returnedDelivery, fittings]
  }
  const correctedClaim = {
    ...returnedClaim,
    receivedDate: '2026-07-02',
    customFields: {
      [supportingDetails.id]: 'The corrected invoice lists freight and installation separately.',
      [deliveryMethod.id]: [localPickup.id]
    },
    lineItems: [
      { ...returnedFurniture, amount: { amount: '245000', currency: 'CAD' } },
      { ...returnedDelivery, amount: { amount: '39500', currency: 'CAD' } },
      { ...fittings, submittedCostCategory: 'Installation supplies', submittedCostSubsection: 'Safety fittings' }
    ]
  }
  const acceptedForecast = {
    ...forecast,
    customFields: { ...forecast.customFields, [volunteerHours.id]: 24 },
    lineItems: forecast.lineItems.map(line => ({ ...line, amount: { ...line.amount, amount: '725000' } }))
  }
  const samples: Insertable<AgreementSubmissionTable>[] = [
    { ...sampleDefaults, egcs_fc_sourceid: 'CLAIM-JUNE', egcs_fc_target: 'claim', egcs_fc_payload: claim, egcs_fc_result: await createClaim(claim) },
    { ...sampleDefaults, egcs_fc_sourceid: 'FORECAST-JULY', egcs_fc_target: 'forecast', egcs_fc_payload: forecast, egcs_fc_result: await createForecast() },
    {
      ...sampleDefaults,
      egcs_fc_sourceid: 'CLAIM-NEEDS-REVISION',
      egcs_fc_target: 'claim',
      egcs_fc_payload: claimToReturn,
      egcs_fc_result: await createClaim(claimToReturn)
    },
    {
      ...sampleDefaults,
      egcs_fc_sourceid: 'BUDGET-REPLACEMENT',
      egcs_fc_target: 'amendment_budget',
      egcs_fc_mode: 'automatic',
      egcs_fc_blocker: 'SUBMISSION_AMENDMENT_REQUIRED',
      egcs_fc_payload: proposedBudget
    },
    {
      ...sampleDefaults,
      egcs_fc_sourceid: 'FORECAST-RETURNED',
      egcs_fc_target: 'forecast',
      egcs_fc_state: 'returned',
      egcs_fc_revision: 3,
      egcs_fc_updatedby: actor,
      egcs_fc_payload: forecast,
      egcs_fc_result: await createForecast()
    },
    {
      ...sampleDefaults,
      egcs_fc_sourceid: 'CLAIM-JOURNEY',
      egcs_fc_target: 'claim',
      egcs_fc_sourcerevision: '2',
      egcs_fc_revision: 4,
      egcs_fc_payload: correctedClaim,
      egcs_fc_result: await createClaim(correctedClaim)
    },
    {
      ...sampleDefaults,
      egcs_fc_sourceid: 'FORECAST-JOURNEY',
      egcs_fc_target: 'forecast',
      egcs_fc_state: 'accepted',
      egcs_fc_revision: 3,
      egcs_fc_updatedby: actor,
      egcs_fc_payload: acceptedForecast,
      egcs_fc_result: await createForecast('725000', acceptedForecast.customFields)
    }
  ]
  await sql`SET CONSTRAINTS trg_enforce_fundingcaseagreementclaim_assignment_roster, trg_enforce_fundingcaseforecast_assignment_roster IMMEDIATE`.execute(db)
  for (const sample of samples) {
    const row = await db.insertInto('Funding_Case_Agreement_Submission').values(sample)
      .returningAll().executeTakeFirstOrThrow()
    const event = {
      egcs_fc_submission: row.id,
      egcs_fc_sourcerevision: row.egcs_fc_sourcerevision,
      egcs_fc_formatversion: row.egcs_fc_formatversion
    }
    const claimJourney = row.egcs_fc_sourceid === 'CLAIM-JOURNEY'
    const forecastJourney = row.egcs_fc_sourceid === 'FORECAST-JOURNEY'
    const original = {
      ...event,
      egcs_fc_sourcerevision: '1',
      egcs_fc_kind: 'received' as const,
      egcs_fc_payload: claimJourney ? receivedClaim : forecastJourney ? forecast : row.egcs_fc_payload,
      egcs_fc_description: null,
      egcs_fc_actor: null
    }
    const review = {
      ...original,
      egcs_fc_kind: 'review_started' as const,
      egcs_fc_payload: null,
      egcs_fc_actor: actor
    }
    const history: Insertable<Database['Funding_Case_Agreement_Submission_Event']>[] = [original]
    if (claimJourney || forecastJourney || row.egcs_fc_state === 'returned') {
      history.push(review, {
        ...original,
        egcs_fc_kind: forecastJourney ? 'accepted' : 'returned',
        egcs_fc_payload: claimJourney ? returnedClaim : row.egcs_fc_payload,
        egcs_fc_description: claimJourney
          ? 'Please confirm the equipment amount and clarify the delivery charges.'
          : forecastJourney ? null : 'Please confirm the July forecast amount.',
        egcs_fc_actor: actor
      })
    }
    if (claimJourney) history.push({ ...original, ...event, egcs_fc_payload: correctedClaim })
    const claimReferences = row.egcs_fc_target === 'claim' && row.egcs_fc_result
      ? (await readClaimSubmissionEvidence(db, row.egcs_fc_result)).references
      : null
    await db.insertInto('Funding_Case_Agreement_Submission_Event').values(history.map(entry => {
      if (!entry.egcs_fc_payload) return entry
      if (row.egcs_fc_target === 'forecast') {
        const answers = entry.egcs_fc_kind === 'accepted' ? acceptedForecast.customFields : forecast.customFields
        const snapshot = claimCustomFieldSnapshot(forecastDefinitions, answers)
        return { ...entry, egcs_fc_forecastcustomfields: sql<ClaimCustomFieldSnapshot>`${JSON.stringify(snapshot)}::jsonb` }
      }
      if (row.egcs_fc_target !== 'claim') return entry
      const answers = entry.egcs_fc_kind === 'returned'
        ? returnedClaim.customFields
        : claimJourney && entry.egcs_fc_sourcerevision === '2' ? correctedClaim.customFields : customFields
      const customFieldSnapshot = claimCustomFieldSnapshot(claimDefinitions, answers)
      return {
        ...entry,
        egcs_fc_claimcustomfields: sql<ClaimCustomFieldSnapshot>`${JSON.stringify(customFieldSnapshot)}::jsonb`,
        egcs_fc_claimreferences: claimReferences ? sql<ClaimSubmissionReferenceSnapshot>`${JSON.stringify(claimReferences)}::jsonb` : null
      }
    })).execute()
  }
}
