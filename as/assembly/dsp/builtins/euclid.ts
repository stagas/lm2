// dprint-ignore-file
import { Euclid } from '../../gen/euclid'
import { Program } from '../../program'
import { Op } from '../../shared'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'

// @ts-ignore

export function callEuclid(
  posCount: i32,
  _nameSyms: StaticArray<i32>,
  _nameTags: StaticArray<i32>,
  _nameNums: StaticArray<f64>,
  _nameAux: StaticArray<i32>,
  _namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  // euclid(pulses, steps, offset=0, bar=1)
  if (posCount < 2) {
    stack.push(VmTag.Undef)
    return
  }

  const pulsesTag: VmTag = posTags[0] as VmTag
  const pulsesNum: f64 = posNums[0]
  const pulsesAux: i32 = posAux[0]

  const stepsTag: VmTag = posTags[1] as VmTag
  const stepsNum: f64 = posNums[1]
  const stepsAux: i32 = posAux[1]

  const offsetIsSet = posCount >= 3 && posTags[2] !== VmTag.Undef && posTags[2] !== VmTag.Null
  const offsetTag: VmTag = offsetIsSet ? (posTags[2] as VmTag) : VmTag.Num
  const offsetNum: f64 = offsetIsSet ? posNums[2] : 0.0
  const offsetAux: i32 = offsetIsSet ? posAux[2] : 0

  const barIsSet = posCount >= 4 && posTags[3] !== VmTag.Undef && posTags[3] !== VmTag.Null
  const barTag: VmTag = barIsSet ? (posTags[3] as VmTag) : VmTag.Num
  const barNum: f64 = barIsSet ? posNums[3] : 1.0
  const barAux: i32 = barIsSet ? posAux[3] : 0

  const pulses$: usize = audio.toAudioPtr(pulsesTag, pulsesNum, pulsesAux, length, program)
  const steps$: usize = audio.toAudioPtr(stepsTag, stepsNum, stepsAux, length, program)
  const offset$: usize = audio.toAudioPtr(offsetTag, offsetNum, offsetAux, length, program)
  const bar$: usize = audio.toAudioPtr(barTag, barNum, barAux, length, program)

  const outIndex: i32 = audio.allocOut(program)
  const out$: usize = program.getOutBuffer(outIndex)

  const gen = program.gensPool.get(Op.Euclid) as Euclid
  gen.pulses$ = pulses$
  gen.steps$ = steps$
  gen.offset$ = offset$
  gen.bar$ = bar$
  gen.process(out$, length)

  stack.push(VmTag.Audio, 0.0, outIndex)
}


