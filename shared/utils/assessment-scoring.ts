/**
 * Selects the smallest inclusive upper bound without changing authored row order.
 * @param rows Authored scoring bands.
 * @param score Numeric score to classify.
 * @returns The matching band, or undefined above all thresholds.
 */
export const findAssessmentBand = <T extends { max: number }>(rows: T[], score: number): T | undefined =>
  rows.reduce<T | undefined>((selected, row) =>
    score <= row.max && (selected === undefined || row.max < selected.max) ? row : selected, undefined)
