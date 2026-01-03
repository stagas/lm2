import type { LangError } from '../lang/errors.ts'
import { type SourceLocation } from '../lib/mini-source-map.ts'
import {
  type AdRef,
  type AdsrRef,
  type AnalyserRef,
  type ArrayLiteralRef,
  type AtRef,
  type BranchMarkRef,
  type CompressorRef,
  type EnvfollowRef,
  type EuclidRef,
  type EveryRef,
  type FilterRef,
  type LfoRef,
  type LimiterRef,
  type LpRef,
  type MiniSequenceRef,
  type NumberWithParamsInfo,
  type ReverbRef,
  type SampleDef,
  type SlewRef,
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
  miniPlayBars: Array<number | undefined>
  timelineRefs: TimelineSequenceRef[]
  miniSourceMaps: Array<Map<number, SourceLocation> | undefined>
  adRefs: AdRef[]
  adsrRefs: AdsrRef[]
  envfollowRefs: EnvfollowRef[]
  slewRefs: SlewRef[]
  analyserRefs: AnalyserRef[]
  compressorRefs: CompressorRef[]
  limiterRefs: LimiterRef[]
  filterRefs: FilterRef[]
  reverbRefs: ReverbRef[]
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
