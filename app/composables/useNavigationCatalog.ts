/* eslint-disable jsdoc/require-jsdoc -- Navigation entries declare the existing sidebar policy. */
import { computed, toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { NavigationMenuItem } from '@nuxt/ui'
import type { GcsExtensionWorkspaceNavigation } from '@gcs-ssc/extensions'
import type { ExtensionAgencyWorkspaceListItem } from '~~/shared/types/schemas/extensions'
import { appRouteLocations } from '~/utils/route-locations'

export type NavigationCatalogItem = NavigationMenuItem & {
  id: string
  label: string
  to: string
  searchLabels: string[]
  navigation: { category: GcsExtensionWorkspaceNavigation['category'] | 'primary'; order: number }
}

/**
 * Supplies the same permitted page destinations to the sidebar and global search.
 * @param workspaces - Server-permitted extension workspace entries.
 * @returns Reactive sidebar groups and searchable page destinations.
 */
export const useNavigationCatalog = (workspaces: MaybeRefOrGetter<ExtensionAgencyWorkspaceListItem[]>) => {
  const { t, locale } = useI18n()
  const localePath = useLocalePath()
  const { can, canAny, canManageAssignments = () => false } = useCan()
  const pages = computed<NavigationCatalogItem[]>(() => {
    const entries: NavigationCatalogItem[] = []
    const add = (
      id: string,
      labelKey: string,
      icon: string,
      destination: Parameters<typeof localePath>[0],
      navigation: NavigationCatalogItem['navigation'],
      permitted = true
    ) => {
      if (!permitted) return
      entries.push({
        id, navigation, label: t(labelKey), icon, to: localePath(destination),
        searchLabels: [t(labelKey, {}, { locale: 'en' }), t(labelKey, {}, { locale: 'fr' })]
      })
    }
    add('home', 'nav.home', 'i-lucide-house', appRouteLocations.home(), { category: 'primary', order: 10 })
    add('agencies', 'nav.agencies', 'i-lucide-settings', appRouteLocations.agencies(), { category: 'management', order: 10 }, canAny('agency', 'read'))
    add('programs', 'nav.transfer_payments', 'i-lucide-banknote', appRouteLocations.transferPayments(), { category: 'primary', order: 60 }, canAny('transfer_payment', 'read'))
    add('opportunities', 'nav.funding_opportunities', 'i-lucide-megaphone', appRouteLocations.fundingOpportunities(), { category: 'primary', order: 50 }, canAny('transfer_payment', 'read'))
    add('intakes', 'nav.funding_case_intakes', 'i-lucide-inbox', appRouteLocations.fundingCaseIntakes(), { category: 'primary', order: 40 }, canAny('funding_case', 'read'))
    add('journal-vouchers', 'journal_voucher.title', 'i-lucide-book-open-check', appRouteLocations.journalVouchers(), { category: 'management', order: 70 }, canAny('journal_voucher', 'read'))
    add('agreements', 'nav.agreements', 'i-lucide-file-signature', appRouteLocations.agreements(), { category: 'primary', order: 20 }, canAny('agreement', 'read'))
    entries.push(...toValue(workspaces).map(workspace => ({
      id: `extension:${workspace.key}`,
      navigation: workspace.navigation,
      label: locale.value === 'fr' ? workspace.label.fr : workspace.label.en,
      icon: workspace.icon ?? 'i-lucide-panels-top-left',
      to: localePath(appRouteLocations.extensionAgencyWorkspaceList(workspace.key)),
      searchLabels: [workspace.label.en, workspace.label.fr]
    })))
    add('proponents', 'nav.applicant_recipients', 'i-lucide-store', appRouteLocations.proponents(), { category: 'primary', order: 30 }, canAny('applicant_recipient', 'read'))
    const assignmentSubjects = ['agreement', 'applicant_recipient', 'funding_case', 'journal_voucher', 'correction'] as const
    add('assignment', 'nav.assignment_management', 'i-lucide-user-round-check', appRouteLocations.assignmentManagement(), { category: 'administration', order: 10 }, assignmentSubjects.some(subject => canManageAssignments(subject)))
    add('field-help', 'field_tooltips.title', 'i-lucide-message-circle-question-mark', appRouteLocations.fieldHelp(), { category: 'management', order: 65 }, canAny('help', 'read', ['global', 'agency']))
    add('guided-help', 'guided_help.title', 'i-lucide-book-open', appRouteLocations.guidedHelp(), { category: 'management', order: 60 }, canAny('help', 'read', ['global', 'agency']))
    add('roles', 'role.title', 'i-lucide-shield', appRouteLocations.roles(), { category: 'management', order: 50 }, canAny('role', 'read'))
    add('users', 'nav.users', 'i-lucide-user-round', appRouteLocations.users(), { category: 'administration', order: 20 }, canAny('user', 'read'))
    add('groups', 'nav.groups', 'i-lucide-users', appRouteLocations.groups(), { category: 'administration', order: 30 }, canAny('group', 'read'))
    add('audit', 'audit.title', 'i-lucide-clipboard-list', appRouteLocations.adminAudit(), { category: 'administration', order: 40 }, canAny('audit', 'read', ['global', 'agency']))
    add('access', 'audit.access', 'i-lucide-eye', appRouteLocations.adminAccess(), { category: 'administration', order: 45 }, canAny('audit', 'read', ['global', 'agency']))
    add('common', 'admin_common.resources.gwcoa', 'i-lucide-database', appRouteLocations.adminGwcoa(), { category: 'administration', order: 50 }, can('system', 'read', { type: 'global' }))
    add('queues', 'queues.title', 'i-lucide-list-restart', appRouteLocations.adminQueues(), { category: 'administration', order: 60 }, can('system', 'read', { type: 'global' }))
    return entries
  })
  const items = computed<NavigationMenuItem[][]>(() => {
    const orderedPages = [...pages.value].sort((left, right) =>
      left.navigation.order - right.navigation.order || left.id.localeCompare(right.id, 'en'))
    const mainPages: NavigationMenuItem[] = orderedPages.filter(page => page.navigation.category === 'primary')
    const groups = [
      { id: 'management', category: 'management', labelKey: 'nav.management', icon: 'i-lucide-briefcase-business' },
      { id: 'admin', category: 'administration', labelKey: 'nav.admin', icon: 'i-lucide-settings-2' }
    ]
    for (const group of groups) {
      const children = orderedPages.filter(page => page.navigation.category === group.category)
      if (!children.length) continue
      mainPages.push({
        'id': group.id,
        'value': group.id,
        'label': t(group.labelKey),
        'aria-label': t(group.labelKey),
        'icon': group.icon,
        'type': 'trigger',
        'popover': true,
        children
      })
    }
    return [mainPages, []]
  })
  return { items, pages }
}
