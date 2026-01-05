import type { Program } from './ast.ts'
import { type Chunk, compile, disassemble } from './bytecode.ts'
import { desugarProgram } from './desugar.ts'
import { type LangError, lineText } from './errors.ts'
import { checkUndefinedVariableErrors } from './undefined-variable.ts'
import { lex } from './lexer.ts'
import { parse } from './parser.ts'
import type { Token } from './token.ts'
import { PRELUDE } from '../engine/bytecode/prelude.ts'

export type Analysis = {
  tokens: Token[]
  program: Program
  chunk: Chunk
  bytecodeText: string
  errors: LangError[]
}

const normalizePrelude = (s: string): string => {
  const t = s.trimEnd()
  if (!t) return ''
  const last = t[t.length - 1]
  const withSep = last === ';' || last === '}' ? t : `${t};`
  return withSep.endsWith('\n') ? withSep : `${withSep}\n`
}

const countNewlines = (s: string): number => {
  let n = 0
  for (let i = 0; i < s.length; i++) if (s[i] === '\n') n++
  return n
}

export function analyze(src: string, prelude = PRELUDE): Analysis {
  const p = normalizePrelude(prelude)
  const pLines = countNewlines(p)
  const fullSrc = `${p}${src}`

  const mapError = (e: LangError): LangError => {
    if (e.line <= 0) return { ...e, line: 0, column: 0, code: '' }
    return { ...e, code: lineText(src, e.line) }
  }

  const lexed = lex(fullSrc, { preludeLines: pLines, postludeStart: Infinity })
  const parsed = parse(fullSrc, lexed.tokens, { preludeLines: pLines })
  const program = desugarProgram(parsed.program)
  const undefinedVarErrors = lexed.errors.length === 0 && parsed.errors.length === 0
    ? checkUndefinedVariableErrors(fullSrc, program).filter(e => e.line > 0)
    : []
  const compiled = compile(fullSrc, program)

  const errors: LangError[] = [
    ...lexed.errors.map(mapError),
    ...parsed.errors.map(mapError),
    ...undefinedVarErrors.map(mapError),
    ...compiled.errors.map(mapError),
  ]
  const bytecodeText = disassemble(compiled.chunk)

  return {
    tokens: lexed.tokens,
    program,
    chunk: compiled.chunk,
    bytecodeText,
    errors,
  }
}
