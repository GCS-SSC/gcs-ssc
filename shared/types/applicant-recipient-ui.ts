import type {
  ApplicantRecipientAgencyFinancialIdItem,
  ApplicantRecipientAddressItem,
  ApplicantRecipientContactItem,
  ApplicantRecipientOtherNameItem,
  ApplicantRecipientProfileItem,
  ApplicantRecipientRegistryItem
} from './schemas'

export interface ApplicantRecipientProfileRow extends ApplicantRecipientProfileItem {
  subtype_name_en?: string
  subtype_name_fr?: string
  subtype_type?: string
  lead_agency_name_en?: string
  lead_agency_name_fr?: string
  can_update?: boolean
  can_delete?: boolean
  can_create_child_records?: boolean
  can_update_child_records?: boolean
  can_delete_child_records?: boolean
}

export type ApplicantRecipientProfileForm = Partial<ApplicantRecipientProfileItem> & {
  extensions?: Record<string, Record<string, unknown>>
}

export interface ApplicantRecipientAgencyFinancialIdRow extends ApplicantRecipientAgencyFinancialIdItem {
  agency_name_en?: string | null
  agency_name_fr?: string | null
}

export type ApplicantRecipientAgencyFinancialIdForm = Partial<ApplicantRecipientAgencyFinancialIdItem>

export type ApplicantRecipientOtherNameRow = ApplicantRecipientOtherNameItem

export type ApplicantRecipientOtherNameForm = Partial<ApplicantRecipientOtherNameItem>

export type ApplicantRecipientRegistryRow = ApplicantRecipientRegistryItem

export type ApplicantRecipientRegistryForm = Partial<ApplicantRecipientRegistryRow>

export interface ApplicantRecipientAddressRow extends ApplicantRecipientAddressItem {
  egcs_ar_applicantrecipient: string
  egcs_ar_address: string
}

export type ApplicantRecipientAddressForm = Partial<ApplicantRecipientAddressItem>

export interface ApplicantRecipientContactRow extends ApplicantRecipientContactItem {
  egcs_ar_applicantrecipient: string
  egcs_ar_contact: string
}

export type ApplicantRecipientContactForm = Partial<ApplicantRecipientContactItem>
