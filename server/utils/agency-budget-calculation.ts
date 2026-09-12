/* eslint-disable jsdoc/require-jsdoc */
import type { Transaction } from 'kysely'
import type { H3Event } from 'h3'
import type { Database } from '~~/shared/types/database'
import type { AgencyCostCategoryLineItem } from '~~/shared/types/schemas'
import { badRequest } from './api-errors'

export const validateAgencyBudgetCalculation = async (
  event: H3Event, trx: Transaction<Database>, agencyId: string, categoryId: string,
  values: Partial<AgencyCostCategoryLineItem>, id?: string
) => {
  const existing = id ? await trx.selectFrom('Agency_Cost_Category_Line_Item').selectAll().where('id', '=', id).executeTakeFirstOrThrow() : undefined
  const config = { egcs_ay_calculationmode: 'manual', egcs_ay_sourcecategory: null, egcs_ay_percentage: null, egcs_ay_allowpercentageoverride: false, ...existing, ...values }
  const invalid = async () => await badRequest(event, 'INVALID_BUDGET_CALCULATION', 'apiErrors.agreement.invalid_budget_calculation')
  if (config.egcs_ay_calculationmode === 'manual') {
    if (config.egcs_ay_sourcecategory !== null || config.egcs_ay_percentage !== null || config.egcs_ay_allowpercentageoverride) await invalid()
  } else {
    if (config.egcs_ay_percentage === null) await invalid()
    const referenced = await trx.selectFrom('Agency_Cost_Category_Line_Item').select('id')
      .where('egcs_ay_sourcecategory', '=', categoryId).where('_deleted', '=', false).executeTakeFirst()
    if (referenced) await invalid()
    if (config.egcs_ay_calculationmode === 'category') {
      if (!config.egcs_ay_sourcecategory || config.egcs_ay_sourcecategory === categoryId) await invalid()
      const source = await trx.selectFrom('Agency_Cost_Category').select('id')
        .where('id', '=', config.egcs_ay_sourcecategory!).where('egcs_ay_organizationagency', '=', agencyId).where('_deleted', '=', false).executeTakeFirst()
      const calculated = await trx.selectFrom('Agency_Cost_Category_Line_Item').select('id')
        .where('egcs_ay_organizationcostcategory', '=', config.egcs_ay_sourcecategory!).where('egcs_ay_calculationmode', '!=', 'manual').where('_deleted', '=', false).executeTakeFirst()
      if (!source || calculated) await invalid()
    } else if (config.egcs_ay_sourcecategory !== null) await invalid()
  }
}
