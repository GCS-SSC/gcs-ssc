/* eslint-disable jsdoc/require-param, jsdoc/require-returns */
import type { H3Event } from 'h3'
import { sql } from 'kysely'
import type { Kysely, Selectable, Transaction } from 'kysely'
import type { Database, Entity_Type, TransferPaymentStreamTable } from '~~/shared/types/database'
import type { TransferPaymentStreamPolymorphicWizard } from '~~/shared/types/schemas'
import { badRequest as badRequestApiError } from './api-errors'
import { validateRecommendationSchemasForAgency, validateReviewSchemasForAgency } from './transfer-payment-polymorphic'
import { buildAmendmentTypeKey } from './transfer-payment-stream-uniqueness'
import { supportsDirectReviewConfiguration } from './entity-type-registry'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from './database-money'
import { addMoney, compareMoney, parseMoney, type Money } from '~~/shared/utils/money'

type StreamWizardTransaction = Transaction<Database>
type StreamWizardPayload = TransferPaymentStreamPolymorphicWizard
type CreatedStream = Selectable<TransferPaymentStreamTable>

interface ValidateStreamWizardReferencesOptions {
  event: H3Event
  db: StreamWizardTransaction
  profileId: string
  agencyId: string
  payload: StreamWizardPayload
}

/** Returns a bad-request response while preserving route-test global stubs. */
const routeBadRequest = async (
  event: H3Event,
  code: string,
  key: string
): Promise<unknown> => {
  const badRequestHandler = (globalThis as { badRequest?: typeof badRequestApiError }).badRequest ?? badRequestApiError
  return await badRequestHandler(event, code, key)
}

/** Checks whether a lookup result missed at least one requested id. */
const hasMissingId = (requestedIds: string[], rows: Array<{ id: string | number }>): boolean => {
  const validIds = new Set(rows.map(item => String(item.id)))
  return requestedIds.some(id => !validIds.has(id))
}

/** Builds a de-duplicated string id list from wizard child rows. */
const uniqueStrings = <T>(items: T[], getValue: (item: T) => string | number): string[] => {
  return [...new Set(items.map(item => String(getValue(item))))]
}

/** Validates that an optional parent stream belongs to the current transfer payment. */
const assertParentStreamReference = async (
  event: H3Event,
  db: StreamWizardTransaction,
  profileId: string,
  payload: StreamWizardPayload
): Promise<unknown | null> => {
  if (!payload.stream.egcs_tp_parentstream) {
    return null
  }

  const parentStream = await db
    .selectFrom('Transfer_Payment_Stream')
    .where('id', '=', payload.stream.egcs_tp_parentstream)
    .where('egcs_tp_transferpaymentprofile', '=', profileId)
    .where('_deleted', '=', false)
    .select('id')
    .forUpdate('Transfer_Payment_Stream')
    .executeTakeFirst()

  if (!parentStream) {
    return await routeBadRequest(
      event,
      'TRANSFER_PAYMENT_PARENT_STREAM_INVALID',
      'apiErrors.transfer_payment.parent_stream_invalid'
    )
  }

  return null
}

