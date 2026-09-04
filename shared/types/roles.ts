import type { RoleInput } from './schemas/rbac'

export interface RoleRow extends Omit<RoleInput, 'id'> {
  id: string
}

export type RoleDetail = RoleRow
