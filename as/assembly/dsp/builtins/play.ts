// dprint-ignore-file
import { Program } from '../../program'
import { Dsp } from '../dsp'
import { VmTag } from '../types'
import { VmSym } from '../vm-sym'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'
import { playMini } from './play-mini'

// @ts-ignore

export function callPlay(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
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

  let seqTag = posTags[0] as VmTag
  let seqNum = posNums[0]
  let seqAux = posAux[0]
  let cbTag = posTags[1] as VmTag
  let cbAux = posAux[1]

  // Check for named parameters
  for (let i = 0; i < namedCount; i++) {
    if (nameSyms[i] === VmSym.Seq) {
      seqTag = nameTags[i] as VmTag
      seqNum = nameNums[i]
      seqAux = nameAux[i]
    }
    else if (nameSyms[i] === VmSym.Cb) {
      cbTag = nameTags[i] as VmTag
      cbAux = nameAux[i]
    }
  }

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

