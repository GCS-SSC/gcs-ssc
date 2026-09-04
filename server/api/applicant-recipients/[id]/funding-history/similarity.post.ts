import { z } from 'zod'
import { FundingHistoryIdentityBaseSchema } from '~~/shared/types/schemas'
import { authorize, requireAuthContext } from '~~/server/utils/authorize'
import { badRequest } from '~~/server/utils/api-errors'
import { resolveApplicantRecipientAuthorization } from '~~/server/utils/applicant-recipient-auth'
import {
  assertNoExactFundingHistoryConflicts,
  collectFundingHistorySimilarityWarnings
} from '~~/server/utils/funding-history'
import { isValidFundingHistoryId } from '~~/server/utils/funding-history-id'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

const SimilaritySchema = FundingHistoryIdentityBaseSchema.partial().and(z.object({
  excludeHistoryId: z.union([z.string(), z.number()]).transform(String)
    .refine(isPositivePostgresBigintText, { error: 'validation.invalid_selection' }).optional(),
  permission_action: z.enum(['create', 'update']).optional()
}))

export default defineEventHandler(async event => {
  const db = event.context.$db
  const context = await requireAuthContext(event)
  const applicantRecipientId = getRouterParam(event, 'id')
  if (!isValidFundingHistoryId(applicantRecipientId)) return await badRequest(event, 'INVALID_ID', 'apiErrors.request.invalid_id')
  const validated = await readValidatedBodyI18n(event, SimilaritySchema)
  const permissionAction = validated.permission_action || (validated.excludeHistoryId ? 'update' : 'create')
  await authorize(event, 'applicant_recipient', permissionAction, async ({ context }) =>
    await resolveApplicantRecipientAuthorization(context, applicantRecipientId, permissionAction, db)
  )
  await assertNoExactFundingHistoryConflicts(event, validated, db, validated.excludeHistoryId)
  return {
    warnings: await collectFundingHistorySimilarityWarnings(
      context,
      validated,
      db,
      { excludeHistoryId: validated.excludeHistoryId }
    )
  }
})
