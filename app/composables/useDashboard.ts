import { createSharedComposable, useLocalStorage, useBreakpoints, breakpointsTailwind } from '@vueuse/core'
import { computed } from 'vue'

/**
 * Internal dashboard UI state composable providing persistent hero-collapse state.
 *
 * @returns Dashboard state refs and helpers.
 */
const _useDashboard = () => {
  // Track hero collapsed states for different pages
  const heroCollapsedStates = useLocalStorage<Record<string, boolean>>('dashboard-hero-collapsed-states', {})

  const breakpoints = useBreakpoints(breakpointsTailwind)
  const isMobile = breakpoints.smaller('sm')

  /**
   * Returns a reactive computed for the hero collapsed state of a specific page.
   *
   * @param key - Unique key for the page/hero section.
   * @returns Writable computed for the collapsed state.
   */
  const getHeroCollapsed = (key: string) =>
    computed<boolean>({
      get: () => heroCollapsedStates.value[key] ?? isMobile.value,
      set: value => {
        heroCollapsedStates.value[key] = value
      }
    })

  return {
    getHeroCollapsed
  }
}

/**
 * Shared dashboard UI state composable.
 *
 * @remarks
 * Uses shared composable scope so state is reused across consumers.
 */
export const useDashboard = createSharedComposable(_useDashboard)
