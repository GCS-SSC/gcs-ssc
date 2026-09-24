/* eslint-disable jsdoc/require-jsdoc */
export type DocumentConditionReason = 'syntax' | 'type' | 'blocks' | 'limit'

export class DocumentConditionError extends Error {
  constructor(readonly reason: DocumentConditionReason, readonly expression: string) {
    super(`Invalid document condition (${reason}): ${expression}`)
  }
}

type Operand = { kind: 'path', path: string } | { kind: 'literal', value: string | number | boolean }
type ComparisonOperator = '=' | '!=' | '>' | '>=' | '<' | '<='
export type DocumentCondition =
  | { kind: 'comparison', operator: ComparisonOperator, left: Operand, right: Operand }
  | { kind: 'and' | 'or', left: DocumentCondition, right: DocumentCondition }
type Token = { kind: 'operand', operand: Operand } | { kind: 'symbol', value: string }
const forbiddenSegments = new Set(['__proto__', 'prototype', 'constructor'])

export const parseDocumentCondition = (expression: string): DocumentCondition => {
  const fail = (reason: DocumentConditionReason = 'syntax'): never => {
    throw new DocumentConditionError(reason, expression)
  }
  if (expression.length > 2048) fail('limit')
  if (/[\r\n\u2028\u2029]/u.test(expression)) fail()
  const tokens: Token[] = []
  let offset = 0
  while (offset < expression.length) {
    const rest = expression.slice(offset)
    const whitespace = /^\s+/.exec(rest)
    if (whitespace) {
      offset += whitespace[0].length
      continue
    }
    const quote = rest[0]!
    const endQuote = ({ '\'': '\'', '"': '"', '‘': '’', '“': '”' } as Record<string, string>)[quote]
    if (endQuote) {
      let value = ''
      let closed = false
      offset++
      while (offset < expression.length) {
        const character = expression[offset++]!
        if (character === endQuote) {
          closed = true
          break
        }
        if (character === '\\') {
          const escaped = expression[offset++]
          if (escaped !== endQuote && escaped !== '\\') fail()
          value += escaped
        } else value += character
      }
      if (!closed) fail()
      tokens.push({ kind: 'operand', operand: { kind: 'literal', value } })
    } else {
      const symbol = /^(?:!=|>=|<=|[=><()])/.exec(rest)
      const number = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest)
      const path = /^[A-Za-z_][\w]*(?:\.(?:[A-Za-z_][\w]*|\d+))*/.exec(rest)
      if (symbol) {
        tokens.push({ kind: 'symbol', value: symbol[0] })
        offset += symbol[0].length
      } else if (number) {
        const value = Number(number[0])
        if (!Number.isFinite(value)) fail()
        tokens.push({ kind: 'operand', operand: { kind: 'literal', value } })
        offset += number[0].length
      } else if (path) {
        const value = path[0]
        if (value === 'and' || value === 'or') tokens.push({ kind: 'symbol', value })
        else if (value === 'true' || value === 'false') tokens.push({ kind: 'operand', operand: { kind: 'literal', value: value === 'true' } })
        else {
          if (value.split('.').some(segment => forbiddenSegments.has(segment))) fail()
          tokens.push({ kind: 'operand', operand: { kind: 'path', path: value } })
        }
        offset += value.length
      } else fail()
    }
    if (tokens.length > 256) fail('limit')
  }
  let cursor = 0
  const takeSymbol = (value: string): boolean => {
    const token = tokens[cursor]
    if (token?.kind !== 'symbol' || token.value !== value) return false
    cursor++
    return true
  }
  const operand = (): Operand => {
    const token = tokens[cursor++]
    if (token?.kind !== 'operand') return fail()
    return token.operand
  }
  const primary = (depth: number): DocumentCondition => {
    if (depth > 16) return fail('limit')
    if (takeSymbol('(')) {
      const node = disjunction(depth + 1)
      if (!takeSymbol(')')) fail()
      return node
    }
    const left = operand()
    const operator = tokens[cursor++]
    if (operator?.kind !== 'symbol' || !['=', '!=', '>', '>=', '<', '<='].includes(operator.value)) return fail()
    return { kind: 'comparison', operator: operator.value as ComparisonOperator, left, right: operand() }
  }
  const conjunction = (depth: number): DocumentCondition => {
    let node = primary(depth)
    while (takeSymbol('and')) node = { kind: 'and', left: node, right: primary(depth) }
    return node
  }
  const disjunction = (depth: number): DocumentCondition => {
    let node = conjunction(depth)
    while (takeSymbol('or')) node = { kind: 'or', left: node, right: conjunction(depth) }
    return node
  }
  const condition = disjunction(0)
  if (cursor !== tokens.length) fail()
  return condition
}

export const evaluateDocumentCondition = (
  node: DocumentCondition, resolve: (path: string) => unknown, expression: string
): boolean => {
  if (node.kind !== 'comparison') {
    // Validate both sides even when one determines the outcome: malformed data must not be hidden.
    const left = evaluateDocumentCondition(node.left, resolve, expression)
    const right = evaluateDocumentCondition(node.right, resolve, expression)
    return node.kind === 'and' ? left && right : left || right
  }
  const value = (operand: Operand): unknown => operand.kind === 'literal' ? operand.value : resolve(operand.path)
  const left = value(node.left)
  const right = value(node.right)
  if (left === undefined || left === null || right === undefined || right === null) return false
  if (typeof left !== typeof right || !['string', 'number', 'boolean'].includes(typeof left)
    || (typeof left === 'number' && (!Number.isFinite(left) || !Number.isFinite(right)))) {
    throw new DocumentConditionError('type', expression)
  }
  if (node.operator === '=') return left === right
  if (node.operator === '!=') return left !== right
  if (typeof left !== 'number' || typeof right !== 'number') throw new DocumentConditionError('type', expression)
  switch (node.operator) {
    case '>': return left > right
    case '>=': return left >= right
    case '<': return left < right
    case '<=': return left <= right
  }
}

export const resolveDocumentConditionPath = (scope: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((current, segment) =>
    current !== null && typeof current === 'object' && Object.prototype.hasOwnProperty.call(current, segment)
      ? (current as Record<string, unknown>)[segment]
      : undefined, scope)
