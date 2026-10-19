import { describe, expect, it } from 'vitest'
import { checkVueContracts } from '../../src/checker'
import type { TargetLedger } from '../../src/contracts'

const ledger: TargetLedger = { formatVersion: 1, views: [{ key: 'agency.general', label: { en: 'Agency', fr: 'Organisme' }, targets: [{ key: 'agency.name', label: { en: 'Name', fr: 'Nom' }, kind: 'text' }] }] }
const check = (source: string) => checkVueContracts({ ledger, sources: [{ filename: 'Agency.vue', source }] })

describe('instance-scoped and native control forwarding', () => {
  const scoped: TargetLedger = { formatVersion: 1, views: [{ key: 'shipment', label: { en: 'Shipment', fr: 'Envoi' }, targets: [{ key: 'shipment.open', label: { en: 'Open', fr: 'Ouvrir' }, kind: 'navigation', scope: 'instance' }] }] }
  it('accepts one repeated logical target with an explicit business instance and rejects unqualified repetition', () => {
    const source = '<template><main data-help-view="shipment"><a v-for="row in rows" data-help-target="shipment.open" :data-help-instance="row.id" /></main></template>'
    expect(checkVueContracts({ ledger: scoped, sources: [{ filename: 'Shipment.vue', source }] })).toEqual([])
    for (const replacement of ['', 'data-help-instance="fixed"', ':data-help-instance="\'fixed\'"']) {
      expect(checkVueContracts({ ledger: scoped, sources: [{ filename: 'Shipment.vue', source: source.replace(':data-help-instance="row.id"', replacement) }] }).map(item => item.code)).toContain('repeated-instance')
    }
  })
  it('verifies repeated forwarding endpoints and every intermediary without allowing dynamic owning callers', () => {
    const options = {
      ledger: scoped,
      sources: [
        { filename: 'Shipment.vue', source: '<template><main data-help-view="shipment"><TaskHost help-target="shipment.open" /></main></template>' },
        { filename: 'TaskHost.vue', source: '<template><TaskBody :help-target="helpTarget" /></template>' },
        { filename: 'TaskBody.vue', source: '<template><a v-for="row in rows" :data-help-target="helpTarget" :data-help-instance="row.id" /></template>' }
      ],
      forwardedTargets: [
        { component: 'TaskHost', prop: 'helpTarget', kind: 'navigation' as const, scope: 'instance' as const, filename: 'TaskBody.vue', via: [{ filename: 'TaskHost.vue', component: 'TaskBody' }] },
        { component: 'TaskBody', prop: 'helpTarget', kind: 'navigation' as const, scope: 'instance' as const, filename: 'TaskBody.vue' }
      ]
    }
    expect(checkVueContracts(options)).toEqual([])
    expect(checkVueContracts({ ...options, sources: options.sources.map(item => item.filename === 'Shipment.vue' ? { ...item, source: item.source.replace('help-target="shipment.open"', ':help-target="dynamic"') } : item) }).map(item => item.code)).toContain('dynamic-declaration')
    expect(checkVueContracts({ ...options, sources: options.sources.map(item => item.filename === 'TaskBody.vue' ? { ...item, source: item.source.replace(':data-help-instance="row.id"', '') } : item) }).map(item => item.code)).toContain('invalid-forwarding')
  })
  it('requires an actual parsed native attribute setter and exact prop forwarding', () => {
    const targetLedger: TargetLedger = { ...ledger, views: [{ ...ledger.views[0]!, targets: [{ ...ledger.views[0]!.targets[0]!, kind: 'button' }] }] }
    const options = {
      ledger: targetLedger,
      sources: [
        { filename: 'Agency.vue', source: '<template><main data-help-view="agency.general"><TabsHost help-target="agency.name" /></main></template>' },
        { filename: 'TabsHost.vue', source: '<template><TabsBody :help-target="helpTarget" /></template>' },
        { filename: 'TabsBody.vue', source: '<script setup lang="ts">element.setAttribute(\'data-help-target\', helpTarget)</script><template><div /></template>' }
      ],
      forwardedTargets: [{ component: 'TabsHost', prop: 'helpTarget', kind: 'button' as const, nativeAttribute: true as const, filename: 'TabsBody.vue', via: [{ filename: 'TabsHost.vue', component: 'TabsBody' }] }]
    }
    expect(checkVueContracts(options)).toEqual([])
    for (const replacement of ['// element.setAttribute(\'data-help-target\', helpTarget)', 'element.setAttribute(\'data-other\', helpTarget)', 'element.setAttribute(\'data-help-target\', otherTarget)']) {
      expect(checkVueContracts({ ...options, sources: options.sources.map(item => item.filename === 'TabsBody.vue' ? { ...item, source: `<script setup lang="ts">${replacement}\n</script><template><div /></template>` } : item) }).map(item => item.code)).toContain('invalid-forwarding')
    }
  })
})

describe('Vue source help compatibility', () => {
  it('accepts a declared view and actual field through ordinary layout and label changes', () => {
    expect(check('<template><main data-help-view="agency.general"><label>Nom</label><section><UInput data-help-target="agency.name" /></section></main></template>')).toEqual([])
  })
})