/** Validates stream budget references against the transfer payment profile. */
const assertBudgetReferences = async (
  event: H3Event,
  db: StreamWizardTransaction,
  profileId: string,
  payload: StreamWizardPayload
): Promise<unknown | null> => {
  if (payload.budgets.length === 0) {
    return null
  }

  const budgetIds = uniqueStrings(payload.budgets, item => item.egcs_tp_transferpaymentbudget)
  const budgets = await db
    .selectFrom('Transfer_Payment_Fiscal_Year_Budget')
    .where('id', 'in', budgetIds)
    .where('egcs_tp_transferpaymentprofile', '=', profileId)
    .where('_deleted', '=', false)
    .select(['id', databaseMoneyText(sql.ref('egcs_tp_totalbudget')).as('egcs_tp_totalbudget')])
    .orderBy('id', 'asc')
    .forUpdate('Transfer_Payment_Fiscal_Year_Budget')
    .execute()

  if (hasMissingId(budgetIds, budgets)) {
    return await routeBadRequest(event, 'TRANSFER_PAYMENT_BUDGET_NOT_FOUND', 'apiErrors.transfer_payment.budget_not_found')
  }

  const existingAllocations = await db.selectFrom('Transfer_Payment_Stream_Budget')
    .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentstream')
    .where('Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentbudget', 'in', budgetIds)
    .where('Transfer_Payment_Stream_Budget._deleted', '=', false)
    .where('Transfer_Payment_Stream._deleted', '=', false)
    .select([
      'Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentbudget as budget_id',
      databaseMoneyText(sql`COALESCE(SUM(${sql.ref('Transfer_Payment_Stream_Budget.egcs_tp_totalbudget')}), 0)`).as('total')
    ])
    .groupBy('Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentbudget')
    .execute()
  const allocatedByBudget = new Map(existingAllocations.map(item => [String(item.budget_id), parseDatabaseMoney(item.total)]))
  const requestedByBudget = new Map<string, Money>()
  const zero = parseMoney('0')
  for (const item of payload.budgets) {
    const budgetId = String(item.egcs_tp_transferpaymentbudget)
    requestedByBudget.set(budgetId, addMoney(requestedByBudget.get(budgetId) ?? zero, item.egcs_tp_totalbudget))
  }
  const exceedsCapacity = budgets.some(budget => {
    const budgetId = String(budget.id)
    return compareMoney(
      addMoney(allocatedByBudget.get(budgetId) ?? zero, requestedByBudget.get(budgetId) ?? zero),
      parseDatabaseMoney(budget.egcs_tp_totalbudget)
    ) > 0
  })
  if (exceedsCapacity) {
    return await routeBadRequest(
      event,
      'TRANSFER_PAYMENT_STREAM_BUDGET_EXCEEDS_PROGRAM_BUDGET',
      'apiErrors.transfer_payment.stream_budget_exceeds_program_budget'
    )
  }

  return null
}

/** Validates eligible recipient subtype references against the agency. */
const assertEligibleRecipientReferences = async (
  event: H3Event,
  db: StreamWizardTransaction,
  agencyId: string,
  payload: StreamWizardPayload
): Promise<unknown | null> => {
  if (payload.eligibleRecipients.length === 0) {
    return null
  }

  const stakeholderIds = uniqueStrings(payload.eligibleRecipients, item => item.egcs_tp_applicantrecipientsubtype)
  const stakeholders = await db
    .selectFrom('Agency_Applicant_Recipient_Subtype')
    .where('id', 'in', stakeholderIds)
    .where('egcs_ay_organizationagency', '=', agencyId)
    .where('_deleted', '=', false)
    .select('id')
    .orderBy('id', 'asc')
    .forUpdate('Agency_Applicant_Recipient_Subtype')
    .execute()

  if (hasMissingId(stakeholderIds, stakeholders)) {
    return await routeBadRequest(
      event,
      'INVALID_APPLICANT_RECIPIENT_SUBTYPE',
      'apiErrors.transfer_payment.invalid_applicant_recipient_subtype'
    )
  }

  return null
}

/** Validates cost category line item references against the agency. */
const assertCostCategoryReferences = async (
  event: H3Event,
  db: StreamWizardTransaction,
  agencyId: string,
  payload: StreamWizardPayload
): Promise<unknown | null> => {
  if (payload.costCategoryLineItems.length === 0) {
    return null
  }

  const lineItemIds = uniqueStrings(payload.costCategoryLineItems, item => item.egcs_tp_organizationcostcategory)
  const lineItems = await db
    .selectFrom('Agency_Cost_Category_Line_Item')
    .innerJoin(
      'Agency_Cost_Category',
      'Agency_Cost_Category.id',
      'Agency_Cost_Category_Line_Item.egcs_ay_organizationcostcategory'
    )
    .where('Agency_Cost_Category_Line_Item.id', 'in', lineItemIds)
    .where('Agency_Cost_Category.egcs_ay_organizationagency', '=', agencyId)
    .where('Agency_Cost_Category_Line_Item._deleted', '=', false)
    .where('Agency_Cost_Category._deleted', '=', false)
    .select('Agency_Cost_Category_Line_Item.id as id')
    .orderBy('Agency_Cost_Category_Line_Item.id', 'asc')
    .forUpdate(['Agency_Cost_Category_Line_Item', 'Agency_Cost_Category'])
    .execute()

  if (hasMissingId(lineItemIds, lineItems)) {
    return await routeBadRequest(
      event,
      'TRANSFER_PAYMENT_COST_CATEGORY_INVALID',
      'apiErrors.transfer_payment.invalid_cost_category_line_item'
    )
  }

  return null
}

