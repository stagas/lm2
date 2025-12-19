export const RING_BUFFER_SIZE = 16384
export const CHUNK_SIZE = 128
export const ARRAY_SIZE = 1024
export const HISTORY_SIZE = 2048 // ring buffer for event history
export const HISTORY_HEADER_SIZE = 1 // writePos
export const HISTORY_ENTRY_SIZE = 6 // opIndex, voiceIndex, value, velocity, startSample, endSample
export const HISTORY_WRITE_POS_OFFSET = 0
export const HISTORY_DATA_OFFSET = 1
export const HISTORIES_COUNT = 128
export const ARRAY_HISTORY_SIZE = 128 // space for history metadata in array header
export const ARRAY_HISTORY_ENTRY_SIZE = 6 // opIndex, voiceIndex, value, velocity, startSample, endSample
export const ARRAY_HEADER_SIZE = 4 + ARRAY_HISTORY_SIZE * ARRAY_HISTORY_ENTRY_SIZE // length, historyWritePos, historySize, version, [opIndex,voiceIndex,value,velocity,startSample,endSample]*historySize
export const ARRAYS_COUNT = 1024
export const LITERALS_COUNT = 1024
export const OPS_COUNT = 8192
export const SEQ_VOICES = 16
export const MAX_DSP_INSTANCES = 128
export const CALLBACK_SCOPE_BASE = 500
export const CALLBACK_SCOPE_BUFFERS_PER_VOICE = 32
export const CALLBACK_SCOPE_MAX_DEPTH = 8
export const CALLBACK_SCOPE_MAX_BINDINGS = 8
export const MINI_EVENT_SIZE: i32 = 7
export const MINI_HEADER_SIZE: i32 = 1

// timeline(beat, seq) bytecode format
// [opLength,
//  TIMELINE_MAGIC, segmentCount, totalUnits, beatDiv,
//  [kind, durUnits, startValue, endValue, curve] * segmentCount
// ]
//
// curve encoding:
// - curve > 0: exponential curve using pow(t, curve)
// - curve = 0: linear
// - curve < 0: logarithmic curve with base = -curve
export const TIMELINE_MAGIC: i32 = 1000
export const TIMELINE_HEADER_SIZE: i32 = 4 // magic, segmentCount, totalUnits, beatDiv
export const TIMELINE_SEGMENT_SIZE: i32 = 5 // kind, durUnits, startValue, endValue, exponent
export const TIMELINE_KIND_HOLD: i32 = 0
export const TIMELINE_KIND_GLIDE: i32 = 1

// Timeline constants for visualizers
export const PAST_SECONDS = 4
export const FUTURE_SECONDS = 16
export const TIME_WINDOW_SECONDS = PAST_SECONDS + FUTURE_SECONDS

// Operation types
export const OP_EVENT: i32 = 0
export const OP_GROUP_START: i32 = 1
export const OP_GROUP_END: i32 = 2
export const OP_REST: i32 = 3
export const OP_OCTAVE: i32 = 4
export const OP_TRANSPOSE: i32 = 5
export const OP_SCALE: i32 = 6
export const OP_CYCLE_START: i32 = 7
export const OP_CYCLE_END: i32 = 8

// Operation sizes (in floats)
export const OP_GROUP_START_SIZE: i32 = 13 // opcode, childCount, angle, velocity, hold, replicate, elongate, density, offset, jitter, prob, glide, strum
export const OP_GROUP_END_SIZE: i32 = 1 // opcode
export const OP_REST_SIZE: i32 = 1 // opcode
export const OP_OCTAVE_SIZE: i32 = 2 // opcode, deltaOctaves
export const OP_TRANSPOSE_SIZE: i32 = 2 // opcode, deltaSemitones
export const MAX_EVENT_VALUES: i32 = 16
export const OP_SCALE_SIZE: i32 = 3 // opcode, rootMidi, scaleIndex
export const OP_CYCLE_START_SIZE: i32 = 3 // opcode, periodCycles, childCount
export const OP_CYCLE_END_SIZE: i32 = 1 // opcode
export const OP_EVENT_BASE_SIZE: i32 = 12 + MAX_EVENT_VALUES // opcode, valueCount, values..., velocity, hold, glide, prob, density
