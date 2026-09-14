import { z } from 'zod'
import { PositivePostgresBigintIdSchema } from './common'

export const AssignedListViewSchema = z.union([
  z.enum(['all', 'mine']),
  PositivePostgresBigintIdSchema
]).default('all')