/** Validates agency holdback bases selected for the new stream. */
const assertHoldbackBasisReferences = async (
  event: H3Event,
  db: StreamWizardTransaction,
  agencyId: string,
  payload: StreamWizardPayload
): Promise<unknown | null> => {
  if (payload.holdbackBases.length === 0) return null
  const ids = uniqueStrings(payload.holdbackBases, item => item.egcs_tp_agencyholdback)
  const rows = await db.selectFrom('Agency_Holdback_Basis').select('id')
    .where('id', 'in', ids).where('egcs_ay_organizationagency', '=', agencyId)
    .where('_deleted', '=', false).orderBy('id', 'asc').forUpdate('Agency_Holdback_Basis').execute()
  if (hasMissingId(ids, rows)) {
    return await routeBadRequest(event, 'INVALID_HOLDBACK_BASIS', 'apiErrors.transfer_payment.invalid_holdback_basis')
  }
  return null
}

/** Validates agreement subtype agreement-type references against the agency. */
const assertAgreementTypeReferences = async (
  event: H3Event,
  db: StreamWizardTransaction,
  agencyId: string,
  payload: StreamWizardPayload
): Promise<unknown | null> => {
  if (payload.agreementSubtypes.length === 0) {
    return null
  }

  const agreementTypeIds = uniqueStrings(payload.agreementSubtypes, item => item.egcs_tp_agreementtype)
  const agreementTypes = await db
    .selectFrom('Agency_Agreement_Type')
    .where('id', 'in', agreementTypeIds)
    .where('egcs_ay_organizationagency', '=', agencyId)
    .where('_deleted', '=', false)
    .select('id')
    .orderBy('id', 'asc')
    .forUpdate('Agency_Agreement_Type')
    .execute()

  if (hasMissingId(agreementTypeIds, agreementTypes)) {
    return await routeBadRequest(event, 'INVALID_AGREEMENT_TYPE', 'apiErrors.transfer_payment.invalid_agreement_type')
  }

  return null
}

/** Validates wizard-local amendment subtype references before insert transactions begin. */
const assertAmendmentSubtypeTempReferences = async (
  event: H3Event,
  payload: StreamWizardPayload
): Promise<unknown | null> => {
  if (payload.amendmentSubtypes.length === 0) {
    return null
  }

  const amendmentTypeTempIds = new Set(payload.amendmentTypes.map(item => item.tempId))
  const hasMissingTempReference = payload.amendmentSubtypes.some(item =>
    item.tempAmendmentTypeIds.some(id => !amendmentTypeTempIds.has(id))
  )

  if (hasMissingTempReference) {
    return await routeBadRequest(event, 'INVALID_AMENDMENT_TYPE', 'apiErrors.transfer_payment.invalid_amendment_type')
  }

  return null
}

/** Validates wizard-local chart-of-account references to stream budgets. */
const assertChartOfAccountBudgetReferences = async (
  event: H3Event,
  payload: StreamWizardPayload
): Promise<unknown | null> => {
  const budgetTempIds = new Set(payload.budgets.map(item => item.tempId))
  if ((payload.chartOfAccounts ?? []).some(item => !budgetTempIds.has(item.tempStreamBudgetId))) {
    return await routeBadRequest(event, 'TRANSFER_PAYMENT_BUDGET_NOT_FOUND', 'apiErrors.transfer_payment.budget_not_found')
  }

  return null
}

/** Builds de-duplicated review schema targets for batch validation. */
const buildReviewSchemaTargets = (
  payload: StreamWizardPayload
): Array<{ entityType: Entity_Type, schemaId: string }> => {
  const targets = new Map<string, { entityType: Entity_Type, schemaId: string }>()

  for (const reviewSetup of payload.reviewSetups ?? []) {
    for (const member of reviewSetup.members) {
      const schemaId = String(member.egcs_cn_reviewschema)
      targets.set(
        `${reviewSetup.egcs_cn_entitytype}:${schemaId}`,
        { entityType: reviewSetup.egcs_cn_entitytype as Entity_Type, schemaId }
      )
    }
  }

  return Array.from(targets.values())
}

