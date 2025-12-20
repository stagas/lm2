import {
  MAX_EVENT_VALUES,
  OP_CYCLE_END,
  OP_CYCLE_END_SIZE,
  OP_CYCLE_START,
  OP_CYCLE_START_SIZE,
  OP_EVENT,
  OP_EVENT_BASE_SIZE,
  OP_GROUP_END,
  OP_GROUP_END_SIZE,
  OP_GROUP_START,
  OP_GROUP_START_SIZE,
  OP_OCTAVE,
  OP_OCTAVE_SIZE,
  OP_REST,
  OP_REST_SIZE,
  OP_SCALE,
  OP_SCALE_SIZE,
  OP_TRANSPOSE,
  OP_TRANSPOSE_SIZE,
} from '../constants'

@unmanaged
export class EventOp {
  opcode!: f32
  valueCount!: f32
  velocity!: f32
  hold!: f32
  replicate!: f32
  elongate!: f32
  density!: f32
  offset!: f32
  jitter!: f32
  prob!: f32
  glide!: f32
  strum!: f32
  // values[MAX_EVENT_VALUES] stored at offset + 12

  static size(): i32 {
    return OP_EVENT_BASE_SIZE
  }

  static at(array$: usize, offset: i32): EventOp {
    return changetype<EventOp>(array$ + (offset << 2))
  }

  getValue(index: i32): f32 {
    if (index >= 0 && index < MAX_EVENT_VALUES) {
      const valuesPtr = changetype<usize>(this) + ((12 + index) << 2)
      return load<f32>(valuesPtr)
    }
    return 0.0
  }
}

@unmanaged
export class GroupStartOp {
  opcode!: f32
  childCount!: f32
  angle!: f32
  velocity!: f32
  hold!: f32
  replicate!: f32
  elongate!: f32
  density!: f32
  offset!: f32
  jitter!: f32
  prob!: f32
  glide!: f32
  strum!: f32

  static size(): i32 {
    return OP_GROUP_START_SIZE
  }

  static at(array$: usize, offset: i32): GroupStartOp {
    return changetype<GroupStartOp>(array$ + (offset << 2))
  }
}

@unmanaged
export class CycleStartOp {
  opcode!: f32
  pos!: f32
  loop!: f32
  childCount!: f32

  static size(): i32 {
    return OP_CYCLE_START_SIZE
  }

  static at(array$: usize, offset: i32): CycleStartOp {
    return changetype<CycleStartOp>(array$ + (offset << 2))
  }
}

@unmanaged
export class CycleEndOp {
  opcode!: f32

  static size(): i32 {
    return OP_CYCLE_END_SIZE
  }

  static at(array$: usize, offset: i32): CycleEndOp {
    return changetype<CycleEndOp>(array$ + (offset << 2))
  }
}

@unmanaged
export class RestOp {
  opcode!: f32

  static size(): i32 {
    return OP_REST_SIZE
  }

  static at(array$: usize, offset: i32): RestOp {
    return changetype<RestOp>(array$ + (offset << 2))
  }
}

@unmanaged
export class OctaveOp {
  opcode!: f32
  delta!: f32

  static size(): i32 {
    return OP_OCTAVE_SIZE
  }

  static at(array$: usize, offset: i32): OctaveOp {
    return changetype<OctaveOp>(array$ + (offset << 2))
  }
}

@unmanaged
export class TransposeOp {
  opcode!: f32
  delta!: f32

  static size(): i32 {
    return OP_TRANSPOSE_SIZE
  }

  static at(array$: usize, offset: i32): TransposeOp {
    return changetype<TransposeOp>(array$ + (offset << 2))
  }
}

@unmanaged
export class ScaleOp {
  opcode!: f32
  rootMidi!: f32
  scaleIndex!: f32

  static size(): i32 {
    return OP_SCALE_SIZE
  }

  static at(array$: usize, offset: i32): ScaleOp {
    return changetype<ScaleOp>(array$ + (offset << 2))
  }
}

@unmanaged
export class GroupEndOp {
  opcode!: f32

  static size(): i32 {
    return OP_GROUP_END_SIZE
  }

  static at(array$: usize, offset: i32): GroupEndOp {
    return changetype<GroupEndOp>(array$ + (offset << 2))
  }
}

export function getOpcode(array$: usize, offset: i32): i32 {
  return i32(load<f32>(array$ + (offset << 2)))
}

export function skipOp(array$: usize, offset: i32): i32 {
  const opcode = getOpcode(array$, offset)
  if (opcode === OP_EVENT) return offset + OP_EVENT_BASE_SIZE
  if (opcode === OP_REST) return offset + OP_REST_SIZE
  if (opcode === OP_GROUP_START) return offset + OP_GROUP_START_SIZE
  if (opcode === OP_GROUP_END) return offset + OP_GROUP_END_SIZE
  if (opcode === OP_CYCLE_START) return offset + OP_CYCLE_START_SIZE
  if (opcode === OP_CYCLE_END) return offset + OP_CYCLE_END_SIZE
  if (opcode === OP_OCTAVE) return offset + OP_OCTAVE_SIZE
  if (opcode === OP_TRANSPOSE) return offset + OP_TRANSPOSE_SIZE
  if (opcode === OP_SCALE) return offset + OP_SCALE_SIZE
  return offset
}
