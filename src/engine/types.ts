import type { LangError } from '../lang/errors.ts'
import { type SourceLocation } from '../lib/mini-source-map.ts'
import {
  type AnalyserRef,
  type ArrayLiteralRef,
  type AtRef,
  type BranchMarkRef,
  type CompressorRef,
  type EuclidRef,
  type EveryRef,
  type LfoRef,
  type LpRef,
  type MiniSequenceRef,
  type NumberWithParamsInfo,
  type SampleDef,
  type SlicerRef,
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
  compressorRefs: CompressorRef[]
  lpRefs: LpRef[]
  slicerRefs: SlicerRef[]
  lfoRefs: LfoRef[]
  everyRefs: EveryRef[]
  atRefs: AtRef[]
  euclidRefs: EuclidRef[]
  arrayLiterals: ArrayLiteralRef[]
  branchMarks: BranchMarkRef[]
  numberParams: NumberWithParamsInfo[]
  sampleDefs: SampleDef[]
  errors: LangError[]
}
