import type { Program } from '../../lang/ast.ts'
import {
  type NumberLiteralInfo,
  type NumberWithParamsInfo,
} from './types.ts'

export function extractNumberParamsFromProgram(program: Program): NumberWithParamsInfo[] {
  const out: NumberWithParamsInfo[] = []

  function visitExpr(expr: any): void {
    if (!expr) return

    if (expr.kind === 'number' && expr.slider) {
      const min = Number(expr.slider.min ?? 0)
      const max = Number(expr.slider.max ?? 0)
      out.push({
        line: expr.loc.line,
        column: expr.loc.column,
        length: expr.loc.length,
        widgetLength: Number(expr.slider.widgetLength ?? expr.loc.length),
        value: Number(expr.value ?? 0),
        min,
        max,
        precision: expr.slider.precision,
        exp: expr.slider.exp,
      })
      return
    }

    if (expr.kind === 'call') {
      visitExpr(expr.callee)
      for (const arg of expr.args ?? []) {
        if (arg.kind === 'pos' || arg.kind === 'named') visitExpr(arg.value)
      }
      return
    }

    if (expr.kind === 'binary') {
      visitExpr(expr.left)
      visitExpr(expr.right)
      return
    }

    if (expr.kind === 'assign') {
      visitExpr(expr.target)
      visitExpr(expr.value)
      return
    }

    if (expr.kind === 'unary' || expr.kind === 'postfix') {
      visitExpr(expr.expr)
      return
    }

    if (expr.kind === 'member') {
      visitExpr(expr.object)
      if (expr.computed) visitExpr(expr.index)
      return
    }

    if (expr.kind === 'array') {
      for (const item of expr.items ?? []) visitExpr(item)
      return
    }

    if (expr.kind === 'object') {
      for (const prop of expr.props ?? []) visitExpr(prop.value)
      return
    }

    if (expr.kind === 'if') {
      visitExpr(expr.test)
      if (expr.then?.kind === 'block') visitStmt(expr.then)
      else visitExpr(expr.then)
      if (expr.else) {
        if (expr.else.kind === 'block') visitStmt(expr.else)
        else visitExpr(expr.else)
      }
      return
    }

    if (expr.kind === 'func') {
      if (expr.body?.kind === 'block') visitStmt(expr.body)
      else visitExpr(expr.body)
      return
    }
  }

  function visitStmt(stmt: any): void {
    if (!stmt) return

    if (stmt.kind === 'expr_stmt') {
      visitExpr(stmt.expr)
      return
    }

    if (stmt.kind === 'block') {
      for (const s of stmt.body ?? []) visitStmt(s)
      return
    }

    if (stmt.kind === 'for') {
      if (stmt.head?.kind === 'c_style') {
        if (stmt.head.init) visitExpr(stmt.head.init)
        if (stmt.head.test) visitExpr(stmt.head.test)
        if (stmt.head.update) visitExpr(stmt.head.update)
      }
      else {
        visitExpr(stmt.head?.iterable)
      }
      visitStmt(stmt.body)
      return
    }

    if (stmt.kind === 'while' || stmt.kind === 'do_while') {
      visitExpr(stmt.test)
      visitStmt(stmt.body)
      return
    }

    if (stmt.kind === 'switch') {
      visitExpr(stmt.test)
      for (const c of stmt.cases ?? []) {
        if (c.test) visitExpr(c.test)
        for (const s of c.body ?? []) visitStmt(s)
      }
      return
    }

    if (stmt.kind === 'try') {
      visitStmt(stmt.body)
      if (stmt.catchBody) visitStmt(stmt.catchBody)
      if (stmt.finallyBody) visitStmt(stmt.finallyBody)
      return
    }

    if (stmt.kind === 'throw') {
      visitExpr(stmt.value)
      return
    }

    if (stmt.kind === 'return') {
      if (stmt.value) visitExpr(stmt.value)
      return
    }

    if (stmt.kind === 'label') {
      visitStmt(stmt.stmt)
      return
    }

    if (stmt.kind === 'destructure') {
      visitExpr(stmt.value)
      return
    }
  }

  for (const stmt of program.body) visitStmt(stmt)
  return out
}

