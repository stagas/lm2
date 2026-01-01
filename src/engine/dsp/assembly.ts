import { Struct } from 'utils/struct'

export const DspStruct = Struct({
  program: 'usize',
})
export type Dsp = typeof DspStruct.type

export const OutsPoolStruct = Struct({
  outs: 'usize',
})
export type OutsPool = typeof OutsPoolStruct.type

export const AnalyserOutsPoolStruct = Struct({
  outs: 'usize',
})
export type AnalyserOutsPool = typeof AnalyserOutsPoolStruct.type

export const CompressorOutsPoolStruct = Struct({
  levelDbOuts: 'usize',
  grDbOuts: 'usize',
})
export type CompressorOutsPool = typeof CompressorOutsPoolStruct.type

export const LimiterOutsPoolStruct = Struct({
  levelDbOuts: 'usize',
  grDbOuts: 'usize',
})
export type LimiterOutsPool = typeof LimiterOutsPoolStruct.type

export const ProgramDataStruct = Struct({
  ops: 'usize',
  arrays: 'usize',
  literals: 'usize',
})
export type ProgramData = typeof ProgramDataStruct.type

export const ProgramStruct = Struct({
  lock: 'i32',
  data: 'usize',
  histories: 'usize',
  analyserOutsPool: 'usize',
  compressorOutsPool: 'usize',
  limiterOutsPool: 'usize',
  arrayAccessHistory: 'usize',
  branchHistory: 'usize',
  sampleNeedleHistory: 'usize',
  filterHistory: 'usize',
  lfoHistory: 'usize',
  freeverbHistory: 'usize',
  trigHistory: 'usize',
  envelopeHistory: 'usize',
})
export type Program = typeof ProgramStruct.type
