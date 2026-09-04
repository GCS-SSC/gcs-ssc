export interface ListStats {
  total: number
  active?: number
}

export interface ListResponse<TItem> {
  items: TItem[]
  total?: number
  stats?: ListStats
  page?: number
  limit?: number
}

export interface AgencyOptionItem {
  id: string
  egcs_ay_name_en: string
  egcs_ay_name_fr: string
}

export interface RoleOptionItem {
  id: string
  name_en: string
  name_fr: string
  agency_id?: string | null
  agency_name_en?: string | null
  agency_name_fr?: string | null
  scope_type?: 'global' | 'agency' | 'program' | null
  transfer_payment_ids?: string[]
}

export interface UserOptionItem {
  id: string
  name: string
}

export interface UserAssignment {
  id: string
  role_id: string
  role_name_en: string
  role_name_fr: string
  agency_id: string | null
  agency_name_en: string | null
  agency_name_fr: string | null
  can_delete: boolean
}

export interface UserRoleAssignmentAccess {
  has_global_access: boolean
  agency_ids: string[]
}

export interface UserProfileResponse {
  assignments: UserAssignment[]
}
