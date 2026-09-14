import { z } from 'zod'

/**
 * Required dates reject the empty values emitted by both native and segmented controls.
 * Valid existing Date, string and numeric date inputs retain Zod's date conversion.
 */
export const RequiredDateSchema = z.preprocess(
  value => value === null || value === '' ? undefined : value,
  z.coerce.date({ error: 'validation.required' })
).meta({ formRequired: true })