export function extractNumberLiteralsFromProgram(program: Program): NumberLiteralInfo[] {
  const out: NumberLiteralInfo[] = []

  function visitExpr(expr: any): void {
    if (!expr) return

    if (expr.kind === 'number') {
      out.push({
        line: expr.loc.line,
        column: expr.loc.column,
        length: expr.loc.length,
        value: Number(expr.value ?? 0),
      })
      return
    }

    if (expr.kind === 'call') {
      visitExpr(expr.callee)
      for (const arg of expr.args ?? []) {
        if (arg.kind === 'pos' || arg.kind === 'named') visitExpr(arg.value)
      }
      return
    }

    if (expr.kind === 'binary') {
      visitExpr(expr.left)
      visitExpr(expr.right)
      return
    }

    if (expr.kind === 'assign') {
      visitExpr(expr.target)
      visitExpr(expr.value)
      return
    }

    if (expr.kind === 'unary' || expr.kind === 'postfix') {
      visitExpr(expr.expr)
      return
    }

    if (expr.kind === 'member') {
      visitExpr(expr.object)
      if (expr.computed) visitExpr(expr.index)
      return
    }

    if (expr.kind === 'array') {
      for (const item of expr.items ?? []) visitExpr(item)
      return
    }

    if (expr.kind === 'object') {
      for (const prop of expr.props ?? []) visitExpr(prop.value)
      return
    }

    if (expr.kind === 'if') {
      visitExpr(expr.test)
      if (expr.then?.kind === 'block') visitStmt(expr.then)
      else visitExpr(expr.then)
      if (expr.else) {
        if (expr.else.kind === 'block') visitStmt(expr.else)
        else visitExpr(expr.else)
      }
      return
    }

    if (expr.kind === 'func') {
      if (expr.body?.kind === 'block') visitStmt(expr.body)
      else visitExpr(expr.body)
      return
    }
  }

  function visitStmt(stmt: any): void {
    if (!stmt) return

    if (stmt.kind === 'expr_stmt') {
      visitExpr(stmt.expr)
      return
    }

    if (stmt.kind === 'block') {
      for (const s of stmt.body ?? []) visitStmt(s)
      return
    }

    if (stmt.kind === 'for') {
      if (stmt.head?.kind === 'c_style') {
        if (stmt.head.init) visitExpr(stmt.head.init)
        if (stmt.head.test) visitExpr(stmt.head.test)
        if (stmt.head.update) visitExpr(stmt.head.update)
      }
      else {
        visitExpr(stmt.head?.iterable)
      }
      visitStmt(stmt.body)
      return
    }

    if (stmt.kind === 'while' || stmt.kind === 'do_while') {
      visitExpr(stmt.test)
      visitStmt(stmt.body)
      return
    }

    if (stmt.kind === 'switch') {
      visitExpr(stmt.test)
      for (const c of stmt.cases ?? []) {
        if (c.test) visitExpr(c.test)
        for (const s of c.body ?? []) visitStmt(s)
      }
      return
    }

    if (stmt.kind === 'try') {
      visitStmt(stmt.body)
      if (stmt.catchBody) visitStmt(stmt.catchBody)
      if (stmt.finallyBody) visitStmt(stmt.finallyBody)
      return
    }

    if (stmt.kind === 'throw') {
      visitExpr(stmt.value)
      return
    }

    if (stmt.kind === 'return') {
      if (stmt.value) visitExpr(stmt.value)
      return
    }

    if (stmt.kind === 'label') {
      visitStmt(stmt.stmt)
      return
    }

    if (stmt.kind === 'destructure') {
      visitExpr(stmt.value)
      return
    }
  }

  for (const stmt of program.body) visitStmt(stmt)
  return out
}
