import { parseChordSuffix, romanToDegree } from '../mini/chord-parser.ts'
import { findScaleIndex } from '../mini/scales.ts'
import type { Arg, Expr, Program, Stmt } from './ast.ts'

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

      if (raw === 'scale') {
        return {
          kind: 'call',
          callee: { kind: 'ident', name: 'getScale', loc: expr.loc },
          args: [],
          loc: expr.loc,
        }
      }

      const chordMatch = raw.match(/^([ivxlcdm]+)(.*)$/i)
      if (chordMatch) {
        const roman = chordMatch[1]
        const suffix = chordMatch[2] ?? ''
        const base = romanToDegree(roman)
        if (base !== null) {
          const tones = parseChordSuffix(suffix)
          const numLoc = (dx: number) => dx === 0 ? expr.loc : { ...expr.loc, line: 0, column: expr.loc.column + dx }

          const items = tones.map((tone, idx) => {
            const scaleDegree = base + tone.degree
            const args: Arg[] = [{
              kind: 'pos' as const,
              value: { kind: 'number' as const, value: scaleDegree, raw: String(scaleDegree), loc: numLoc(idx) },
              loc: expr.loc,
            }]

            // Add semitone adjustment as second parameter if non-zero
            if (tone.semitoneAdjust !== 0) {
              args.push({
                kind: 'pos' as const,
                value: { kind: 'number' as const, value: tone.semitoneAdjust, raw: String(tone.semitoneAdjust),
                  loc: numLoc(idx) },
                loc: expr.loc,
              })
            }

            return {
              kind: 'call' as const,
              callee: { kind: 'ident' as const, name: 'degree', loc: expr.loc },
              args,
              loc: expr.loc,
            }
          })

          return { kind: 'array', items, loc: expr.loc }
        }
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
        return { ...expr, target: desugarExpr(expr.target),
          value: { kind: 'number', value: idx, raw: String(idx), loc: v?.loc ?? expr.loc } as any }
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
  if (expr.kind === 'object') {
    return { ...expr, props: (expr.props ?? []).map(p => ({ ...p, value: desugarExpr(p.value) })) }
  }
  if (expr.kind === 'if') {
    const thenPart: any = expr.then?.kind === 'block' ? desugarStmt(expr.then) : desugarExpr(expr.then as any)
    const elsePart: any = expr.else ? (expr.else.kind === 'block' ? desugarStmt(expr.else) : desugarExpr(expr.else as any)) : undefined
    return { ...expr, test: desugarExpr(expr.test), then: thenPart, else: elsePart }
  }
  if (expr.kind === 'func') {
    const params = (expr.params ?? []).map(p => (p.default ? { ...p, default: desugarExpr(p.default) } : p))
    const body: any = expr.body?.kind === 'block' ? desugarStmt(expr.body) : desugarExpr(expr.body as any)

    const initStmts = params.flatMap(p => {
      const out: Stmt[] = []

      if (p.default && !p.isRest) {
        const pLoc = p.loc
        const ident = { kind: 'ident' as const, name: p.name, loc: pLoc }
        const test = {
          kind: 'binary' as const,
          op: '===' as const,
          left: ident,
          right: { kind: 'undefined' as const, loc: pLoc },
          loc: pLoc,
        }
        const value = {
          kind: 'if' as const,
          test,
          then: p.default,
          else: ident,
          loc: pLoc,
          __noBranchMark: true,
        }
        const assign = {
          kind: 'assign' as const,
          op: '=' as const,
          target: ident,
          value,
          loc: pLoc,
        }
        out.push({ kind: 'expr_stmt' as const, expr: assign, loc: pLoc })
      }

      if (p.pattern) {
        out.push({
          kind: 'destructure' as const,
          pattern: p.pattern,
          value: { kind: 'ident' as const, name: p.name, loc: p.loc },
          loc: p.loc,
        })
      }

      return out
    })

    if (initStmts.length === 0) return { ...expr, params, body }

    if (body?.kind === 'block') {
      return { ...expr, params, body: { ...body, body: [...initStmts, ...(body.body ?? [])] } }
    }

    return {
      ...expr,
      params,
      body: {
        kind: 'block' as const,
        body: [...initStmts, { kind: 'expr_stmt' as const, expr: body, loc: body.loc }],
        loc: expr.loc,
      },
    }
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
      cases: (stmt.cases ?? []).map(c => ({ ...c, test: c.test ? desugarExpr(c.test) : undefined,
        body: (c.body ?? []).map(desugarStmt) })
      ),
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
