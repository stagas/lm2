import { ARRAY_HEADER_SIZE, SEQ_VOICES } from './constants'
import { Ad } from './gen/ad'
import { Seq } from './gen/seq'
import { SeqMap } from './gen/seqmap'
import { Sin } from './gen/sin'
import { Program } from './program'
import { Op } from './shared'

function clearAudio(out$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    store<f32>(out$, 0)
    out$ += 4
  }
}

function addAudio(out$: usize, a1$: usize, a2$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const s1 = load<f32>(a1$)
    const s2 = load<f32>(a2$)
    const sample = s1 + s2
    store<f32>(out$, sample)
    out$ += 4
    a1$ += 4
    a2$ += 4
  }
}

function mulAudio(out$: usize, a1$: usize, a2$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const s1 = load<f32>(a1$)
    const s2 = load<f32>(a2$)
    const sample = s1 * s2
    store<f32>(out$, sample)
    out$ += 4
    a1$ += 4
    a2$ += 4
  }
}

export class Dsp {
  program: Program = new Program()

  process(left$: usize, right$: usize, begin: i32, length: i32): void {
    const ops = this.program.ops
    const gensPool = this.program.gensPool
    const outsPool = this.program.outsPool
    gensPool.resetIndices()

    const pos = begin * 4
    left$ += pos
    right$ += pos
    clearAudio(left$, length)
    clearAudio(right$, length)

    let pc = 0
    while (pc < ops.length) {
      const op = ops[pc]
      pc++
      switch (op) {
        case Op.End: {
          globalSampleCount += length
          return
        }

        case Op.Out: {
          const outLeft$ = outsPool.get(ops[pc++]) + pos
          const outRight$ = outsPool.get(ops[pc++]) + pos
          addAudio(left$, left$, outLeft$, length)
          addAudio(right$, right$, outRight$, length)
          break
        }

        case Op.ArrayAt: {
          let out$ = outsPool.get(ops[pc++]) + pos
          const arrayIndex = ops[pc++]
          const array = changetype<StaticArray<f32>>(this.program.data.arrays[arrayIndex])
          let element$ = outsPool.get(ops[pc++]) + pos
          for (let i = 0; i < length; i++) {
            const element = load<f32>(element$)
            const index = Mathf.round(element)
            const value = array[index as i32 + ARRAY_HEADER_SIZE]
            store<f32>(out$, value)
            element$ += 4
            out$ += 4
          }
          break
        }

        case Op.Literal: {
          let out$ = outsPool.get(ops[pc++]) + pos
          const literalIndex = ops[pc++]
          const literal = this.program.data.readLiteral(literalIndex)
          for (let i = 0; i < length; i++) {
            store<f32>(out$, literal)
            out$ += 4
          }
          break
        }

        case Op.LiteralSmoothed: {
          let out$ = outsPool.get(ops[pc++]) + pos
          const literalIndex = ops[pc++]
          const literalSmoothed = this.program.literalsSmoothed[literalIndex]
          const literalTarget = this.program.data.readLiteral(literalIndex)
          literalSmoothed.set(literalTarget)
          for (let i = 0; i < length; i++) {
            literalSmoothed.update()
            store<f32>(out$, literalSmoothed.value as f32)
            out$ += 4
          }
          break
        }

        case Op.Add: {
          const out$ = outsPool.get(ops[pc++]) + pos
          const a1$ = outsPool.get(ops[pc++]) + pos
          const a2$ = outsPool.get(ops[pc++]) + pos
          addAudio(out$, a1$, a2$, length)
          break
        }

        case Op.Mul: {
          const out$ = outsPool.get(ops[pc++]) + pos
          const a1$ = outsPool.get(ops[pc++]) + pos
          const a2$ = outsPool.get(ops[pc++]) + pos
          mulAudio(out$, a1$, a2$, length)
          break
        }

        case Op.Sin: {
          const sin = gensPool.get(Op.Sin) as Sin
          const out$ = outsPool.get(ops[pc++]) + pos
          const hz$ = outsPool.get(ops[pc++]) + pos
          const trig$ = outsPool.get(ops[pc++]) + pos
          sin.hz$ = hz$
          sin.trig$ = trig$
          sin.process(out$, length)
          break
        }

        case Op.Ad: {
          const ad = gensPool.get(Op.Ad) as Ad
          const out$ = outsPool.get(ops[pc++]) + pos
          const attack$ = outsPool.get(ops[pc++]) + pos
          const decay$ = outsPool.get(ops[pc++]) + pos
          const trig$ = outsPool.get(ops[pc++]) + pos
          ad.attack$ = attack$
          ad.decay$ = decay$
          ad.trig$ = trig$
          ad.process(out$, length)
          break
        }

        case Op.Seq: {
          const seq = gensPool.get(Op.Seq) as Seq
          const arrayIndex = ops[pc++]
          const voiceCountOut = ops[pc++]

          for (let v = 0; v < SEQ_VOICES; v++) {
            const trigOut = ops[pc++]
            const velocityOut = ops[pc++]
            const valueOut = ops[pc++]
            this.program.lastSeqTrigOuts[v] = trigOut
            this.program.lastSeqVelocityOuts[v] = velocityOut
            this.program.lastSeqValueOuts[v] = valueOut
            seq.outTrig$[v] = outsPool.get(trigOut) + pos
            seq.outVelocity$[v] = outsPool.get(velocityOut) + pos
            seq.outValue$[v] = outsPool.get(valueOut) + pos
          }

          seq.bytecode$ = changetype<usize>(this.program.data.arrays[arrayIndex])
          seq.outVoiceCount$ = outsPool.get(voiceCountOut) + pos

          seq.process(0, length)

          // Store voice count
          this.program.lastSeqVoiceCountOut = voiceCountOut

          break
        }

        case Op.SeqForEach: {
          const voiceCountIndex = ops[pc++]
          const bodyStartPc = ops[pc++]
          const bodyLength = ops[pc++]
          this.program.seqForEachAudioOutsCount = 0

          const voiceCount$ = outsPool.get(voiceCountIndex) + pos
          const numVoices = Mathf.round(load<f32>(voiceCount$)) as i32
          const voicesToProcess = numVoices < SEQ_VOICES ? numVoices : SEQ_VOICES

          // Execute loop body for each active voice
          // Use pre-allocated runtime voice buffers to avoid overwrites
          for (let v = 0; v < voicesToProcess; v++) {
            this.program.currentVoiceIndex = v

            // Get pre-allocated buffers for this voice (3 buffers per voice: value, trig, audio)
            const runtimeValueBuf = this.program.runtimeVoiceBufs[v * 3 + 0]
            const runtimeTrigBuf = this.program.runtimeVoiceBufs[v * 3 + 1]
            const runtimeAudioBuf = this.program.runtimeVoiceBufs[v * 3 + 2]

            // Execute body bytecode
            let bodyPc = bodyStartPc
            const bodyEndPc = bodyStartPc + bodyLength
            while (bodyPc < bodyEndPc) {
              const bodyOp = ops[bodyPc]
              bodyPc++

              // Dispatch ops with runtime-allocated buffers
              if (bodyOp === Op.SeqVoiceValue) {
                bodyPc++ // Skip compile-time buffer index
                const voiceIndex = this.program.currentVoiceIndex
                const out$ = outsPool.get(runtimeValueBuf) + pos
                if (voiceIndex >= 0 && voiceIndex < this.program.lastSeqValueOuts.length) {
                  const value$ = outsPool.get(this.program.lastSeqValueOuts[voiceIndex]) + pos
                  for (let i = 0; i < length; i++) {
                    store<f32>(out$ + i * 4, load<f32>(value$ + i * 4))
                  }
                }
              }
              else if (bodyOp === Op.SeqVoiceTrig) {
                bodyPc++ // Skip compile-time buffer index
                const voiceIndex = this.program.currentVoiceIndex
                const out$ = outsPool.get(runtimeTrigBuf) + pos
                if (voiceIndex >= 0 && voiceIndex < this.program.lastSeqTrigOuts.length) {
                  const trig$ = outsPool.get(this.program.lastSeqTrigOuts[voiceIndex]) + pos
                  for (let i = 0; i < length; i++) {
                    store<f32>(out$ + i * 4, load<f32>(trig$ + i * 4))
                  }
                }
              }
              else if (bodyOp === Op.SeqVoiceVelocity) {
                bodyPc++ // Skip compile-time buffer index (not used for now)
              }
              else if (bodyOp === Op.Sin) {
                bodyPc++ // Skip compile-time output buffer
                bodyPc++ // Skip compile-time hz buffer
                bodyPc++ // Skip compile-time trig buffer

                const sin = gensPool.get(Op.Sin) as Sin
                const out$ = outsPool.get(runtimeAudioBuf) + pos
                const hz$ = outsPool.get(runtimeValueBuf) + pos
                const trig$ = outsPool.get(runtimeTrigBuf) + pos

                sin.hz$ = hz$
                sin.trig$ = trig$
                sin.process(out$, length)

                this.program.seqForEachAudioOuts[this.program.seqForEachAudioOutsCount++] = runtimeAudioBuf
              }
            }
          }

          break
        }

        case Op.SeqMap: {
          const seqmap = gensPool.get(Op.SeqMap) as SeqMap
          const out$ = outsPool.get(ops[pc++]) + pos

          // Get audio inputs from SeqForEach
          const numVoices = this.program.seqForEachAudioOutsCount
          seqmap.numVoices = numVoices

          for (let v = 0; v < numVoices; v++) {
            seqmap.inTrig$[v] = outsPool.get(this.program.lastSeqTrigOuts[v]) + pos
            seqmap.inVelocity$[v] = outsPool.get(this.program.lastSeqVelocityOuts[v]) + pos
            seqmap.inValue$[v] = outsPool.get(this.program.lastSeqValueOuts[v]) + pos
            seqmap.inAudio$[v] = outsPool.get(this.program.seqForEachAudioOuts[v]) + pos
          }

          seqmap.process(out$, length)
          break
        }
      }
    }
  }
}
