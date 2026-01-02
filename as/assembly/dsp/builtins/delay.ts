// dprint-ignore-file
import { Program } from '../../program'
import { Delay } from '../../gen/delay'
import { Op } from '../../shared'
import { Dsp } from '../dsp'
import { VmSym } from '../vm-sym'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'

// @ts-ignore
@inline
export function callDelay(
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
  cbArgTags: StaticArray<i32>,
  cbArgNums: StaticArray<f64>,
  cbArgAux: StaticArray<i32>,
): void {
  // delay(in, seconds, feedback=0, cb?)
  if (posCount < 2) {
    stack.push(VmTag.Undef)
    return
  }

  let inTag: VmTag = VmTag.Num
  let inNum: f64 = 0.0
  let inAux: i32 = 0

  let secondsTag: VmTag = VmTag.Undef
  let secondsNum: f64 = 0.0
  let secondsAux: i32 = 0

  let fbTag: VmTag = VmTag.Num
  let fbNum: f64 = 0.0
  let fbAux: i32 = 0

  let cbTag: VmTag = VmTag.Undef
  let cbAux: i32 = 0

  if (posCount >= 1 && posTags[0] !== VmTag.Undef && posTags[0] !== VmTag.Null) {
    inTag = posTags[0] as VmTag
    inNum = posNums[0]
    inAux = posAux[0]
  }

  if (posCount >= 2 && posTags[1] !== VmTag.Undef && posTags[1] !== VmTag.Null) {
    secondsTag = posTags[1] as VmTag
    secondsNum = posNums[1]
    secondsAux = posAux[1]
  }

  if (posCount >= 3 && posTags[2] !== VmTag.Undef && posTags[2] !== VmTag.Null) {
    fbTag = posTags[2] as VmTag
    fbNum = posNums[2]
    fbAux = posAux[2]
  }

  if (posCount >= 4 && posTags[3] !== VmTag.Undef && posTags[3] !== VmTag.Null) {
    cbTag = posTags[3] as VmTag
    cbAux = posAux[3]
  }

  for (let i: i32 = 0; i < namedCount; i++) {
    const k: i32 = nameSyms[i]
    if (k === VmSym.In) {
      inTag = nameTags[i] as VmTag
      inNum = nameNums[i]
      inAux = nameAux[i]
    }
    else if (k === VmSym.Seconds) {
      secondsTag = nameTags[i] as VmTag
      secondsNum = nameNums[i]
      secondsAux = nameAux[i]
    }
    else if (k === VmSym.Feedback) {
      fbTag = nameTags[i] as VmTag
      fbNum = nameNums[i]
      fbAux = nameAux[i]
    }
    else if (k === VmSym.Cb) {
      cbTag = nameTags[i] as VmTag
      cbAux = nameAux[i]
    }
  }

  if (secondsTag === VmTag.Undef || secondsTag === VmTag.Null) {
    stack.push(VmTag.Undef)
    return
  }

  const in$ = audio.toAudioPtr(inTag, inNum, inAux, length, program)
  const seconds$ = audio.toAudioPtr(secondsTag, secondsNum, secondsAux, length, program)
  const fb$ = audio.toAudioPtr(fbTag, fbNum, fbAux, length, program)

  const delay = program.gensPool.get(Op.Delay) as Delay
  delay.in$ = in$
  delay.seconds$ = seconds$
  delay.feedback$ = fb$

  // Fast path: default cb is identity
  if (cbTag === VmTag.Undef || cbTag === VmTag.Null) {
    const outIndex: i32 = audio.allocOut(program)
    const out$ = program.getOutBuffer(outIndex)
    delay.process(out$, length)
    stack.push(VmTag.Audio, 0.0, outIndex)
    return
  }

  if (cbTag !== VmTag.Func) {
    stack.push(VmTag.Undef)
    return
  }

  // Read raw echo first
  const rawIndex: i32 = audio.allocOut(program)
  const raw$ = program.getOutBuffer(rawIndex)
  delay.readEcho(raw$, length)

  // cb(rawEcho) -> processedEcho (audio)
  cbArgTags[0] = VmTag.Audio
  cbArgNums[0] = 0.0
  cbArgAux[0] = rawIndex
  program.pushHistoryWriteEnabled(program.historyWriteEnabled !== 0 ? 1 : 0)
  dsp.vmInvokeFunc(cbAux, 1, cbArgTags, cbArgNums, cbArgAux, length, left$, right$)
  program.popHistoryWriteEnabled()
  const resIdx: i32 = stack.pop()
  const resTag: VmTag = stack.tag[resIdx] as VmTag
  if (resTag !== VmTag.Audio) {
    stack.push(VmTag.Undef)
    return
  }

  const outIndex: i32 = stack.aux[resIdx]
  const out$ = program.getOutBuffer(outIndex)
  delay.writeWithEcho(out$, length)

  stack.push(VmTag.Audio, 0.0, outIndex)
}
