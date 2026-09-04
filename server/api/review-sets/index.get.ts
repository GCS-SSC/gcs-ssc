import { sql } from 'kysely'
import { PaginationSchema } from '~~/shared/types/schemas'
import {
  CoreOrExtensionEntityTargetSchema,
  validateCoreOrExtensionEntityTarget
} from '~~/shared/types/schemas/common'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import {
  assertDirectReviewRuntimeEntitySupported,
  authorizeReviewRuntimeAction,
  resolveReviewRuntimeEntityFromEntity,
  respondReviewRuntimeEntityNotFound
} from '~~/server/utils/review-runtime-access'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { readRuntimeReviewConfiguration } from '~~/server/utils/review-runtime'
import { authorizeExtensionLifecycleRead, resolveExtensionLifecycleRuntime } from '~~/server/utils/extension-lifecycle-runtime'
import { RUNTIME_TERMINAL_STATES } from '~~/shared/constants/system-lifecycle'
import { requireAuthContext } from '~~/server/utils/authorize'

const ReviewSetListQuerySchema = PaginationSchema.safeExtend(CoreOrExtensionEntityTargetSchema.shape)
  .superRefine(validateCoreOrExtensionEntityTarget)

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const db = event.context.$db
  const { entityType, entityId, page, limit, search } = await getValidatedQueryI18n(event, ReviewSetListQuerySchema)
  const unsupportedEntityResult = await assertDirectReviewRuntimeEntitySupported(event, entityType)

  if (unsupportedEntityResult) {
    return unsupportedEntityResult
  }

  const extensionRuntime = entityType.includes(':')
    ? await resolveExtensionLifecycleRuntime(event, entityType, entityId)
    : null
  const runtimeEntity = extensionRuntime?.context
    ?? await resolveReviewRuntimeEntityFromEntity(db, entityType, entityId)
  if (!runtimeEntity) {
    return await respondReviewRuntimeEntityNotFound(event, entityType)
  }

  // The route is review-specific, not applicant-recipient-specific. Entity auth resolves here so
  // the list payload can stay generic when the next review target entity is added.
  if (extensionRuntime) await authorizeExtensionLifecycleRead(event, extensionRuntime)
  else await authorizeReviewRuntimeAction(event, 'list_review_sets', runtimeEntity)

  const offset = (page - 1) * limit
  let baseQuery = db
    .selectFrom('Common_Review_Set')
    .innerJoin('Common_Runtime_Item as Set_Item', 'Set_Item.id', 'Common_Review_Set.egcs_cn_runtimeitem')
    .innerJoin('Common_Runtime', 'Common_Runtime.id', 'Set_Item.egcs_cn_runtime')
    .innerJoin('Common_Publication_Version as Set_Version', 'Set_Version.id', 'Set_Item.egcs_cn_publicationversion')
    .where('Common_Review_Set.egcs_cn_entitytype', '=', entityType)
    .where('Common_Review_Set.egcs_cn_entityid', '=', entityId)
    .where('Common_Review_Set._deleted', '=', false)

  if (search) {
    const escapedSearch = escapeLikePattern(search)
    baseQuery = baseQuery.where(eb => eb.or([
      eb(sql<string>`${sql.ref('Common_Review_Set.id')}::text`, 'ilike', `%${escapedSearch}%`),
      eb(sql<string>`${sql.ref('Set_Version.egcs_cn_definition')} #>> '{name,en}'`, 'ilike', `%${escapedSearch}%`),
      eb(sql<string>`${sql.ref('Set_Version.egcs_cn_definition')} #>> '{name,fr}'`, 'ilike', `%${escapedSearch}%`)
    ]))
  }

  const [sets, countResult, activeCountResult] = await Promise.all([
    baseQuery
      .select([
        'Common_Review_Set.id as id',
        'Common_Review_Set.egcs_cn_reviewsetsetup as egcs_cn_reviewsetsetup',
        'Common_Runtime.id as runtimeId',
        'Set_Item.id as runtimeItemId',
        'Set_Item.egcs_cn_state as runtimeState',
        'Common_Runtime.egcs_cn_attempt as attempt',
        'Common_Runtime.egcs_cn_previousruntime as previousRuntimeId',
        'Set_Version.id as publicationVersionId',
        'Set_Version.egcs_cn_version as publicationVersion',
        'Set_Version.egcs_cn_definition as definition'
      ])
      .orderBy('Common_Review_Set.id', 'asc')
      .limit(limit)
      .offset(offset)
      .execute(),
    baseQuery
      .select(eb => eb.fn.count('Common_Review_Set.id').as('total'))
      .executeTakeFirst(),
    baseQuery
      .where('Set_Item.egcs_cn_state', 'not in', [...RUNTIME_TERMINAL_STATES])
      .select(eb => eb.fn.count('Common_Review_Set.id').as('total'))
      .executeTakeFirst()
  ])

  const reviewSetIds = sets.map(set => String(set.id))
  const reviews = reviewSetIds.length === 0
    ? []
    : await db
        .selectFrom('Common_Review')
        .innerJoin('Common_Runtime_Item as Review_Item', 'Review_Item.id', 'Common_Review.egcs_cn_runtimeitem')
        .innerJoin('Common_Publication_Version as Schema_Version', 'Schema_Version.id', 'Review_Item.egcs_cn_publicationversion')
        .innerJoin('Common_Review_Schema', 'Common_Review_Schema.id', 'Common_Review.egcs_cn_reviewschema')
        .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Common_Review_Schema.egcs_cn_agency')
        .select([
          'Common_Review.id as id',
          'Common_Review.egcs_cn_reviewset as egcs_cn_reviewset',
          'Common_Review.egcs_cn_reviewschema as egcs_cn_reviewschema',
          'Review_Item.id as runtimeItemId',
          'Review_Item.egcs_cn_state as runtimeState',
          'Schema_Version.egcs_cn_definition as definition',
          'Agency_Profile.egcs_ay_name_en as agency_name_en',
          'Agency_Profile.egcs_ay_name_fr as agency_name_fr'
        ])
        .where('Common_Review.egcs_cn_reviewset', 'in', reviewSetIds)
        .where('Common_Review._deleted', '=', false)
        .orderBy('Common_Review.id', 'asc')
        .execute()

  const reviewsBySetId = reviews.reduce<Map<string, typeof reviews>>((acc, review) => {
    const key = String(review.egcs_cn_reviewset)
    const current = acc.get(key)

    if (current) {
      current.push(review)
      return acc
    }

    acc.set(key, [review])
    return acc
  }, new Map<string, typeof reviews>())

  const total = Number(countResult?.total ?? 0)

  return {
    items: sets.map(set => {
      const runtimeConfiguration = readRuntimeReviewConfiguration(set.definition)
      const setReviews = reviewsBySetId.get(String(set.id)) ?? []
      const firstReview = setReviews[0]

      return {
        id: String(set.id),
        runtimeId: String(set.runtimeId),
        runtimeItemId: String(set.runtimeItemId),
        runtimeState: set.runtimeState,
        attempt: Number(set.attempt),
        previousRuntimeId: set.previousRuntimeId === null ? null : String(set.previousRuntimeId),
        publicationVersionId: String(set.publicationVersionId),
        publicationVersion: Number(set.publicationVersion),
        egcs_cn_reviewsetsetup: String(set.egcs_cn_reviewsetsetup),
        egcs_cn_name_en: runtimeConfiguration.name.en,
        egcs_cn_name_fr: runtimeConfiguration.name.fr,
        agency_name_en: firstReview?.agency_name_en ?? '',
        agency_name_fr: firstReview?.agency_name_fr ?? '',
        egcs_cn_sequential: runtimeConfiguration.sequential,
        reviews: setReviews.map(review => {
          const definition = review.definition as { name: { en: string, fr: string }, reviewType: string }
          return ({
            id: String(review.id),
            egcs_cn_reviewset: String(review.egcs_cn_reviewset),
            egcs_cn_reviewschema: String(review.egcs_cn_reviewschema),
            runtimeItemId: String(review.runtimeItemId),
            runtimeState: review.runtimeState,
            egcs_cn_name_en: definition.name.en,
            egcs_cn_name_fr: definition.name.fr,
            egcs_cn_reviewtype: definition.reviewType
          })
        })
      }
    }),
    total,
    stats: {
      total,
      active: Number(activeCountResult?.total ?? 0)
    },
    page,
    limit
  }
})
