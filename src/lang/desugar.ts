import type { Arg, Expr, Program, Stmt } from './ast.ts'
import { findScaleIndex } from '../mini/scales.ts'

function noteIdentToMidi(name: string): number | null {
  const m = name.match(/^([a-gA-G])([#b]?)(\d+)$/)
  if (!m) return null
  const note = m[1]!.toLowerCase()
  const acc = m[2] ?? ''
  const oct = parseInt(m[3]!, 10)
  const base = note === 'c'
    ? 0
    : note === 'd'
    ? 2
    : note === 'e'
    ? 4
    : note === 'f'
    ? 5
    : note === 'g'
    ? 7
    : note === 'a'
    ? 9
    : note === 'b'
    ? 11
    : null
  if (base === null || !Number.isFinite(oct)) return null
  let midi = base + (oct + 1) * 12
  if (acc === '#') midi += 1
  else if (acc === 'b') midi -= 1
  return midi
}

function romanToDegree(text: string): number | null {
  const t = text.toLowerCase()
  if (t === 'i') return 1
  if (t === 'ii') return 2
  if (t === 'iii') return 3
  if (t === 'iv') return 4
  if (t === 'v') return 5
  if (t === 'vi') return 6
  if (t === 'vii') return 7
  return null
}

function desugarExpr(expr: Expr): Expr {
  if (!expr) return expr

  if (expr.kind === 'ident') {
    const om = expr.name.match(/^o(\d+)$/)
    if (om) {
      const o = parseInt(om[1]!, 10)
      const mul = Number.isFinite(o) ? 2 ** (o + 1) : 0
      return { kind: 'number', value: mul, raw: String(mul), loc: expr.loc }
    }

    if (expr.name.startsWith('#')) {
      const raw = expr.name.slice(1)
      const dm = raw.match(/^(\d+)$/)
      if (dm) {
        const d = parseInt(dm[1]!, 10)
        return {
          kind: 'call',
          callee: { kind: 'ident', name: 'degree', loc: expr.loc },
          args: [{
            kind: 'pos',
            value: { kind: 'number', value: d, raw: String(d), loc: expr.loc },
            loc: expr.loc,
          }],
          loc: expr.loc,
        }
      }

      const base = romanToDegree(raw)
      if (base !== null) {
        const numLoc = (dx: number) => dx === 0 ? expr.loc : { ...expr.loc, line: 0, column: expr.loc.column + dx }
        const mk = (n: number, dx: number) => ({
          kind: 'call',
          callee: { kind: 'ident', name: 'degree', loc: expr.loc },
          args: [{
            kind: 'pos',
            value: { kind: 'number', value: n, raw: String(n), loc: numLoc(dx) },
            loc: expr.loc,
          }],
          loc: expr.loc,
        })
        return { kind: 'array', items: [mk(base, 0), mk(base + 2, 1), mk(base + 4, 2)], loc: expr.loc }
      }
    }

    const midi = noteIdentToMidi(expr.name)
    if (midi !== null) {
      return {
        kind: 'call',
        callee: { kind: 'ident', name: 'note', loc: expr.loc },
        args: [{
          kind: 'pos',
          value: { kind: 'number', value: midi, raw: String(midi), loc: expr.loc },
          loc: expr.loc,
        }],
        loc: expr.loc,
      }
    }
  }

  if (expr.kind === 'call') {
    const callee = desugarExpr(expr.callee)
    const args = (expr.args ?? []).map((a: Arg) => {
      if (a.kind === 'pos' || a.kind === 'named') return { ...a, value: desugarExpr(a.value) }
      return a
    })
    return { ...expr, callee, args }
  }

  if (expr.kind === 'binary') {
    return { ...expr, left: desugarExpr(expr.left), right: desugarExpr(expr.right) }
  }

  if (expr.kind === 'assign') {
    if (expr.op === '=' && expr.target?.kind === 'ident' && expr.target.name === 'scale') {
      const v: any = expr.value
      const name = v?.kind === 'string' ? String(v.value ?? '') : v?.kind === 'ident' ? String(v.name ?? '') : ''
      if (name) {
        const idx = findScaleIndex(name) ?? findScaleIndex(name.toLowerCase()) ?? 0
        return { ...expr, target: desugarExpr(expr.target), value: { kind: 'number', value: idx, raw: String(idx), loc: v?.loc ?? expr.loc } as any }
      }
    }
    return { ...expr, target: desugarExpr(expr.target), value: desugarExpr(expr.value) }
  }

  if (expr.kind === 'unary' || expr.kind === 'postfix') {
    return { ...expr, expr: desugarExpr(expr.expr) }
  }

  if (expr.kind === 'member') {
    if (expr.computed) return { ...expr, object: desugarExpr(expr.object), index: desugarExpr(expr.index) } as any
    return { ...expr, object: desugarExpr(expr.object) } as any
  }

  if (expr.kind === 'array') return { ...expr, items: (expr.items ?? []).map(desugarExpr) }
  if (expr.kind === 'object') return { ...expr, props: (expr.props ?? []).map(p => ({ ...p, value: desugarExpr(p.value) })) }
  if (expr.kind === 'if') {
    const thenPart: any = expr.then?.kind === 'block' ? desugarStmt(expr.then) : desugarExpr(expr.then as any)
    const elsePart: any = expr.else?.kind === 'block' ? desugarStmt(expr.else) : desugarExpr(expr.else as any)
    return { ...expr, test: desugarExpr(expr.test), then: thenPart, else: elsePart }
  }
  if (expr.kind === 'func') {
    const body: any = expr.body?.kind === 'block' ? desugarStmt(expr.body) : desugarExpr(expr.body as any)
    return { ...expr, body }
  }

  return expr
}

function desugarStmt(stmt: Stmt): Stmt {
  if (!stmt) return stmt
  if (stmt.kind === 'expr_stmt') return { ...stmt, expr: desugarExpr(stmt.expr) }
  if (stmt.kind === 'block') return { ...stmt, body: (stmt.body ?? []).map(desugarStmt) }
  if (stmt.kind === 'for') {
    if (stmt.head.kind === 'c_style') {
      return {
        ...stmt,
        head: {
          ...stmt.head,
          init: stmt.head.init ? desugarExpr(stmt.head.init) : undefined,
          test: stmt.head.test ? desugarExpr(stmt.head.test) : undefined,
          update: stmt.head.update ? desugarExpr(stmt.head.update) : undefined,
        },
        body: desugarStmt(stmt.body),
      }
    }
    return { ...stmt, head: { ...stmt.head, iterable: desugarExpr(stmt.head.iterable) }, body: desugarStmt(stmt.body) }
  }
  if (stmt.kind === 'while') return { ...stmt, test: desugarExpr(stmt.test), body: desugarStmt(stmt.body) }
  if (stmt.kind === 'do_while') return { ...stmt, test: desugarExpr(stmt.test), body: desugarStmt(stmt.body) }
  if (stmt.kind === 'switch') {
    return {
      ...stmt,
      test: desugarExpr(stmt.test),
      cases: (stmt.cases ?? []).map(c => ({ ...c, test: c.test ? desugarExpr(c.test) : undefined, body: (c.body ?? []).map(desugarStmt) })),
    }
  }
  if (stmt.kind === 'try') {
    return {
      ...stmt,
      body: desugarStmt(stmt.body) as any,
      catchBody: stmt.catchBody ? (desugarStmt(stmt.catchBody) as any) : undefined,
      finallyBody: stmt.finallyBody ? (desugarStmt(stmt.finallyBody) as any) : undefined,
    }
  }
  if (stmt.kind === 'throw') return { ...stmt, value: desugarExpr(stmt.value) }
  if (stmt.kind === 'return') return { ...stmt, value: stmt.value ? desugarExpr(stmt.value) : undefined }
  if (stmt.kind === 'label') return { ...stmt, stmt: desugarStmt(stmt.stmt) }
  if (stmt.kind === 'destructure') return { ...stmt, value: desugarExpr(stmt.value) }
  return stmt
}

export function desugarProgram(program: Program): Program {
  return { ...program, body: (program.body ?? []).map(desugarStmt) }
}