/** Validates all review schemas referenced by wizard review setups. */
const assertReviewSchemaReferences = async (
  event: H3Event,
  db: StreamWizardTransaction,
  agencyId: string,
  payload: StreamWizardPayload
): Promise<unknown | null> => {
  const targets = buildReviewSchemaTargets(payload)
  if (targets.length === 0) {
    return null
  }

  const schemaIds = [...new Set(targets.map(target => target.schemaId))].sort()
  await db
    .selectFrom('Common_Review_Schema')
    .select('id')
    .where('id', 'in', schemaIds)
    .orderBy('id', 'asc')
    .forUpdate('Common_Review_Schema')
    .execute()

  const hasValidReviewSchemas = await validateReviewSchemasForAgency(db, agencyId, targets)
  if (!hasValidReviewSchemas) {
    return await routeBadRequest(event, 'REVIEW_SCHEMA_NOT_FOUND', 'apiErrors.transfer_payment.review_schema_not_found')
  }

  return null
}

/** Ensures every wizard Review Set target explicitly supports direct Reviews. */
const assertReviewTargetCapabilities = async (
  event: H3Event,
  db: StreamWizardTransaction,
  payload: StreamWizardPayload
): Promise<unknown | null> => {
  const entityTypes = [...new Set((payload.reviewSetups ?? []).map(setup => setup.egcs_cn_entitytype))]
  for (const entityType of entityTypes) {
    if (!await supportsDirectReviewConfiguration(db, entityType)) {
      return await routeBadRequest(event, 'UNSUPPORTED_REVIEW_ENTITY_TYPE', 'apiErrors.request.invalid')
    }
  }

  return null
}

/** Validates all recommendation schemas referenced by wizard recommendation setups. */
const assertRecommendationSchemaReferences = async (
  event: H3Event,
  db: StreamWizardTransaction,
  agencyId: string,
  payload: StreamWizardPayload
): Promise<unknown | null> => {
  const schemaIds = [...new Set((payload.recommendationSetups ?? []).flatMap(recommendationSetup =>
    recommendationSetup.members.map(member => String(member.egcs_cn_recommendationschema))))].sort()
  if (schemaIds.length > 0) {
    await db
      .selectFrom('Common_Recommendation_Schema')
      .select('id')
      .where('id', 'in', schemaIds)
      .orderBy('id', 'asc')
      .forUpdate('Common_Recommendation_Schema')
      .execute()
  }
  const hasValidRecommendationSchemas = await validateRecommendationSchemasForAgency(db, agencyId, schemaIds)

  if (!hasValidRecommendationSchemas) {
    return await routeBadRequest(
      event,
      'RECOMMENDATION_SCHEMA_NOT_FOUND',
      'apiErrors.transfer_payment.recommendation_schema_not_found'
    )
  }

  return null
}

/** Validates all external references in the stream wizard payload before inserts. */
export const validateTransferPaymentStreamWizardReferences = async ({
  event,
  db,
  profileId,
  agencyId,
  payload
}: ValidateStreamWizardReferencesOptions): Promise<unknown | null> => {
  const validators = [
    () => assertParentStreamReference(event, db, profileId, payload),
    () => assertBudgetReferences(event, db, profileId, payload),
    () => assertEligibleRecipientReferences(event, db, agencyId, payload),
    () => assertCostCategoryReferences(event, db, agencyId, payload),
    () => assertHoldbackBasisReferences(event, db, agencyId, payload),
    () => assertAgreementTypeReferences(event, db, agencyId, payload),
    () => assertAmendmentSubtypeTempReferences(event, payload),
    () => assertChartOfAccountBudgetReferences(event, payload),
    () => assertReviewTargetCapabilities(event, db, payload),
    () => assertReviewSchemaReferences(event, db, agencyId, payload),
    () => assertRecommendationSchemaReferences(event, db, agencyId, payload)
  ]

  for (const validate of validators) {
    const response = await validate()
    if (response) {
      return response
    }
  }

  return null
}

