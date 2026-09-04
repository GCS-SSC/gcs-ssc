/* eslint-disable jsdoc/require-jsdoc -- Narrow guards are covered by focused unit and PostgreSQL tests. */
import type { H3Event } from 'h3'
import type { Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { badRequest } from '~~/server/utils/api-errors'

const routeBadRequest = async (event: H3Event, code: string, key: string) => {
  const handler = (globalThis as { badRequest?: typeof badRequest }).badRequest ?? badRequest
  return await handler(event, code, key)
}

export const assertAgencyCostCategoryNotInUse = async (
  event: H3Event,
  trx: Transaction<Database>,
  costCategoryId: string
) => {
  const reference = await trx.selectFrom('Agency_Cost_Category_Line_Item')
    .select('id').where('egcs_ay_organizationcostcategory', '=', costCategoryId)
    .where('_deleted', '=', false).forUpdate().executeTakeFirst()
  if (reference) return await routeBadRequest(event, 'AGENCY_COST_CATEGORY_IN_USE', 'apiErrors.agency.cost_category_in_use')
}

export const assertAgencyCostCategoryLineItemNotInUse = async (
  event: H3Event,
  trx: Transaction<Database>,
  lineItemId: string
) => {
  const reference = await trx.selectFrom('Transfer_Payment_Stream_Cost_Category_Line_Item')
    .select('id').where('egcs_tp_organizationcostcategory', '=', lineItemId)
    .where('_deleted', '=', false).forUpdate().executeTakeFirst()
  if (reference) return await routeBadRequest(event, 'AGENCY_COST_CATEGORY_LINE_ITEM_IN_USE', 'apiErrors.agency.cost_category_line_item_in_use')
}

export const assertAgencyHoldbackBasisNotInUse = async (
  event: H3Event,
  trx: Transaction<Database>,
  holdbackBasisId: string
) => {
  const reference = await trx.selectFrom('Transfer_Payment_Stream_Holdback_Basis')
    .select('id').where('egcs_tp_agencyholdback', '=', holdbackBasisId)
    .where('_deleted', '=', false).forUpdate().executeTakeFirst()
  if (reference) return await routeBadRequest(event, 'AGENCY_HOLDBACK_BASIS_IN_USE', 'apiErrors.agency.holdback_basis_in_use')
}

export const assertAgencyAgreementTypeNotInUse = async (
  event: H3Event,
  trx: Transaction<Database>,
  agreementTypeId: string
) => {
  const reference = await trx.selectFrom('Transfer_Payment_Agreement_Subtype')
    .select('id').where('egcs_tp_agreementtype', '=', agreementTypeId)
    .where('_deleted', '=', false).forUpdate().executeTakeFirst()
  if (reference) return await routeBadRequest(event, 'AGENCY_AGREEMENT_TYPE_IN_USE', 'apiErrors.agency.agreement_type_in_use')
}

export const assertTransferPaymentCostCategoryLineItemNotInUse = async (
  event: H3Event,
  trx: Transaction<Database>,
  lineItemId: string
) => {
  const reference = await trx.selectFrom('Funding_Case_Agreement_Budget_Line_Item')
    .select('id').where('egcs_fc_organizationcostcategory', '=', lineItemId)
    .where('_deleted', '=', false).forUpdate().executeTakeFirst()
  if (reference) return await routeBadRequest(event, 'TRANSFER_PAYMENT_COST_CATEGORY_LINE_ITEM_IN_USE', 'apiErrors.transfer_payment.cost_category_line_item_in_use')
}
