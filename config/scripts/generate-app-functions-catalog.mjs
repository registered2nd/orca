// Why: `orca app functions` lists the IPC channels the desktop UI calls, read live from the running
// app — but compiled handlers have lost their TypeScript types. This reads them back from source:
// each `ipcMain.handle` channel's argument names and types, the preload bridge the renderer calls it
// through, and which runtime RPC methods some CLI command already calls.
//
//   node config/scripts/generate-app-functions-catalog.mjs [--check]
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  globSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import ts from 'typescript-api'
import { resolveOxcCliInvocation } from './oxc-cli-invocation.mjs'

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..')
const OUTPUT_PATH = path.join(
  REPO_ROOT,
  'src',
  'main',
  'app-functions',
  'app-functions-catalog.generated.json'
)
const PRELOAD_INDEX = path.join(REPO_ROOT, 'src', 'preload', 'index.ts')

const posix = (value) => value.split(path.sep).join('/')
const repoPath = (absolute) => posix(path.relative(REPO_ROOT, absolute))
const isSourceFile = (file) =>
  !/\.(test|spec)\.ts$/.test(file) &&
  !file.includes('__fixtures__') &&
  !file.includes('test-fixture')

function sourceFiles(dir) {
  return globSync('**/*.ts', { cwd: path.join(REPO_ROOT, dir) })
    .filter(isSourceFile)
    .map((file) => path.join(REPO_ROOT, dir, file))
    .sort()
}

const parsed = new Map()
function parse(file) {
  let sf = parsed.get(file)
  if (!sf) {
    sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
    parsed.set(file, sf)
  }
  return sf
}

const collapse = (text) => text.replace(/\s+/g, ' ').trim()
const printer = ts.createPrinter({ removeComments: true })
// Why the printer: source text would carry comments and newline-separated members without `;`.
const typeText = (node, sf) => collapse(printer.printNode(ts.EmitHint.Unspecified, node, sf))

function unwrap(node) {
  while (
    node &&
    (ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isParenthesizedExpression(node))
  ) {
    node = node.expression
  }
  return node
}

function resolveModule(fromFile, specifier) {
  if (!specifier.startsWith('.')) {
    return null
  }
  const base = path.resolve(path.dirname(fromFile), specifier.replace(/\.js$/, ''))
  for (const candidate of [`${base}.ts`, path.join(base, 'index.ts')]) {
    if (existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

// The declaration a name refers to in `sf`: a local const/function, or one an import brings in.
function findDeclaration(sf, name, depth = 0) {
  if (depth > 4) {
    return null
  }
  for (const statement of sf.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === name) {
          return { sf, node: decl.initializer ? unwrap(decl.initializer) : null }
        }
      }
    } else if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) {
      return { sf, node: statement }
    } else if (
      ts.isImportDeclaration(statement) &&
      statement.importClause?.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      for (const element of statement.importClause.namedBindings.elements) {
        if (element.name.text === name) {
          const target = resolveModule(sf.fileName, statement.moduleSpecifier.text)
          const exported = (element.propertyName ?? element.name).text
          return target ? findDeclaration(parse(target), exported, depth + 1) : null
        }
      }
    }
  }
  return null
}

function resolveString(node, sf, depth = 0) {
  node = unwrap(node)
  if (!node || depth > 6) {
    return null
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text
  }
  if (ts.isIdentifier(node)) {
    const decl = findDeclaration(sf, node.text)
    return decl?.node ? resolveString(decl.node, decl.sf, depth + 1) : null
  }
  if (ts.isPropertyAccessExpression(node)) {
    const owner = resolveObject(node.expression, sf)
    const prop = owner?.node.properties.find(
      (p) => ts.isPropertyAssignment(p) && p.name.getText(owner.sf) === node.name.text
    )
    return prop ? resolveString(prop.initializer, owner.sf, depth + 1) : null
  }
  return null
}

function resolveObject(node, sf) {
  node = unwrap(node)
  if (ts.isObjectLiteralExpression(node)) {
    return { sf, node }
  }
  if (ts.isIdentifier(node)) {
    const decl = findDeclaration(sf, node.text)
    return decl?.node && ts.isObjectLiteralExpression(decl.node)
      ? { sf: decl.sf, node: decl.node }
      : null
  }
  return null
}