/** Inserts the root transfer payment stream row. */
const insertStreamWizardRoot = async (
  trx: StreamWizardTransaction,
  profileId: string,
  payload: StreamWizardPayload
): Promise<CreatedStream> => {
  return await trx
    .insertInto('Transfer_Payment_Stream')
    .values({
      egcs_tp_transferpaymentprofile: profileId,
      egcs_tp_parentstream: payload.stream.egcs_tp_parentstream ? String(payload.stream.egcs_tp_parentstream) : null,
      egcs_tp_name_en: payload.stream.egcs_tp_name_en,
      egcs_tp_name_fr: payload.stream.egcs_tp_name_fr,
      egcs_tp_description_en: payload.stream.egcs_tp_description_en,
      egcs_tp_description_fr: payload.stream.egcs_tp_description_fr,
      egcs_tp_abbreviation_en: payload.stream.egcs_tp_abbreviation_en,
      egcs_tp_abbreviation_fr: payload.stream.egcs_tp_abbreviation_fr,
      egcs_tp_objective_en: payload.stream.egcs_tp_objective_en,
      egcs_tp_objective_fr: payload.stream.egcs_tp_objective_fr,
      egcs_tp_allowsfurtherdistribution: payload.stream.egcs_tp_allowsfurtherdistribution,
      egcs_tp_active: payload.stream.egcs_tp_active
    })
    .returningAll()
    .executeTakeFirstOrThrow()
}

/** Inserts stream child rows that do not depend on generated ids from other inserts. */
const insertSimpleStreamWizardChildren = async (
  trx: StreamWizardTransaction,
  streamId: string,
  payload: StreamWizardPayload
): Promise<Map<string, string>> => {
  const streamBudgetIdByTempId = new Map<string, string>()
  if (payload.holdbackBases.length > 0) {
    await trx.insertInto('Transfer_Payment_Stream_Holdback_Basis').values(payload.holdbackBases.map(item => ({
      egcs_tp_transferpaymentstream: streamId,
      egcs_tp_agencyholdback: item.egcs_tp_agencyholdback,
      egcs_tp_name_en: item.egcs_tp_name_en,
      egcs_tp_name_fr: item.egcs_tp_name_fr
    }))).execute()
  }
  if (payload.budgets.length > 0) {
    const createdBudgets = await trx.insertInto('Transfer_Payment_Stream_Budget').values(payload.budgets.map(item => ({
      egcs_tp_transferpaymentstream: streamId,
      egcs_tp_totalbudget: databaseMoneyValue(item.egcs_tp_totalbudget),
      egcs_tp_transferpaymentbudget: item.egcs_tp_transferpaymentbudget,
      egcs_tp_overcommitthreshold: item.egcs_tp_overcommitthreshold
    }))).returning(['id', 'egcs_tp_transferpaymentbudget']).execute()
    if (createdBudgets.length !== payload.budgets.length) {
      throw new Error(
        `Stream budget insert count mismatch for stream wizard request: expected ${payload.budgets.length}, got ${createdBudgets.length}`
      )
    }
    const createdIdByProgramBudget = new Map(createdBudgets.map(item => [String(item.egcs_tp_transferpaymentbudget), String(item.id)]))
    for (const budget of payload.budgets) {
      const createdId = createdIdByProgramBudget.get(String(budget.egcs_tp_transferpaymentbudget))
      if (!createdId) throw new Error(`Missing created stream budget for wizard budget "${budget.tempId}"`)
      streamBudgetIdByTempId.set(budget.tempId, createdId)
    }
  }

  if (payload.eligibleRecipients.length > 0) {
    await trx.insertInto('Transfer_Payment_Stream_Eligible_Recipient').values(payload.eligibleRecipients.map(item => ({
      egcs_tp_transferpaymentstream: streamId,
      egcs_tp_applicantrecipientsubtype: item.egcs_tp_applicantrecipientsubtype
    }))).execute()
  }

  if (payload.costCategoryLineItems.length > 0) {
    await trx.insertInto('Transfer_Payment_Stream_Cost_Category_Line_Item').values(payload.costCategoryLineItems.map(item => ({
      egcs_tp_transferpaymentstream: streamId,
      egcs_tp_organizationcostcategory: item.egcs_tp_organizationcostcategory,
      egcs_tp_costsharingratio: item.egcs_tp_costsharingratio
    }))).execute()
  }

  return streamBudgetIdByTempId
}

