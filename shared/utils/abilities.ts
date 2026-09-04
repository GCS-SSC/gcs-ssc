/* eslint-disable jsdoc/require-param, jsdoc/require-returns -- Ability validation helpers are covered by the shared ability unit suite. */
import {
  AUTHORIZATION_SUBJECTS,
  isAuthorizationSubject,
  isRoleAbility,
  type AuthorizationAction,
  type AuthorizationSubject,
  type RoleAbility,
  type RoleAbilitySubject
} from '@gcs-ssc/authorization'

export { AUTHORIZATION_SUBJECTS, isAuthorizationSubject }

export const ABILITIES = [
  {
    action: 'create',
    subject: 'system',
    name_en: 'Create System Configuration',
    name_fr: 'Créer la configuration du système',
    desc_en: 'Create system-wide administrative configuration.',
    desc_fr: 'Créer la configuration administrative à l’échelle du système.'
  },
  {
    action: 'read',
    subject: 'system',
    name_en: 'Read System Configuration',
    name_fr: 'Lire la configuration du système',
    desc_en: 'Read system-wide administrative configuration.',
    desc_fr: 'Lire la configuration administrative à l’échelle du système.'
  },
  {
    action: 'update',
    subject: 'system',
    name_en: 'Update System Configuration',
    name_fr: 'Modifier la configuration du système',
    desc_en: 'Update system-wide administrative configuration.',
    desc_fr: 'Modifier la configuration administrative à l’échelle du système.'
  },
  {
    action: 'delete',
    subject: 'system',
    name_en: 'Delete System Configuration',
    name_fr: 'Supprimer la configuration du système',
    desc_en: 'Delete system-wide administrative configuration.',
    desc_fr: 'Supprimer la configuration administrative à l’échelle du système.'
  },
  {
    action: 'create',
    subject: 'agency',
    name_en: 'Create Agency',
    name_fr: 'Creer l\'agence',
    desc_en: 'Ability to create agency profiles and settings.',
    desc_fr: 'Capacite de creer des profils et des parametres d\'agence.'
  },
  {
    action: 'read',
    subject: 'agency',
    name_en: 'Read Agency',
    name_fr: 'Lire l\'agence',
    desc_en: 'Read-only access to agency information.',
    desc_fr: 'Acces en lecture seule aux informations de l\'agence.'
  },
  {
    action: 'update',
    subject: 'agency',
    name_en: 'Update Agency',
    name_fr: 'Modifier l\'agence',
    desc_en: 'Ability to update agency profiles and settings.',
    desc_fr: 'Capacite de modifier les profils et les parametres d\'agence.'
  },
  {
    action: 'delete',
    subject: 'agency',
    name_en: 'Delete Agency',
    name_fr: 'Supprimer l\'agence',
    desc_en: 'Ability to delete agency profiles.',
    desc_fr: 'Capacite de supprimer les profils d\'agence.'
  },
  {
    action: 'create',
    subject: 'transfer_payment',
    name_en: 'Create Transfer Payments',
    name_fr: 'Creer des paiements de transfert',
    desc_en: 'Ability to create transfer payment programs and configurations.',
    desc_fr: 'Capacite de creer des programmes de paiements de transfert et leurs configurations.'
  },
  {
    action: 'read',
    subject: 'transfer_payment',
    name_en: 'Read Transfer Payments',
    name_fr: 'Lire les paiements de transfert',
    desc_en: 'Read-only access to transfer payment programs.',
    desc_fr: 'Acces en lecture seule aux programmes de paiements de transfert.'
  },
  {
    action: 'update',
    subject: 'transfer_payment',
    name_en: 'Update Transfer Payments',
    name_fr: 'Modifier les paiements de transfert',
    desc_en: 'Ability to update transfer payment programs and settings.',
    desc_fr: 'Capacite de modifier les programmes de paiements de transfert et leurs parametres.'
  },
  {
    action: 'delete',
    subject: 'transfer_payment',
    name_en: 'Delete Transfer Payments',
    name_fr: 'Supprimer les paiements de transfert',
    desc_en: 'Ability to delete transfer payment programs.',
    desc_fr: 'Capacite de supprimer les programmes de paiements de transfert.'
  },
  {
    action: 'create',
    subject: 'role',
    name_en: 'Create Roles',
    name_fr: 'Creer des roles',
    desc_en: 'Ability to create system roles and their permissions.',
    desc_fr: 'Capacite de creer des roles du systeme et leurs permissions.'
  },
  {
    action: 'read',
    subject: 'role',
    name_en: 'Read Roles',
    name_fr: 'Lire les roles',
    desc_en: 'Read-only access to system roles.',
    desc_fr: 'Acces en lecture seule aux roles du systeme.'
  },
  {
    action: 'update',
    subject: 'role',
    name_en: 'Update Roles',
    name_fr: 'Modifier les roles',
    desc_en: 'Ability to update system roles and their permissions.',
    desc_fr: 'Capacite de modifier les roles du systeme et leurs permissions.'
  },
  {
    action: 'delete',
    subject: 'role',
    name_en: 'Delete Roles',
    name_fr: 'Supprimer les roles',
    desc_en: 'Ability to delete system roles.',
    desc_fr: 'Capacite de supprimer les roles du systeme.'
  },
  {
    action: 'create',
    subject: 'user',
    name_en: 'Create Users',
    name_fr: 'Creer des utilisateurs',
    desc_en: 'Ability to create user profiles and assignments.',
    desc_fr: 'Capacite de creer des profils et des attributions d utilisateurs.'
  },
  {
    action: 'read',
    subject: 'user',
    name_en: 'Read Users',
    name_fr: 'Lire les utilisateurs',
    desc_en: 'Read-only access to user profiles.',
    desc_fr: 'Acces en lecture seule aux profils d utilisateurs.'
  },
  {
    action: 'update',
    subject: 'user',
    name_en: 'Update Users',
    name_fr: 'Modifier les utilisateurs',
    desc_en: 'Ability to update user profiles and assignments.',
    desc_fr: 'Capacite de modifier les profils et les attributions d utilisateurs.'
  },
  {
    action: 'delete',
    subject: 'user',
    name_en: 'Delete Users',
    name_fr: 'Supprimer les utilisateurs',
    desc_en: 'Ability to delete user profiles.',
    desc_fr: 'Capacite de supprimer les profils d utilisateurs.'
  },
  {
    action: 'create',
    subject: 'agreement',
    name_en: 'Create Agreements',
    name_fr: 'Creer des ententes',
    desc_en: 'Ability to create funding case agreements.',
    desc_fr: 'Capacite de creer des ententes de dossier de financement.'
  },
  {
    action: 'read',
    subject: 'agreement',
    name_en: 'Read Agreements',
    name_fr: 'Lire les ententes',
    desc_en: 'Read-only access to funding case agreements.',
    desc_fr: 'Acces en lecture seule aux ententes de dossier de financement.'
  },
  {
    action: 'update',
    subject: 'agreement',
    name_en: 'Update Agreements',
    name_fr: 'Modifier les ententes',
    desc_en: 'Ability to update funding case agreements.',
    desc_fr: 'Capacite de modifier des ententes de dossier de financement.'
  },
  {
    action: 'delete',
    subject: 'agreement',
    name_en: 'Delete Agreements',
    name_fr: 'Supprimer les ententes',
    desc_en: 'Ability to delete funding case agreements.',
    desc_fr: 'Capacite de supprimer des ententes de dossier de financement.'
  }
] as const

export type AbilityAction = AuthorizationAction
export type { AuthorizationSubject, RoleAbility, RoleAbilitySubject }
export type AbilitySubject<_A extends AbilityAction = AbilityAction> = AuthorizationSubject
export type Ability = RoleAbility

/** Checks whether a value is a supported action and subject pair. */
export const isAbility = (
  ability: { action: unknown; subject: unknown }
): ability is Ability => {
  return isRoleAbility(ability)
}

/**
 * Retrieves the details for a specific ability action and subject.
 *
 * @param action - The action of the ability.
 * @param subject - The subject of the ability.
 * @returns The ability details object or undefined if not found.
 */
export const getAbilityDetails = (action: string, subject: string) => {
  return ABILITIES.find(a => a.action === action && a.subject === subject)
}
