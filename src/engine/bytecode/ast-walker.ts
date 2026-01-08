import type { Program } from '../../lang/ast.ts'

export interface VisitorContext {
  src?: string
}

export interface VisitorFunctions {
  visitCall?: (expr: any, ctx: VisitorContext) => void
  visitExpr?: (expr: any, ctx: VisitorContext) => void
  visitStmt?: (stmt: any, ctx: VisitorContext) => void
  visitProgram?: (program: Program, ctx: VisitorContext) => void
}

function visitExpr(expr: any, visitors: VisitorFunctions[], ctx: VisitorContext): void {
  if (!expr) return
  if (expr.loc?.kernel) return

  // Call all visitExpr visitors
  for (const visitor of visitors) {
    visitor.visitExpr?.(expr, ctx)
  }

  if (expr.kind === 'call') {
    // Call all visitCall visitors
    for (const visitor of visitors) {
      visitor.visitCall?.(expr, ctx)
    }

    visitExpr(expr.callee, visitors, ctx)
    for (const arg of expr.args ?? []) {
      if (arg.kind === 'pos' || arg.kind === 'named') visitExpr(arg.value, visitors, ctx)
    }
    return
  }

  if (expr.kind === 'binary') {
    visitExpr(expr.left, visitors, ctx)
    visitExpr(expr.right, visitors, ctx)
    return
  }

  if (expr.kind === 'assign') {
    visitExpr(expr.target, visitors, ctx)
    visitExpr(expr.value, visitors, ctx)
    return
  }

  if (expr.kind === 'unary' || expr.kind === 'postfix') {
    visitExpr(expr.expr, visitors, ctx)
    return
  }

  if (expr.kind === 'member') {
    visitExpr(expr.object, visitors, ctx)
    if (expr.computed) visitExpr(expr.index, visitors, ctx)
    return
  }

  if (expr.kind === 'array') {
    for (const item of expr.items ?? []) visitExpr(item, visitors, ctx)
    return
  }

  if (expr.kind === 'object') {
    for (const prop of expr.props ?? []) visitExpr(prop.value, visitors, ctx)
    return
  }

  if (expr.kind === 'if') {
    visitExpr(expr.test, visitors, ctx)
    if (expr.then?.kind === 'block') visitStmt(expr.then, visitors, ctx)
    else visitExpr(expr.then, visitors, ctx)
    if (expr.else) {
      if (expr.else.kind === 'block') visitStmt(expr.else, visitors, ctx)
      else visitExpr(expr.else, visitors, ctx)
    }
    return
  }

  if (expr.kind === 'func') {
    // Visit parameter defaults
    for (const param of expr.params ?? []) {
      if (param.default) visitExpr(param.default, visitors, ctx)
    }
    // Visit function body
    if (expr.body?.kind === 'block') visitStmt(expr.body, visitors, ctx)
    else visitExpr(expr.body, visitors, ctx)
    return
  }
}

function visitStmt(stmt: any, visitors: VisitorFunctions[], ctx: VisitorContext): void {
  if (!stmt) return
  if (stmt.loc?.kernel) return

  // Call all visitStmt visitors
  for (const visitor of visitors) {
    visitor.visitStmt?.(stmt, ctx)
  }

  if (stmt.kind === 'expr_stmt') {
    visitExpr(stmt.expr, visitors, ctx)
    return
  }

  if (stmt.kind === 'block') {
    for (const s of stmt.body ?? []) visitStmt(s, visitors, ctx)
    return
  }

  if (stmt.kind === 'for') {
    if (stmt.head?.kind === 'c_style') {
      if (stmt.head.init) visitExpr(stmt.head.init, visitors, ctx)
      if (stmt.head.test) visitExpr(stmt.head.test, visitors, ctx)
      if (stmt.head.update) visitExpr(stmt.head.update, visitors, ctx)
    }
    else {
      visitExpr(stmt.head?.iterable, visitors, ctx)
    }
    visitStmt(stmt.body, visitors, ctx)
    return
  }

  if (stmt.kind === 'while' || stmt.kind === 'do_while') {
    visitExpr(stmt.test, visitors, ctx)
    visitStmt(stmt.body, visitors, ctx)
    return
  }

  if (stmt.kind === 'switch') {
    visitExpr(stmt.test, visitors, ctx)
    for (const c of stmt.cases ?? []) {
      if (c.test) visitExpr(c.test, visitors, ctx)
      for (const s of c.body ?? []) visitStmt(s, visitors, ctx)
    }
    return
  }

  if (stmt.kind === 'try') {
    visitStmt(stmt.body, visitors, ctx)
    if (stmt.catchBody) visitStmt(stmt.catchBody, visitors, ctx)
    if (stmt.finallyBody) visitStmt(stmt.finallyBody, visitors, ctx)
    return
  }

  if (stmt.kind === 'throw') {
    visitExpr(stmt.value, visitors, ctx)
    return
  }

  if (stmt.kind === 'return') {
    if (stmt.value) visitExpr(stmt.value, visitors, ctx)
    return
  }

  if (stmt.kind === 'label') {
    visitStmt(stmt.stmt, visitors, ctx)
    return
  }

  if (stmt.kind === 'destructure') {
    visitExpr(stmt.value, visitors, ctx)
    return
  }
}

export function walkAst(program: Program, visitors: VisitorFunctions[], ctx: VisitorContext = {}): void {
  // Call all visitProgram visitors
  for (const visitor of visitors) {
    visitor.visitProgram?.(program, ctx)
  }

  for (const stmt of program.body) visitStmt(stmt, visitors, ctx)
}
