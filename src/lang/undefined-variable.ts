import type { Arg, BlockStmt, DestructurePattern, Expr, Loc, Program, Stmt } from './ast.ts'
import { type LangError, lineText } from './errors.ts'
import { builtinSyms } from '../engine/bytecode/builtin-syms.ts'
import { functionDefinitions } from '../engine/ui/function-definitions.ts'

const BUILTIN_NAMES = new Set<string>([
  ...Object.keys(builtinSyms),
  ...Object.keys(functionDefinitions).map(name => (name.startsWith('.') ? name.slice(1) : name)),
])

export function checkUndefinedVariableErrors(src: string, program: Program): LangError[] {
  const errors: LangError[] = []

  const scopeStack: Array<Set<string>> = [new Set(BUILTIN_NAMES)]

  const makeError = (loc: Pick<Loc, 'line' | 'column' | 'length'>): LangError => ({
    message: 'Undefined variable',
    line: loc.line,
    column: loc.column,
    length: Math.max(1, loc.length),
    code: lineText(src, loc.line),
  })

  const isDefined = (name: string): boolean => {
    for (let i = scopeStack.length - 1; i >= 0; i--) {
      if (scopeStack[i]!.has(name)) return true
    }
    return false
  }

  // Matches VM semantics: store() updates an existing binding (in any scope) if present;
  // otherwise it defines a new binding in the current scope.
  const defineName = (name: string): void => {
    if (isDefined(name)) return
    scopeStack[scopeStack.length - 1]!.add(name)
  }

  const withScope = (fn: () => void): void => {
    scopeStack.push(new Set())
    try {
      fn()
    }
    finally {
      scopeStack.pop()
    }
  }

  const definePattern = (pattern: DestructurePattern): void => {
    if (pattern.kind === 'obj') {
      for (const key of pattern.keys) defineName(key)
      return
    }
    for (const item of pattern.items) defineName(item)
  }

  const visitBranch = (branch: Expr | BlockStmt): void => {
    if ('kind' in branch && branch.kind === 'block') {
      visitStmt(branch)
      return
    }
    visitExpr(branch as Expr)
  }

  const visitAssignableDefineOnly = (target: Expr): void => {
    if (target.kind === 'ident') {
      defineName(target.name)
      return
    }
    if (target.kind === 'member') {
      visitExpr(target.object)
      if (target.computed) visitExpr(target.index)
    }
  }

  const visitArg = (arg: Arg): void => {
    if (arg.kind === 'pos') {
      visitExpr(arg.value)
      return
    }
    if (arg.kind === 'named') {
      visitExpr(arg.value)
      return
    }
    if (!isDefined(arg.name)) errors.push(makeError(arg.loc))
  }

  const visitExpr = (expr: Expr): void => {
    switch (expr.kind) {
      case 'number':
      case 'string':
      case 'bool':
      case 'null':
      case 'undefined':
      case 'pipe_value':
        return
      case 'ident':
        if (!isDefined(expr.name)) errors.push(makeError(expr.loc))
        return
      case 'array':
        for (const item of expr.items) visitExpr(item)
        return
      case 'object':
        for (const prop of expr.props) visitExpr(prop.value)
        return
      case 'member':
        visitExpr(expr.object)
        if (expr.computed) visitExpr(expr.index)
        return
      case 'call':
        visitExpr(expr.callee)
        expr.args.forEach(visitArg)
        return
      case 'unary':
        visitExpr(expr.expr)
        return
      case 'postfix':
        visitExpr(expr.expr)
        return
      case 'binary':
        visitExpr(expr.left)
        visitExpr(expr.right)
        return
      case 'assign':
        if (expr.op === '=' && expr.target.kind === 'ident') {
          visitExpr(expr.value)
          defineName(expr.target.name)
          return
        }
        if (expr.op === '=') {
          visitAssignableDefineOnly(expr.target)
          visitExpr(expr.value)
          return
        }
        visitExpr(expr.target)
        visitExpr(expr.value)
        return
      case 'if':
        visitExpr(expr.test)
        visitBranch(expr.then)
        if (expr.else) visitBranch(expr.else)
        return
      case 'func':
        withScope(() => {
          for (const param of expr.params) defineName(param.name)
          for (const param of expr.params) if (param.default) visitExpr(param.default)
          if ('kind' in expr.body && expr.body.kind === 'block') visitStmt(expr.body)
          else visitExpr(expr.body as Expr)
        })
        return
    }
  }

  const visitStmt = (stmt: Stmt): void => {
    switch (stmt.kind) {
      case 'block':
        withScope(() => {
          for (const child of stmt.body) visitStmt(child)
        })
        return
      case 'expr_stmt':
        visitExpr(stmt.expr)
        return
      case 'destructure':
        visitExpr(stmt.value)
        definePattern(stmt.pattern)
        return
      case 'label':
        visitStmt(stmt.stmt)
        return
      case 'for':
        withScope(() => {
          const head = stmt.head
          if (head.kind === 'c_style') {
            if (head.init) visitExpr(head.init)
            if (head.test) visitExpr(head.test)
            if (head.update) visitExpr(head.update)
            visitStmt(stmt.body)
            return
          }
          visitExpr(head.iterable)
          defineName(head.value)
          if (head.index) defineName(head.index)
          if (head.length) defineName(head.length)
          visitStmt(stmt.body)
        })
        return
      case 'while':
        visitExpr(stmt.test)
        visitStmt(stmt.body)
        return
      case 'do_while':
        visitStmt(stmt.body)
        visitExpr(stmt.test)
        return
      case 'switch':
        visitExpr(stmt.test)
        for (const c of stmt.cases) {
          if (c.test) visitExpr(c.test)
          for (const s of c.body) visitStmt(s)
        }
        return
      case 'try':
        visitStmt(stmt.body)
        if (stmt.catchBody) {
          const catchBody = stmt.catchBody
          withScope(() => {
            if (stmt.catchName) defineName(stmt.catchName)
            for (const s of catchBody.body) visitStmt(s)
          })
        }
        if (stmt.finallyBody) visitStmt(stmt.finallyBody)
        return
      case 'throw':
        visitExpr(stmt.value)
        return
      case 'return':
        if (stmt.value) visitExpr(stmt.value)
        return
      case 'break':
      case 'continue':
        return
    }
  }

  for (const stmt of program.body) visitStmt(stmt)

  return errors
}


