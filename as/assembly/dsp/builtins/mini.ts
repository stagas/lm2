// dprint-ignore-file
import { Program } from '../../program'
import { Dsp } from '../dsp'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'
import { callPlay } from './play'

// @ts-ignore
@inline
export function callMini(
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
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  const seqTag = posTags[0] as VmTag
  const seqNum = posNums[0]
  const seqAux = posAux[0]
  if (seqTag !== VmTag.Num && seqTag !== VmTag.Audio) {
    stack.push(VmTag.Undef)
    return
  }

  // mini(seq) -> seq
  if (posCount === 1) {
    stack.push(seqTag, seqNum, seqAux)
    return
  }

  const cbTag = posTags[1] as VmTag
  const cbAux = posAux[1]
  if (cbTag !== VmTag.Func) {
    stack.push(VmTag.Undef)
    return
  }

  // Delegate to play() implementation so `seq` can be a per-sample buffer (audio-rate selection).
  callPlay(
    2,
    posTags,
    posNums,
    posAux,
    stack,
    audio,
    program,
    length,
    left$,
    right$,
    dsp,
    miniTrigOuts,
    miniVelOuts,
    miniValOuts,
    cbArgTags,
    cbArgNums,
    cbArgAux,
  )
}

