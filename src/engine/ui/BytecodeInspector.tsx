import { useMemo, useRef } from 'preact/hooks'
import type { LangError } from '../../lang/errors.ts'
import { analyze } from '../../lang/pipeline.ts'
import { useEngineDspStore, useFontStore } from '../store.ts'

export function BytecodeInspector() {
  const rootRef = useRef<HTMLDivElement>(null)
  const source = useEngineDspStore(state => state.dspSource)
  const currentFont = useFontStore(state => state.currentFont)

  const analysis = useMemo(() => {
    try {
      const result = analyze(source)
      return {
        bytecodeText: result.bytecodeText,
        errors: result.errors,
        tokenCount: result.tokens.length,
      }
    }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const fallback: LangError = {
        message,
        line: 0,
        column: 0,
        length: 0,
        code: '',
      }
      return {
        bytecodeText: '',
        errors: [fallback],
        tokenCount: 0,
      }
    }
  }, [source])

  function formatBytecodeText(bytecodeText: string) {
    const lines = bytecodeText.split('\n')
    return lines.map((line, i) => {
      let [opcode, ...args] = line.split(' ')
      const isFunc = opcode === 'FUNC'
      const isInsideFunc = opcode === ''
      if (isInsideFunc) [opcode, ...args] = args.slice(1)
      const isMany = args.length > 3 && args[3].startsWith('(') && !args[3].startsWith('(%')
      let last = isMany ? args.slice(3) : undefined
      if (isMany) args = args.slice(0, 3)
      if (args[1] === 'BINARY') {
        last = [args.pop()!]
        args = args.slice(0, 2)
      }
      return (
        <div key={i}>
          {isFunc && <br />}
          <span className={'text-orange-600 ' + (isInsideFunc ? ' pl-2' : '')}>{opcode}</span>
          <span className="text-gray-400">{args.join(' ')}</span>
          {last && <span className="text-white">{' '}{last.join(' ')}</span>}
        </div>
      )
    })
  }

  return (
    <div ref={rootRef} className="flex flex-col gap-2 w-full" onClick={e => {
      navigator.clipboard.writeText(analysis.bytecodeText)
    }}>
      {analysis.errors.length > 0 && (
        <div className="bg-red-900 text-red-200 p-2 rounded-md text-xs">
          {analysis.errors.map((err, idx) => (
            <div key={idx}>
              {err.message} <span className="opacity-70">({err.line}:{err.column})</span>
            </div>
          ))}
        </div>
      )}
      <div className="text-white p-3 text-xs w-full h-full overflow-auto">
        <pre className="whitespace-pre-wrap"
          style={{ fontFamily: `"${currentFont}", monospace` }}
        >{analysis.tokenCount} tokens<br /><br/>{formatBytecodeText(analysis.bytecodeText || 'No bytecode available yet.')}</pre>
      </div>
    </div>
  )
}
