export const DEFAULT_Q: f64 = 0.7071067811865476

export const RING_BUFFER_SIZE = 16384
export const CHUNK_SIZE = 128
export const ANALYSER_OUTS_COUNT = 64
export const FINAL_OUT_ANALYSER_L_INDEX = 62
export const FINAL_OUT_ANALYSER_R_INDEX = 63
export const ARRAY_SIZE = 1024
export const HISTORY_SIZE = 2048 // ring buffer for event history
export const HISTORY_SIZE_MINUS_ONE = 2047 // for modulo operations
export const HISTORY_HEADER_SIZE = 1 // writePos
export const HISTORY_ENTRY_SIZE = 6 // opIndex, voiceIndex, value, velocity, startSample, endSample
export const HISTORY_WRITE_POS_OFFSET = 0
export const HISTORY_DATA_OFFSET = 1
export const HISTORIES_COUNT = 128
export const ARRAY_HISTORY_SIZE = 128 // space for history metadata in array header
export const ARRAY_HISTORY_ENTRY_SIZE = 6 // opIndex, voiceIndex, value, velocity, startSample, endSample
export const ARRAY_HEADER_SIZE = 4 + ARRAY_HISTORY_SIZE * ARRAY_HISTORY_ENTRY_SIZE // length, historyWritePos, historySize, version, [opIndex,voiceIndex,value,velocity,startSample,endSample]*historySize

// Best-effort branch marker history for UI widgets.
// entry: ifPc, branchPc
export const BRANCH_HISTORY_SIZE = 256
export const BRANCH_HISTORY_ENTRY_SIZE = 2

// Best-effort sample needle history for UI widgets.
// entry: sampleIndex, posFrames, playing, sampleCountMod
export const SAMPLE_NEEDLE_HISTORY_SIZE = 512
export const SAMPLE_NEEDLE_ENTRY_SIZE = 4
export const SAMPLE_NEEDLE_WRITE_POS_OFFSET = 0
export const SAMPLE_NEEDLE_DATA_OFFSET = 1

// Best-effort filter history for UI widgets.
// entry: lpIndex, cutHz, q, gate, sampleCountMod
export const FILTER_HISTORY_SIZE = 2048
export const FILTER_ENTRY_SIZE = 5
export const FILTER_WRITE_POS_OFFSET = 0
export const FILTER_DATA_OFFSET = 1

// Best-effort LFO history for UI widgets.
// entry: lfoIndex, lfoType, bar, offset, phase01, value, sampleCountMod
export const LFO_HISTORY_SIZE = 2048
export const LFO_ENTRY_SIZE = 7
export const LFO_WRITE_POS_OFFSET = 0
export const LFO_DATA_OFFSET = 1

// Best-effort freeverb history for UI widgets.
// entry: freeverbIndex, roomsize, damp, wet, dry, width, sampleCountMod
export const FREEVERB_HISTORY_SIZE = 2048
export const FREEVERB_ENTRY_SIZE = 7
export const FREEVERB_WRITE_POS_OFFSET = 0
export const FREEVERB_DATA_OFFSET = 1

// Best-effort impulse history for UI widgets (every/at/euclid).
// entry: index, value, sampleCountMod
export const TRIG_HISTORY_SIZE = 2048
export const TRIG_ENTRY_SIZE = 3
export const TRIG_WRITE_POS_OFFSET = 0
export const TRIG_DATA_OFFSET = 1

export const ARRAYS_COUNT = 1024
export const LITERALS_COUNT = 1024
export const OPS_COUNT = 8192
export const SEQ_VOICES = 6
export const MAX_DSP_INSTANCES = 128
export const CALLBACK_SCOPE_BASE = 500
export const CALLBACK_SCOPE_BUFFERS_PER_VOICE = 32
export const CALLBACK_SCOPE_MAX_DEPTH = 8
export const CALLBACK_SCOPE_MAX_BINDINGS = 8
export const MINI_EVENT_SIZE: i32 = 7
export const MINI_HEADER_SIZE: i32 = 1

// timeline(seq) bytecode format
// [opLength,
//  TIMELINE_MAGIC, segmentCount, totalUnits, beatDiv,
//  [kind, durUnits, startValue, endValue, curve] * segmentCount
// ]
//
// Notes:
// - `durUnits` and `totalUnits` are compiled as absolute beats.
// - `beatDiv` is currently always stored as 1.
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
export const PAST_BARS = 1
export const FUTURE_BARS = 4
export const TIME_WINDOW_BARS = PAST_BARS + FUTURE_BARS

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
export const OP_SWING: i32 = 9

// Operation sizes (in floats)
export const OP_GROUP_START_SIZE: i32 = 13 // opcode, childCount, angle, velocity, hold, replicate, elongate, density, offset, jitter, prob, glide, strum
export const OP_GROUP_END_SIZE: i32 = 1 // opcode
export const OP_REST_SIZE: i32 = 1 // opcode
export const OP_OCTAVE_SIZE: i32 = 2 // opcode, deltaOctaves
export const OP_TRANSPOSE_SIZE: i32 = 2 // opcode, deltaSemitones
export const MAX_EVENT_VALUES: i32 = 16
export const OP_SCALE_SIZE: i32 = 3 // opcode, rootMidi, scaleIndex
export const OP_CYCLE_START_SIZE: i32 = 4 // opcode, pos, loop, childCount
export const OP_CYCLE_END_SIZE: i32 = 1 // opcode
export const OP_EVENT_BASE_SIZE: i32 = 12 + MAX_EVENT_VALUES // opcode, valueCount, values..., velocity, hold, glide, prob, density
export const OP_SWING_SIZE: i32 = 2 // opcode, amount
