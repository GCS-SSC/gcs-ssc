import { defineEventHandler, getRouterParam } from 'h3'
import { z } from 'zod'
import { flagMissingDraftText, resolveProposedApprovalGroups } from '~~/server/utils/authoring-proposal'
import { authoringResponseExample } from '~~/server/utils/authoring-examples'
import { authorize } from '~~/server/utils/authorize'
import { resolveRequestLocale } from '~~/server/utils/request-locale'
import { notFound, throwApiError } from '~~/server/utils/api-errors'
import { getAuthoringCredentials, readAuthoringFile, requestAuthoringResult } from '~~/server/utils/openai-authoring'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { PortableAuthoringNoticeSchema, portableAuthoringKinds, portableSchemaJsonSchema } from '~~/shared/utils/portable-authoring-schema'

const kindSchema = z.enum(portableAuthoringKinds)
const resultSchema = z.object({
  payload: z.record(z.string(), z.unknown()),
  notices: z.array(PortableAuthoringNoticeSchema).max(100),
  approvalAssignees: z.array(z.object({
    stepIndex: z.int().nonnegative(),
    groupName: z.string().trim().min(1).max(250)
  })).max(100).default([])
})

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'agencyId') ?? ''
  const kind = kindSchema.safeParse(getRouterParam(event, 'kind'))
  if (!isPositivePostgresBigintText(agencyId) || !kind.success) {
    return await notFound(event, 'AUTHORING_TARGET_NOT_FOUND', 'apiErrors.request.not_found')
  }
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  const credentials = await getAuthoringCredentials(event, agencyId)
  const file = await readAuthoringFile(event)
  const locale = resolveRequestLocale(event)
  const result = resultSchema.safeParse(await requestAuthoringResult(event, {
    ...credentials, file,
    instructions: [
      `Convert the uploaded file into a GCS ${kind.data} draft.`,
      'Return a JSON object with payload (the payload property of the provided schema) and notices (an array of objects with message and optional source).',
      'Omit unused optional fields instead of supplying empty strings. For code fields such as assessment section, subsection, question, outcome, and strategy names, use lowercase codes starting with a letter and containing only letters, digits, or underscores. Keep display text in bilingual labels. Use the same code for all references to an item.',
      'Report missing or ambiguous values, include a source page or short excerpt where possible, and do not invent agency IDs or scoring rules.',
      ...(kind.data === 'approval'
        ? [
            'For approval groups named in the document, add approvalAssignees to the response. Each item has a zero-based stepIndex and exact groupName from the file. GCS matches these group names locally. Leave group IDs null when unknown.'
          ]
        : []),
      `Write notices in ${locale === 'fr' ? 'French' : 'English'}. Preserve bilingual source content.`,
      'When scoring data is missing, leave the relevant optional fields or scoring arrays empty and explain the omission in notices.',
      'Here is a valid response example. Use its structure only. Never copy its example names, questions, options, scores, or references into the proposal:',
      JSON.stringify(authoringResponseExample(kind.data)),
      'Use the following GCS schema contract:',
      JSON.stringify(portableSchemaJsonSchema(kind.data))
    ].join('\n')
  }))
  if (!result.success) return await throwApiError(event, {
    statusCode: 422, code: 'AUTHORING_INVALID_PROPOSAL', key: 'authoring_generation.invalid_proposal'
  })
  const proposed = kind.data === 'approval'
    ? await resolveProposedApprovalGroups(event.context.$db, agencyId, result.data.payload, result.data.approvalAssignees)
    : result.data.payload
  const { payload, notices } = flagMissingDraftText(kind.data, proposed, result.data.notices, locale)
  return { envelope: { version: 1, kind: kind.data, payload }, notices }
})
