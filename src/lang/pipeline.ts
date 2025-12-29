import type { Program } from './ast.ts'
import { type Chunk, compile, disassemble } from './bytecode.ts'
import { desugarProgram } from './desugar.ts'
import { type LangError } from './errors.ts'
import { checkUndefinedVariableErrors } from './undefined-variable.ts'
import { lex } from './lexer.ts'
import { parse } from './parser.ts'
import type { Token } from './token.ts'

export type Analysis = {
  tokens: Token[]
  program: Program
  chunk: Chunk
  bytecodeText: string
  errors: LangError[]
}

export function analyze(src: string): Analysis {
  const lexed = lex(src)
  const parsed = parse(src, lexed.tokens)
  const program = desugarProgram(parsed.program)
  const undefinedVarErrors = lexed.errors.length === 0 && parsed.errors.length === 0
    ? checkUndefinedVariableErrors(src, program)
    : []
  const compiled = compile(src, program)

  const errors: LangError[] = [...lexed.errors, ...parsed.errors, ...undefinedVarErrors, ...compiled.errors]
  const bytecodeText = disassemble(compiled.chunk)

  return {
    tokens: lexed.tokens,
    program,
    chunk: compiled.chunk,
    bytecodeText,
    errors,
  }
}
