import { SEQ_VOICES } from '../constants'
import { Gen } from './gen'

export class SeqMap extends Gen {
  inTrig$: StaticArray<usize> = new StaticArray<usize>(SEQ_VOICES)
  inVelocity$: StaticArray<usize> = new StaticArray<usize>(SEQ_VOICES)
  inValue$: StaticArray<usize> = new StaticArray<usize>(SEQ_VOICES)
  inAudio$: StaticArray<usize> = new StaticArray<usize>(SEQ_VOICES)
  numVoices: i32 = 0

  process(out$: usize, length: i32): void {
    for (let i = 0; i < length; i++) {
      store<f32>(out$ + i * 4, 0)
    }

    // Only mix the actual number of active voices
    const voicesToMix = this.numVoices < SEQ_VOICES ? this.numVoices : SEQ_VOICES
    for (let v = 0; v < voicesToMix; v++) {
      for (let i = 0; i < length; i++) {
        const audio = load<f32>(this.inAudio$[v] + i * 4)
        const trig = load<f32>(this.inTrig$[v] + i * 4)
        const velocity = load<f32>(this.inVelocity$[v] + i * 4)
        const mixed = audio * trig * velocity
        store<f32>(out$ + i * 4, load<f32>(out$ + i * 4) + mixed)
      }
    }
  }
}
