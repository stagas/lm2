import { SEQ_VOICES } from '../../../as/assembly/constants.ts'
import { Op, SeqOp } from '../../../as/assembly/shared.ts'
import type {
  Arg,
  BlockStmt,
  CallExpr,
  DestructurePattern,
  Expr,
  ForHead,
  FuncExpr,
  Loc,
  Program,
  Stmt,
  SwitchCase,
  TryStmt,
} from '../../lang/ast.ts'
import { compile } from '../../lang/bytecode.ts'
import { type LangError, lineText } from '../../lang/errors.ts'
import { lex } from '../../lang/lexer.ts'
import { parse } from '../../lang/parser.ts'
import { builtinSyms } from './builtin-syms.ts'
import { extractAnalysersFromProgramWithRefs } from './extract-analysers.ts'
import { extractBarsFromProgram, extractBpmFromProgram } from './extract-bpm-bars.ts'
import { extractMiniSequencesFromProgramWithRefs } from './extract-mini.ts'
import { extractNumberLiteralsFromProgram, extractNumberParamsFromProgram } from './extract-numbers.ts'
import { extractSamplesFromProgramWithRefs } from './extract-samples.ts'
import { extractTimelineLabelsFromProgram } from './extract-timeline-labels.ts'
import { extractTimelineSequencesFromProgramWithRefs } from './extract-timeline-sequences.ts'
import { binaryCode, encoderError, tryEvalConstNumber, unaryCode } from './helpers.ts'
import {
  AnalyserRef,
  ArrayLiteralRef,
  BranchMarkRef,
  type MiniSequenceRef,
  type NumberLiteralInfo,
  type NumberWithParamsInfo,
  type SampleDef,
  type TimelineLabel,
  type TimelineSequenceDef,
  type TimelineSequenceRef,
  VM_MAGIC,
  VmOp,
  VmTarget,
} from './types.ts'

export * from './builtin-syms.ts'
export * from './extract-analysers.ts'
export * from './extract-bpm-bars.ts'
export * from './extract-mini.ts'
export * from './extract-numbers.ts'
export * from './extract-samples.ts'
export * from './extract-timeline-labels.ts'
export * from './extract-timeline-sequences.ts'
export * from './types.ts'

const BUILTIN_CALL_NAMES = new Set([
  'out',
  'sine',
  'ad',
  'adsr',
  'mini',
  'play',
  'timeline',
  'analyser',
  'sampler',
  'slicer',
  'every',
  'at',
  'freesound',
  'label',
  't',
])