function resolveFunction(node, sf) {
  node = unwrap(node)
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)) {
    return { sf, node }
  }
  if (ts.isIdentifier(node)) {
    const decl = findDeclaration(sf, node.text)
    return decl?.node ? resolveFunction(decl.node, decl.sf) : null
  }
  return null
}

function toParams(fn, sf, skipFirst) {
  const params = fn.parameters.map((p) => ({
    name: collapse(p.name.getText(sf)),
    type: p.type ? typeText(p.type, sf) : null,
    optional: Boolean(p.questionToken || p.initializer || p.dotDotDotToken),
    rest: Boolean(p.dotDotDotToken)
  }))
  return skipFirst ? params.slice(1) : params
}

const location = (sf, node) =>
  `${repoPath(sf.fileName)}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`

function isCallTo(node, object, methods) {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === object &&
    methods.includes(node.expression.name.text)
  )
}

function visit(sf, callback) {
  const walk = (node) => {
    callback(node)
    ts.forEachChild(node, walk)
  }
  walk(sf)
}

function collectMainHandlers() {
  const handlers = new Map()
  for (const file of sourceFiles('src/main')) {
    const sf = parse(file)
    visit(sf, (node) => {
      if (!isCallTo(node, 'ipcMain', ['handle', 'handleOnce']) || node.arguments.length < 2) {
        return
      }
      const channel = resolveString(node.arguments[0], sf)
      if (channel === null || handlers.has(channel)) {
        return
      }
      const fn = resolveFunction(node.arguments[1], sf)
      handlers.set(channel, {
        source: location(sf, node),
        params: fn ? toParams(fn.node, fn.sf, true) : null
      })
    })
  }
  return handlers
}

// Maps each preload object variable to the `window.api…` path it is exposed under.
function preloadApiPaths(files) {
  const edges = []
  for (const file of files) {
    const sf = parse(file)
    visit(sf, (node) => {
      if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name) || !node.initializer) {
        return
      }
      const literal = unwrap(node.initializer)
      if (ts.isIdentifier(literal)) {
        edges.push([node.name.text, [], literal.text])
        return
      }
      if (!ts.isObjectLiteralExpression(literal)) {
        return
      }
      const walk = (object, rel) => {
        for (const prop of object.properties) {
          if (ts.isSpreadAssignment(prop) && ts.isIdentifier(unwrap(prop.expression))) {
            edges.push([node.name.text, rel, unwrap(prop.expression).text])
          } else if (ts.isShorthandPropertyAssignment(prop)) {
            edges.push([node.name.text, [...rel, prop.name.text], prop.name.text])
          } else if (ts.isPropertyAssignment(prop)) {
            const value = unwrap(prop.initializer)
            const key = [...rel, prop.name.getText(sf)]
            if (ts.isIdentifier(value)) {
              edges.push([node.name.text, key, value.text])
            } else if (ts.isObjectLiteralExpression(value)) {
              walk(value, key)
            }
          }
        }
      }
      walk(literal, [])
    })
  }
  const paths = new Map([['api', 'window.api']])
  for (let changed = true; changed;) {
    changed = false
    for (const [parent, rel, child] of edges) {
      if (paths.has(parent) && !paths.has(child)) {
        paths.set(child, [paths.get(parent), ...rel].join('.'))
        changed = true
      }
    }
  }
  return paths
}

// The variable and property path of the object member or const that holds `node`.
function holderPath(node, sf) {
  const rel = []
  for (let current = node; current; current = current.parent) {
    if (ts.isPropertyAssignment(current) || ts.isMethodDeclaration(current)) {
      rel.unshift(current.name.getText(sf))
    } else if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) {
      return { variable: current.name.text, rel }
    }
  }
  return null
}

function enclosingFunction(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (
      ts.isArrowFunction(current) ||
      ts.isFunctionExpression(current) ||
      ts.isFunctionDeclaration(current) ||
      ts.isMethodDeclaration(current)
    ) {
      return current
    }
  }
  return null
}

