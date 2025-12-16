import type { Program } from './ast.ts'
import { type Chunk, compile, disassemble } from './bytecode.ts'
import { type LangError } from './errors.ts'
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
  const compiled = compile(src, parsed.program)

  const errors: LangError[] = [...lexed.errors, ...parsed.errors, ...compiled.errors]
  const bytecodeText = disassemble(compiled.chunk)

  return {
    tokens: lexed.tokens,
    program: parsed.program,
    chunk: compiled.chunk,
    bytecodeText,
    errors,
  }
}
