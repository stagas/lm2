import { ARRAY_HEADER_SIZE } from './constants'
import { Ad } from './gen/ad'
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
            array[1] = index
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
      }
    }
  }
}