function checkUndefinedCallErrors(src: string, program: Program): LangError[] {
  const errors: LangError[] = []

  const scopeStack: Array<Set<string>> = [new Set(BUILTIN_CALL_NAMES)]

  const makeError = (loc: Pick<Loc, 'line' | 'column' | 'length'>, message: string): LangError => ({
    message,
    line: loc.line,
    column: loc.column,
    length: Math.max(1, loc.length),
    code: lineText(src, loc.line),
  })

  const isDefined = (name: string): boolean => {
    for (let i = scopeStack.length - 1; i >= 0; i--) {
      if (scopeStack[i].has(name)) return true
    }
    return false
  }

  const defineName = (name: string): void => {
    for (let i = scopeStack.length - 1; i >= 0; i--) {
      if (scopeStack[i].has(name)) return
    }
    scopeStack[scopeStack.length - 1].add(name)
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
    }
    else {
      for (const item of pattern.items) defineName(item)
    }
  }

  const visitBranch = (branch: Expr | BlockStmt): void => {
    if ('kind' in branch && branch.kind === 'block') {
      visitStmt(branch)
      return
    }
    visitExpr(branch as Expr)
  }

  const visitAssignable = (target: Expr, shouldDefine: boolean): void => {
    if (target.kind === 'ident') {
      if (shouldDefine) defineName(target.name)
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
    if (!isDefined(arg.name)) {
      errors.push(makeError(arg.loc, `${arg.name} is not defined`))
    }
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
        if (expr.callee.kind === 'ident') {
          const name = expr.callee.name
          if (!isDefined(name)) {
            errors.push(makeError(expr.callee.loc, `${name} is not defined`))
          }
        }
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
        visitAssignable(expr.target, true)
        visitExpr(expr.value)
        return
      case 'if':
        visitExpr(expr.test)
        visitBranch(expr.then)
        visitBranch(expr.else)
        return
      case 'func':
        withScope(() => {
          for (const param of expr.params) defineName(param.name)
          for (const param of expr.params) {
            if (param.default) visitExpr(param.default)
          }
          if ('kind' in expr.body && expr.body.kind === 'block') {
            visitStmt(expr.body)
          }
          else {
            visitExpr(expr.body as Expr)
          }
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
        definePattern(stmt.pattern)
        visitExpr(stmt.value)
        return
      case 'label':
        visitStmt(stmt.stmt)
        return
      case 'for': {
        const head = stmt.head
        if (head.kind === 'c_style') {
          if (head.init) visitExpr(head.init)
          if (head.test) visitExpr(head.test)
          if (head.update) visitExpr(head.update)
          withScope(() => visitStmt(stmt.body))
        }
        else {
          visitExpr(head.iterable)
          withScope(() => {
            defineName(head.value)
            if (head.index) defineName(head.index)
            if (head.length) defineName(head.length)
            visitStmt(stmt.body)
          })
        }
        return
      }
      case 'while':
        visitExpr(stmt.test)
        withScope(() => visitStmt(stmt.body))
        return
      case 'do_while':
        withScope(() => visitStmt(stmt.body))
        visitExpr(stmt.test)
        return
      case 'switch':
        visitExpr(stmt.test)
        for (const c of stmt.cases) {
          withScope(() => {
            if (c.test) visitExpr(c.test)
            for (const bodyStmt of c.body) visitStmt(bodyStmt)
          })
        }
        return
      case 'try':
        visitStmt(stmt.body)
        if (stmt.catchBody) {
          const catchBody = stmt.catchBody
          withScope(() => {
            if (stmt.catchName) defineName(stmt.catchName)
            for (const cStmt of catchBody.body) visitStmt(cStmt)
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

  for (const stmt of program.body) {
    visitStmt(stmt)
  }

  return errors
}

export { Op, SEQ_VOICES, SeqOp }

export function encodeLangToVmOps(
  src: string,
  target: VmTarget,
): {
  errors: LangError[]
  bpm?: number
  bars?: number
  miniSequences?: string[]
  miniRefs?: MiniSequenceRef[]
  timelineSequences?: TimelineSequenceDef[]
  timelineRefs?: TimelineSequenceRef[]
  timelineLabels?: TimelineLabel[]
  analyserRefs?: AnalyserRef[]
  arrayLiterals?: ArrayLiteralRef[]
  branchMarks?: BranchMarkRef[]
  numberParams?: NumberWithParamsInfo[]
  numberLiterals?: NumberLiteralInfo[]
  sampleDefs?: SampleDef[]
} {
  const lexed = lex(src)
  const parsed = parse(src, lexed.tokens)
  const errors: LangError[] = [...lexed.errors, ...parsed.errors]
  if (errors.length === 0) {
    errors.push(...checkUndefinedCallErrors(src, parsed.program))
  }
  if (errors.length) return { errors }

  const bpm = extractBpmFromProgram(src, parsed.program, errors)
  const bars = extractBarsFromProgram(src, parsed.program, errors)
  if (errors.length) return { errors }

  const { sequences, refs } = extractMiniSequencesFromProgramWithRefs(src, parsed.program)
  const timelineExtracted = extractTimelineSequencesFromProgramWithRefs(src, parsed.program)
  const timelineLabels = extractTimelineLabelsFromProgram(parsed.program)
  const samplesExtracted = extractSamplesFromProgramWithRefs(src, parsed.program, errors)
  if (errors.length) return { errors }
  let analyserRefs: AnalyserRef[] = []
  const numberParams = extractNumberParamsFromProgram(parsed.program)
  const numberLiterals = extractNumberLiteralsFromProgram(parsed.program)
  const sliderKeyOf = (loc: Pick<Loc, 'line' | 'column' | 'length'>) => `${loc.line}:${loc.column}:${loc.length}`
  const sliderKeys = new Set(numberParams.map(p => sliderKeyOf(p)))
  const sequenceToIndex = new Map<string, number>()
  sequences.forEach((seq, idx) => sequenceToIndex.set(seq, idx))
  const timelineKeyToIndex = new Map<string, number>()
  timelineExtracted.sequences.forEach((s, idx) => timelineKeyToIndex.set(s.sequence, idx))
  const miniCount = sequences.length
  const sampleKeyToIndex = new Map<string, number>()
  for (const s of samplesExtracted.samples) {
    sampleKeyToIndex.set(`freesound:${s.id}`, s.sampleIndex)
  }

  const toSeqIndexExpr = (loc: Loc, idx: number) => ({ kind: 'number', value: idx, raw: String(idx), loc }) as any

  const MAX_ANALYSER_INDEX = 63
  const clampAnalyserIndex = (n: number) => Math.max(0, Math.min(MAX_ANALYSER_INDEX, Math.floor(Number(n || 0))))

  const usedAnalyserIndices = new Set<number>([0])
  let nextAnalyserIndex = 1
  const allocAnalyserIndex = (): number => {
    if (nextAnalyserIndex > MAX_ANALYSER_INDEX) return MAX_ANALYSER_INDEX
    while (usedAnalyserIndices.has(nextAnalyserIndex) && nextAnalyserIndex < MAX_ANALYSER_INDEX) nextAnalyserIndex++
    const idx = nextAnalyserIndex
    usedAnalyserIndices.add(idx)
    nextAnalyserIndex = Math.min(MAX_ANALYSER_INDEX, idx + 1)
    return idx
  }

  const transformExpr = (expr: any): any => {
    if (!expr) return expr

    if (expr.kind === 'call') {
      const callee = transformExpr(expr.callee)
      const args = (expr.args ?? []).map((a: any) => {
        if (a.kind === 'pos' || a.kind === 'named') return { ...a, value: transformExpr(a.value) }
        return a
      })

      const calleeName = callee?.kind === 'ident' ? callee.name : null

      const isMini = calleeName === 'mini'
      const isPlay = calleeName === 'play'
      const isTimeline = calleeName === 'timeline'
      const isAnalyser = calleeName === 'analyser'
      const isOut = calleeName === 'out'
      const isLabel = calleeName === 'label'
      const isFreesound = calleeName === 'freesound'

      if (isLabel) {
        return { kind: 'undefined', loc: expr.loc }
      }

      if (isFreesound) {
        const idArg = args.find((a: any) => a.kind === 'named' && a.name === 'id')
          ?? args.find((a: any) => a.kind === 'pos')
        const idExpr = idArg?.kind === 'pos' || idArg?.kind === 'named' ? idArg.value : null
        const id = tryEvalConstNumber(idExpr)
        if (id != null && Number.isFinite(id) && Number.isInteger(id) && id >= 0) {
          const idx = sampleKeyToIndex.get(`freesound:${id}`)
          if (idx !== undefined) return toSeqIndexExpr(expr.loc, idx)
        }
        return { kind: 'undefined', loc: expr.loc }
      }

      if (isAnalyser) {
        const posArgs = args.filter((a: any) => a.kind === 'pos')
        const idxArg = posArgs.length >= 2 ? posArgs[1] : null
        const idxVal = idxArg?.value

        if (idxVal?.kind === 'number') {
          const idx = clampAnalyserIndex(Number(idxVal.value ?? 0))
          usedAnalyserIndices.add(idx)
          idxArg.value = toSeqIndexExpr(idxVal.loc ?? expr.loc, idx)
          return { ...expr, callee, args }
        }

        if (posArgs.length === 1) {
          const idx = allocAnalyserIndex()
          return { ...expr, callee, args: [...args, { kind: 'pos', value: toSeqIndexExpr(expr.loc, idx) }] }
        }
      }

      if (isOut) {
        const posArgs = args.filter((a: any) => a.kind === 'pos')
        const audioArg = posArgs[0]
        const audioExpr = audioArg?.value
        const audioCalleeName = audioExpr?.kind === 'call' && audioExpr.callee?.kind === 'ident'
          ? audioExpr.callee.name
          : null

        // If the signal is already analysed (common: `... |> analyser(%) |> out(%)`), don't wrap again.
        if (audioArg?.kind === 'pos' && audioExpr && audioCalleeName !== 'analyser') {
          const idx = allocAnalyserIndex()
          const analyserCall = {
            kind: 'call',
            callee: { kind: 'ident', name: 'analyser', loc: expr.callee?.loc ?? expr.loc },
            args: [
              { kind: 'pos', value: audioExpr },
              { kind: 'pos', value: toSeqIndexExpr(expr.loc, idx) },
            ],
            loc: expr.loc,
          }
          const args2 = args.map((a: any) => a === audioArg ? { ...a, value: analyserCall } : a)
          return { ...expr, callee, args: args2 }
        }
      }

      if (isMini || isPlay) {
        // Find "seq" argument (positional #0 or named seq:)
        const seqArg = args.find((a: any) => a.kind === 'named' && a.name === 'seq')
          ?? args.find((a: any) => a.kind === 'pos') // first positional

        if (seqArg?.kind === 'pos' || seqArg?.kind === 'named') {
          const v = seqArg.value
          if (v?.kind === 'string') {
            const idx = sequenceToIndex.get(String(v.value ?? ''))
            if (idx !== undefined) {
              seqArg.value = toSeqIndexExpr(v.loc, idx)
            }
          }
        }

        // Strip compile-time-only mini(seq, color?) arg so runtime sees mini(seq[, cb]).
        const argsNoColor = (() => {
          const namedColor = args.find((a: any) => a.kind === 'named' && a.name === 'color')
          if (namedColor) return args.filter((a: any) => a !== namedColor)

          const posArgs = args.filter((a: any) => a.kind === 'pos')
          const secondPos = posArgs[1]
          const thirdPos = posArgs[2]
          if (secondPos?.value?.kind === 'string') {
            return args.filter((a: any) => a !== secondPos)
          }
          if (thirdPos?.value?.kind === 'string') {
            return args.filter((a: any) => a !== thirdPos)
          }
          return args
        })()

        const seqArg2 = argsNoColor.find((a: any) => a.kind === 'named' && a.name === 'seq')
          ?? argsNoColor.find((a: any) => a.kind === 'pos')

        // mini(x) is a compile-time identity for sequence refs (also mini(x, color?))
        if (isMini && argsNoColor.length === 1 && seqArg2 && (seqArg2.kind === 'pos' || seqArg2.kind === 'named')) {
          return seqArg2.value
        }

        // play(seq, cb) is a compile-time alias of mini(seq, cb)
        if (isPlay) {
          return { ...expr, callee: { kind: 'ident', name: 'mini', loc: callee.loc }, args: argsNoColor }
        }

        return { ...expr, callee, args: argsNoColor }
      }

      if (isTimeline) {
        const posArgs = args.filter((a: any) => a.kind === 'pos')
        let seqArg = args.find((a: any) => a.kind === 'named' && a.name === 'seq') ?? null
        if (!seqArg) {
          for (let i = 0; i < posArgs.length; i++) {
            const v = posArgs[i]?.value
            if (v?.kind === 'string') {
              seqArg = posArgs[i]
              break
            }
          }
        }
        if (!seqArg) seqArg = posArgs.length >= 2 ? posArgs[1] : posArgs[0]
        if (seqArg?.kind === 'pos' || seqArg?.kind === 'named') {
          const v = seqArg.value
          if (v?.kind === 'string') {
            const key = String(v.value ?? '')
            const idx = timelineKeyToIndex.get(key)
            if (idx !== undefined) {
              seqArg.value = toSeqIndexExpr(v.loc, miniCount + idx)
              return {
                ...expr,
                callee,
                args: [{ kind: 'pos', value: seqArg.value }],
              }
            }
          }
        }
      }

      return { ...expr, callee, args }
    }

    if (expr.kind === 'binary') {
      return { ...expr, left: transformExpr(expr.left), right: transformExpr(expr.right) }
    }

    if (expr.kind === 'assign') {
      return { ...expr, target: transformExpr(expr.target), value: transformExpr(expr.value) }
    }

    if (expr.kind === 'unary' || expr.kind === 'postfix') {
      return { ...expr, expr: transformExpr(expr.expr) }
    }

    if (expr.kind === 'member') {
      const out: any = { ...expr, object: transformExpr(expr.object) }
      if (expr.computed) out.index = transformExpr(expr.index)
      return out
    }

    if (expr.kind === 'array') {
      return { ...expr, items: (expr.items ?? []).map(transformExpr) }
    }

    if (expr.kind === 'object') {
      return { ...expr, props: (expr.props ?? []).map((p: any) => ({ ...p, value: transformExpr(p.value) })) }
    }

    if (expr.kind === 'if') {
      const thenPart = expr.then?.kind === 'block' ? transformStmt(expr.then) : transformExpr(expr.then)
      const elsePart = expr.else?.kind === 'block' ? transformStmt(expr.else) : transformExpr(expr.else)
      return { ...expr, test: transformExpr(expr.test), then: thenPart, else: elsePart }
    }

    if (expr.kind === 'func') {
      const body = expr.body?.kind === 'block' ? transformStmt(expr.body) : transformExpr(expr.body)
      return { ...expr, body }
    }

    return expr
  }

  const transformStmt = (stmt: any): any => {
    if (!stmt) return stmt
    if (stmt.kind === 'expr_stmt') {
      const isBpmStmt = !!(
        stmt.expr?.kind === 'assign'
        && stmt.expr.target?.kind === 'ident'
        && stmt.expr.target?.name === 'bpm'
      )
      if (isBpmStmt) return null
      const isBarsStmt = !!(
        stmt.expr?.kind === 'assign'
        && stmt.expr.target?.kind === 'ident'
        && stmt.expr.target?.name === 'bars'
      )
      if (isBarsStmt) return null
      const isLabelStmt = !!(
        stmt.expr?.kind === 'call'
        && stmt.expr.callee?.kind === 'ident'
        && stmt.expr.callee?.name === 'label'
      )
      if (isLabelStmt) return null
      return { ...stmt, expr: transformExpr(stmt.expr) }
    }
    if (stmt.kind === 'block') return { ...stmt, body: (stmt.body ?? []).map(transformStmt).filter(Boolean) }
    if (stmt.kind === 'for') {
      if (stmt.head?.kind === 'c_style') {
        return {
          ...stmt,
          head: {
            ...stmt.head,
            init: stmt.head.init ? transformExpr(stmt.head.init) : undefined,
            test: stmt.head.test ? transformExpr(stmt.head.test) : undefined,
            update: stmt.head.update ? transformExpr(stmt.head.update) : undefined,
          },
          body: transformStmt(stmt.body),
        }
      }
      return { ...stmt, head: { ...stmt.head, iterable: transformExpr(stmt.head.iterable) },
        body: transformStmt(stmt.body) }
    }
    if (stmt.kind === 'while' || stmt.kind === 'do_while') {
      return { ...stmt, test: transformExpr(stmt.test), body: transformStmt(stmt.body) }
    }
    if (stmt.kind === 'switch') {
      return {
        ...stmt,
        test: transformExpr(stmt.test),
        cases: (stmt.cases ?? []).map((c: any) => ({
          ...c,
          test: c.test ? transformExpr(c.test) : undefined,
          body: (c.body ?? []).map(transformStmt).filter(Boolean),
        })),
      }
    }
    if (stmt.kind === 'try') {
      return {
        ...stmt,
        body: transformStmt(stmt.body),
        catchBody: stmt.catchBody ? transformStmt(stmt.catchBody) : undefined,
        finallyBody: stmt.finallyBody ? transformStmt(stmt.finallyBody) : undefined,
      }
    }
    if (stmt.kind === 'throw') return { ...stmt, value: transformExpr(stmt.value) }
    if (stmt.kind === 'return') return { ...stmt, value: stmt.value ? transformExpr(stmt.value) : undefined }
    if (stmt.kind === 'label') return { ...stmt, stmt: transformStmt(stmt.stmt) }
    if (stmt.kind === 'destructure') return { ...stmt, value: transformExpr(stmt.value) }
    return stmt
  }

  const transformedProgram = { ...parsed.program, body: parsed.program.body.map(transformStmt).filter(Boolean) } as any
  analyserRefs = extractAnalysersFromProgramWithRefs(transformedProgram)
  const compiled = compile(src, transformedProgram)
  errors.push(...compiled.errors)
  if (errors.length) return { errors }
  const chunk = compiled.chunk
  const arrayLiterals: ArrayLiteralRef[] = []
  const branchMarks: BranchMarkRef[] = []

  const syms = new Map<string, number>()
  let nextSym = 1000
  const symOf = (s: string) => {
    const b = builtinSyms[s]
    if (b !== undefined) return b
    const prev = syms.get(s)
    if (prev !== undefined) return prev
    const id = nextSym++
    syms.set(s, id)
    return id
  }

  let litCount = 0
  const litIndexByValue = new Map<number, number>()
  const litIndexByLocKey = new Map<string, number>()
  const locKeyToLiteralIndex = new Map<string, number>()

  const allocLit = () => litCount++

  const litOfValue = (v: number) => {
    const prev = litIndexByValue.get(v)
    if (prev !== undefined) return prev
    if (litCount >= target.literals.length) {
      errors.push(encoderError(src, `Too many number literals (max ${target.literals.length})`))
      return 0
    }
    const idx = allocLit()
    litIndexByValue.set(v, idx)
    return idx
  }

  const litOfLocKey = (key: string) => {
    const prev = litIndexByLocKey.get(key)
    if (prev !== undefined) return prev
    if (litCount >= target.literals.length) {
      errors.push(encoderError(src, `Too many number literals (max ${target.literals.length})`))
      return 0
    }
    const idx = allocLit()
    litIndexByLocKey.set(key, idx)
    return idx
  }

  target.ops.fill(0)
  target.literals.fill(0)
  target.ops[0] = VM_MAGIC

  const funcOffsets = new Map<object, number>()
  const funcPatches: { at: number; fn: object }[] = []
  const funcQueue: object[] = []

  const vmFuncHeader = -2

  const encodeChunk = (
    chunk: { consts: any[]; funcs: any[]; code: any[]; arrayLiterals?: any[]; branchMarks?: any[] },
    base: number,
  ) => {
    const code = chunk.code as any[]

    const pcMap = new Int32Array(code.length)
    let pc = base
    for (let i = 0; i < code.length; i++) {
      pcMap[i] = pc
      const ins = code[i]!
      switch (ins.op) {
        case 'PUSH_CONST':
          {
            const v = chunk.consts[ins.k]
            if (typeof v === 'number') pc += 2
            else if (typeof v === 'string') pc += 2
            else if (typeof v === 'boolean') pc += 2
            else if (v === null) pc += 1
            else pc += 1
          }
          break
        case 'ENTER_SCOPE':
        case 'EXIT_SCOPE':
        case 'POP':
        case 'DUP':
        case 'BRANCH':
        case 'LABEL':
        case 'RETURN':
        case 'THROW':
        case 'TRY_BEGIN':
        case 'CATCH_BEGIN':
        case 'FINALLY_BEGIN':
        case 'TRY_END':
          pc += 1
          break
        case 'DUP2':
          errors.push(encoderError(src, 'DUP2 not supported in VM encoder yet'))
          pc += 1
          break
        case 'LOAD':
        case 'STORE':
          pc += 2
          break
        case 'UNARY':
          pc += 2
          break
        case 'BINARY':
          pc += 2
          break
        case 'CALL':
          pc += 3
          break
        case 'JUMP':
        case 'JUMP_IF_FALSE':
          pc += 2
          break
        case 'FUNC':
          pc += 2
          break
        case 'BREAK':
        case 'CONTINUE':
          errors.push(encoderError(src, `${ins.op} not supported in VM encoder yet`))
          pc += 1
          break
        case 'ARRAY':
          pc += 2
          break
        case 'GET_INDEX':
        case 'GET_INDEX2':
        case 'SET_INDEX':
          pc += 1
          break
        case 'OBJECT':
        case 'GET_PROP':
        case 'SET_PROP':
          errors.push(encoderError(src, `${ins.op} not supported in VM encoder yet`))
          pc += 1
          break
        default:
          errors.push(encoderError(src, `Unsupported opcode ${(ins as any).op}`))
          pc += 1
      }
    }

    const endPc = pc

    const arrayMeta = chunk.arrayLiterals as Array<{ ins: number; loc: Loc; items: Loc[] }> | undefined
    if (arrayMeta?.length) {
      for (const lit of arrayMeta) {
        const pcAt = pcMap[lit.ins]
        if (pcAt != null) arrayLiterals.push({ pc: pcAt, loc: lit.loc, items: lit.items })
      }
    }

    const branchMeta = chunk.branchMarks as Array<{ ins: number; loc: Loc }> | undefined
    if (branchMeta?.length) {
      for (const m of branchMeta) {
        const pcAt = pcMap[m.ins]
        if (pcAt != null) branchMarks.push({ pc: pcAt, loc: m.loc })
      }
    }

    let w = base
    for (let i = 0; i < code.length; i++) {
      const ins = code[i]!
      switch (ins.op) {
        case 'PUSH_CONST': {
          const v = chunk.consts[ins.k]
          if (typeof v === 'number') {
            const key = ins.loc ? sliderKeyOf(ins.loc) : undefined
            const isSlider = key !== undefined && sliderKeys.has(key)
            const k = key !== undefined ? litOfLocKey(key) : litOfValue(v)
            target.literals[k] = v
            target.ops[w++] = isSlider ? VmOp.PushNumSmoothed : VmOp.PushNum
            target.ops[w++] = k
            if (key !== undefined) locKeyToLiteralIndex.set(key, k)
          }
          else if (typeof v === 'string') {
            target.ops[w++] = VmOp.PushSym
            target.ops[w++] = symOf(v)
          }
          else if (typeof v === 'boolean') {
            target.ops[w++] = VmOp.PushBool
            target.ops[w++] = v ? 1 : 0
          }
          else if (v === null) {
            target.ops[w++] = VmOp.PushNull
          }
          else {
            target.ops[w++] = VmOp.PushUndef
          }
          break
        }
        case 'ENTER_SCOPE':
          target.ops[w++] = VmOp.EnterScope
          break
        case 'EXIT_SCOPE':
          target.ops[w++] = VmOp.ExitScope
          break
        case 'BRANCH':
          target.ops[w++] = VmOp.Branch
          break
        case 'POP':
          target.ops[w++] = VmOp.Pop
          break
        case 'DUP':
          target.ops[w++] = VmOp.Dup
          break
        case 'LABEL':
          target.ops[w++] = VmOp.Nop
          break
        case 'LOAD': {
          const name = String(chunk.consts[ins.name])
          target.ops[w++] = VmOp.Load
          target.ops[w++] = symOf(name)
          break
        }
        case 'STORE': {
          const name = String(chunk.consts[ins.name])
          target.ops[w++] = VmOp.Store
          target.ops[w++] = symOf(name)
          break
        }
        case 'UNARY': {
          const code = unaryCode(ins.opName)
          if (code === null) {
            errors.push(encoderError(src, `Unsupported unary op ${ins.opName}`))
            target.ops[w++] = VmOp.Nop
            break
          }
          target.ops[w++] = VmOp.Unary
          target.ops[w++] = code
          break
        }
        case 'BINARY': {
          const code = binaryCode(ins.opName)
          if (code === null) {
            errors.push(encoderError(src, `Unsupported binary op ${ins.opName}`))
            target.ops[w++] = VmOp.Nop
            break
          }
          target.ops[w++] = VmOp.Binary
          target.ops[w++] = code
          break
        }
        case 'ARRAY': {
          target.ops[w++] = VmOp.Array
          target.ops[w++] = ins.n | 0
          break
        }
        case 'GET_INDEX': {
          target.ops[w++] = VmOp.GetIndex
          break
        }
        case 'GET_INDEX2': {
          target.ops[w++] = VmOp.GetIndex2
          break
        }
        case 'SET_INDEX': {
          target.ops[w++] = VmOp.SetIndex
          break
        }
        case 'CALL':
          target.ops[w++] = VmOp.Call
          target.ops[w++] = ins.pos
          target.ops[w++] = ins.named
          break
        case 'JUMP':
          target.ops[w++] = VmOp.Jump
          target.ops[w++] = ins.to === code.length ? endPc : (pcMap[ins.to] ?? endPc)
          break
        case 'JUMP_IF_FALSE':
          target.ops[w++] = VmOp.JumpIfFalse
          target.ops[w++] = ins.to === code.length ? endPc : (pcMap[ins.to] ?? endPc)
          break
        case 'RETURN':
          target.ops[w++] = VmOp.Return
          break
        case 'THROW':
          target.ops[w++] = VmOp.Throw
          break
        case 'TRY_BEGIN':
        case 'CATCH_BEGIN':
        case 'FINALLY_BEGIN':
        case 'TRY_END':
          target.ops[w++] = VmOp.Nop
          break
        case 'FUNC': {
          const fn = chunk.funcs[ins.id]
          if (!fn) {
            errors.push(encoderError(src, `Missing FUNC #${ins.id}`))
            target.ops[w++] = VmOp.PushUndef
            break
          }
          target.ops[w++] = VmOp.Func
          const at = w++
          funcPatches.push({ at, fn })
          funcQueue.push(fn)
          target.ops[at] = 0
          break
        }
        default:
          errors.push(encoderError(src, `Unsupported opcode ${(ins as any).op}`))
          target.ops[w++] = VmOp.Nop
      }
    }

    return { endPc, writtenEnd: w }
  }

  // Encode main chunk at pc=1
  let writePc = 1
  const main = encodeChunk(chunk as any, writePc)
  writePc = main.writtenEnd

  // Encode functions (BFS), patching FUNC placeholders to absolute pcs.
  for (let qi = 0; qi < funcQueue.length; qi++) {
    const fn: any = funcQueue[qi]
    if (funcOffsets.has(fn)) continue

    const funcPc = writePc
    funcOffsets.set(fn, funcPc)

    const params = fn.params as { name: string; isRest: boolean }[]
    target.ops[writePc++] = vmFuncHeader
    target.ops[writePc++] = params.length
    for (const p of params) {
      target.ops[writePc++] = symOf(p.name)
    }

    const body = encodeChunk(fn.chunk as any, writePc)
    writePc = body.writtenEnd

    // Ensure function returns something
    target.ops[writePc++] = VmOp.PushUndef
    target.ops[writePc++] = VmOp.Return
  }

  for (const p of funcPatches) {
    const off = funcOffsets.get(p.fn)
    if (off === undefined) {
      errors.push(encoderError(src, 'Unpatched function offset'))
      target.ops[p.at] = 0
    }
    else {
      target.ops[p.at] = off
    }
  }

  target.ops[writePc++] = VmOp.End

  const timelineRefs = timelineExtracted.refs.map(r => ({ ...r, seqIndex: miniCount + r.seqIndex }))
  const numberParamsWithLiteralIndex = numberParams.map(p => ({
    ...p,
    literalIndex: locKeyToLiteralIndex.get(sliderKeyOf(p)),
  }))
  const numberLiteralsWithLiteralIndex = numberLiterals.map(p => ({
    ...p,
    literalIndex: locKeyToLiteralIndex.get(sliderKeyOf(p)),
  }))

  return errors.length
    ? {
      errors,
      bpm,
      bars,
      miniSequences: sequences,
      miniRefs: refs,
      timelineSequences: timelineExtracted.sequences,
      timelineRefs,
      timelineLabels,
      analyserRefs,
      arrayLiterals,
      branchMarks,
      numberParams: numberParamsWithLiteralIndex,
      numberLiterals: numberLiteralsWithLiteralIndex,
      sampleDefs: samplesExtracted.samples,
    }
    : {
      errors: [],
      bpm,
      bars,
      miniSequences: sequences,
      miniRefs: refs,
      timelineSequences: timelineExtracted.sequences,
      timelineRefs,
      timelineLabels,
      analyserRefs,
      arrayLiterals,
      branchMarks,
      numberParams: numberParamsWithLiteralIndex,
      numberLiterals: numberLiteralsWithLiteralIndex,
      sampleDefs: samplesExtracted.samples,
    }
}
