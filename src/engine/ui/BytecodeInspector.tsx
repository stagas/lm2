import { CopyIcon } from '@phosphor-icons/react'
import { CodeEditor, CodeFile, type EditorError, type EditorHeader, type EditorWidget } from 'mini-code'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { LITERALS_COUNT, OPS_COUNT } from '../../../as/assembly/constants.ts'
import { useAppStore } from '../../app/store.ts'
import { Logo } from '../../components/Logo.tsx'
import { Spinner } from '../../components/Spinner.tsx'
import type { LangError } from '../../lang/errors.ts'
import { analyze } from '../../lang/pipeline.ts'
import { buildMiniSourceMap, type SourceLocation } from '../../lib/mini-source-map.ts'
import { compileMiniNotation } from '../../mini/compiler.ts'
import {
  type AnalyserRef,
  type ArrayLiteralRef,
  encodeLangToVmOps,
  extractBarsFromSource,
  extractTimelineLabelsFromSource,
  type MiniSequenceRef,
  type NumberWithParamsInfo,
  type SampleDef,
  type TimelineSequenceRef,
} from '../bytecode/bytecode.ts'
import { useEngine } from '../dsp/program.ts'
import { buildTimelineLabels } from '../dsp/timeline-labels.ts'
import { functionDefinitions } from './function-definitions.ts'
import type { Loop } from './loop.ts'
import { MinimapScrollbar } from './MinimapScrollbar.tsx'
import { Sidebar } from './Sidebar.tsx'
import { useTheme } from './theme.ts'
import { tokenizer } from './tokenizer.ts'
import { useAnalyserWidget } from './useAnalyserWidget.ts'
import { useArrayAccessWidget } from './useArrayAccessWidget.ts'
import { useCodeFileValue } from './useCodeFileValue.ts'
import { useLoopView } from './useLoopView.ts'
import { usePianorollWidget } from './usePianorollWidget.ts'
import { useSampleWidget } from './useSampleWidget.ts'
import { type SeqControlState, type SeqFrame, useSequenceWidget } from './useSequenceWidget.ts'
import { useSliderWidget } from './useSliderWidget.ts'
import { useTimelineHeader } from './useTimelineHeader.ts'
import { useTimelineSequenceWidget } from './useTimelineSequenceWidget.ts'
import { useTimelineWidget } from './useTimelineWidget.ts'

export type BytecodeInspectorProps = {
  source: string
}

export function BytecodeInspector({ source }: BytecodeInspectorProps) {
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

  return (
    <div className="flex flex-col gap-2 w-full" onClick={e => {
      navigator.clipboard.writeText((e.target as HTMLElement).textContent || '')
    }}>
      <div className="flex items-center justify-between text-xs text-gray-200">
        <span className="font-semibold">Bytecode (analysis)</span>
        <span className="text-neutral-400">{analysis.tokenCount} tokens</span>
      </div>
      {analysis.errors.length > 0 && (
        <div className="bg-red-900 text-red-200 p-2 rounded-md text-xs">
          {analysis.errors.map((err, idx) => (
            <div key={idx}>
              {err.message} <span className="opacity-70">({err.line}:{err.column})</span>
            </div>
          ))}
        </div>
      )}
      <div className="bg-neutral-900 text-white p-3 border border-gray-600 font-mono text-xs w-full h-full overflow-auto">
        <pre className="whitespace-pre-wrap">{analysis.bytecodeText || 'No bytecode available yet.'}</pre>
      </div>
    </div>
  )
}
