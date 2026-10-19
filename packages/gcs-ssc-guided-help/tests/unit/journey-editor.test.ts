// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import type { GuideDraft, TargetLedger } from '../../src/contracts'
import type { GuideJourneyDefinition } from '../../src/journey'
import GuidedHelpEditor from '../../src/components/GuidedHelpEditor.vue'

const definitions: GuideJourneyDefinition[] = [{ adapter: 'example.workflow', label: { en: 'Example journey', fr: 'Parcours exemple' }, stages: [
  { id: 'prepare', kind: 'once', label: { en: 'Prepare', fr: 'Préparer' } },
  { id: 'work', kind: 'tasks', label: { en: 'Work', fr: 'Travail' } }
] }]
const ledger: TargetLedger = { formatVersion: 1, views: [] }
const document: GuideDraft = { formatVersion: 1, title: { en: 'Help', fr: 'Aide' }, description: { en: '', fr: '' }, steps: [
  { id: 'first', view: 'example', target: 'example.target', kind: 'section', title: { en: 'First', fr: 'Première' }, instructions: { en: '', fr: '' } }
] }

describe('generic journey authoring', () => {
  it('selects a host recipe, assigns and moves a step, and clears removed references', async () => {
    let draft = structuredClone(document)
    const editor = mount(GuidedHelpEditor, { props: { 'modelValue': draft, ledger, 'locale': 'en', 'journeyDefinitions': definitions, 'onUpdate:modelValue': (value: GuideDraft) => {
      draft = value
      void editor.setProps({ modelValue: value })
    } } })
    await editor.find('select').setValue('example.workflow')
    expect(draft.journey).toEqual({ adapter: 'example.workflow', stages: [{ id: 'prepare', kind: 'once', guideStepIds: [] }, { id: 'work', kind: 'tasks', guideStepIds: [] }] })
    const stage = editor.findAll('select')[1]!
    await stage.setValue('prepare')
    expect(draft.journey?.stages[0]?.guideStepIds).toEqual(['first'])
    await stage.setValue('work')
    expect(draft.journey?.stages.map(item => item.guideStepIds)).toEqual([[], ['first']])
    await editor.findAll('button').find(button => button.text() === 'Remove')!.trigger('click')
    expect(draft.steps).toEqual([])
    expect(draft.journey?.stages.map(item => item.guideStepIds)).toEqual([[], []])
    await editor.find('select').setValue('')
    expect(draft).not.toHaveProperty('journey')
    editor.unmount()
  })

  it('localizes host recipe and stage labels without changing ordinary authoring', async () => {
    const editor = mount(GuidedHelpEditor, { props: { modelValue: document, ledger, locale: 'fr', journeyDefinitions: definitions } })
    expect(editor.find('select').text()).toContain('Parcours exemple')
    await editor.setProps({ modelValue: { ...document, journey: { adapter: 'example.workflow', stages: [{ id: 'prepare', kind: 'once', guideStepIds: ['first'] }] } } })
    expect(editor.findAll('select')[1]?.text()).toContain('Préparer')
    editor.unmount()
    const plain = mount(GuidedHelpEditor, { props: { modelValue: document, ledger, locale: 'en' } })
    expect(plain.text()).not.toContain('Journey')
    plain.unmount()
  })
})

it('reorders reader instructions within their stage and requires the stage picker to cross a boundary', async () => {
  let draft: GuideDraft = { ...document, steps: ['first', 'second', 'third'].map(id => ({ ...document.steps[0]!, id })), journey: { adapter: 'example.workflow', stages: [
    { id: 'prepare', kind: 'once', guideStepIds: ['first', 'second'] },
    { id: 'work', kind: 'tasks', guideStepIds: ['third'] }
  ] } }
  const editor = mount(GuidedHelpEditor, { props: { 'modelValue': draft, ledger, 'locale': 'en', 'journeyDefinitions': definitions, 'onUpdate:modelValue': (value: GuideDraft) => {
    draft = value
    void editor.setProps({ modelValue: value })
  } } })
  const down = () => editor.findAll('button').filter(button => button.text() === 'Move down')
  await down()[0]!.trigger('click')
  expect(draft.steps.map(step => step.id)).toEqual(['second', 'first', 'third'])
  expect(draft.journey?.stages[0]?.guideStepIds).toEqual(['second', 'first'])
  expect(down()[1]!.attributes('disabled')).toBeDefined()
  await down()[1]!.trigger('click')
  expect(draft.journey?.stages.map(stage => stage.guideStepIds)).toEqual([['second', 'first'], ['third']])
  const stagePickers = editor.findAll('label').filter(label => label.text().startsWith('Journey stage')).map(label => label.find('select'))
  await stagePickers[1]!.setValue('work')
  expect(draft.journey?.stages.map(stage => stage.guideStepIds)).toEqual([['second'], ['first', 'third']])
  editor.unmount()
})

it('authors task templates independently, preserves instruction order and blocks moving across templates', async () => {
  const recipes: GuideJourneyDefinition[] = [{ ...definitions[0]!, stages: [{ id: 'work', kind: 'tasks', label: { en: 'Work', fr: 'Travail' }, taskTemplates: [{ key: 'assessment', label: { en: 'Assessment', fr: 'Évaluation' } }, { key: 'checklist', label: { en: 'Checklist', fr: 'Liste' } }] }] }]
  let draft: GuideDraft = { ...structuredClone(document), steps: ['first', 'second', 'third'].map(id => ({ ...document.steps[0]!, id })) }
  const editor = mount(GuidedHelpEditor, { props: { 'modelValue': draft, ledger, 'locale': 'en', 'journeyDefinitions': recipes, 'onUpdate:modelValue': (value: GuideDraft) => {
    draft = value
    void editor.setProps({ modelValue: value })
  } } })
  await editor.find('select').setValue('example.workflow')
  const assignments = () => editor.findAll('select').filter(select => select.findAll('option').some(option => option.text() === 'Work — Assessment'))
  await assignments()[1]!.setValue(JSON.stringify(['work', 'assessment']))
  await assignments()[0]!.setValue(JSON.stringify(['work', 'assessment']))
  await assignments()[2]!.setValue(JSON.stringify(['work', 'checklist']))
  expect(draft.journey?.stages[0]?.taskTemplates).toEqual([{ key: 'assessment', guideStepIds: ['first', 'second'] }, { key: 'checklist', guideStepIds: ['third'] }])
  await editor.findAll('button').find(button => button.text() === 'Move down')!.trigger('click')
  expect(draft.journey?.stages[0]?.taskTemplates?.[0]?.guideStepIds).toEqual(['second', 'first'])
  const down = editor.findAll('button').filter(button => button.text() === 'Move down')
  expect(down[1]?.attributes('disabled')).toBeDefined()
  await assignments()[0]!.setValue('work')
  expect(draft.journey?.stages[0]?.guideStepIds).toEqual(['second'])
  expect(draft.journey?.stages[0]?.taskTemplates?.[0]?.guideStepIds).toEqual(['first'])
  await editor.findAll('button').filter(button => button.text() === 'Remove')[1]!.trigger('click')
  expect(draft.journey?.stages[0]?.taskTemplates?.[0]?.guideStepIds).toEqual([])
  editor.unmount()
})
