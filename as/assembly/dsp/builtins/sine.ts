// dprint-ignore-file
import { Sine } from '../../gen/sine'
import { Program } from '../../program'
import { Op } from '../../shared'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'

// @ts-ignore
@inline
export function callSine(
  posCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  const hzTag = posCount >= 1 ? (posTags[0] as VmTag) : VmTag.Num
  const hzNum = posCount >= 1 ? posNums[0] : 0.0
  const hzAux = posCount >= 1 ? posAux[0] : 0
  const trigTag = posCount >= 2 ? (posTags[1] as VmTag) : VmTag.Num
  const trigNum = posCount >= 2 ? posNums[1] : 0.0
  const trigAux = posCount >= 2 ? posAux[1] : 0

  const hz$ = audio.toAudioPtr(hzTag, hzNum, hzAux, length, program)
  const trig$ = audio.toAudioPtr(trigTag, trigNum, trigAux, length, program)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const sin = program.gensPool.get(Op.Sine) as Sine
  sin.hz$ = hz$
  sin.trig$ = trig$
  sin.process(out$, length)

  stack.push(VmTag.Audio, 0.0, outIndex)
}

