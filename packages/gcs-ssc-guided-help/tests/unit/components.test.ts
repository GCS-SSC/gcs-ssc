// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { h, nextTick } from 'vue'
import type { GuideDraft } from '../../src/contracts'
import { mount } from '@vue/test-utils'
import GuidedHelpEditor from '../../src/components/GuidedHelpEditor.vue'
import GuidedHelpPanel from '../../src/components/GuidedHelpPanel.vue'

const guide = { formatVersion: 1 as const, title: { en: 'Help', fr: 'Aide' }, description: { en: 'Help', fr: 'Aide' }, steps: [
  { id: 'name', view: 'agency.general', target: 'agency.name', kind: 'text' as const, title: { en: 'Name', fr: 'Nom' }, instructions: { en: 'Type **here**', fr: 'Saisir **ici**' } },
  { id: 'save', view: 'agency.general', target: 'agency.save', kind: 'button' as const, title: { en: 'Save', fr: 'Enregistrer' }, instructions: { en: 'Click Save', fr: 'Cliquer Enregistrer' } }
] }
const ledger = { formatVersion: 1 as const, views: [{ key: 'agency.general', label: { en: 'Agency', fr: 'Organisme' }, targets: [{ key: 'agency.name', label: { en: 'Name', fr: 'Nom' }, kind: 'text' as const }, { key: 'agency.save', label: { en: 'Save', fr: 'Enregistrer' }, kind: 'button' as const }] }] }
afterEach(() => {
  document.body.innerHTML = ''
})
describe('guide public components', () => {
  it('mounts and removes guidance without becoming a sibling in the host layout', async () => {
    const host = mount({ render: () => h('div', [h('main', 'Workspace'), h(GuidedHelpPanel, { document: guide, locale: 'en', currentView: 'other' })]) }, { attachTo: document.body })
    try {
      await nextTick()
      expect(document.querySelector('.driver-popover')).not.toBeNull()
      expect(host.element.lastElementChild?.tagName).toBe('MAIN')
    } finally { host.unmount() }
    expect(document.querySelector('.driver-popover')).toBeNull()
  })
  it('allows manual step selection and switches language without losing position', async () => {
    const panel = mount(GuidedHelpPanel, { props: { document: guide, locale: 'en', currentView: 'other' } })
    await nextTick()
    expect(document.querySelector('.driver-popover-description')?.textContent).toContain('Follow the instructions')
    document.querySelector<HTMLButtonElement>('.driver-popover-next-btn')!.click()
    await nextTick()
    expect(panel.emitted('select')?.[0]).toEqual(['save', ['name', 'save']])
    await panel.setProps({ locale: 'fr' })
    expect(document.querySelector('.driver-popover-title')?.textContent).toContain('Enregistrer')
    document.querySelector<HTMLButtonElement>('.driver-popover-close-btn')!.click()
    expect(panel.emitted('exit')).toHaveLength(1)
    panel.unmount()
  })
  it('renders restricted Markdown as instructions', async () => {
    const panel = mount(GuidedHelpPanel, { props: { document: guide, locale: 'en', currentView: 'other' } })
    await nextTick()
    expect(document.querySelector('.driver-popover-description strong')?.textContent).toBe('here')
    panel.unmount()
  })
  it('edits bilingual content, reorders steps, and offers only registered controls', async () => {
    const editor = mount(GuidedHelpEditor, { props: { modelValue: guide, ledger, locale: 'en' } })
    await editor.find('input[lang="fr"]').setValue('Nouvelle aide')
    expect(editor.emitted('update:modelValue')?.[0]?.[0]).toMatchObject({ title: { en: 'Help', fr: 'Nouvelle aide' } })
    const up = editor.findAll('button').find(button => button.text() === 'Move down')!
    await up.trigger('click')
    expect((editor.emitted('update:modelValue')?.[1]?.[0] as typeof guide).steps[0]?.id).toBe('save')
    const controlSelect = editor.findAll('select')[1]!
    expect(controlSelect.findAll('option').map(option => option.attributes('value'))).toEqual(['', 'agency.name', 'agency.save'])
    await controlSelect.setValue('agency.save')
    expect((editor.emitted('update:modelValue')?.[2]?.[0] as typeof guide).steps[0]).toMatchObject({ target: 'agency.save', kind: 'button' })
    await editor.findAll('button').find(button => button.text() === 'Preview')!.trigger('click')
    expect(editor.emitted('preview')?.[0]?.[0]).toEqual(guide)
    editor.unmount()
  })
})

it('authors French instructions and adds and removes independently identified steps', async () => {
  let draft: GuideDraft = structuredClone(guide)
  const editor = mount(GuidedHelpEditor, { props: { 'modelValue': draft, ledger, 'locale': 'fr', 'onUpdate:modelValue': value => {
    draft = value
    void editor.setProps({ modelValue: value })
  } } })
  await editor.find('textarea[lang="fr"]').setValue('Description française')
  expect(draft.description.fr).toBe('Description française')
  const frenchFields = editor.findAll('input[lang="fr"]')
  await frenchFields[1]!.setValue('Nom à saisir')
  const frenchInstructions = editor.findAll('textarea[lang="fr"]')
  await frenchInstructions[1]!.setValue('Saisissez votre nom')
  expect(draft.steps[0]).toMatchObject({ title: { fr: 'Nom à saisir' }, instructions: { fr: 'Saisissez votre nom' } })
  await editor.findAll('button').find(button => button.text() === 'Ajouter une étape')!.trigger('click')
  expect(draft.steps).toHaveLength(3)
  expect(new Set(draft.steps.map(step => step.id)).size).toBe(3)
  await editor.findAll('button').find(button => button.text() === 'Supprimer')!.trigger('click')
  expect(draft.steps[0]?.id).toBe('save')
  await editor.findAll('button').find(button => button.text() === 'Sélectionner à l’écran')!.trigger('click')
  expect(editor.emitted('pick')?.[0]?.[0]).toEqual({ stepId: 'save', view: 'agency.general', target: 'agency.save' })
  await editor.findAll('select')[0]!.setValue('agency.general')
  expect(draft.steps[0]?.target).toBe('agency.name')
  editor.unmount()
})

