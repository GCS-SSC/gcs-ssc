/**
 * Reset the page scroll container after a review section changes.
 * @param content - The active review content element.
 */
export const scrollReviewPageToTop = (content: HTMLElement | null) => {
  if (!content) return

  let ancestor: HTMLElement | null = content.parentElement
  while (ancestor) {
    if (ancestor.scrollTop > 0) ancestor.scrollTo({ top: 0, behavior: 'instant' })
    ancestor = ancestor.parentElement
  }

  if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'instant' })
}
