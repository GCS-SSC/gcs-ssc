import { describe, expect, it } from 'vitest'

import config, {
  AUTHORIZATION_COVERAGE_INCLUDE,
  AUTHORIZATION_COVERAGE_THRESHOLDS
} from '../../vitest.config'

type CoverageConfig = {
  include?: string[]
  thresholds?: Partial<Record<keyof typeof AUTHORIZATION_COVERAGE_THRESHOLDS, number>>
}
type CoverageProjectConfig = { test?: { coverage?: CoverageConfig } }

/**
 * Asserts the package-owned source universe and threshold contract.
 * @param coverage - Coverage configuration under mutation testing.
 */
const assertCoverageContract = (coverage: CoverageConfig): void => {
  for (const source of AUTHORIZATION_COVERAGE_INCLUDE) {
    expect(coverage.include).toContain(source)
  }
  expect(coverage.thresholds).toEqual(AUTHORIZATION_COVERAGE_THRESHOLDS)
}

describe('authorization coverage configuration', () => {
  const coverage = (config as CoverageProjectConfig).test?.coverage as CoverageConfig

  it('enforces every package source file and all four 80 percent thresholds', () => {
    assertCoverageContract(coverage)
  })

  it.each(AUTHORIZATION_COVERAGE_INCLUDE)('fails closed when %s is removed', (source) => {
    const mutated = {
      ...coverage,
      include: coverage.include?.filter(entry => entry !== source)
    }

    expect(() => assertCoverageContract(mutated)).toThrow()
  })

  it('fails closed when any threshold is lowered', () => {
    const mutated = {
      ...coverage,
      thresholds: { ...coverage.thresholds, statements: 79 }
    }

    expect(() => assertCoverageContract(mutated)).toThrow()
  })
})