it('keeps empty drafts authorable when no screens are registered', async () => {
  const editor = mount(GuidedHelpEditor, { props: { modelValue: { ...guide, steps: [] }, ledger: { formatVersion: 1, views: [] }, locale: 'en' } })
  await editor.findAll('button').find(button => button.text() === 'Add step')!.trigger('click')
  expect((editor.emitted('update:modelValue')?.[0]?.[0] as typeof guide).steps[0]).toMatchObject({ view: '', target: '', kind: 'section' })
  editor.unmount()
})

it('offers Retry and manual Previous/Next without navigating the application', async () => {
  const panel = mount(GuidedHelpPanel, { props: { document: guide, locale: 'fr', currentView: 'agency.general' } })
  await nextTick()
  expect(document.querySelector('.driver-popover-description')?.textContent).toContain('indisponible')
  document.querySelector<HTMLButtonElement>('.gcs-guide-retry')!.click()
  document.querySelector<HTMLButtonElement>('.driver-popover-next-btn')!.click()
  await nextTick()
  expect(document.querySelector('.driver-popover-title')?.textContent).toContain('Enregistrer')
  document.querySelector<HTMLButtonElement>('.driver-popover-prev-btn')!.click()
  await nextTick()
  expect(document.querySelector('.driver-popover-title')?.textContent).toContain('Nom')
  await panel.setProps({ document: { ...guide, title: { en: 'Updated', fr: 'Mise à jour' } } })
  expect(document.querySelector('.driver-popover-title')?.textContent).toBe('Nom')
  panel.unmount()
})

it('allows selecting a screen control for an incomplete draft and explains publication requirements', async () => {
  const draft = { ...guide, steps: [{ ...guide.steps[0]!, target: '', title: { en: '', fr: '' } }] }
  const editor = mount(GuidedHelpEditor, { props: { modelValue: draft, ledger, locale: 'en' } })
  const picker = editor.findAll('button').find(button => button.text() === 'Select on screen')!
  expect(picker.attributes('disabled')).toBeUndefined()
  await picker.trigger('click')
  expect(editor.emitted('pick')?.[0]?.[0]).toEqual({ stepId: 'name', view: 'agency.general', target: '' })
  expect(editor.findAll('label').every(label => label.text().startsWith('Progression') || label.text().startsWith('Appearance') || label.text().includes('Required for publication'))).toBe(true)
  expect(editor.findAll('[required], [aria-required="true"]')).toHaveLength(0)
  await editor.setProps({ locale: 'fr' })
  expect(editor.findAll('label').every(label => label.text().startsWith('Progression') || label.text().startsWith('Apparence') || label.text().includes('Obligatoire pour publication'))).toBe(true)
  editor.unmount()
})

it('updates the preview warning language without resetting the selected step', async () => {
  const panel = mount(GuidedHelpPanel, { props: { document: guide, locale: 'en', currentView: 'other', notice: 'Preview changes live data' } })
  document.querySelector<HTMLButtonElement>('.driver-popover-next-btn')!.click()
  await nextTick()
  expect(document.querySelector('.driver-popover-title')?.textContent).toBe('Save')
  await panel.setProps({ locale: 'fr', notice: 'Aperçu : données réelles' })
  expect(document.querySelector('.driver-popover-title')?.textContent).toBe('Enregistrer')
  expect(document.querySelector('.gcs-guide-status')?.textContent).toBe('Aperçu : données réelles')
  expect(document.querySelector('.driver-popover-progress-text')?.textContent).toBe('2 sur 2')
  await panel.setProps({ notice: undefined })
  expect(document.querySelector('.driver-popover-description')?.textContent).not.toContain('Aperçu')
  panel.unmount()
})

it('authors optional automatic completion or explicit manual progression in either language', async () => {
  const editor = mount(GuidedHelpEditor, { props: { modelValue: guide, ledger, locale: 'en' } })
  const progression = editor.findAll('label').find(label => label.text().startsWith('Progression'))!.find('select')
  expect(progression.element.value).toBe('completion')
  await progression.setValue('manual')
  expect((editor.emitted('update:modelValue')?.at(-1)?.[0] as typeof guide).steps[0]).toMatchObject({ advanceOn: 'manual' })
  await editor.setProps({ locale: 'fr' })
  expect(editor.text()).toContain('Après réalisation de l’action')
  editor.unmount()
})

it('authors anchored instructions without highlighting while preserving the target', async () => {
  const editor = mount(GuidedHelpEditor, { props: { modelValue: guide, ledger, locale: 'en' } })
  const appearance = editor.findAll('label').find(label => label.text().startsWith('Appearance'))!.find('select')
  expect(appearance.element.value).toBe('spotlight')
  await appearance.setValue('anchor-only')
  expect((editor.emitted('update:modelValue')?.at(-1)?.[0] as typeof guide).steps[0]).toMatchObject({ appearance: 'anchor-only', target: guide.steps[0]!.target })
  await editor.setProps({ locale: 'fr' })
  expect(editor.text()).toContain('Instructions uniquement')
  editor.unmount()
})
