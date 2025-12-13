export const RING_BUFFER_SIZE = 16384
export const CHUNK_SIZE = 128
export const ARRAY_SIZE = 1024
export const SEQ_HISTORY_SIZE = 128 // ring buffer for event history (increased for rapid events)
export const ARRAY_HEADER_SIZE = 3 + SEQ_HISTORY_SIZE * 3 // length, historyWritePos, historySize, [index,startSample,endSample]*historySize
export const ARRAYS_COUNT = 1024
export const LITERALS_COUNT = 1024
export const OPS_COUNT = 1024
export const SEQ_VOICES = 16
export const MAX_DSP_INSTANCES = 128
export const CALLBACK_SCOPE_BASE = 500
export const CALLBACK_SCOPE_BUFFERS_PER_VOICE = 32
export const CALLBACK_SCOPE_MAX_DEPTH = 8
export const CALLBACK_SCOPE_MAX_BINDINGS = 8
export const MINI_EVENT_SIZE: i32 = 7
export const MINI_HEADER_SIZE: i32 = 1

// Operation types
export const OP_EVENT: i32 = 0
export const OP_GROUP_START: i32 = 1
export const OP_GROUP_END: i32 = 2
export const OP_REST: i32 = 3

// Operation sizes (in floats)
export const OP_GROUP_START_SIZE: i32 = 13 // opcode, childCount, angle, velocity, hold, replicate, elongate, density, offset, jitter, prob, glide, strum
export const OP_GROUP_END_SIZE: i32 = 1 // opcode
export const OP_REST_SIZE: i32 = 1 // opcode
export const MAX_EVENT_VALUES: i32 = 16
export const OP_EVENT_BASE_SIZE: i32 = 6 + MAX_EVENT_VALUES // opcode, valueCount, values..., velocity, hold, glide, prob, density
