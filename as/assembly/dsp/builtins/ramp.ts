// dprint-ignore-file
import { Ramp } from '../../gen/osc'
import { Program } from '../../program'
import { Op } from '../../shared'
import { VmSym } from '../vm-sym'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'

// @ts-ignore
@inline
export function callRamp(
  posCount: i32,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  posAux: StaticArray<i32>,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  // Positional fallback: (hz, offset, trig)
  let hzTag = posCount >= 1 ? (posTags[0] as VmTag) : VmTag.Num
  let hzNum = posCount >= 1 ? posNums[0] : 0.0
  let hzAux = posCount >= 1 ? posAux[0] : 0
  let offsetTag = posCount >= 2 ? (posTags[1] as VmTag) : VmTag.Num
  let offsetNum = posCount >= 2 ? posNums[1] : 0.0
  let offsetAux = posCount >= 2 ? posAux[1] : 0
  let trigTag = posCount >= 3 ? (posTags[2] as VmTag) : VmTag.Num
  let trigNum = posCount >= 3 ? posNums[2] : 0.0
  let trigAux = posCount >= 3 ? posAux[2] : 0

  // Named overrides (offset/trig)
  for (let i = 0; i < namedCount; i++) {
    const k = nameSyms[i]
    if (k === VmSym.Offset) {
      offsetTag = nameTags[i] as VmTag
      offsetNum = nameNums[i]
      offsetAux = nameAux[i]
    }
    else if (k === VmSym.Trig) {
      trigTag = nameTags[i] as VmTag
      trigNum = nameNums[i]
      trigAux = nameAux[i]
    }
  }

  const hz$ = audio.toAudioPtr(hzTag, hzNum, hzAux, length, program)
  const trig$ = audio.toAudioPtr(trigTag, trigNum, trigAux, length, program)
  const offset$ = audio.toAudioPtr(offsetTag, offsetNum, offsetAux, length, program)

  const outIndex = audio.allocOut(program)
  const out$ = program.getOutBuffer(outIndex)

  const ramp = program.gensPool.get(Op.Ramp) as Ramp
  ramp.hz$ = hz$
  ramp.trig$ = trig$
  ramp.offset$ = offset$
  ramp.process(out$, length)

  stack.push(VmTag.Audio, 0.0, outIndex)
}


