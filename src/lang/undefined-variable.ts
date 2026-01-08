import { builtinSyms } from '../engine/bytecode/builtin-syms.ts'
import { functionDefinitions } from '../engine/ui/function-definitions.ts'
import type { Arg, BlockStmt, DestructurePattern, Expr, Loc, Program, Stmt } from './ast.ts'
import { type LangError, lineText } from './errors.ts'

const BUILTIN_NAMES = new Set<string>([
  ...Object.keys(builtinSyms),
  ...Object.keys(functionDefinitions).map(name => (name.startsWith('.') ? name.slice(1) : name)),
])

type Context = {
  src: string
  errors: LangError[]
  scopeStack: Array<Set<string>>
}
const makeError = (ctx: Context, loc: Pick<Loc, 'line' | 'column' | 'length'>): LangError => ({
  message: 'Undefined variable',
  line: loc.line,
  column: loc.column,
  length: Math.max(1, loc.length),
  code: lineText(ctx.src, loc.line),
})

const isDefined = (ctx: Context, name: string): boolean => {
  for (let i = ctx.scopeStack.length - 1; i >= 0; i--) {
    if (ctx.scopeStack[i]!.has(name)) return true
  }
  return false
}

// Matches VM semantics: store() updates an existing binding (in any scope) if present;
// otherwise it defines a new binding in the current scope.
const defineName = (ctx: Context, name: string): void => {
  if (isDefined(ctx, name)) return
  ctx.scopeStack[ctx.scopeStack.length - 1]!.add(name)
}

const withScope = (ctx: Context, fn: () => void): void => {
  ctx.scopeStack.push(new Set())
  try {
    fn()
  }
  finally {
    ctx.scopeStack.pop()
  }
}

const definePattern = (ctx: Context, pattern: DestructurePattern): void => {
  if (pattern.kind === 'obj') {
    for (const key of pattern.keys) defineName(ctx, key)
    return
  }
  for (const item of pattern.items) defineName(ctx, item)
}

const visitBranch = (ctx: Context, branch: Expr | BlockStmt): void => {
  if ('kind' in branch && branch.kind === 'block') {
    visitStmt(ctx, branch)
    return
  }
  visitExpr(ctx, branch as Expr)
}

const visitAssignableDefineOnly = (ctx: Context, target: Expr): void => {
  if (target.kind === 'ident') {
    defineName(ctx, target.name)
    return
  }
  if (target.kind === 'member') {
    visitExpr(ctx, target.object)
    if (target.computed) visitExpr(ctx, target.index)
  }
}

const visitArg = (ctx: Context, arg: Arg): void => {
  if (arg.kind === 'pos') {
    visitExpr(ctx, arg.value)
    return
  }
  if (arg.kind === 'named') {
    visitExpr(ctx, arg.value)
    return
  }
  if (!isDefined(ctx, arg.name)) ctx.errors.push(makeError(ctx, arg.loc))
}

const visitExpr = (ctx: Context, expr: Expr): void => {
  switch (expr.kind) {
    case 'number':
    case 'string':
    case 'bool':
    case 'null':
    case 'undefined':
    case 'pipe_value':
      return
    case 'ident':
      if (!isDefined(ctx, expr.name)) ctx.errors.push(makeError(ctx, expr.loc))
      return
    case 'array':
      for (const item of expr.items) visitExpr(ctx, item)
      return
    case 'object':
      for (const prop of expr.props) visitExpr(ctx, prop.value)
      return
    case 'member':
      visitExpr(ctx, expr.object)
      if (expr.computed) visitExpr(ctx, expr.index)
      return
    case 'call':
      visitExpr(ctx, expr.callee)
      expr.args.forEach(arg => visitArg(ctx, arg))
      return
    case 'unary':
      visitExpr(ctx, expr.expr)
      return
    case 'postfix':
      visitExpr(ctx, expr.expr)
      return
    case 'binary':
      visitExpr(ctx, expr.left)
      visitExpr(ctx, expr.right)
      return
    case 'assign':
      if (expr.op === '=' && expr.target.kind === 'ident') {
        visitExpr(ctx, expr.value)
        defineName(ctx, expr.target.name)
        return
      }
      if (expr.op === '=') {
        visitAssignableDefineOnly(ctx, expr.target)
        visitExpr(ctx, expr.value)
        return
      }
      visitExpr(ctx, expr.target)
      visitExpr(ctx, expr.value)
      return
    case 'if':
      visitExpr(ctx, expr.test)
      visitBranch(ctx, expr.then)
      if (expr.else) visitBranch(ctx, expr.else)
      return
    case 'func':
      withScope(ctx, () => {
        for (const param of expr.params) defineName(ctx, param.name)
        for (const param of expr.params) if (param.default) visitExpr(ctx, param.default)
        if ('kind' in expr.body && expr.body.kind === 'block') visitStmt(ctx, expr.body)
        else visitExpr(ctx, expr.body as Expr)
      })
      return
  }
}

const visitStmt = (ctx: Context, stmt: Stmt): void => {
  switch (stmt.kind) {
    case 'block':
      withScope(ctx, () => {
        for (const child of stmt.body) visitStmt(ctx, child)
      })
      return
    case 'expr_stmt':
      visitExpr(ctx, stmt.expr)
      return
    case 'destructure':
      visitExpr(ctx, stmt.value)
      definePattern(ctx, stmt.pattern)
      return
    case 'label':
      visitStmt(ctx, stmt.stmt)
      return
    case 'for':
      withScope(ctx, () => {
        const head = stmt.head
        if (head.kind === 'c_style') {
          if (head.init) visitExpr(ctx, head.init)
          if (head.test) visitExpr(ctx, head.test)
          if (head.update) visitExpr(ctx, head.update)
          visitStmt(ctx, stmt.body)
          return
        }
        visitExpr(ctx, head.iterable)
        defineName(ctx, head.value)
        if (head.index) defineName(ctx, head.index)
        if (head.length) defineName(ctx, head.length)
        visitStmt(ctx, stmt.body)
      })
      return
    case 'while':
      visitExpr(ctx, stmt.test)
      visitStmt(ctx, stmt.body)
      return
    case 'do_while':
      visitStmt(ctx, stmt.body)
      visitExpr(ctx, stmt.test)
      return
    case 'switch':
      visitExpr(ctx, stmt.test)
      for (const c of stmt.cases) {
        if (c.test) visitExpr(ctx, c.test)
        for (const s of c.body) visitStmt(ctx, s)
      }
      return
    case 'try':
      visitStmt(ctx, stmt.body)
      if (stmt.catchBody) {
        const catchBody = stmt.catchBody
        withScope(ctx, () => {
          if (stmt.catchName) defineName(ctx, stmt.catchName)
          for (const s of catchBody.body) visitStmt(ctx, s)
        })
      }
      if (stmt.finallyBody) visitStmt(ctx, stmt.finallyBody)
      return
    case 'throw':
      visitExpr(ctx, stmt.value)
      return
    case 'return':
      if (stmt.value) visitExpr(ctx, stmt.value)
      return
    case 'break':
    case 'continue':
      return
  }
}

export function checkUndefinedVariableErrors(src: string, program: Program): LangError[] {
  const errors: LangError[] = []

  const scopeStack: Array<Set<string>> = [new Set(BUILTIN_NAMES)]

  const ctx: Context = {
    src,
    errors,
    scopeStack,
  }

  for (const stmt of program.body) visitStmt(ctx, stmt)

  return errors
}
