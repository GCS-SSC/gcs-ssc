type SectionUrlDefinition = { fr: string; aliases?: readonly string[] }

// URL vocabulary is deliberately independent of interface labels and their translations.
const SECTION_URL_VALUES: Record<string, SectionUrlDefinition> = {
  'general': { fr: 'general' },
  'summary': { fr: 'sommaire' },
  'lines': { fr: 'lignes' },
  'completion': { fr: 'finalisation' },
  'reviews': { fr: 'examens' },
  'review': { fr: 'examen' },
  'additional-review': { fr: 'examen-supplementaire' },
  'workflow': { fr: 'processus' },
  'workflows': { fr: 'flux-de-travail', aliases: ['workflowSetups'] },
  'workflow-setups': { fr: 'configurations-de-flux-de-travail' },
  'supplementary-information': { fr: 'informations-supplementaires' },
  'attachments': { fr: 'pieces-jointes' },
  'assignments': { fr: 'affectations', aliases: ['assigned-users', 'utilisateurs-assignes'] },
  'documents': { fr: 'documents' },
  'addresses': { fr: 'adresses' },
  'notes': { fr: 'notes' },
  'notes-to-file': { fr: 'notes-au-dossier' },
  'applicant-recipients': { fr: 'promoteurs' },
  'budget': { fr: 'budget' },
  'budgets': { fr: 'budgets' },
  'financial-summary': { fr: 'sommaire-financier' },
  'recommendation': { fr: 'recommandation' },
  'risk-rating': { fr: 'cote-de-risque' },
  'commitments': { fr: 'engagements' },
  'payments': { fr: 'paiements' },
  'account-receivables': { fr: 'comptes-debiteurs' },
  'credit-memos': { fr: 'notes-de-credit' },
  'corrections': { fr: 'corrections' },
  'forecasts': { fr: 'previsions' },
  'claims': { fr: 'demandes-de-remboursement' },
  'monitors': { fr: 'suivis' },
  'activities': { fr: 'activites' },
  'amendments': { fr: 'modifications' },
  'closeout': { fr: 'cloture' },
  'snapshots': { fr: 'instantanes' },
  'basis': { fr: 'base' },
  'breakdown': { fr: 'ventilation' },
  'reconciliation': { fr: 'rapprochement' },
  'entry': { fr: 'ecriture' },
  'adjustments': { fr: 'ajustements' },
  'claim-reductions': { fr: 'reductions-de-demandes-de-remboursement' },
  'application': { fr: 'demande' },
  'applications': { fr: 'demandes' },
  'approval': { fr: 'approbation' },
  'statuses': { fr: 'statuts' },
  'custom-fields': { fr: 'champs-personnalises' },
  'approval-templates': { fr: 'modeles-d-approbation', aliases: ['approvalTemplates'] },
  'review-setups': { fr: 'configurations-d-examen', aliases: ['reviewSets'] },
  'recommendation-setups': { fr: 'configurations-de-recommandation', aliases: ['recommendationSets'] },
  'data-collections': { fr: 'collectes-de-donnees', aliases: ['dataCollections'] },
  'programs': { fr: 'programmes' },
  'cost-categories': { fr: 'categories-de-couts' },
  'funding-types': { fr: 'types-de-financement' },
  'fiscal-years': { fr: 'annees-budgetaires' },
  'charts-of-accounts': { fr: 'plans-comptables' },
  'chart-of-accounts': { fr: 'plan-comptable' },
  'commitment-types': { fr: 'types-d-engagement' },
  'receivable-types': { fr: 'types-de-comptes-debiteurs' },
  'document-templates': { fr: 'modeles-de-documents' },
  'holdback-bases': { fr: 'bases-de-retenue' },
  'monitor-types': { fr: 'types-de-suivi' },
  'address-types': { fr: 'types-d-adresses' },
  'attachment-types': { fr: 'types-de-pieces-jointes' },
  'proponent-subtypes': { fr: 'sous-types-de-promoteurs' },
  'approval-behalf': { fr: 'approbation-au-nom-de' },
  'agreement-types': { fr: 'types-d-ententes' },
  'extensions': { fr: 'extensions' },
  'streams': { fr: 'volets' },
  'outcomes': { fr: 'resultats' },
  'objectives': { fr: 'objectifs' },
  'performance-indicators': { fr: 'indicateurs-de-rendement' },
  'eligible-recipients': { fr: 'beneficiaires-admissibles' },
  'cost-category-line-items': { fr: 'lignes-de-categorie-de-couts' },
  'amendment-types': { fr: 'types-de-modification' },
  'amendment-subtypes': { fr: 'sous-types-d-amendement' },
  'agreement-subtypes': { fr: 'sous-types-d-entente' },
  'funding-subtypes': { fr: 'sous-types-de-financement' },
  'risk-ratings': { fr: 'cotes-de-risque' },
  'areas-of-expertise': { fr: 'domaines-d-expertise' },
  'financial-limits': { fr: 'limites-financieres' },
  'agency-financial-ids': { fr: 'identifiants-financiers-d-agence' },
  'registries': { fr: 'registres' },
  'other-names': { fr: 'autres-noms' },
  'contacts': { fr: 'contacts' },
  'agreements': { fr: 'ententes' },
  'funding-history': { fr: 'historique-du-financement' },
  'permissions': { fr: 'autorisations' },
  'schema-general': { fr: 'schema-general' },
  'schema-matrices': { fr: 'schema-matrices' },
  'schema-sections': { fr: 'schema-sections' },
  'schema-outcomes': { fr: 'schema-resultats' },
  'schema-impactors': { fr: 'schema-facteurs-d-impact' },
  'connection': { fr: 'connexion' },
  'verification': { fr: 'verification' },
  'queue': { fr: 'file' },
  'delivery': { fr: 'livraison' },
  'forms': { fr: 'formulaires' },
  'intakes': { fr: 'appels-de-demandes' }
}