it.each([
  ['<template><main /></template>', 'missing-view'],
  ['<template><main data-help-view="agency.general" /></template>', 'missing-target'],
  ['<template><main data-help-view="agency.general"><UCheckbox data-help-target="agency.name" /></main></template>', 'kind-mismatch'],
  ['<template><main data-help-view="agency.general"><input data-help-target="agency.name" /><input data-help-target="agency.name" /></main></template>', 'duplicate-target'],
  ['<template><main data-help-view="agency.general"><input data-help-target="unknown" /></main></template>', 'unknown-target'],
  ['<template><main data-help-view="unknown" /></template>', 'unknown-view'],
  ['<template><input data-help-target="agency.name" /></template>', 'unscoped-target'],
  ['<template><main :data-help-view="view"><input :data-help-target="field" /></main></template>', 'dynamic-declaration'],
  ['<template><main data-help-view="agency.general"><input v-for="row in rows" data-help-target="agency.name" /></main></template>', 'repeated-declaration'],
  ['<template><main data-help-view="agency.general"><input :type="type" data-help-target="agency.name" /></main></template>', 'kind-mismatch'],
  ['<template><main data-help-view="agency.general"><div data-help-kind="text" data-help-target="agency.name" /></main></template>', 'kind-mismatch'],
  ['<template><main data-help-view="agency.general"><input data-help-target="agency.name" /></template>', 'invalid-source']
])('diagnoses source breakage: %s', (source, code) => {
  expect(check(source).map(item => item.code)).toContain(code)
})

it('detects repeated declarations inherited from a loop wrapper', () => {
  expect(check('<template><main data-help-view="agency.general"><section v-for="row in rows"><input data-help-target="agency.name" /></section></main></template>').map(item => item.code)).toContain('repeated-declaration')
})

it('independently verifies literal consumers and the complete forwarding chain', () => {
  const options = {
    ledger,
    sources: [
      { filename: 'Agency.vue', source: '<template><main data-help-view="agency.general"><FieldHost help-name-target="agency.name" /></main></template>' },
      { filename: 'FieldHost.vue', source: '<template><FieldBody :help-name-target="helpNameTarget" /></template>' },
      { filename: 'FieldBody.vue', source: '<template><input :data-help-target="helpNameTarget" /></template>' }
    ],
    forwardedTargets: [{ component: 'FieldHost', prop: 'helpNameTarget', kind: 'text' as const, filename: 'FieldBody.vue', via: [{ filename: 'FieldHost.vue', component: 'FieldBody' }] }]
  }
  expect(checkVueContracts(options)).toEqual([])
  const broken = { ...options, sources: options.sources.map(item => item.filename === 'FieldHost.vue' ? { ...item, source: '<template><FieldBody /></template>' } : item) }
  expect(checkVueContracts(broken).map(item => item.code)).toContain('invalid-forwarding')
  const changed = { ...options, sources: options.sources.map(item => item.filename === 'FieldBody.vue' ? { ...item, source: '<template><UCheckbox :data-help-target="helpNameTarget" /></template>' } : item) }
  expect(checkVueContracts(changed).map(item => item.code)).toContain('invalid-forwarding')
})

it.each([
  ['<input type="email"', 'text'], ['<input type="number"', 'number'], ['<input type="checkbox"', 'checkbox'],
  ['<input type="date"', 'date'], ['<textarea', 'textarea'], ['<select', 'select'], ['<button', 'button'],
  ['<input type="submit"', 'button'], ['<CommonCurrencyInput', 'money'], ['<CommonServerLookupSelect', 'select'],
  ['<button data-help-kind="navigation"', 'navigation'], ['<div data-help-kind="section"', 'section']
] as const)('checks the actual semantic control type: %s', (control, kind) => {
  const typedLedger: TargetLedger = { ...ledger, views: [{ ...ledger.views[0]!, targets: [{ ...ledger.views[0]!.targets[0]!, kind }] }] }
  expect(checkVueContracts({ ledger: typedLedger, sources: [{ filename: 'Field.vue', source: `<template><main data-help-view="agency.general">${control} data-help-target="agency.name" /></main></template>` }] })).toEqual([])
})

it('rejects duplicated views, valueless markers and unrecognized native controls', () => {
  expect(check('<template><div data-help-view="agency.general"/><div data-help-view="agency.general"/></template>').map(item => item.code)).toContain('duplicate-view')
  expect(check('<template><main data-help-view="agency.general"><input data-help-target /></main></template>').map(item => item.code)).toContain('invalid-declaration')
  expect(check('<template><main data-help-view="agency.general"><input type="hidden" data-help-target="agency.name" /></main></template>').map(item => item.code)).toContain('kind-mismatch')
})

it('rejects forwarding endpoints inside loops and dynamic consumer references', () => {
  const options = {
    ledger,
    sources: [
      { filename: 'Agency.vue', source: '<template><main data-help-view="agency.general"><FieldHost :help-name-target="target" /></main></template>' },
      { filename: 'FieldHost.vue', source: '<template><div v-for="row in rows"><input :data-help-target="helpNameTarget" /></div></template>' }
    ],
    forwardedTargets: [{ component: 'FieldHost', prop: 'helpNameTarget', kind: 'text' as const, filename: 'FieldHost.vue' }]
  }
  expect(checkVueContracts(options).map(item => item.code)).toContain('invalid-forwarding')
  expect(checkVueContracts(options).map(item => item.code)).toContain('dynamic-declaration')
})

it('accepts standard HTML void elements in supported and unrelated Vue templates', () => {
  expect(check('<template><main data-help-view="agency.general"><input data-help-target="agency.name"><br><hr></main></template>')).toEqual([])
})
