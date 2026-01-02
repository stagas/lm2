// dprint-ignore-file
import { Timeline } from '../../gen/timeline'
import { Program } from '../../program'
import { Op } from '../../shared'
import { VmTag } from '../types'
import { VmSym } from '../vm-sym'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'

// @ts-ignore
@inline
export function callTimeline(
  posCount: i32,
  nameSyms: StaticArray<i32>,
  nameTags: StaticArray<i32>,
  nameNums: StaticArray<f64>,
  nameAux: StaticArray<i32>,
  namedCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  // timeline(pattern, color)
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  // Backwards compatibility: timeline(beatDiv, seq) is accepted, but beatDiv
  // is compile-time only (durations are compiled to absolute beats).
  const seqPos: i32 = posCount >= 2 ? 1 : 0
  let arrayTag: VmTag = posTags[seqPos] as VmTag
  let arrayNum: f64 = posNums[seqPos]

  // Check for named 'pattern' parameter
  for (let i = 0; i < namedCount; i++) {
    if (nameSyms[i] === VmSym.Pattern) {
      arrayTag = nameTags[i] as VmTag
      arrayNum = nameNums[i]
      break
    }
  }

  if (arrayTag !== VmTag.Num) {
    stack.push(VmTag.Undef)
    return
  }

  const outIndex: i32 = audio.allocOut(program)
  const out$: usize = program.getOutBuffer(outIndex)

  const arrayIndex: i32 = i32(arrayNum)
  const timeline: Timeline = program.gensPool.get(Op.Timeline) as Timeline
  timeline.bytecode$ = changetype<usize>(program.data.arrays[arrayIndex])
  timeline.history$ = program.historyWriteEnabled !== 0 ? changetype<usize>(program.histories[arrayIndex]) : 0
  timeline.beatDiv = 0.0
  timeline.process(out$, length)

  stack.push(VmTag.Audio, 0.0, outIndex)
}