const SECTION_TAB_KEYS: Record<string, string> = {
  'agency.tabs.general': 'general',
  'agency.tabs.statuses': 'statuses',
  'custom_fields.title': 'custom-fields',
  'agency.tabs.approval_templates': 'approval-templates',
  'agency.tabs.workflow_setups': 'workflows',
  'transfer_payment.review_setups': 'review-setups',
  'transfer_payment.recommendation_setups': 'recommendation-setups',
  'data_collection.catalog_title': 'data-collections',
  'agency.tabs.programs': 'programs',
  'agency.tabs.cost_categories': 'cost-categories',
  'agency.funding_types.title': 'funding-types',
  'agency.tabs.fiscal_years': 'fiscal-years',
  'agency.tabs.chart_of_accounts': 'charts-of-accounts',
  'agency.tabs.commitment_types': 'commitment-types',
  'agency.tabs.account_receivable_types': 'receivable-types',
  'agency.tabs.document_templates': 'document-templates',
  'agency.tabs.holdback_bases': 'holdback-bases',
  'agency.tabs.monitor_types': 'monitor-types',
  'agency.tabs.address_types': 'address-types',
  'agency.tabs.attachment_types': 'attachment-types',
  'agency.tabs.applicant_recipient_subtypes': 'proponent-subtypes',
  'agency.tabs.approval_behalf': 'approval-behalf',
  'agency.tabs.agreement_types': 'agreement-types',
  'extensions.tab': 'extensions',
  'transfer_payment.streams': 'streams',
  'transfer_payment.outcomes': 'outcomes',
  'transfer_payment.objectives': 'objectives',
  'transfer_payment.budgets': 'budgets',
  'transfer_payment.performance_indicators': 'performance-indicators',
  'transfer_payment.holdback_bases': 'holdback-bases',
  'transfer_payment.eligible_recipients': 'eligible-recipients',
  'transfer_payment.cost_category_line_items': 'cost-category-line-items',
  'transfer_payment.amendment_types': 'amendment-types',
  'transfer_payment.amendment_subtypes': 'amendment-subtypes',
  'transfer_payment.agreement_subtypes': 'agreement-subtypes',
  'transfer_payment.chart_of_accounts.title': 'chart-of-accounts',
  'transfer_payment.commitment_types.title': 'commitment-types',
  'transfer_payment.monitor_types': 'monitor-types',
  'transfer_payment.risk_ratings': 'risk-ratings',
  'agency.funding_types.subtypes': 'funding-subtypes',
  'transfer_payment.areas_of_expertise': 'areas-of-expertise',
  'transfer_payment.financial_limits': 'financial-limits',
  'transfer_payment.document_templates.title': 'document-templates',
  'workflow.title': 'workflows',
  'applicant_recipient.agency_financial_ids.title': 'agency-financial-ids',
  'applicant_recipient.registries.title': 'registries',
  'applicant_recipient.other_names.title': 'other-names',
  'notes.title': 'notes-to-file',
  'applicant_recipient.addresses.title': 'addresses',
  'applicant_recipient.contacts.title': 'contacts',
  'applicant_recipient.reviews.title': 'reviews',
  'applicant_recipient.agreements.title': 'agreements',
  'applicant_recipient.funding_history.title': 'funding-history',
  'account_receivable.title': 'account-receivables',
  'account_receivable.lines': 'lines',
  'account_receivable.credit_memo_lines': 'lines',
  'account_receivable.credit_memos_title': 'credit-memos',
  'attachments.title': 'attachments',
  'assignments.title': 'assignments',
  'role.permissions': 'permissions',
  'role.assignment.title': 'assignments',
  'assessment.review': 'additional-review'
}