function collectPreloadBindings() {
  const files = sourceFiles('src/preload')
  if (!files.includes(PRELOAD_INDEX)) {
    throw new Error(`preload entry not found: ${repoPath(PRELOAD_INDEX)}`)
  }
  const apiPaths = preloadApiPaths(files)
  const bindings = new Map()
  for (const file of files) {
    const sf = parse(file)
    visit(sf, (node) => {
      if (!isCallTo(node, 'ipcRenderer', ['invoke']) || node.arguments.length < 1) {
        return
      }
      const channel = resolveString(node.arguments[0], sf)
      const fn = enclosingFunction(node)
      if (channel === null || !fn || bindings.has(channel)) {
        return
      }
      const holder = holderPath(fn, sf)
      const root = holder ? (apiPaths.get(holder.variable) ?? holder.variable) : null
      bindings.set(channel, {
        api: root ? [root, ...holder.rel].join('.') : null,
        source: location(sf, node),
        params: toParams(fn, sf, false),
        returns: fn.type ? typeText(fn.type, sf) : null
      })
    })
  }
  return bindings
}

function collectCliRpcMethods() {
  const methods = new Set()
  for (const file of sourceFiles('src/main/runtime/rpc/methods')) {
    visit(parse(file), (node) => {
      if (!ts.isObjectLiteralExpression(node)) {
        return
      }
      const keys = new Map(
        node.properties
          .filter(ts.isPropertyAssignment)
          .map((p) => [p.name.getText(), p.initializer])
      )
      const name = keys.get('name')
      if (name && ts.isStringLiteral(name) && keys.has('permission') && keys.has('handler')) {
        methods.add(name.text)
      }
    })
  }
  const called = new Set()
  for (const file of sourceFiles('src/cli')) {
    visit(parse(file), (node) => {
      if (
        (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
        methods.has(node.text)
      ) {
        called.add(node.text)
      }
    })
  }
  // Why: listing and invoking are not commands that expose a method to agents in their own right.
  called.delete('appFunctions.list')
  called.delete('appFunctions.invokeIpc')
  return [...called].sort()
}

function render() {
  const handlers = collectMainHandlers()
  const bindings = collectPreloadBindings()
  const ipc = {}
  for (const channel of [...new Set([...handlers.keys(), ...bindings.keys()])].sort()) {
    const handler = handlers.get(channel)
    ipc[channel] = {
      source: handler?.source ?? null,
      params: handler?.params ?? null,
      preload: bindings.get(channel) ?? null
    }
  }
  return `${JSON.stringify({ ipc, cliRpcMethods: collectCliRpcMethods() }, null, 2)}\n`
}

// Why: the check compares bytes, so emit exactly what `pnpm format` would leave.
function formatted(source) {
  const root = path.join(REPO_ROOT, 'out')
  mkdirSync(root, { recursive: true })
  const dir = mkdtempSync(path.join(root, 'app-functions-catalog-'))
  try {
    const file = path.join(dir, 'app-functions-catalog.generated.json')
    writeFileSync(file, source)
    const { command, prefixArgs } = resolveOxcCliInvocation('oxfmt', 'oxfmt', REPO_ROOT)
    execFileSync(command, [...prefixArgs, '--write', file], { stdio: 'ignore', windowsHide: true })
    return readFileSync(file, 'utf8')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function main() {
  const check = process.argv.includes('--check')
  const generated = formatted(render())
  // Why the newline fold: a checkout with core.autocrlf holds this file with CRLF.
  const current = existsSync(OUTPUT_PATH)
    ? readFileSync(OUTPUT_PATH, 'utf8').replaceAll('\r\n', '\n')
    : null
  if (generated === current) {
    console.log(`app functions catalog up to date: ${repoPath(OUTPUT_PATH)}`)
    return
  }
  if (check) {
    console.error(
      `${repoPath(OUTPUT_PATH)} is out of date. Run \`node config/scripts/generate-app-functions-catalog.mjs\`.`
    )
    process.exitCode = 1
    return
  }
  writeFileSync(OUTPUT_PATH, generated)
  console.log(`wrote ${repoPath(OUTPUT_PATH)}`)
}

main()
