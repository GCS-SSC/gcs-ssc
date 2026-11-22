import { z } from 'zod'

export const LanguageIndependentCodeSchema = z.string({ error: 'validation.required' })
  .min(1, { error: 'validation.required' })
  .max(255, { error: 'validation.max_length' })
  .refine(code => /^[a-z][a-z0-9_]*$/.test(code) && code !== 'constructor' && code !== 'prototype', {
    error: 'validation.invalid_language_independent_code'
  })
  .meta({ formRequired: true, pattern: '^[a-z][a-z0-9_]*$' })
