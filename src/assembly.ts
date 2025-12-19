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
  arrayAccessHistory: 'usize',
})
export type Program = typeof ProgramStruct.type
