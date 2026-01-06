import type { CodeFile } from 'mini-code'

const editTokenRe = /^-?\d*\.?\d*/
const displayTokenRe = /^-?\d*\.?\d*k?/

export function getEditableNumberToken(line: string, from: number, fallbackLength: number): string {
  const match = line.substring(from).match(editTokenRe)?.[0]
  if (match && match.length > 0) return match
  return line.slice(from, from + Math.max(1, fallbackLength))
}

function parseNumberToken(token: string): number | null {
  if (!token) return null
  const raw = token.replace('k', '')
  const base = Number.parseFloat(raw)
  if (!Number.isFinite(base)) return null
  return token.includes('k') ? base * 1000 : base
}

export function getCurrentNumberAt(
  codeFile: CodeFile,
  info: { line: number; column: number; length: number },
): number | null {
  const lines = codeFile.value.split('\n')
  const lineIndex = info.line - 1
  if (lineIndex < 0 || lineIndex >= lines.length) return null

  const lineText = lines[lineIndex]!
  const from = info.column - 1
  if (from < 0 || from >= lineText.length) return null

  const token = lineText.substring(from).match(displayTokenRe)?.[0]
    ?? lineText.slice(from, from + Math.max(1, info.length))
  return parseNumberToken(token)
}

