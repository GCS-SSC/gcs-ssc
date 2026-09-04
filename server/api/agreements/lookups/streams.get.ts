import { z } from 'zod'
import { authorize } from '~~/server/utils/authorize'
import {
  canAccessAgreement,
  resolveAgreementScopeContext,
  resolveAgreementVisibility
} from '~~/server/utils/agreement'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { PaginationSchema } from '~~/shared/types/schemas'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'

const QuerySchema = PaginationSchema.extend({
  agreement_id: z.coerce.string().optional(),
  permission_action: z.enum(['create', 'update']).default('create')
})

const readRoute = defineEventHandler(async event => {
  const db = event.context.$db
  const { page, limit, search, agreement_id, permission_action } = await getValidatedQueryI18n(event, QuerySchema)
  const offset = (page - 1) * limit
  const escapedSearch = search ? escapeLikePattern(search) : ''

  const agreementContext = permission_action === 'update' && agreement_id
    ? await resolveAgreementScopeContext(agreement_id, db)
    : null

  const { data: access } = await authorize(event, 'agreement', permission_action, async ({ context }) => {
    const resolved = await resolveAgreementVisibility(context, permission_action, db)

    if (agreementContext) {
      const canUpdateExactAgreement = await canAccessAgreement(
        context,
        'update',
        agreementContext.scope,
        db
      )
      if (canUpdateExactAgreement) {
        const hasStaticUpdate = context.userAbilities.authorize(
          'agreement',
          'update',
          agreementContext.scope
        )
        return {
          bypass: true,
          data: {
            restrictedStreamId: hasStaticUpdate ? null : agreementContext.streamId,
            visibility: resolved
          }
        }
      }
    }

    const hasVisibleRecords = resolved.hasGlobalAccess
      || resolved.agencyIds.length > 0
      || resolved.transferPaymentIds.length > 0

    if (hasVisibleRecords) {
      return {
        bypass: true,
        data: { restrictedStreamId: null, visibility: resolved }
      }
    }

    return { scope: { type: 'global' } }
  })

  let baseQuery = db
    .selectFrom('Transfer_Payment_Stream')
    .innerJoin(
      'Transfer_Payment_Profile',
      'Transfer_Payment_Profile.id',
      'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile'
    )
    .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Transfer_Payment_Profile.egcs_tp_agency')
    .where('Transfer_Payment_Stream._deleted', '=', false)
    .where('Transfer_Payment_Profile._deleted', '=', false)
    .where('Agency_Profile._deleted', '=', false)
    .where(eb => eb.or([
      eb.and([
        eb('Transfer_Payment_Stream.egcs_tp_active', '=', true),
        eb('Transfer_Payment_Profile.egcs_tp_active', '=', true),
        eb('Agency_Profile.egcs_ay_active', '=', true)
      ]),
      ...(agreementContext ? [eb('Transfer_Payment_Stream.id', '=', agreementContext.streamId)] : [])
    ]))

  if (access?.restrictedStreamId) {
    baseQuery = baseQuery.where('Transfer_Payment_Stream.id', '=', access.restrictedStreamId)
  } else if (!access?.visibility.hasGlobalAccess) {
    baseQuery = baseQuery.where(eb => eb.or([
      ...(access?.visibility.agencyIds.length
        ? [eb('Transfer_Payment_Profile.egcs_tp_agency', 'in', access.visibility.agencyIds)]
        : []),
      ...(access?.visibility.transferPaymentIds.length
        ? [eb('Transfer_Payment_Profile.id', 'in', access.visibility.transferPaymentIds)]
        : [])
    ]))
  }

  if (escapedSearch) {
    baseQuery = baseQuery.where(eb => eb.or([
      eb('Transfer_Payment_Stream.id', '=', escapedSearch),
      eb('Agency_Profile.egcs_ay_name_en', 'ilike', `%${escapedSearch}%`),
      eb('Agency_Profile.egcs_ay_name_fr', 'ilike', `%${escapedSearch}%`),
      eb('Transfer_Payment_Profile.egcs_tp_name_en', 'ilike', `%${escapedSearch}%`),
      eb('Transfer_Payment_Profile.egcs_tp_name_fr', 'ilike', `%${escapedSearch}%`),
      eb('Transfer_Payment_Stream.egcs_tp_name_en', 'ilike', `%${escapedSearch}%`),
      eb('Transfer_Payment_Stream.egcs_tp_name_fr', 'ilike', `%${escapedSearch}%`)
    ]))
  }

  const [items, countResult] = await Promise.all([
    baseQuery
      .select([
        'Transfer_Payment_Stream.id as id',
        'Transfer_Payment_Profile.id as program_id',
        'Transfer_Payment_Profile.egcs_tp_agency as agency_id',
        'Agency_Profile.egcs_ay_name_en as agency_name_en',
        'Agency_Profile.egcs_ay_name_fr as agency_name_fr',
        'Transfer_Payment_Profile.egcs_tp_name_en as program_name_en',
        'Transfer_Payment_Profile.egcs_tp_name_fr as program_name_fr',
        'Transfer_Payment_Stream.egcs_tp_name_en as egcs_tp_name_en',
        'Transfer_Payment_Stream.egcs_tp_name_fr as egcs_tp_name_fr',
        'Transfer_Payment_Stream.egcs_tp_name_en as label_en',
        'Transfer_Payment_Stream.egcs_tp_name_fr as label_fr'
      ])
      .orderBy('Transfer_Payment_Stream.id', 'asc')
      .limit(limit)
      .offset(offset)
      .execute(),
    baseQuery.select(eb => eb.fn.count('Transfer_Payment_Stream.id').as('total')).executeTakeFirst()
  ])

  const total = Number(countResult?.total || 0)

  return {
    items,
    total,
    stats: { total, active: total },
    page,
    limit
  }
})

export default defineEventHandler(async event =>
  await executeFreshReadSnapshot(event, async () => await readRoute(event)))