const sectionAliasToValue = new Map<string, string>()
for (const [value, definition] of Object.entries(SECTION_URL_VALUES)) {
  sectionAliasToValue.set(value, value)
  if (!sectionAliasToValue.has(definition.fr)) sectionAliasToValue.set(definition.fr, value)
  for (const alias of definition.aliases ?? []) sectionAliasToValue.set(alias, value)
}

/**
 * Resolve the stable section identity without consulting a display label.
 * @param root0 - Tab metadata.
 * @param root0.key - Stable translation or extension key.
 * @param root0.value - Optional explicit internal identity.
 * @returns Stable internal section identity.
 */
export const getSectionTabValue = ({ key, value }: { key: string; value?: string }): string =>
  value || (Object.hasOwn(SECTION_TAB_KEYS, key) ? SECTION_TAB_KEYS[key]! : key)

/**
 * Translate a known section URL token; preserve opaque extension and authored identities.
 * @param value - Canonical or localized section token.
 * @param locale - Destination locale.
 * @returns Localized URL token or the original unknown identity.
 */
export const localizeSectionValue = (value: string, locale: string): string => {
  const canonicalValue = sectionAliasToValue.get(value)
  if (!canonicalValue) return value
  return locale.toLowerCase().split('-')[0] === 'fr'
    ? SECTION_URL_VALUES[canonicalValue]!.fr
    : canonicalValue
}

/**
 * Accept the stable identity, both localized URL tokens, and established entry-link aliases.
 * @param value - Stable internal section identity.
 * @returns Recognized URL aliases for this section.
 */
export const sectionValueAliases = (value: string): string[] => {
  const definition = Object.hasOwn(SECTION_URL_VALUES, value) ? SECTION_URL_VALUES[value] : undefined
  return definition ? [...new Set([value, definition.fr, ...(definition.aliases ?? [])])] : [value]
}

/**
 * Translate every section parameter while preserving the route path and other URL state.
 * @param path - Relative route URL.
 * @param locale - Destination locale.
 * @returns Relative URL with localized section query values.
 */
export const localizeSectionUrl = (path: string, locale: string): string => {
  const url = new URL(path, 'https://gcs-ssc.invalid')
  if (!url.searchParams.has('section')) return path
  const query = new URLSearchParams()
  for (const [key, value] of url.searchParams) {
    query.append(key, key === 'section' ? localizeSectionValue(value, locale) : value)
  }
  return `${url.pathname}?${query.toString()}${url.hash}`
}
