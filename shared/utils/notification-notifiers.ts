const SYSTEM_GROUP = { id: 'system', name: { en: 'System variables', fr: 'Variables système' } } as const
const APPROVAL_GROUP = { id: 'approval', name: { en: 'Approval variables', fr: 'Variables d’approbation' } } as const

/** System values available to every host notifier. Localized values require a mapping language; date and time also require a timezone. */
export const SYSTEM_NOTIFICATION_FIELDS = [
  { id: 'today_date', type: 'date', group: SYSTEM_GROUP, name: { en: 'Today’s date', fr: 'Date du jour' } },
  { id: 'current_time', type: 'time', group: SYSTEM_GROUP, name: { en: 'Current time', fr: 'Heure actuelle' } },
  { id: 'agency_name', type: 'localized-text', group: SYSTEM_GROUP, name: { en: 'Agency name', fr: 'Nom de l’agence' } },
  { id: 'program_name', type: 'localized-text', group: SYSTEM_GROUP, name: { en: 'Program name', fr: 'Nom du programme' } },
  { id: 'stream_name', type: 'localized-text', group: SYSTEM_GROUP, name: { en: 'Stream name', fr: 'Nom du volet' } }
] as const

const APPROVAL_NOTIFICATION_FIELDS = [
  { id: 'agreement_number', type: 'text', group: APPROVAL_GROUP, name: { en: 'Agreement number', fr: 'Numéro de l’entente' } },
  { id: 'recipient_email', type: 'email', group: APPROVAL_GROUP, name: { en: 'Assigned approver email', fr: 'Courriel de l’approbateur affecté' } },
  { id: 'recipient_name', type: 'localized-text', group: APPROVAL_GROUP, name: { en: 'Assigned approver name', fr: 'Nom de l’approbateur affecté' } },
  { id: 'item_reference', type: 'text', group: APPROVAL_GROUP, name: { en: 'Item reference', fr: 'Référence du dossier' } },
  { id: 'item_title', type: 'text', group: APPROVAL_GROUP, name: { en: 'Item title', fr: 'Titre du dossier' } },
  { id: 'approval_url', type: 'text', group: APPROVAL_GROUP, name: { en: 'Approval link', fr: 'Lien vers l’approbation' } }
] as const

/** Host-owned events and values available to notification extension template mappings. */
export const NOTIFICATION_NOTIFIERS = [{
  id: 'approval.action_required',
  name: { en: 'Approval required', fr: 'Approbation requise' },
  fields: [...SYSTEM_NOTIFICATION_FIELDS, ...APPROVAL_NOTIFICATION_FIELDS]
}]

export type NotificationFieldId = typeof NOTIFICATION_NOTIFIERS[number]['fields'][number]['id']
type LocalizedNotificationFieldId = Extract<typeof NOTIFICATION_NOTIFIERS[number]['fields'][number], { type: 'localized-text' }>['id']
export type ApprovalNotificationFields = Omit<Record<NotificationFieldId, string>, LocalizedNotificationFieldId>
  & Record<`${LocalizedNotificationFieldId}_${'en' | 'fr'}`, string>
