import { describe, expect, it } from 'vitest'
import { GuideDocumentSchema, GuideDraftSchema, TargetLedgerSchema, checkGuideCompatibility } from '../../src/contracts'

export const guide = {
  formatVersion: 1,
  title: { en: 'Add an address type', fr: 'Ajouter un type d’adresse' },
  description: { en: 'Agency configuration', fr: 'Configuration de l’organisme' },
  steps: [{ id: 'name', view: 'agency.address-types', target: 'agency.address-type.name', kind: 'text', title: { en: 'Name', fr: 'Nom' }, instructions: { en: 'Enter a name.', fr: 'Saisissez un nom.' } }]
}

describe('guide document publication', () => {
  it('accepts complete bilingual content and keeps stable step identities', () => {
    expect(GuideDocumentSchema.parse(guide)).toEqual(guide)
  })
})

it('allows incomplete translations in drafts but never in publications', () => {
  const incomplete = { ...guide, title: { en: 'Work in progress', fr: '' }, steps: [] }
  expect(GuideDraftSchema.safeParse(incomplete).success).toBe(true)
  expect(GuideDocumentSchema.safeParse(incomplete).success).toBe(false)
})

it.each([
  { ...guide, formatVersion: 2 },
  { ...guide, onclick: 'alert(1)' },
  { ...guide, title: { en: 'Title', fr: 'Titre', de: 'Titel' } },
  { ...guide, steps: [guide.steps[0], guide.steps[0]] },
  { ...guide, steps: [{ ...guide.steps[0], target: '#arbitrary-selector' }] },
  { ...guide, steps: [{ ...guide.steps[0], instructions: { en: '<img src=x onerror=alert(1)>', fr: 'Texte' } }] },
  { ...guide, steps: [{ ...guide.steps[0], instructions: { en: '{{execute()}}', fr: 'Texte' } }] },
  { ...guide, steps: [{ ...guide.steps[0], instructions: { en: '[click](javascript:alert(1))', fr: 'Texte' } }] },
  { ...guide, steps: [{ ...guide.steps[0], instructions: { en: 'x'.repeat(8001), fr: 'Texte' } }] },
  { ...guide, description: { en: 'a\0b', fr: 'Texte' } }
])('rejects unsafe, ambiguous or unsupported documents', value => {
  expect(GuideDocumentSchema.safeParse(value).success).toBe(false)
})

it('rejects duplicate draft identities and unsafe draft markup too', () => {
  expect(GuideDraftSchema.safeParse({ ...guide, steps: [guide.steps[0], guide.steps[0]] }).success).toBe(false)
  expect(GuideDraftSchema.safeParse({ ...guide, title: { en: '<script>bad()</script>', fr: '' } }).success).toBe(false)
})
const ledger = { formatVersion: 1 as const, views: [{ key: 'agency.address-types', label: { en: 'Address types', fr: 'Types d’adresse' }, targets: [{ key: 'agency.address-type.name', label: { en: 'Name', fr: 'Nom' }, kind: 'text' as const }] }] }

it('offers a validated bilingual catalog and reports broken guide references', () => {
  expect(TargetLedgerSchema.parse(ledger)).toEqual(ledger)
  expect(checkGuideCompatibility(GuideDocumentSchema.parse(guide), ledger)).toEqual([])
  const broken = { ...GuideDocumentSchema.parse(guide), steps: [
    { ...GuideDocumentSchema.parse(guide).steps[0]!, id: 'missing-view', view: 'removed' },
    { ...GuideDocumentSchema.parse(guide).steps[0]!, id: 'missing-target', target: 'removed' },
    { ...GuideDocumentSchema.parse(guide).steps[0]!, id: 'changed-kind', kind: 'checkbox' as const }
  ] }
  expect(checkGuideCompatibility(broken, ledger).map(item => [item.code, item.stepId])).toEqual([
    ['unknown-view', 'missing-view'], ['unknown-target', 'missing-target'], ['kind-mismatch', 'changed-kind']
  ])
})

it('rejects ambiguous ledgers instead of silently choosing a target', () => {
  expect(TargetLedgerSchema.safeParse({ ...ledger, views: [...ledger.views, ...ledger.views] }).success).toBe(false)
  expect(TargetLedgerSchema.safeParse({ ...ledger, views: [{ ...ledger.views[0], targets: [...ledger.views[0]!.targets, ...ledger.views[0]!.targets] }] }).success).toBe(false)
})

it('bounds the total document and gives localizable errors for malformed input', () => {
  const tooLarge = { ...guide, steps: Array.from({ length: 100 }, (_, index) => ({ ...guide.steps[0], id: `step-${index}`, instructions: { en: 'x'.repeat(2000), fr: 'x'.repeat(2000) } })) }
  const result = GuideDraftSchema.safeParse(tooLarge)
  expect(result.success).toBe(false)
  if (!result.success) expect(result.error.issues.map(issue => issue.message)).toContain('validation.guided_help_document_too_large')
  const malformed = GuideDocumentSchema.safeParse({ ...guide, arbitrary: 'value', title: 1 })
  expect(malformed.success).toBe(false)
  if (!malformed.success) expect(malformed.error.issues.every(issue => issue.message.startsWith('validation.'))).toBe(true)
})

it('accepts only declarative completion choices without rewriting omitted published settings', () => {
  expect(GuideDocumentSchema.parse(guide).steps[0]).not.toHaveProperty('advanceOn')
  for (const advanceOn of ['completion', 'manual']) {
    expect(GuideDocumentSchema.parse({ ...guide, steps: [{ ...guide.steps[0], advanceOn }] }).steps[0]?.advanceOn).toBe(advanceOn)
  }
  for (const advanceOn of ['click', '() => true', { event: 'click' }]) {
    expect(GuideDocumentSchema.safeParse({ ...guide, steps: [{ ...guide.steps[0], advanceOn }] }).success).toBe(false)
  }
})

it('marks modal-only authoring views undiscoverable without changing existing ledger JSON', () => {
  const view = { key: 'agency.edit', label: { en: 'Edit agency', fr: 'Modifier l’organisme' }, targets: [] }
  expect(TargetLedgerSchema.parse({ formatVersion: 1, views: [view] }).views[0]).not.toHaveProperty('discoverable')
  expect(TargetLedgerSchema.parse({ formatVersion: 1, views: [{ ...view, discoverable: false }] }).views[0]?.discoverable).toBe(false)
})
