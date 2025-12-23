import type { LangError } from '../lang/errors.ts'
import { type SourceLocation } from '../lib/mini-source-map.ts'
import {
  type AnalyserRef,
  type ArrayLiteralRef,
  type MiniSequenceRef,
  type NumberWithParamsInfo,
  type SampleDef,
  type TimelineSequenceRef,
} from './bytecode/bytecode.ts'

export type TimelineWindow = {
  windowStartTime: number
  windowEndTime: number
  timeSeconds: number
}

export type WidgetCompileResult = {
  dspSource: string
  sequences: string[]
  miniRefs: MiniSequenceRef[]
  timelineRefs: TimelineSequenceRef[]
  miniSourceMaps: Array<Map<number, SourceLocation> | undefined>
  analyserRefs: AnalyserRef[]
  arrayLiterals: ArrayLiteralRef[]
  numberParams: NumberWithParamsInfo[]
  sampleDefs: SampleDef[]
  errors: LangError[]
}
