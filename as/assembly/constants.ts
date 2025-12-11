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
// Callback/body scopes reuse scratch buffers per voice starting at a fixed base
export const CALLBACK_SCOPE_BASE = 500
export const CALLBACK_SCOPE_BUFFERS_PER_VOICE = 32
export const CALLBACK_SCOPE_MAX_DEPTH = 8
export const CALLBACK_SCOPE_MAX_BINDINGS = 8
export const MINI_EVENT_SIZE: i32 = 10
export const MINI_HEADER_SIZE: i32 = 1
