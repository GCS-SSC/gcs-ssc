import { z } from 'zod'

const error = 'validation.invalid_json'
const preferenceId = z.string({ error })
  .regex(/^[A-Za-z0-9_.:-]{1,160}$/, { error })
  .refine(id => !Object.hasOwn(Object.prototype, id), { error })

const filterText = z.string({ error }).max(1024, { error })
  .refine(value => !value.includes(String.fromCodePoint(0)) && !/\p{Surrogate}/u.test(value), { error })
const filterValue = z.union([
  filterText,
  z.number({ error }),
  z.boolean({ error }),
  z.null({ error }),
  z.array(filterText, { error }).max(100, { error })
], { error })

const tablePreference = z.strictObject({
  order: z.array(preferenceId, { error }).max(200, { error }).optional(),
  visibility: z.record(preferenceId, z.boolean({ error }), { error }).optional(),
  filters: z.record(preferenceId, filterValue, { error }).optional()
}, { error })

export const TablePreferencesSchema = z.record(preferenceId, tablePreference, { error })
export type TablePreferences = z.infer<typeof TablePreferencesSchema>
