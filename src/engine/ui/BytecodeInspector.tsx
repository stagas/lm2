import { useMemo, useRef, useState } from 'preact/hooks'
import Switch from '../../components/Switch.tsx'
import type { LangError } from '../../lang/errors.ts'
import { analyze } from '../../lang/pipeline.ts'
import { useEngineDspStore, useFontStore } from '../store.ts'

export function BytecodeInspector() {
  const rootRef = useRef<HTMLDivElement>(null)
  const source = useEngineDspStore(state => state.dspSource)
  const currentFont = useFontStore(state => state.currentFont)
  const [showPrelude, setShowPrelude] = useState(false)

  const fullAnalysis = useMemo(() => {
    try {
      return analyze(source)
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
        tokens: [],
        program: { body: [] },
        chunk: { code: [], consts: [], funcs: [] },
      }
    }
  }, [source])

  const userOnlyAnalysis = useMemo(() => {
    try {
      return analyze(source, '')
    }
    catch (err) {
      return {
        bytecodeText: '',
        errors: [],
        tokens: [],
        program: { body: [] },
        chunk: { code: [], consts: [], funcs: [] },
      }
    }
  }, [source])

  const bytecodeText = useMemo(() => showPrelude ? fullAnalysis.bytecodeText : userOnlyAnalysis.bytecodeText, [
    showPrelude,
    fullAnalysis.bytecodeText,
    userOnlyAnalysis.bytecodeText,
  ])

  const formattedBytecode = useMemo(() => {
    const lines = bytecodeText.split('\n')
    const html = lines.map((line, i) => {
      const parts = line.split(' ')
      if (parts.length === 0) return line

      const [first, ...rest] = parts
      const isFunc = first === 'FUNC'
      const isInsideFunc = first === ''

      let opcode = first
      let args = rest

      if (isInsideFunc && args.length > 0) {
        opcode = args[0]
        args = args.slice(1)
      }

      const isMany = args.length > 3 && args[3]?.startsWith('(') && !args[3]?.startsWith('(%')
      let last: string[] | undefined
      if (isMany) {
        last = args.slice(3)
        args = args.slice(0, 3)
      }
      if (args[1] === 'BINARY') {
        last = [args.pop()!]
        args = args.slice(0, 2)
      }

      const indent = isInsideFunc ? 'margin-left: 8px; display: inline-block;' : ''
      const br = isFunc ? '<br/>' : ''
      const opcodeSpan = `<span class="text-orange-600">${opcode}</span>`
      const argsSpan = `<span class="text-gray-400"> ${args.join(' ')}</span>`
      const lastSpan = last ? `<span class="text-white"> ${last.join(' ')}</span>` : ''

      return `${br}<div style="${indent}">${opcodeSpan}${argsSpan}${lastSpan}</div>`
    }).join('')

    return html
  }, [bytecodeText])

  return (
    <div ref={rootRef} className="flex flex-col gap-2 w-full">
      {fullAnalysis.errors.length > 0 && (
        <div className="bg-red-900 text-red-200 p-2 rounded-md text-xs">
          {fullAnalysis.errors.map((err, idx) => (
            <div key={idx}>
              {err.message} <span className="opacity-70">({err.line}:{err.column})</span>
            </div>
          ))}
        </div>
      )}
      <div className="px-3 py-2 border-b border-neutral-800 flex items-center justify-between gap-2">
        <div className="text-xs text-neutral-400">
          Show Prelude Functions
        </div>
        <Switch checked={showPrelude} onChange={setShowPrelude} />
      </div>
      <div className="text-white p-3 text-xs w-full h-full overflow-auto" onClick={e => {
        navigator.clipboard.writeText(bytecodeText)
      }}>
        <div style={{ fontFamily: `"${currentFont}", monospace`, whiteSpace: 'pre-wrap' }}>
          {fullAnalysis.tokens.length} tokens<br />
          <br />
          <div dangerouslySetInnerHTML={{ __html: formattedBytecode }} />
        </div>
      </div>
    </div>
  )
}