/** Inserts amendment types and maps temp ids to generated database ids. */
const insertAmendmentTypes = async (
  trx: StreamWizardTransaction,
  streamId: string,
  payload: StreamWizardPayload
): Promise<Map<string, string>> => {
  const amendmentTypeIdMap = new Map<string, string>()

  if (payload.amendmentTypes.length === 0) {
    return amendmentTypeIdMap
  }

  const createdTypes = await trx
    .insertInto('Transfer_Payment_Amendment_Type')
    .values(payload.amendmentTypes.map(item => ({
      egcs_tp_transferpaymentstream: streamId,
      egcs_tp_amended: item.egcs_tp_amended,
      egcs_tp_name_en: item.egcs_tp_name_en,
      egcs_tp_name_fr: item.egcs_tp_name_fr,
      egcs_tp_requiresamendmentsubtype: item.egcs_tp_requiresamendmentsubtype
    })))
    .returning(['id', 'egcs_tp_amended', 'egcs_tp_name_en', 'egcs_tp_name_fr'])
    .execute()

  if (createdTypes.length !== payload.amendmentTypes.length) {
    throw new Error(
      `Amendment type insert count mismatch for stream wizard request: expected ${payload.amendmentTypes.length}, got ${createdTypes.length}`
    )
  }

  const createdTypeByKey = new Map<string, { id: string | number }>()
  for (const created of createdTypes) {
    const key = buildAmendmentTypeKey(created)
    if (createdTypeByKey.has(key)) {
      throw new Error(`Duplicate created amendment type key detected after insert: "${key}"`)
    }
    createdTypeByKey.set(key, created)
  }

  for (const item of payload.amendmentTypes) {
    const key = buildAmendmentTypeKey(item)
    const created = createdTypeByKey.get(key)
    if (!created) {
      throw new Error(`Missing created amendment type mapping for temp amendment type "${item.tempId}" using key "${key}"`)
    }
    amendmentTypeIdMap.set(item.tempId, String(created.id))
  }

  return amendmentTypeIdMap
}

/** Inserts amendment subtypes using generated amendment type ids. */
const insertAmendmentSubtypes = async (
  trx: StreamWizardTransaction,
  streamId: string,
  payload: StreamWizardPayload,
  amendmentTypeIdMap: Map<string, string>
): Promise<void> => {
  if (payload.amendmentSubtypes.length === 0) {
    return
  }

  for (const item of payload.amendmentSubtypes) {
    const amendmentTypeIds = item.tempAmendmentTypeIds.map(tempId => {
      const amendmentTypeId = amendmentTypeIdMap.get(tempId)
      if (!amendmentTypeId) throw new Error(`Missing mapped amendment type ID for temp amendment type "${tempId}"`)
      return amendmentTypeId
    })
    const subtype = await trx.insertInto('Transfer_Payment_Amendment_Subtype').values({
      egcs_tp_transferpaymentstream: streamId,
      egcs_tp_name_en: item.egcs_tp_name_en,
      egcs_tp_name_fr: item.egcs_tp_name_fr,
      egcs_tp_description_en: item.egcs_tp_description_en,
      egcs_tp_description_fr: item.egcs_tp_description_fr
    }).returning('id').executeTakeFirstOrThrow()
    await trx.insertInto('Transfer_Payment_Amendment_Subtype_Type').values(amendmentTypeIds.map(typeId => ({
      egcs_tp_amendmentsubtype: subtype.id,
      egcs_tp_amendmenttype: typeId,
      _deleted: false
    }))).execute()
  }
}

