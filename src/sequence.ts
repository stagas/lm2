import { ARRAY_HEADER_SIZE, ARRAY_SIZE } from '../as/assembly/constants.ts'
import { SeqOp } from './bytecode.ts'

export class SequenceBytecode {
  private data: Float32Array
  private pc: number = ARRAY_HEADER_SIZE

  constructor() {
    this.data = new Float32Array(ARRAY_SIZE + ARRAY_HEADER_SIZE)
  }

  get buffer(): Float32Array {
    this.data[0] = this.pc - ARRAY_HEADER_SIZE
    return this.data
  }

  cycle(length: number, speed = 1, repeat = 1, density = 1, offset = 0, jitter = 0, prob = 1, isSquare = 0): this {
    this.data[this.pc++] = SeqOp.Cycle
    this.data[this.pc++] = length
    this.data[this.pc++] = speed
    this.data[this.pc++] = repeat
    this.data[this.pc++] = density
    this.data[this.pc++] = offset
    this.data[this.pc++] = jitter
    this.data[this.pc++] = prob
    this.data[this.pc++] = isSquare
    return this
  }

  value(
    n: number,
    velocity = 1,
    hold = 0,
    repeat = 1,
    density = 1,
    offset = 0,
    prob = 1,
    jitter = 0,
    glide = 0,
  ): this {
    this.data[this.pc++] = SeqOp.Value
    this.data[this.pc++] = n
    this.data[this.pc++] = velocity
    this.data[this.pc++] = hold
    this.data[this.pc++] = repeat
    this.data[this.pc++] = density
    this.data[this.pc++] = offset
    this.data[this.pc++] = prob
    this.data[this.pc++] = jitter
    this.data[this.pc++] = glide
    return this
  }

  rest(repeat = 1): this {
    this.data[this.pc++] = SeqOp.Rest
    this.data[this.pc++] = repeat
    return this
  }

  chord(
    notes: number[],
    strum = 0,
    velocity = 1,
    hold = 0,
    repeat = 1,
    density = 1,
    offset = 0,
    prob = 1,
    jitter = 0,
    glide = 0,
  ): this {
    this.data[this.pc++] = SeqOp.Chord
    this.data[this.pc++] = notes.length
    for (const note of notes) {
      this.data[this.pc++] = note
    }
    this.data[this.pc++] = strum
    this.data[this.pc++] = velocity
    this.data[this.pc++] = hold
    this.data[this.pc++] = repeat
    this.data[this.pc++] = density
    this.data[this.pc++] = offset
    this.data[this.pc++] = prob
    this.data[this.pc++] = jitter
    this.data[this.pc++] = glide
    return this
  }
}
