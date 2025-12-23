// dprint-ignore-file
import { Timeline } from '../../gen/timeline'
import { Program } from '../../program'
import { Op } from '../../shared'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'

// @ts-ignore
@inline
export function callTimeline(
  posCount: i32,
  posTags: StaticArray<i32>,
  posNums: StaticArray<f64>,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
): void {
  // timeline(seq)
  if (posCount < 1) {
    stack.push(VmTag.Undef)
    return
  }

  // Backwards compatibility: timeline(beatDiv, seq) is accepted, but beatDiv
  // is compile-time only (durations are compiled to absolute beats).
  const seqPos: i32 = posCount >= 2 ? 1 : 0
  const arrayTag: VmTag = posTags[seqPos] as VmTag
  const arrayNum: f64 = posNums[seqPos]
  if (arrayTag !== VmTag.Num) {
    stack.push(VmTag.Undef)
    return
  }

  const outIndex: i32 = audio.allocOut(program)
  const out$: usize = program.getOutBuffer(outIndex)

  const arrayIndex: i32 = i32(arrayNum)
  const timeline: Timeline = program.gensPool.get(Op.Timeline) as Timeline
  timeline.bytecode$ = changetype<usize>(program.data.arrays[arrayIndex])
  timeline.history$ = changetype<usize>(program.histories[arrayIndex])
  timeline.beatDiv = 0.0
  timeline.process(out$, length)

  stack.push(VmTag.Audio, 0.0, outIndex)
}

