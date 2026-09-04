export type StatusId = string

export type StatusDefinition = {
  id: StatusId
  agencyId: string
  nameEn: string
  nameFr: string
  color: string
  icon: string
  readOnly: boolean
  terminal: boolean
  isDraft: boolean
  deleted: boolean
}