/** Inserts remaining direct stream setup child rows. */
const insertRemainingStreamWizardChildren = async (
  trx: StreamWizardTransaction,
  streamId: string,
  payload: StreamWizardPayload,
  streamBudgetIdByTempId: Map<string, string>
): Promise<void> => {
  if (payload.agreementSubtypes.length > 0) {
    await trx.insertInto('Transfer_Payment_Agreement_Subtype').values(payload.agreementSubtypes.map(item => ({
      egcs_tp_transferpaymentstream: streamId,
      egcs_tp_agreementtype: item.egcs_tp_agreementtype
    }))).execute()
  }

  if ((payload.chartOfAccounts ?? []).length > 0) {
    await trx.insertInto('Transfer_Payment_Stream_Chart_of_Account').values((payload.chartOfAccounts ?? []).map(item => {
      const streamBudgetId = streamBudgetIdByTempId.get(item.tempStreamBudgetId)
      if (!streamBudgetId) {
        throw new Error(`Missing created stream budget for chart of account "${item.tempId}"`)
      }
      return {
        egcs_tp_transferpaymentstream: streamId,
        egcs_tp_streambudget: streamBudgetId,
        egcs_tp_accountingdimensions: sql`${JSON.stringify(item.egcs_tp_accountingdimensions.map(({ label_en, label_fr, value }) => ({
          label_en,
          label_fr,
          value
        })))}::jsonb`
      }
    })).execute()
  }

  if ((payload.commitmentTypes ?? []).length > 0) {
    await trx.insertInto('Transfer_Payment_Stream_Commitment_Type').values(payload.commitmentTypes.map(item => ({
      egcs_tp_transferpaymentstream: streamId,
      egcs_tp_name_en: item.egcs_tp_name_en,
      egcs_tp_name_fr: item.egcs_tp_name_fr
    }))).execute()
  }

  if (payload.monitorTypes.length > 0) {
    await trx.insertInto('Transfer_Payment_Monitor_Type').values(payload.monitorTypes.map(item => ({
      egcs_tp_transferpaymentstream: streamId,
      egcs_tp_name_en: item.egcs_tp_name_en,
      egcs_tp_name_fr: item.egcs_tp_name_fr
    }))).execute()
  }

  if (payload.areasOfExpertise.length > 0) {
    await trx.insertInto('Transfer_Payment_Stream_Area_of_Expertise').values(payload.areasOfExpertise.map(item => ({
      egcs_tp_transferpaymentstream: streamId,
      egcs_tp_name_en: item.egcs_tp_name_en,
      egcs_tp_name_fr: item.egcs_tp_name_fr,
      egcs_tp_description_en: item.egcs_tp_description_en,
      egcs_tp_description_fr: item.egcs_tp_description_fr
    }))).execute()
  }
}

