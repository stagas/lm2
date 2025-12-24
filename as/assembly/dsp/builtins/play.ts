// dprint-ignore-file
import { Program } from '../../program'
import { Dsp } from '../dsp'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'
import { playMini } from './play-mini'

// @ts-ignore
@inline
export function callPlay(
  posCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
  left$: usize,
  right$: usize,
  dsp: Dsp,
  miniTrigOuts: StaticArray<i32>,
  miniVelOuts: StaticArray<i32>,
  miniValOuts: StaticArray<i32>,
  cbArgTags: StaticArray<i32>,
  cbArgNums: StaticArray<f64>,
  cbArgAux: StaticArray<i32>,
): void {
  if (posCount < 2) {
    stack.push(VmTag.Undef)
    return
  }

  const seqTag = posTags[0] as VmTag
  const seqNum = posNums[0]
  const seqAux = posAux[0]
  const cbTag = posTags[1] as VmTag
  const cbAux = posAux[1]

  if ((seqTag !== VmTag.Num && seqTag !== VmTag.Audio) || cbTag !== VmTag.Func) {
    stack.push(VmTag.Undef)
    return
  }

  const baseSp = stack.sp

  if (seqTag === VmTag.Num) {
    playMini(i32(seqNum), cbAux, stack, audio, program, length, left$, right$, dsp, miniTrigOuts, miniVelOuts,
      miniValOuts, cbArgTags, cbArgNums, cbArgAux)
    return
  }

  // Segment-rate selection: use sample-0 to pick the sequence for this VM segment.
  const seq$ = audio.toAudioPtr(seqTag, seqNum, seqAux, length, program)
  const picked: i32 = i32(load<f32>(seq$))
  audio.tHas = 0
  stack.sp = baseSp
  playMini(picked, cbAux, stack, audio, program, length, left$, right$, dsp, miniTrigOuts, miniVelOuts,
    miniValOuts, cbArgTags, cbArgNums, cbArgAux)
}

