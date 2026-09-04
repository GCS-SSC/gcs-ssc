import { getQuery, readBody, type H3Event } from 'h3'
import type { z } from 'zod'
import { ZodError } from 'zod'
import { validationError } from './api-errors'

/**
 * Parses and validates input data against a Zod schema with i18n support.
 *
 * @param event - The H3 event.
 * @param schema - The Zod schema to validate against.
 * @param input - The input data to validate.
 * @returns The validated data.
 * @throws ValidationError if validation fails.
 */
export const parseI18n = async <TSchema extends z.ZodTypeAny>(
  event: H3Event,
  schema: TSchema,
  input: unknown
): Promise<z.infer<TSchema>> => {
  try {
    return await schema.parseAsync(input)
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return await validationError(event, error)
    }

    throw error
  }
}

/**
 * Reads and validates the request body against a Zod schema with i18n support.
 *
 * @param event - The H3 event.
 * @param schema - The Zod schema to validate against.
 * @returns The validated body data.
 * @throws ValidationError if validation fails.
 */
export const readValidatedBodyI18n = async <TSchema extends z.ZodTypeAny>(
  event: H3Event,
  schema: TSchema
): Promise<z.infer<TSchema>> => {
  const body = await readBody(event)
  return await parseI18n(event, schema, body)
}

/**
 * Gets and validates the request query against a Zod schema with i18n support.
 *
 * @param event - The H3 event.
 * @param schema - The Zod schema to validate against.
 * @returns The validated query data.
 * @throws ValidationError if validation fails.
 */
export const getValidatedQueryI18n = async <TSchema extends z.ZodTypeAny>(
  event: H3Event,
  schema: TSchema
): Promise<z.infer<TSchema>> => {
  const query = getQuery(event)
  return await parseI18n(event, schema, query)
}
