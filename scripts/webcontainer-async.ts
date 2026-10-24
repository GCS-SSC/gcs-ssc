import { transform, version } from 'esbuild'
import ts from 'typescript'
import intlifyH3Package from '@intlify/h3/package.json' with { type: 'json' }

/**
 * Lowers async continuations only in serialized WebContainer server modules.
 * WebContainer's promise instrumentation cannot retain AsyncLocalStorage across
 * native await, or when Promise.resolve returns a native promise unchanged.
 * Filesystem and dynamic import promises both cross that boundary.
 * The extra adoption schedules the continuation on a promise created in its
 * caller's context. The original Node artifact is never changed.
 *
 * @param source - Emitted JavaScript from a contained server artifact file.
 * @param sourcefile - Artifact-relative filename for compiler diagnostics.
 * @returns WebContainer-specific JavaScript with context-preserving continuations.
 */
export const lowerWebContainerAsync = async (source: string, sourcefile: string): Promise<string> => {
  if (!/\b(?:async|await|import)\b|__async|__forAwait/.test(source)) return source
  if (version !== '0.28.2') {
    throw new Error(`WebContainer async helper validation requires esbuild 0.28.2; received ${version}.`)
  }
  let adaptedSource = source
  if (sourcefile === 'server/node_modules/@intlify/h3/dist/index.mjs') {
    if (intlifyH3Package.version !== '0.7.4') {
      throw new Error('Revalidate the WebContainer locale detector adapter after updating @intlify/h3.')
    }
    const localeSource = ts.createSourceFile(sourcefile, source, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS)
    const translation = localeSource.statements.find(statement =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === 'useTranslation'
    )
    if (!translation || !ts.isFunctionDeclaration(translation) || !translation.body) {
      throw new Error('WebContainer locale detector adapter could not find useTranslation.')
    }
    const conditionals = translation.body.statements.filter(statement =>
      ts.isIfStatement(statement) && statement.expression.getText(localeSource) === 'localeDetector.constructor.name === "AsyncFunction"'
    )
    const conditional = conditionals[0]
    if (conditionals.length !== 1 || !conditional || !ts.isIfStatement(conditional) || conditional.elseStatement) {
      throw new Error('WebContainer locale detector adapter shape changed; revalidate sync and async locale resolution.')
    }
    adaptedSource = source.slice(0, conditional.getStart(localeSource))
      + conditional.thenStatement.getText(localeSource) + source.slice(conditional.end)
  }
  const result = await transform(adaptedSource, {
    sourcefile,
    target: 'esnext',
    supported: { 'async-await': false, 'async-generator': false, 'for-await': false },
    legalComments: 'inline'
  })

  const helpers = [
    {
      name: /^__async\d*$/,
      declaration: /var __async(?:\d+)? = \(__this\d*, __arguments\d*, generator\d*\) => \{/g,
      adoption: /Promise\.resolve\((x\d*)\.value\)\.then\((fulfilled\d*), (rejected\d*)\)/g,
      replacement: 'Promise.resolve().then(() => $1.value).then($2, $3)'
    },
    {
      name: /^__asyncGenerator\d*$/,
      declaration: /var __asyncGenerator(?:\d+)? = \(__this\d*, __arguments\d*, generator\d*\) => \{/g,
      adoption: /Promise\.resolve\((isAwait\d*) \? (v\d*)\[0\] : \2\)\.then\(/g,
      replacement: 'Promise.resolve().then(() => $1 ? $2[0] : $2).then('
    },
    {
      name: /^__forAwait\d*$/,
      declaration: /var __forAwait(?:\d+)? = \(obj\d*, it\d*, method\d*\) =>/g,
      adoption: /Promise\.resolve\((arg\d*)\.value\)\.then\(/g,
      replacement: 'Promise.resolve().then(() => $1.value).then('
    }
  ]
  const parsed = ts.createSourceFile(sourcefile, result.code, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS)
  const edits: Array<{ start: number, end: number, replacement: string }> = []
  for (const statement of parsed.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue
      const helperName = declaration.name.text
      const helper = helpers.find(candidate => candidate.name.test(helperName))
      if (!helper) continue
      const initializer = declaration.initializer
      const initializerSource = initializer.getText(parsed)
      const declarationSource = statement.getText(parsed)
      if ([...declarationSource.matchAll(helper.declaration)].length !== 1
        || [...initializerSource.matchAll(helper.adoption)].length !== 1) {
        throw new Error(`Unsupported WebContainer async helper in ${sourcefile}; revalidate promise adoption before updating the compiler.`)
      }
      edits.push({
        start: initializer.getStart(parsed),
        end: initializer.end,
        replacement: initializerSource.replace(helper.adoption, helper.replacement)
      })
    }
  }
  let code = result.code
  for (const edit of edits.reverse()) {
    code = code.slice(0, edit.start) + edit.replacement + code.slice(edit.end)
  }
  const importSource = ts.createSourceFile(sourcefile, code, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS)
  const importInsertions: Array<{ position: number, text: string }> = []
  /** Adopts dynamic import results while preserving immediate argument evaluation.
   * @param node - Current emitted JavaScript syntax node.
   * @returns Nothing.
   */
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      importInsertions.push(
        { position: node.getStart(importSource), text: '((promise) => globalThis.Promise.resolve().then(() => promise))(' },
        { position: node.end, text: ')' }
      )
    }
    ts.forEachChild(node, visit)
  }
  visit(importSource)
  for (const insertion of importInsertions.sort((left, right) => right.position - left.position)) {
    code = code.slice(0, insertion.position) + insertion.text + code.slice(insertion.position)
  }
  return code
}
