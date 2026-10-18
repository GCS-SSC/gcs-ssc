import type { H3Event } from 'h3'
import type { z } from 'zod'
import { readValidatedBodyI18n } from './api-validate'

/**
 * Rejects text PostgreSQL cannot store while preserving the owning schema and field paths.
 * @param event Active Monitor request.
 * @param schema Owning create or sparse patch schema.
 * @returns Validated Monitor body.
 */
export const readAgreementMonitorBody = async <T extends z.ZodType<Record<string, unknown>>>(event: H3Event, schema: T) =>
  await readValidatedBodyI18n(event, schema.superRefine((value, context) => {
    for (const [field, text] of Object.entries(value)) {
      if (typeof text === 'string' && text.includes('\u0000')) {
        context.addIssue({ code: 'custom', path: [field], message: 'validation.invalid_text_character' })
      }
    }
  }))
