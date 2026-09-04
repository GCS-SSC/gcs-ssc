/**
 * Escapes SQL LIKE wildcards in user-provided search text.
 *
 * @param search - Raw search input.
 * @returns Escaped value safe for LIKE/ILIKE pattern interpolation.
 */
export const escapeLikePattern = (search: string) => search.replace(/[\\%_]/g, '\\$&')
