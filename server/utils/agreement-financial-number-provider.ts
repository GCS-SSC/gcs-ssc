import { createError, isError, type H3Event } from 'h3'
import { useEvent } from 'nitropack/runtime'
import type { Kysely, Transaction } from 'kysely'
import { z } from 'zod'
import type { GcsAgreementFinancialNumberContext, GcsAgreementFinancialNumberProvider } from '@gcs-ssc/extensions/server'
import { getGcsExtensions, loadGcsExtensionModule } from '#gcs-extensions/server-registry'
import { isCanonicalNonNegativePostgresBigintText } from '~~/shared/utils/database-id'
import { QuestionnaireResponseEnvelopeSchema } from '~~/shared/types/schemas/questionnaire'
import type { Database } from '~~/shared/types/database'
import { throwApiError } from './api-errors'

const policySchema = z.object({
  required: z.boolean(),
  readOnly: z.boolean(),
  value: z.string().trim().refine(isCanonicalNonNegativePostgresBigintText).nullable().optional()
})
type PolicyContext = GcsAgreementFinancialNumberContext extends infer Context
  ? Context extends GcsAgreementFinancialNumberContext ? Omit<Context, 'agencyConfig'> : never
  : never

const errors = {
  invalid: { code: 'AGREEMENT_FINANCIAL_NUMBER_PROVIDER_INVALID', key: 'apiErrors.agreement.financial_number_provider_invalid' },
  required: { code: 'AGREEMENT_FINANCIAL_NUMBER_REQUIRED', key: 'apiErrors.agreement.financial_number_required' },
  readOnly: { code: 'AGREEMENT_FINANCIAL_NUMBER_READ_ONLY', key: 'apiErrors.agreement.financial_number_read_only' }
} as const

export const isAgreementFinancialNumberProviderError = (error: unknown) =>
  isError(error) && typeof error.data === 'object' && error.data !== null
  && 'code' in error.data && error.data.code === errors.invalid.code

/**
 * Reports a policy failure at an HTTP or background workflow boundary.
 * @param event Current HTTP event when available.
 * @param reason Policy failure category.
 * @returns Rejected promise with a stable API error code.
 */
const fail = async (event: H3Event | undefined, reason: keyof typeof errors): Promise<never> => {
  const { code, key } = errors[reason]
  if (event) return await throwApiError(event, { statusCode: 409, code, key })
  throw createError({ statusCode: 409, message: code, data: { code, translation: { key } } })
}

/**
 * Reads the enabled Agency provider and validates its policy.
 * @param event Current HTTP event when available.
 * @param db Authorized request snapshot or write transaction.
 * @param context Operation and Agreement field context.
 * @returns Validated field policy.
 */
export const resolveAgreementFinancialNumberPolicy = async (
  event: H3Event | undefined,
  db: Kysely<Database>,
  context: PolicyContext
): Promise<z.infer<typeof policySchema>> => {
  const providers = (await getGcsExtensions()).flatMap(extension => extension.agreementFinancialNumberProvider
    ? [{ key: extension.key, id: extension.agreementFinancialNumberProvider.id }]
    : [])
  if (providers.length === 0) return { required: false, readOnly: false }
  const enablements = await db.selectFrom('extensions.agency_enablement as enablement')
    .innerJoin('Agency_Profile as agency', 'agency.id', 'enablement.agency_id')
    .select(['enablement.extension_key', 'enablement.config']).where('enablement.agency_id', '=', context.agencyId)
    .where('enablement.extension_key', 'in', providers.map(provider => provider.key))
    .where('enablement.enabled', '=', true).where('enablement._deleted', '=', false).where('agency._deleted', '=', false).execute()
  if (enablements.length === 0) return { required: false, readOnly: false }
  const [enabled] = enablements
  const provider = providers.find(item => item.key === enabled?.extension_key)
  if (enablements.length !== 1 || !enabled || !provider) return await fail(event, 'invalid')

  try {
    const module = await loadGcsExtensionModule(provider.id) as { default?: GcsAgreementFinancialNumberProvider }
    if (typeof module.default !== 'function') throw new TypeError('Missing financial number provider export')
    const config = z.record(z.string(), z.json()).parse(enabled.config)
    return policySchema.parse(await module.default({ ...context, agencyConfig: config }))
  } catch {
    return await fail(event, 'invalid')
  }
}