/** Inserts review set setup rows and their member setup rows. */
const insertStreamWizardReviewSetups = async (
  trx: StreamWizardTransaction,
  streamId: string,
  payload: StreamWizardPayload
): Promise<void> => {
  for (const setItem of payload.reviewSetups ?? []) {
    const createdReviewSet = await trx
      .insertInto('Common_Review_Set_Setup')
      .values({
        egcs_cn_scopetype: 'transferpaymentstream',
        egcs_cn_scopeid: streamId,
        egcs_cn_entitytype: setItem.egcs_cn_entitytype,
        egcs_cn_name_en: setItem.egcs_cn_name_en,
        egcs_cn_name_fr: setItem.egcs_cn_name_fr,
        egcs_cn_description_en: setItem.egcs_cn_description_en,
        egcs_cn_description_fr: setItem.egcs_cn_description_fr,
        egcs_cn_order: setItem.egcs_cn_order,
        egcs_cn_sequential: setItem.egcs_cn_sequential,
        egcs_cn_approvaltemplate: setItem.egcs_cn_approvaltemplate,
        _deleted: false
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    await trx.insertInto('Common_Review_Setup').values(setItem.members.map(member => ({
      egcs_cn_entitytype: setItem.egcs_cn_entitytype,
      egcs_cn_order: member.egcs_cn_order,
      egcs_cn_reviewset: String(createdReviewSet.id),
      egcs_cn_approvaltemplate: member.egcs_cn_approvaltemplate,
      egcs_cn_reviewschema: member.egcs_cn_reviewschema,
      egcs_cn_failonchecklistfailure: member.egcs_cn_failonchecklistfailure,
      egcs_cn_failurethreshold: member.egcs_cn_failurethreshold,
      _deleted: false
    }))).execute()
  }
}

/** Inserts recommendation setup rows for the new stream. */
const insertStreamWizardRecommendationSetups = async (
  trx: StreamWizardTransaction,
  streamId: string,
  payload: StreamWizardPayload
): Promise<void> => {
  for (const item of payload.recommendationSetups ?? []) {
    const createdSet = await trx.insertInto('Common_Recommendation_Set_Setup').values({
      egcs_cn_scopetype: 'transferpaymentstream',
      egcs_cn_scopeid: streamId,
      egcs_cn_name_en: item.egcs_cn_name_en,
      egcs_cn_name_fr: item.egcs_cn_name_fr,
      egcs_cn_description_en: item.egcs_cn_description_en,
      egcs_cn_description_fr: item.egcs_cn_description_fr,
      egcs_cn_approvaltemplate: item.egcs_cn_approvaltemplate,
      _deleted: false
    }).returning('id').executeTakeFirstOrThrow()

    if (item.members.length > 0) {
      await trx.insertInto('Common_Recommendation_Setup').values(item.members.map(member => ({
        egcs_cn_order: member.egcs_cn_order,
        egcs_cn_recommendationset: String(createdSet.id),
        egcs_cn_approvaltemplate: member.egcs_cn_approvaltemplate,
        egcs_cn_recommendationschema: member.egcs_cn_recommendationschema,
        egcs_cn_failonnotrecommended: member.egcs_cn_failonnotrecommended,
        _deleted: false
      }))).execute()
    }
  }
}

/** Inserts the optional financial limit row for the new stream. */
const insertStreamWizardFinancialLimit = async (
  trx: StreamWizardTransaction,
  streamId: string,
  payload: StreamWizardPayload
): Promise<void> => {
  if (!payload.financialLimit) {
    return
  }

  await trx
    .insertInto('Transfer_Payment_Financial_Limits')
    .values({
      egcs_tp_transferpaymentstream: streamId,
      egcs_tp_maxallowableperrecipient: databaseMoneyValue(payload.financialLimit.egcs_tp_maxallowableperrecipient),
      egcs_tp_maxpercentofsupportavailableperrecipient:
        payload.financialLimit.egcs_tp_maxpercentofsupportavailableperrecipient,
      egcs_tp_maxpercentofretroactivecostsallowable:
        payload.financialLimit.egcs_tp_maxpercentofretroactivecostsallowable,
      egcs_tp_stackinglimit: payload.financialLimit.egcs_tp_stackinglimit,
      egcs_tp_active: payload.financialLimit.egcs_tp_active
    })
    .execute()
}

/** Creates a stream and all nested wizard setup records inside an existing locked transaction. */
export const createTransferPaymentStreamFromWizardInTransaction = async (
  trx: StreamWizardTransaction,
  profileId: string,
  payload: StreamWizardPayload
): Promise<CreatedStream> => {
  const createdStream = await insertStreamWizardRoot(trx, profileId, payload)
  const streamId = String(createdStream.id)

  const streamBudgetIdByTempId = await insertSimpleStreamWizardChildren(trx, streamId, payload)
  const amendmentTypeIdMap = await insertAmendmentTypes(trx, streamId, payload)
  await insertAmendmentSubtypes(trx, streamId, payload, amendmentTypeIdMap)
  await insertRemainingStreamWizardChildren(trx, streamId, payload, streamBudgetIdByTempId)
  await insertStreamWizardReviewSetups(trx, streamId, payload)
  await insertStreamWizardRecommendationSetups(trx, streamId, payload)
  await insertStreamWizardFinancialLimit(trx, streamId, payload)

  return createdStream
}

/** Creates a stream and all nested wizard setup records in one transaction. */
export const createTransferPaymentStreamFromWizard = async (
  db: Kysely<Database>,
  profileId: string,
  payload: StreamWizardPayload
): Promise<CreatedStream> => {
  return await db.transaction().execute(async trx =>
    await createTransferPaymentStreamFromWizardInTransaction(trx, profileId, payload)
  )
}
