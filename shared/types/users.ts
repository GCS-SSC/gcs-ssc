import type { UserProfileItem } from './schemas'
import type { UserAssignment, UserRoleAssignmentAccess } from './admin'

export interface UserListItem extends UserProfileItem {
  emailVerified: boolean
  can_activate: boolean
  can_update: boolean
  can_delete: boolean
}

export interface UserDetail extends UserProfileItem {
  createdAt: string
  updatedAt: string
  emailVerified: boolean
  can_update: boolean
  role_assignment_access: UserRoleAssignmentAccess
  assignments: UserAssignment[]
}