/**
 * Enforces field ownership and resolves the effective value for a write.
 * @param event Current HTTP event when available.
 * @param db Authorized write transaction.
 * @param context Operation and Agreement field context.
 * @returns Financial System Number to persist.
 */
export const applyAgreementFinancialNumberPolicy = async (
  event: H3Event | undefined,
  db: Kysely<Database>,
  context: PolicyContext
): Promise<string | null> => {
  const policy = await resolveAgreementFinancialNumberPolicy(event, db, context)
  const submittedValue = context.operation === 'approval' ? undefined : context.submittedValue
  if ((policy.readOnly || policy.value !== undefined) && submittedValue !== undefined && submittedValue !== context.currentValue) {
    return await fail(event, 'readOnly')
  }
  const value = policy.value !== undefined
    ? policy.value
    : submittedValue !== undefined ? submittedValue : context.currentValue
  if (policy.required && value === null) return await fail(event, 'required')
  return value
}

/**
 * Reads only successful collection items belonging to the approval run.
 * @param trx Active workflow transaction.
 * @param runId Exact approval run.
 * @returns Finalized responses with their runtime item and setup identifiers.
 */
const readFinalizedAnswers = async (trx: Transaction<Database>, runId: string) => {
  const rows = await trx.selectFrom('Common_Data_Collection as collection')
    .innerJoin('Common_Runtime_Item as item', 'item.id', 'collection.egcs_cn_runtimeitem')
    .select(['item.id as runtimeItemId', 'collection.egcs_cn_datacollectionsetup as setupId', 'collection.egcs_cn_response as response'])
    .where('item.egcs_cn_runtime', '=', runId)
    .where('item.egcs_cn_kind', '=', 'data_collection')
    .where('item.egcs_cn_state', 'in', ['succeeded', 'approved'])
    .where('item._deleted', '=', false).where('collection._deleted', '=', false)
    .orderBy('item.egcs_cn_order').orderBy('item.id').execute()

  return rows.map(row => ({
    runtimeItemId: String(row.runtimeItemId),
    setupId: String(row.setupId),
    answers: QuestionnaireResponseEnvelopeSchema.parse(row.response).responses
  }))
}

/**
 * Applies the provider's field value before publishing initial Agreement approval.
 * @param trx Workflow transaction holding the Agreement lock.
 * @param agreementId Locked Agreement.
 * @param runId Approval run whose collected responses may be read.
 */
export const applyAgreementApprovalFinancialNumber = async (
  trx: Transaction<Database>,
  agreementId: string,
  runId: string
) => {
  const agreement = await trx.selectFrom('Funding_Case_Agreement_Profile as agreement')
    .innerJoin('Transfer_Payment_Stream as stream', 'stream.id', 'agreement.egcs_fc_transferpaymentstream')
    .innerJoin('Transfer_Payment_Profile as program', 'program.id', 'stream.egcs_tp_transferpaymentprofile')
    .select(['agreement.egcs_fc_financialsystemnumber as currentValue', 'stream.id as streamId', 'program.egcs_tp_agency as agencyId'])
    .where('agreement.id', '=', agreementId).where('agreement._deleted', '=', false).executeTakeFirstOrThrow()
  let event: H3Event | undefined
  try {
    event = useEvent()
  } catch { /* Runtime operations can also run without an HTTP request. */ }
  const value = await applyAgreementFinancialNumberPolicy(event, trx, {
    operation: 'approval', agreementId,
    agencyId: String(agreement.agencyId), streamId: String(agreement.streamId),
    currentValue: agreement.currentValue,
    readFinalizedAnswers: () => readFinalizedAnswers(trx, runId)
  })
  if (value !== agreement.currentValue) {
    await trx.updateTable('Funding_Case_Agreement_Profile').set({ egcs_fc_financialsystemnumber: value })
      .where('id', '=', agreementId).execute()
  }
}
